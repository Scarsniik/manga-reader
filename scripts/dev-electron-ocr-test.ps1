[CmdletBinding()]
param(
    [switch]$RegenerateRuntime,
    [switch]$ResetRuntimeState,
    [switch]$PrepareOnly
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$repoRoot = Split-Path -Parent $PSScriptRoot
$outputRoot = Join-Path $repoRoot 'build\ocr-runtime-local-test'
$manifestPath = Join-Path $outputRoot 'manifest.json'
$archivePath = Join-Path $outputRoot 'ocr-runtime-local-test.zip'
$generatorPath = Join-Path $PSScriptRoot 'create-local-ocr-runtime-test.ps1'
$devElectronPath = Join-Path $PSScriptRoot 'dev-electron.ps1'

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

function Test-LocalRuntimeArtifacts {
    if (-not (Test-Path -LiteralPath $manifestPath) -or -not (Test-Path -LiteralPath $archivePath)) {
        return $false
    }

    try {
        $manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
        $download = @($manifest.downloads) | Select-Object -First 1
        if (-not $download) {
            return $false
        }

        $archive = Get-Item -LiteralPath $archivePath
        $actualSha256 = Get-Sha256 -FilePath $archivePath

        return (
            $manifest.schemaVersion -eq 1 `
            -and $download.platform -eq 'win32-x64' `
            -and $download.delivery -eq 'single' `
            -and [int64]$download.sizeBytes -eq [int64]$archive.Length `
            -and [string]$download.sha256 -eq $actualSha256
        )
    } catch {
        Write-Warning "Local OCR runtime artifacts are invalid: $($_.Exception.Message)"
        return $false
    }
}

function Get-BackupPath {
    param([string]$PathToBackup)

    $timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
    $candidate = "$PathToBackup.ocr-test-backup-$timestamp"
    $index = 1

    while (Test-Path -LiteralPath $candidate) {
        $candidate = "$PathToBackup.ocr-test-backup-$timestamp-$index"
        $index += 1
    }

    return $candidate
}

function Backup-PathForFreshRun {
    param(
        [string]$Label,
        [string]$PathToBackup
    )

    if (-not (Test-Path -LiteralPath $PathToBackup)) {
        return
    }

    $backupPath = Get-BackupPath -PathToBackup $PathToBackup
    Move-Item -LiteralPath $PathToBackup -Destination $backupPath
    Write-Host "$Label sauvegarde: $backupPath"
}

function Reset-OcrRuntimeState {
    Remove-Item Env:MANGA_HELPER_OCR_RUNTIME_DIR -ErrorAction SilentlyContinue
    Remove-Item Env:MANGA_HELPER_OCR_MANIFEST_URL -ErrorAction SilentlyContinue

    $appConfigDirName = if ([string]::IsNullOrWhiteSpace($env:APP_ROAMING_CONFIG_DIR_NAME)) {
        if ([string]::IsNullOrWhiteSpace($env:APP_PACKAGE_NAME)) { 'scaramanga' } else { $env:APP_PACKAGE_NAME }
    } else {
        $env:APP_ROAMING_CONFIG_DIR_NAME
    }
    $appLocalDataDirName = if ([string]::IsNullOrWhiteSpace($env:APP_LOCAL_DATA_DIR_NAME)) {
        if ([string]::IsNullOrWhiteSpace($env:APP_PRODUCT_NAME)) { 'Scaramanga' } else { $env:APP_PRODUCT_NAME }
    } else {
        $env:APP_LOCAL_DATA_DIR_NAME
    }

    if ($env:APPDATA) {
        Backup-PathForFreshRun `
            -Label 'Config OCR' `
            -PathToBackup (Join-Path $env:APPDATA "$appConfigDirName\data\ocr-runtime.json")
        Backup-PathForFreshRun `
            -Label 'Config OCR legacy' `
            -PathToBackup (Join-Path $env:APPDATA 'manga-helper\data\ocr-runtime.json')
    }

    if ($env:LOCALAPPDATA) {
        Backup-PathForFreshRun `
            -Label 'Runtime OCR' `
            -PathToBackup (Join-Path $env:LOCALAPPDATA "$appLocalDataDirName\ocr-runtime")
        Backup-PathForFreshRun `
            -Label 'Runtime OCR legacy' `
            -PathToBackup (Join-Path $env:LOCALAPPDATA 'Manga Helper\ocr-runtime')
    }
}

if ($RegenerateRuntime -or -not (Test-LocalRuntimeArtifacts)) {
    Write-Host 'Preparation du runtime OCR local de test...'
    & $generatorPath -Force
} else {
    Write-Host "Runtime OCR local de test deja pret: $manifestPath"
}

if ($ResetRuntimeState) {
    Reset-OcrRuntimeState
}

$env:MANGA_HELPER_OCR_MANIFEST_PATH = $manifestPath
Remove-Item Env:MANGA_HELPER_OCR_MANIFEST_URL -ErrorAction SilentlyContinue

Write-Host "MANGA_HELPER_OCR_MANIFEST_PATH=$env:MANGA_HELPER_OCR_MANIFEST_PATH"

if ($PrepareOnly) {
    Write-Host 'Preparation terminee. Lance npm run dev:electron:ocr-test pour demarrer Electron.'
    return
}

& $devElectronPath
