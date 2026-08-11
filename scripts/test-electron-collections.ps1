$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$electronPath = Join-Path $repoRoot 'node_modules\electron\dist\electron.exe'
$testScriptPath = Join-Path $PSScriptRoot 'electron-collections-integration.cjs'

if (-not (Test-Path -LiteralPath $electronPath)) {
    throw "Electron not found: $electronPath"
}

Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue

Push-Location $repoRoot
try {
    $testProcess = Start-Process `
        -FilePath $electronPath `
        -ArgumentList @($testScriptPath) `
        -WindowStyle Hidden `
        -Wait `
        -PassThru
    if ($testProcess.ExitCode -ne 0) {
        throw "Electron collections integration failed with exit code $($testProcess.ExitCode)."
    }
}
finally {
    Pop-Location
}
