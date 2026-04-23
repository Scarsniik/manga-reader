$ErrorActionPreference = 'Stop'

$workspace = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$buildDir = [System.IO.Path]::GetFullPath((Join-Path $workspace 'build'))

if (-not $buildDir.StartsWith($workspace, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw 'Refusing to archive outside the workspace.'
}

$winUnpacked = Join-Path $buildDir 'win-unpacked'
$archiveFolderName = if ([string]::IsNullOrWhiteSpace($env:APP_ARTIFACT_BASE_NAME)) {
    'Scaramanga'
} else {
    $env:APP_ARTIFACT_BASE_NAME
}
$archiveDir = Join-Path $buildDir $archiveFolderName
$zipPath = Join-Path $archiveDir 'win-unpacked.zip'
$legacyZipPath = Join-Path $buildDir 'win-unpacked.zip'

if (-not (Test-Path -LiteralPath $winUnpacked)) {
    throw "Dossier win-unpacked introuvable : $winUnpacked"
}

if (-not (Test-Path -LiteralPath $archiveDir)) {
    New-Item -ItemType Directory -Path $archiveDir | Out-Null
}

if (Test-Path -LiteralPath $zipPath) {
    Remove-Item -LiteralPath $zipPath -Force
}

if (Test-Path -LiteralPath $legacyZipPath) {
    Remove-Item -LiteralPath $legacyZipPath -Force
}

$tar = Get-Command tar.exe -ErrorAction SilentlyContinue
if (-not $tar) {
    throw 'tar.exe est introuvable sur cette machine.'
}

& $tar.Source -a -cf $zipPath -C $buildDir 'win-unpacked'

if ($LASTEXITCODE -ne 0) {
    throw "La creation de l'archive a echoue avec le code $LASTEXITCODE."
}

Write-Host "Archive creee : $zipPath"
