param(
    [Parameter(Mandatory = $true)]
    [string]$BackupPath,
    [switch]$IncludeOcrRuntime,
    [switch]$IncludeLibrary,
    [switch]$Force,
    [switch]$SkipCurrentBackup,
    [string]$PreRestoreBackupRoot = ''
)

$ErrorActionPreference = 'Stop'

function Get-AppIdentityValue {
    param(
        [string[]]$Names,
        [string]$Fallback
    )

    foreach ($name in $Names) {
        $value = [Environment]::GetEnvironmentVariable($name)
        if (-not [string]::IsNullOrWhiteSpace($value)) {
            return $value.Trim()
        }
    }

    return $Fallback
}

function Get-AppProductName {
    return Get-AppIdentityValue -Names @('APP_PRODUCT_NAME', 'SCARAMANGA_PRODUCT_NAME') -Fallback 'Scaramanga'
}

function Get-AppPackageName {
    $fallback = (Get-AppProductName).ToLowerInvariant() -replace '[^a-z0-9._-]+', '-'
    $fallback = $fallback.Trim('-')
    if ([string]::IsNullOrWhiteSpace($fallback)) {
        $fallback = 'scaramanga'
    }

    return Get-AppIdentityValue -Names @('APP_PACKAGE_NAME', 'SCARAMANGA_PACKAGE_NAME') -Fallback $fallback
}

function Get-FullPath {
    param([string]$Path)

    if ([string]::IsNullOrWhiteSpace($Path)) {
        return ''
    }

    return [System.IO.Path]::GetFullPath($Path)
}

function Assert-AppIsNotRunning {
    $processNames = @(
        Get-AppProductName
        Get-AppPackageName
        'Manga Helper'
        'manga-helper'
    ) | Where-Object { -not [string]::IsNullOrWhiteSpace($_) } | Select-Object -Unique

    $runningProcesses = Get-Process -ErrorAction SilentlyContinue |
        Where-Object { $_.ProcessName -in $processNames }

    if ($runningProcesses) {
        $names = ($runningProcesses | Select-Object -ExpandProperty ProcessName -Unique) -join ', '
        throw "$(Get-AppProductName) is running ($names). Close it before restoring user data."
    }
}

function Resolve-BackupManifest {
    param([string]$Path)

    $resolvedPath = Resolve-Path -LiteralPath $Path -ErrorAction Stop
    $backupItem = Get-Item -LiteralPath $resolvedPath.ProviderPath

    if ($backupItem.PSIsContainer) {
        $manifestPath = Join-Path $backupItem.FullName 'backup-manifest.json'
        if (-not (Test-Path -LiteralPath $manifestPath)) {
            throw "Backup manifest not found in $($backupItem.FullName)."
        }

        return @{
            BackupRoot = $backupItem.FullName
            ManifestPath = $manifestPath
        }
    }

    return @{
        BackupRoot = Split-Path -Parent $backupItem.FullName
        ManifestPath = $backupItem.FullName
    }
}

