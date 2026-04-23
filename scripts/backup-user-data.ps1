param(
    [string]$DestinationRoot = '',
    [switch]$IncludeOcrRuntime,
    [string]$LibraryPath = '',
    [switch]$AllowRunningApp
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

function Get-DefaultBackupRoot {
    $desktopPath = [Environment]::GetFolderPath('DesktopDirectory')
    if ([string]::IsNullOrWhiteSpace($desktopPath)) {
        $desktopPath = Join-Path $env:USERPROFILE 'Desktop'
    }

    $backupDirName = Get-AppIdentityValue `
        -Names @('APP_BACKUP_DIR_NAME', 'SCARAMANGA_BACKUP_DIR_NAME') `
        -Fallback "$((Get-AppProductName) -replace '\s+', '')-backups"

    return Join-Path $desktopPath $backupDirName
}

function Get-FullPath {
    param([string]$Path)

    if ([string]::IsNullOrWhiteSpace($Path)) {
        return ''
    }

    return [System.IO.Path]::GetFullPath($Path)
}

function Assert-AppIsNotRunning {
    if ($AllowRunningApp) {
        return
    }

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
        throw "$(Get-AppProductName) is running ($names). Close it before backing up, or pass -AllowRunningApp."
    }
}

function New-BackupRoot {
    param([string]$Root)

    $timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
    $candidate = Join-Path $Root $timestamp
    $suffix = 1

    while (Test-Path -LiteralPath $candidate) {
        $candidate = Join-Path $Root "$timestamp-$suffix"
        $suffix += 1
    }

    New-Item -ItemType Directory -Force -Path $candidate | Out-Null
    return $candidate
}

function New-BackupItem {
    param(
        [string]$Name,
        [string]$SourcePath,
        [string]$Kind,
        [bool]$Optional = $true
    )

    return [ordered]@{
        name = $Name
        sourcePath = Get-FullPath $SourcePath
        backupRelativePath = $Name
        kind = $Kind
        optional = $Optional
    }
}

if ([string]::IsNullOrWhiteSpace($DestinationRoot)) {
    $DestinationRoot = Get-DefaultBackupRoot
}

$DestinationRoot = Get-FullPath $DestinationRoot
Assert-AppIsNotRunning

$items = @()
$packageName = Get-AppPackageName
$productName = Get-AppProductName
$userDataDirName = Get-AppIdentityValue `
    -Names @('APP_USER_DATA_DIR_NAME', 'SCARAMANGA_USER_DATA_DIR_NAME') `
    -Fallback "$packageName-userdata"
$roamingConfigDirName = Get-AppIdentityValue `
    -Names @('APP_ROAMING_CONFIG_DIR_NAME', 'SCARAMANGA_ROAMING_CONFIG_DIR_NAME') `
    -Fallback $packageName
$localDataDirName = Get-AppIdentityValue `
    -Names @('APP_LOCAL_DATA_DIR_NAME', 'SCARAMANGA_LOCAL_DATA_DIR_NAME') `
    -Fallback $productName

if (-not [string]::IsNullOrWhiteSpace($env:LOCALAPPDATA)) {
    $items += New-BackupItem `
        -Name "localappdata-$userDataDirName" `
        -SourcePath (Join-Path $env:LOCALAPPDATA $userDataDirName) `
        -Kind 'appData'
    $items += New-BackupItem `
        -Name 'legacy-localappdata-manga-helper-userdata' `
        -SourcePath (Join-Path $env:LOCALAPPDATA 'manga-helper-userdata') `
        -Kind 'legacyAppData'
}

if (-not [string]::IsNullOrWhiteSpace($env:APPDATA)) {
    $items += New-BackupItem `
        -Name "appdata-$roamingConfigDirName" `
        -SourcePath (Join-Path $env:APPDATA $roamingConfigDirName) `
        -Kind 'appData'
    $items += New-BackupItem `
        -Name 'legacy-appdata-manga-helper' `
        -SourcePath (Join-Path $env:APPDATA 'manga-helper') `
        -Kind 'legacyAppData'
}

if ($IncludeOcrRuntime -and -not [string]::IsNullOrWhiteSpace($env:LOCALAPPDATA)) {
    $items += New-BackupItem `
        -Name 'localappdata-ocr-runtime' `
        -SourcePath (Join-Path $env:LOCALAPPDATA "$localDataDirName\ocr-runtime") `
        -Kind 'ocrRuntime'
    $items += New-BackupItem `
        -Name 'legacy-localappdata-manga-helper-ocr-runtime' `
        -SourcePath (Join-Path $env:LOCALAPPDATA 'Manga Helper\ocr-runtime') `
        -Kind 'legacyOcrRuntime'
}

if (-not [string]::IsNullOrWhiteSpace($LibraryPath)) {
    $items += New-BackupItem `
        -Name 'library' `
        -SourcePath $LibraryPath `
        -Kind 'library'
}

$backupRoot = New-BackupRoot $DestinationRoot
$manifestItems = @()

foreach ($item in $items) {
    $destinationPath = Join-Path $backupRoot $item.backupRelativePath
    $status = 'missing'

    if (Test-Path -LiteralPath $item.sourcePath) {
        Copy-Item `
            -LiteralPath $item.sourcePath `
            -Destination $destinationPath `
            -Recurse `
            -Force
        $status = 'copied'
        Write-Host "Copied $($item.sourcePath)"
    } else {
        Write-Host "Skipped missing path $($item.sourcePath)"
    }

    $manifestItems += [ordered]@{
        name = $item.name
        sourcePath = $item.sourcePath
        backupRelativePath = $item.backupRelativePath
        kind = $item.kind
        optional = $item.optional
        status = $status
    }
}

$manifest = [ordered]@{
    schemaVersion = 1
    createdAt = (Get-Date).ToUniversalTime().ToString('o')
    tool = 'backup-user-data.ps1'
    appName = $productName
    machineName = $env:COMPUTERNAME
    userName = $env:USERNAME
    backupRoot = $backupRoot
    includeOcrRuntime = [bool]$IncludeOcrRuntime
    items = $manifestItems
}

$manifestPath = Join-Path $backupRoot 'backup-manifest.json'
$manifest | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $manifestPath -Encoding UTF8

Write-Host "Backup created in $backupRoot"
Write-Host "Manifest written to $manifestPath"
