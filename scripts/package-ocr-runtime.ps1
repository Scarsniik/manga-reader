[CmdletBinding()]
param(
    [string]$SourceRuntime = 'build-resources\ocr-bundle',

    [string]$OutputRoot = 'build\ocr-runtime',

    [string]$RuntimeVersion = '1.0.0',

    [string]$CompatibleAppVersions = '>=1.0.0 <2.0.0',

    [string]$AssetBaseUrl = '',

    [int64]$PartSizeBytes = 1932735283,

    [switch]$BuildBundle,

    [switch]$ForceRebuild,

    [switch]$Force
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$workspace = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$sourceRuntimePath = [System.IO.Path]::GetFullPath((Join-Path $workspace $SourceRuntime))
$outputRootPath = [System.IO.Path]::GetFullPath((Join-Path $workspace $OutputRoot))
$safeVersion = $RuntimeVersion -replace '[^A-Za-z0-9._-]', '-'
$archiveName = "ocr-runtime-$safeVersion-win32-x64.zip"
$archivePath = Join-Path $outputRootPath $archiveName
$manifestPath = Join-Path $outputRootPath 'manifest.json'
$auditPath = Join-Path $outputRootPath 'audit.json'
$metadataPath = Join-Path $sourceRuntimePath 'runtime-metadata.json'
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)

