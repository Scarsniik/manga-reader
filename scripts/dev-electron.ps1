$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$electronPath = Join-Path $repoRoot 'node_modules\electron\dist\electron.exe'
$viteStdout = Join-Path $repoRoot '.vite-dev.stdout.log'
$viteStderr = Join-Path $repoRoot '.vite-dev.stderr.log'
$viteUrl = 'http://127.0.0.1:3000'

function Test-ViteReady {
    param(
        [string]$Url
    )

    try {
        Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 1 | Out-Null
        return $true
    }
    catch {
        return $false
    }
}

if (-not (Test-Path $electronPath)) {
    throw "Electron introuvable: $electronPath"
}

Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue

Push-Location $repoRoot
try {
    & npm.cmd run build:electron
}
finally {
    Pop-Location
}

if (Test-Path $viteStdout) { Remove-Item $viteStdout -Force -ErrorAction SilentlyContinue }
if (Test-Path $viteStderr) { Remove-Item $viteStderr -Force -ErrorAction SilentlyContinue }

$reuseExistingServer = Test-ViteReady -Url $viteUrl
$viteProcess = $null

if (-not $reuseExistingServer) {
    $viteProcess = Start-Process -FilePath 'npm.cmd' `
        -ArgumentList @('run', 'dev', '--', '--host', '127.0.0.1', '--strictPort') `
        -WorkingDirectory $repoRoot `
        -PassThru `
        -RedirectStandardOutput $viteStdout `
        -RedirectStandardError $viteStderr
}

try {
    if (-not $reuseExistingServer) {
        $ready = $false
        for ($i = 0; $i -lt 60; $i++) {
            Start-Sleep -Milliseconds 500

            if ($viteProcess.HasExited) {
                $stdout = if (Test-Path $viteStdout) { Get-Content $viteStdout -Raw } else { '' }
                $stderr = if (Test-Path $viteStderr) { Get-Content $viteStderr -Raw } else { '' }
                throw "Le serveur Vite s'est arrêté avant qu'Electron puisse démarrer.`nSTDOUT:`n$stdout`nSTDERR:`n$stderr"
            }

            if (Test-ViteReady -Url $viteUrl) {
                $ready = $true
                break
            }
        }

        if (-not $ready) {
            $stdout = if (Test-Path $viteStdout) { Get-Content $viteStdout -Raw } else { '' }
            $stderr = if (Test-Path $viteStderr) { Get-Content $viteStderr -Raw } else { '' }
            throw "Timeout en attendant Vite sur $viteUrl.`nSTDOUT:`n$stdout`nSTDERR:`n$stderr"
        }
    } elseif (-not (Test-ViteReady -Url $viteUrl)) {
        throw "Un serveur semble déjà utiliser le port 3000, mais il ne répond pas correctement sur $viteUrl."
    }

    $env:VITE_DEV_SERVER_URL = $viteUrl

    Push-Location $repoRoot
    try {
        & $electronPath .
    }
    finally {
        Pop-Location
    }
}
finally {
    if ($viteProcess -and -not $viteProcess.HasExited) {
        Stop-Process -Id $viteProcess.Id -Force -ErrorAction SilentlyContinue
    }
}