function Test-IsSubPath {
    param(
        [string]$Path,
        [string]$ParentPath
    )

    if ([string]::IsNullOrWhiteSpace($Path) -or [string]::IsNullOrWhiteSpace($ParentPath)) {
        return $false
    }

    $resolvedPath = Get-FullPath $Path
    $resolvedParent = (Get-FullPath $ParentPath).TrimEnd('\')
    return $resolvedPath.StartsWith($resolvedParent + '\', [System.StringComparison]::OrdinalIgnoreCase)
}

function Assert-SafeRestoreTarget {
    param(
        [string]$TargetPath,
        [string]$Kind
    )

    $resolvedTarget = Get-FullPath $TargetPath
    if ([string]::IsNullOrWhiteSpace($resolvedTarget)) {
        throw 'Restore target is empty.'
    }

    $driveRoot = [System.IO.Path]::GetPathRoot($resolvedTarget).TrimEnd('\')
    if ($resolvedTarget.TrimEnd('\') -eq $driveRoot) {
        throw "Refusing to restore to drive root: $resolvedTarget"
    }

    $forbiddenTargets = @(
        $env:WINDIR,
        $env:PROGRAMFILES,
        ${env:ProgramFiles(x86)}
    ) | Where-Object { -not [string]::IsNullOrWhiteSpace($_) }

    foreach ($forbiddenTarget in $forbiddenTargets) {
        if ($resolvedTarget.TrimEnd('\').Equals((Get-FullPath $forbiddenTarget).TrimEnd('\'), [System.StringComparison]::OrdinalIgnoreCase)) {
            throw "Refusing to restore directly to protected folder: $resolvedTarget"
        }
    }

    if ($Kind -eq 'library') {
        if (-not $IncludeLibrary) {
            throw 'Library restore requires -IncludeLibrary.'
        }

        return
    }

    $allowedParents = @(
        $env:LOCALAPPDATA,
        $env:APPDATA
    ) | Where-Object { -not [string]::IsNullOrWhiteSpace($_) }

    foreach ($allowedParent in $allowedParents) {
        if (Test-IsSubPath -Path $resolvedTarget -ParentPath $allowedParent) {
            return
        }
    }

    throw "Refusing to restore outside LOCALAPPDATA or APPDATA: $resolvedTarget"
}

function Invoke-PreRestoreBackup {
    param(
        [object[]]$ManifestItems
    )

    if ($SkipCurrentBackup -or -not $Force) {
        return
    }

    $backupScript = Join-Path $PSScriptRoot 'backup-user-data.ps1'
    if (-not (Test-Path -LiteralPath $backupScript)) {
        throw "Pre-restore backup script not found: $backupScript"
    }

    $arguments = @()
    if (-not [string]::IsNullOrWhiteSpace($PreRestoreBackupRoot)) {
        $arguments += '-DestinationRoot'
        $arguments += $PreRestoreBackupRoot
    }
    if ($IncludeOcrRuntime) {
        $arguments += '-IncludeOcrRuntime'
    }

    $libraryItem = $ManifestItems |
        Where-Object { $_.kind -eq 'library' -and $_.status -eq 'copied' } |
        Select-Object -First 1

    if ($IncludeLibrary -and $libraryItem) {
        $arguments += '-LibraryPath'
        $arguments += $libraryItem.sourcePath
    }

    Write-Host 'Creating pre-restore backup of current user data.'
    & $backupScript @arguments
}

function Restore-BackupItem {
    param(
        [string]$BackupRoot,
        [object]$Item
    )

    if ($Item.status -ne 'copied') {
        Write-Host "Skipping $($Item.name): backup item status is $($Item.status)."
        return
    }

    if ($Item.kind -like '*ocrRuntime' -and -not $IncludeOcrRuntime) {
        Write-Host "Skipping $($Item.name): pass -IncludeOcrRuntime to restore it."
        return
    }

    if ($Item.kind -eq 'library' -and -not $IncludeLibrary) {
        Write-Host "Skipping $($Item.name): pass -IncludeLibrary to restore it."
        return
    }

    $sourcePath = Join-Path $BackupRoot $Item.backupRelativePath
    $targetPath = Get-FullPath $Item.sourcePath

    if (-not (Test-Path -LiteralPath $sourcePath)) {
        throw "Backup item folder is missing: $sourcePath"
    }

    Assert-SafeRestoreTarget -TargetPath $targetPath -Kind $Item.kind

    if (-not $Force) {
        Write-Host "Dry run: would restore $targetPath from $sourcePath"
        return
    }

    if (Test-Path -LiteralPath $targetPath) {
        Remove-Item -LiteralPath $targetPath -Recurse -Force
    }

    Copy-Item `
        -LiteralPath $sourcePath `
        -Destination $targetPath `
        -Recurse `
        -Force

    Write-Host "Restored $targetPath"
}

Assert-AppIsNotRunning

$backupManifest = Resolve-BackupManifest -Path $BackupPath
$manifest = Get-Content -LiteralPath $backupManifest.ManifestPath -Raw | ConvertFrom-Json

if ($manifest.schemaVersion -ne 1) {
    throw "Unsupported backup manifest schema version: $($manifest.schemaVersion)"
}

$items = @($manifest.items)
Invoke-PreRestoreBackup -ManifestItems $items

foreach ($item in $items) {
    Restore-BackupItem -BackupRoot $backupManifest.BackupRoot -Item $item
}

if (-not $Force) {
    Write-Host 'Dry run completed. Re-run with -Force to restore user data.'
} else {
    Write-Host 'Restore completed.'
}
