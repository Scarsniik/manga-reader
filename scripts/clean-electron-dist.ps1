$ErrorActionPreference = 'Stop'

$workspace = (Get-Location).Path
$distDir = [System.IO.Path]::GetFullPath((Join-Path $workspace 'dist'))

if (-not $distDir.StartsWith($workspace, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw 'Refusing to clean outside the workspace.'
}

if (-not (Test-Path -LiteralPath $distDir)) {
    exit 0
}

Get-ChildItem -LiteralPath $distDir -Force -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -ne 'renderer' } |
    Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
