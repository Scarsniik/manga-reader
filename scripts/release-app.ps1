param(
    [string]$Version,
    [switch]$DryRun,
    [switch]$Publish,
    [switch]$AllowExistingTag,
    [switch]$AllowDirty,
    [string]$ReleaseNotesPath
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if (-not $DryRun -and -not $Publish) {
    $DryRun = $true
}

$workspace = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $workspace

function Write-Step {
    param([string]$Message)
    Write-Host "==> $Message"
}

function Read-PackageJson {
    $packageJsonPath = Join-Path $workspace "package.json"
    return Get-Content -Raw -LiteralPath $packageJsonPath | ConvertFrom-Json
}

function Get-RepositoryValue {
    param(
        [string[]]$EnvironmentNames,
        [object]$PackageRepository
    )

    foreach ($name in $EnvironmentNames) {
        $value = [Environment]::GetEnvironmentVariable($name)
        if (-not [string]::IsNullOrWhiteSpace($value)) {
            return $value.Trim()
        }
    }

    if ($PackageRepository -is [string]) {
        return [string]$PackageRepository
    }

    if ($null -ne $PackageRepository -and $PackageRepository.PSObject.Properties.Name -contains "url") {
        return [string]$PackageRepository.url
    }

    return ""
}

function Resolve-GitHubRepository {
    param([object]$PackageJson)

    $owner = Get-RepositoryValue -EnvironmentNames @(
        "APP_UPDATE_GITHUB_OWNER",
        "SCARAMANGA_APP_UPDATE_GITHUB_OWNER"
    ) -PackageRepository $null
    $repo = Get-RepositoryValue -EnvironmentNames @(
        "APP_UPDATE_GITHUB_REPO",
        "SCARAMANGA_APP_UPDATE_GITHUB_REPO"
    ) -PackageRepository $null

    if (-not [string]::IsNullOrWhiteSpace($owner) -and -not [string]::IsNullOrWhiteSpace($repo)) {
        return @{
            Owner = $owner
            Repo = $repo
        }
    }

    $repositoryValue = Get-RepositoryValue -EnvironmentNames @() -PackageRepository $PackageJson.repository
    if ([string]::IsNullOrWhiteSpace($repositoryValue)) {
        throw "Unable to resolve the GitHub repository. Set APP_UPDATE_GITHUB_OWNER and APP_UPDATE_GITHUB_REPO."
    }

    $normalized = $repositoryValue.Trim().Replace("git+", "")
    if ($normalized.EndsWith(".git", [System.StringComparison]::OrdinalIgnoreCase)) {
        $normalized = $normalized.Substring(0, $normalized.Length - 4)
    }

    $match = [System.Text.RegularExpressions.Regex]::Match(
        $normalized,
        "github\.com[:/](?<owner>[^/]+)/(?<repo>[^/]+)$",
        [System.Text.RegularExpressions.RegexOptions]::IgnoreCase
    )

    if (-not $match.Success) {
        throw "Unable to parse the GitHub repository from '$repositoryValue'."
    }

    return @{
        Owner = $match.Groups["owner"].Value
        Repo = $match.Groups["repo"].Value
    }
}

function Test-CommandAvailable {
    param([string]$CommandName)
    return $null -ne (Get-Command $CommandName -ErrorAction SilentlyContinue)
}

function Assert-Tooling {
    if (-not (Test-CommandAvailable -CommandName "git")) {
        throw "Git is required to publish the release."
    }
}

function Assert-RepoState {
    if ($AllowDirty) {
        return
    }

    $statusLines = git status --porcelain --untracked-files=no
    if ($LASTEXITCODE -ne 0) {
        throw "Failed to inspect the git worktree state."
    }

    if ($statusLines) {
        throw "The git worktree contains tracked changes. Commit or stash them before publishing, or use -AllowDirty."
    }
}

function Compare-SemVer {
    param(
        [Parameter(Mandatory = $true)][string]$Left,
        [Parameter(Mandatory = $true)][string]$Right
    )

    $leftVersion = [version]$Left
    $rightVersion = [version]$Right
    return $leftVersion.CompareTo($rightVersion)
}

function Get-GitHubCredentialToken {
    $credentialInput = @(
        "protocol=https"
        "host=github.com"
        ""
    )

    try {
        $credentialLines = $credentialInput | git credential fill
        if ($LASTEXITCODE -ne 0) {
            return $null
        }
    } catch {
        return $null
    }

    $passwordLine = $credentialLines |
        Where-Object { $_ -like "password=*" } |
        Select-Object -First 1

    if (-not $passwordLine) {
        return $null
    }

    return $passwordLine.Substring("password=".Length).Trim()
}

function Get-GitHubToken {
    $tokenNames = @(
        "GITHUB_RELEASE_TOKEN",
        "GH_TOKEN",
        "GITHUB_TOKEN"
    )

    foreach ($tokenName in $tokenNames) {
        $tokenValue = [Environment]::GetEnvironmentVariable($tokenName)
        if (-not [string]::IsNullOrWhiteSpace($tokenValue)) {
            return $tokenValue.Trim()
        }
    }

    return Get-GitHubCredentialToken
}

function Get-GitHubApiHeaders {
    param([switch]$RequireAuthorization)

    $headers = @{
        "Accept" = "application/vnd.github+json"
        "User-Agent" = "scaramanga-release-script"
        "X-GitHub-Api-Version" = "2022-11-28"
    }

    $token = Get-GitHubToken
    if (-not [string]::IsNullOrWhiteSpace($token)) {
        $headers["Authorization"] = "Bearer $token"
    } elseif ($RequireAuthorization) {
        throw "Unable to resolve GitHub credentials. Set GITHUB_RELEASE_TOKEN, GH_TOKEN, GITHUB_TOKEN, or configure git credential manager."
    }

    return $headers
}

function Get-HttpStatusCode {
    param([System.Management.Automation.ErrorRecord]$ErrorRecord)

    $response = $ErrorRecord.Exception.Response
    if ($null -eq $response) {
        return $null
    }

    try {
        return [int]$response.StatusCode
    } catch {
        return $null
    }
}

function Get-LatestPublishedVersion {
    param(
        [Parameter(Mandatory = $true)][string]$Owner,
        [Parameter(Mandatory = $true)][string]$Repo
    )

    $headers = Get-GitHubApiHeaders

    try {
        $releases = Invoke-RestMethod `
            -Method Get `
            -Uri "https://api.github.com/repos/$Owner/$Repo/releases?per_page=100" `
            -Headers $headers
    } catch {
        throw "Unable to read GitHub releases for $Owner/$Repo via the GitHub API."
    }

    if (-not $releases) {
        return $null
    }

    $versions = @()
    foreach ($release in $releases) {
        if ($release.draft -or $release.prerelease) {
            continue
        }

        $tagName = [string]$release.tag_name
        if ($tagName -match "^v(?<version>\d+\.\d+\.\d+)$") {
            $versions += $Matches["version"]
        }
    }

    if (-not $versions) {
        return $null
    }

    return $versions |
        Sort-Object { [version]$_ } |
        Select-Object -Last 1
}

function Get-ExistingRelease {
    param(
        [Parameter(Mandatory = $true)][string]$Owner,
        [Parameter(Mandatory = $true)][string]$Repo,
        [Parameter(Mandatory = $true)][string]$TagName,
        [hashtable]$Headers
    )

    try {
        return Invoke-RestMethod `
            -Method Get `
            -Uri "https://api.github.com/repos/$Owner/$Repo/releases/tags/$TagName" `
            -Headers $Headers
    } catch {
        $statusCode = Get-HttpStatusCode -ErrorRecord $_
        if ($statusCode -eq 404) {
            return $null
        }

        throw "Unable to inspect the GitHub release for $TagName."
    }
}

function Test-TagExists {
    param([string]$TagName)

    git rev-parse --verify --quiet "refs/tags/$TagName" *> $null
    if ($LASTEXITCODE -eq 0) {
        return $true
    }

    $remoteTagMatch = git ls-remote --tags origin "refs/tags/$TagName"
    if ($LASTEXITCODE -ne 0) {
        return $false
    }

    return -not [string]::IsNullOrWhiteSpace(($remoteTagMatch | Out-String))
}

function Get-ReleaseAssets {
    $buildDir = Join-Path $workspace "build"
    if (-not (Test-Path -LiteralPath $buildDir)) {
        throw "Build directory not found: $buildDir"
    }

    $latestFile = Join-Path $buildDir "latest.yml"
    if (-not (Test-Path -LiteralPath $latestFile)) {
        throw "Expected latest.yml was not found in build/."
    }

    $installer = Get-ChildItem -LiteralPath $buildDir -File -Filter "*.exe" |
        Where-Object { $_.Name -notmatch "portable" } |
        Sort-Object LastWriteTimeUtc -Descending |
        Select-Object -First 1

    if (-not $installer) {
        throw "Expected NSIS installer .exe was not found in build/."
    }

    $blockmaps = Get-ChildItem -LiteralPath $buildDir -File -Filter "*.blockmap" |
        Sort-Object Name

    $assets = @($installer.FullName, $latestFile)
    foreach ($blockmap in $blockmaps) {
        $assets += $blockmap.FullName
    }

    return $assets
}

function Assert-NoOcrArtifacts {
    param([string[]]$AssetPaths)

    $ocrArtifacts = $AssetPaths | Where-Object { [System.IO.Path]::GetFileName($_) -match "(ocr|easyocr|manga-ocr)" }
    if ($ocrArtifacts) {
        throw "OCR artifacts detected in the app release assets: $($ocrArtifacts -join ', ')"
    }
}

function New-ReleaseNotesFile {
    param(
        [Parameter(Mandatory = $true)][string]$TagName,
        [Parameter(Mandatory = $true)][string]$VersionNumber,
        [string]$SourcePath
    )

    if (-not [string]::IsNullOrWhiteSpace($SourcePath)) {
        if (-not (Test-Path -LiteralPath $SourcePath)) {
            throw "Release notes file not found: $SourcePath"
        }
        return (Resolve-Path -LiteralPath $SourcePath).Path
    }

    $tempPath = Join-Path ([System.IO.Path]::GetTempPath()) "scaramanga-release-notes-$VersionNumber.md"
    @(
        "# $TagName"
        ""
        "- Application release for Scaramanga."
        "- Version: $VersionNumber"
        "- Generated: $(Get-Date -Format s)"
    ) | Set-Content -LiteralPath $tempPath -Encoding utf8

    return $tempPath
}

function Publish-GitHubReleaseWithGh {
    param(
        [Parameter(Mandatory = $true)][string]$Owner,
        [Parameter(Mandatory = $true)][string]$Repo,
        [Parameter(Mandatory = $true)][string]$TagName,
        [Parameter(Mandatory = $true)][string]$ReleaseNotesFile,
        [Parameter(Mandatory = $true)][string[]]$AssetPaths
    )

    Write-Step "Creating GitHub release via GitHub CLI"

    $releaseArgs = @(
        "release",
        "create",
        $TagName,
        "--repo", "$Owner/$Repo",
        "--title", $TagName,
        "--notes-file", $ReleaseNotesFile,
        "--verify-tag"
    )

    foreach ($asset in $AssetPaths) {
        $releaseArgs += $asset
    }

    & gh @releaseArgs
    if ($LASTEXITCODE -ne 0) {
        throw "Unable to create the GitHub release for $TagName."
    }
}

function Publish-GitHubReleaseWithApi {
    param(
        [Parameter(Mandatory = $true)][string]$Owner,
        [Parameter(Mandatory = $true)][string]$Repo,
        [Parameter(Mandatory = $true)][string]$TagName,
        [Parameter(Mandatory = $true)][string]$ReleaseNotesFile,
        [Parameter(Mandatory = $true)][string[]]$AssetPaths,
        [switch]$AllowExisting
    )

    Write-Step "Creating GitHub release via GitHub API"

    $headers = Get-GitHubApiHeaders -RequireAuthorization
    $releaseBody = Get-Content -Raw -LiteralPath $ReleaseNotesFile
    $release = Get-ExistingRelease -Owner $Owner -Repo $Repo -TagName $TagName -Headers $headers

    if ($null -eq $release) {
        $payload = @{
            tag_name = $TagName
            name = $TagName
            body = $releaseBody
            draft = $false
            prerelease = $false
            generate_release_notes = $false
        } | ConvertTo-Json -Depth 5
        $payloadBytes = [System.Text.Encoding]::UTF8.GetBytes($payload)

        $release = Invoke-RestMethod `
            -Method Post `
            -Uri "https://api.github.com/repos/$Owner/$Repo/releases" `
            -Headers $headers `
            -ContentType "application/json; charset=utf-8" `
            -Body $payloadBytes
    } elseif (-not $AllowExisting) {
        throw "GitHub release $TagName already exists."
    } else {
        $payload = @{
            tag_name = $TagName
            name = $TagName
            body = $releaseBody
            draft = $false
            prerelease = $false
        } | ConvertTo-Json -Depth 5
        $payloadBytes = [System.Text.Encoding]::UTF8.GetBytes($payload)

        $release = Invoke-RestMethod `
            -Method Patch `
            -Uri "https://api.github.com/repos/$Owner/$Repo/releases/$($release.id)" `
            -Headers $headers `
            -ContentType "application/json; charset=utf-8" `
            -Body $payloadBytes
    }

    $assetNames = $AssetPaths | ForEach-Object { [System.IO.Path]::GetFileName($_) }
    foreach ($existingAsset in @($release.assets)) {
        if ($existingAsset -and $assetNames -contains [string]$existingAsset.name) {
            Invoke-RestMethod `
                -Method Delete `
                -Uri "https://api.github.com/repos/$Owner/$Repo/releases/assets/$($existingAsset.id)" `
                -Headers $headers | Out-Null
        }
    }

    $uploadUrl = ([string]$release.upload_url) -replace "\{.*$", ""
    foreach ($assetPath in $AssetPaths) {
        $assetName = [System.IO.Path]::GetFileName($assetPath)
        $escapedAssetName = [System.Uri]::EscapeDataString($assetName)
        $assetUploadUrl = "${uploadUrl}?name=${escapedAssetName}"

        Invoke-RestMethod `
            -Method Post `
            -Uri $assetUploadUrl `
            -Headers $headers `
            -ContentType "application/octet-stream" `
            -InFile $assetPath | Out-Null
    }
}

function Publish-GitHubRelease {
    param(
        [Parameter(Mandatory = $true)][string]$Owner,
        [Parameter(Mandatory = $true)][string]$Repo,
        [Parameter(Mandatory = $true)][string]$TagName,
        [Parameter(Mandatory = $true)][string]$ReleaseNotesFile,
        [Parameter(Mandatory = $true)][string[]]$AssetPaths,
        [switch]$AllowExisting
    )

    if (Test-CommandAvailable -CommandName "gh") {
        Publish-GitHubReleaseWithGh `
            -Owner $Owner `
            -Repo $Repo `
            -TagName $TagName `
            -ReleaseNotesFile $ReleaseNotesFile `
            -AssetPaths $AssetPaths
        return
    }

    Publish-GitHubReleaseWithApi `
        -Owner $Owner `
        -Repo $Repo `
        -TagName $TagName `
        -ReleaseNotesFile $ReleaseNotesFile `
        -AssetPaths $AssetPaths `
        -AllowExisting:$AllowExisting
}

Assert-Tooling
$packageJson = Read-PackageJson

if ([string]::IsNullOrWhiteSpace($Version)) {
    $Version = [string]$packageJson.version
}

if ($Version -notmatch "^\d+\.\d+\.\d+$") {
    throw "Version must follow MAJOR.MINOR.PATCH."
}

if ([string]$packageJson.version -ne $Version) {
    throw "package.json version '$($packageJson.version)' does not match requested version '$Version'."
}

$tagName = "v$Version"
$repository = Resolve-GitHubRepository -PackageJson $packageJson
$releaseUrl = "https://github.com/$($repository.Owner)/$($repository.Repo)/releases/tag/$tagName"

Assert-RepoState

if ((Test-TagExists -TagName $tagName) -and -not $AllowExistingTag) {
    throw "Git tag $tagName already exists. Use -AllowExistingTag only for explicit test scenarios."
}

$latestPublishedVersion = Get-LatestPublishedVersion -Owner $repository.Owner -Repo $repository.Repo
if ($latestPublishedVersion -and (Compare-SemVer -Left $Version -Right $latestPublishedVersion) -le 0) {
    throw "Requested version $Version must be greater than the latest published app version $latestPublishedVersion."
}

Write-Step "Building installer assets"
& npm run package:app:installer
if ($LASTEXITCODE -ne 0) {
    throw "Packaging the installer failed."
}

$assets = Get-ReleaseAssets
Assert-NoOcrArtifacts -AssetPaths $assets

$releaseNotesFile = New-ReleaseNotesFile -TagName $tagName -VersionNumber $Version -SourcePath $ReleaseNotesPath

Write-Host ""
Write-Host "Repository   : $($repository.Owner)/$($repository.Repo)"
Write-Host "Version      : $Version"
Write-Host "Tag          : $tagName"
Write-Host "Assets       :"
foreach ($asset in $assets) {
    Write-Host "  - $asset"
}
Write-Host "Release URL  : $releaseUrl"
Write-Host "Mode         : $(if ($Publish) { 'publish' } else { 'dry-run' })"

if ($DryRun -and -not $Publish) {
    Write-Step "Dry run completed"
    exit 0
}

Write-Step "Creating git tag"
if (-not (Test-TagExists -TagName $tagName)) {
    git tag -a $tagName -m "feat: release $tagName"
    if ($LASTEXITCODE -ne 0) {
        throw "Unable to create git tag $tagName."
    }
}

Write-Step "Pushing git tag"
git push origin $tagName
if ($LASTEXITCODE -ne 0) {
    throw "Unable to push git tag $tagName to origin."
}

Publish-GitHubRelease `
    -Owner $repository.Owner `
    -Repo $repository.Repo `
    -TagName $tagName `
    -ReleaseNotesFile $releaseNotesFile `
    -AssetPaths $assets `
    -AllowExisting:$AllowExistingTag

Write-Step "Release published"
Write-Host "Release URL: $releaseUrl"
