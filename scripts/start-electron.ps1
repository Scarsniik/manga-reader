$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$electronPath = Join-Path $repoRoot 'node_modules\electron\dist\electron.exe'

if (-not (Test-Path $electronPath)) {
    throw "Electron introuvable: $electronPath"
}

Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue

Push-Location $repoRoot
try {
    & npm.cmd run build:electron
    & $electronPath .
}
finally {
    Pop-Location
}