function Assert-InWorkspace {
    param([string]$PathToCheck)

    $fullPath = [System.IO.Path]::GetFullPath($PathToCheck)
    if (-not $fullPath.StartsWith($workspace, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "Refusing to write outside workspace: $fullPath"
    }
}

function Write-Utf8NoBomFile {
    param(
        [string]$FilePath,
        [string]$Content
    )

    $parentDirectory = Split-Path -Parent $FilePath
    if ($parentDirectory) {
        New-Item -ItemType Directory -Path $parentDirectory -Force | Out-Null
    }

    [System.IO.File]::WriteAllText($FilePath, $Content, $utf8NoBom)
}

function Get-Sha256 {
    param([string]$FilePath)

    $stream = [System.IO.File]::OpenRead($FilePath)
    $sha256 = [System.Security.Cryptography.SHA256]::Create()
    try {
        $hashBytes = $sha256.ComputeHash($stream)
        return ([System.BitConverter]::ToString($hashBytes)).Replace('-', '').ToLowerInvariant()
    } finally {
        $sha256.Dispose()
        $stream.Dispose()
    }
}

function Get-DirectoryAudit {
    param([string]$DirectoryPath)

    $children = Get-ChildItem -LiteralPath $DirectoryPath -Force
    $topLevel = @()
    $totalFiles = 0
    $totalBytes = [int64]0

    foreach ($child in $children) {
        if ($child.PSIsContainer) {
            $files = Get-ChildItem -LiteralPath $child.FullName -Recurse -File -Force
            $fileCount = @($files).Count
            $sum = ($files | Measure-Object -Property Length -Sum).Sum
            $sizeBytes = if ($null -eq $sum) { [int64]0 } else { [int64]$sum }
        } else {
            $fileCount = 1
            $sizeBytes = [int64]$child.Length
        }

        $totalFiles += $fileCount
        $totalBytes += $sizeBytes
        $topLevel += [ordered]@{
            name = $child.Name
            fileCount = $fileCount
            sizeBytes = $sizeBytes
        }
    }

    return [ordered]@{
        generatedAt = (Get-Date).ToUniversalTime().ToString('o')
        sourceRuntime = $DirectoryPath
        fileCount = $totalFiles
        sizeBytes = $totalBytes
        topLevel = $topLevel
    }
}

function Convert-ToDownloadUrl {
    param([string]$FilePath)

    $fileName = [System.IO.Path]::GetFileName($FilePath)
    if ($AssetBaseUrl.Trim()) {
        return "$($AssetBaseUrl.TrimEnd('/'))/$fileName"
    }

    return ([System.Uri][System.IO.Path]::GetFullPath($FilePath)).AbsoluteUri
}

function Test-RuntimeStructure {
    $requiredPaths = @(
        'python\python.exe',
        'scripts\ocr_worker.py',
        'models\manga-ocr-base',
        'cache\manga-ocr\comictextdetector.pt'
    )

    foreach ($relativePath in $requiredPaths) {
        $candidate = Join-Path $sourceRuntimePath $relativePath
        if (-not (Test-Path -LiteralPath $candidate)) {
            throw "Runtime OCR incomplet, element manquant: $candidate"
        }
    }
}

function New-RuntimeZipArchive {
    param(
        [string]$SourceDirectory,
        [string]$DestinationArchive
    )

    if (Test-Path -LiteralPath $DestinationArchive) {
        Remove-Item -LiteralPath $DestinationArchive -Force
    }

    $tarCommand = Get-Command 'tar.exe' -ErrorAction SilentlyContinue
    if ($tarCommand) {
        & $tarCommand.Source -a -cf $DestinationArchive -C $SourceDirectory .
        if ($LASTEXITCODE -ne 0) {
            throw "Runtime archive creation failed with code $LASTEXITCODE."
        }
        return
    }

    Compress-Archive -Path (Join-Path $SourceDirectory '*') -DestinationPath $DestinationArchive -CompressionLevel Optimal -Force
}

function Split-Archive {
    param([string]$InputPath)

    $parts = @()
    $buffer = New-Object byte[] (8MB)
    $inputStream = [System.IO.File]::OpenRead($InputPath)
    try {
        $index = 1
        while ($inputStream.Position -lt $inputStream.Length) {
            $partPath = "$InputPath.$($index.ToString('000'))"
            if (Test-Path -LiteralPath $partPath) {
                Remove-Item -LiteralPath $partPath -Force
            }

            $outputStream = [System.IO.File]::Create($partPath)
            try {
                $written = [int64]0
                while ($written -lt $PartSizeBytes -and $inputStream.Position -lt $inputStream.Length) {
                    $remaining = [Math]::Min([int64]$buffer.Length, $PartSizeBytes - $written)
                    $read = $inputStream.Read($buffer, 0, [int]$remaining)
                    if ($read -le 0) {
                        break
                    }
                    $outputStream.Write($buffer, 0, $read)
                    $written += $read
                }
            } finally {
                $outputStream.Dispose()
            }

            $parts += [ordered]@{
                index = $index
                path = $partPath
                url = Convert-ToDownloadUrl -FilePath $partPath
                sizeBytes = (Get-Item -LiteralPath $partPath).Length
                sha256 = Get-Sha256 -FilePath $partPath
            }
            $index += 1
        }
    } finally {
        $inputStream.Dispose()
    }

    return $parts
}

Assert-InWorkspace -PathToCheck $outputRootPath

if ($BuildBundle) {
    $prepareScript = Join-Path $workspace 'scripts\prepare-ocr-bundle.ps1'
    $prepareArgs = @()
    if ($ForceRebuild) {
        $prepareArgs += '-ForceRebuild'
    }
    & $prepareScript @prepareArgs
    if ($LASTEXITCODE -ne 0) {
        throw "OCR bundle preparation failed with code $LASTEXITCODE."
    }
}

if (-not (Test-Path -LiteralPath $sourceRuntimePath)) {
    throw "Runtime source introuvable: $sourceRuntimePath"
}

Test-RuntimeStructure

if ((Test-Path -LiteralPath $outputRootPath) -and -not $Force) {
    throw "Le dossier existe deja: $outputRootPath. Relance avec -Force pour le remplacer."
}
if (Test-Path -LiteralPath $outputRootPath) {
    Remove-Item -LiteralPath $outputRootPath -Recurse -Force
}
New-Item -ItemType Directory -Path $outputRootPath -Force | Out-Null

$metadata = [ordered]@{
    schemaVersion = 1
    runtimeVersion = $RuntimeVersion
    platform = 'win32-x64'
    compatibleAppVersions = $CompatibleAppVersions
    installedAt = $null
    sourceManifestUrl = $null
    installPath = $null
    supportsGpu = $true
    packagedAt = (Get-Date).ToUniversalTime().ToString('o')
}
Write-Utf8NoBomFile -FilePath $metadataPath -Content ($metadata | ConvertTo-Json -Depth 10)

Write-Host "Audit du runtime OCR..."
Write-Utf8NoBomFile -FilePath $auditPath -Content ((Get-DirectoryAudit -DirectoryPath $sourceRuntimePath) | ConvertTo-Json -Depth 10)

Write-Host "Creation de l'archive OCR..."
New-RuntimeZipArchive -SourceDirectory $sourceRuntimePath -DestinationArchive $archivePath

$archiveSize = (Get-Item -LiteralPath $archivePath).Length
$archiveSha256 = Get-Sha256 -FilePath $archivePath

if ($archiveSize -gt $PartSizeBytes) {
    Write-Host "Decoupage multipart..."
    $partDescriptors = Split-Archive -InputPath $archivePath
    $download = [ordered]@{
        platform = 'win32-x64'
        archiveType = 'zip'
        delivery = 'multipart'
        totalSizeBytes = $archiveSize
        installedSha256 = $archiveSha256
        parts = @($partDescriptors | ForEach-Object {
            [ordered]@{
                index = $_.index
                url = $_.url
                sizeBytes = $_.sizeBytes
                sha256 = $_.sha256
            }
        })
    }
} else {
    $download = [ordered]@{
        platform = 'win32-x64'
        archiveType = 'zip'
        delivery = 'single'
        url = Convert-ToDownloadUrl -FilePath $archivePath
        sizeBytes = $archiveSize
        sha256 = $archiveSha256
    }
}

$manifest = [ordered]@{
    schemaVersion = 1
    runtimeVersion = $RuntimeVersion
    compatibleAppVersions = $CompatibleAppVersions
    recommended = $true
    downloads = @($download)
}

Write-Utf8NoBomFile -FilePath $manifestPath -Content ($manifest | ConvertTo-Json -Depth 10)

Write-Host ""
Write-Host "Runtime OCR package pret : $outputRootPath"
Write-Host "Archive : $archivePath"
Write-Host "Manifest : $manifestPath"
Write-Host "Audit : $auditPath"
Write-Host "Taille archive : $([math]::Round($archiveSize / 1GB, 3)) GB"
Write-Host "SHA256 archive : $archiveSha256"
