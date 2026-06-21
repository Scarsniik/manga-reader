$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$electronPath = Join-Path $repoRoot 'node_modules\electron\dist\electron.exe'
$viteScriptPath = Join-Path $repoRoot 'node_modules\vite\bin\vite.js'
$viteStdout = Join-Path $repoRoot '.vite-dev.stdout.log'
$viteStderr = Join-Path $repoRoot '.vite-dev.stderr.log'
$viteUrl = 'http://127.0.0.1:3000'

function Test-ViteReady {
    param(
        [string]$Url
    )

    $request = $null
    $response = $null
    $reader = $null
    try {
        $request = [System.Net.HttpWebRequest]::Create($Url)
        $request.Timeout = 2000
        $request.ReadWriteTimeout = 2000
        $request.Proxy = $null
        $response = $request.GetResponse()
        if ($response.StatusCode -ne [System.Net.HttpStatusCode]::OK) {
            return $false
        }

        $reader = [System.IO.StreamReader]::new($response.GetResponseStream())
        $content = $reader.ReadToEnd()
        return $content.Contains('/src/renderer/index.tsx')
    }
    catch {
        return $false
    }
    finally {
        if ($reader) {
            $reader.Dispose()
        }
        if ($response) {
            $response.Dispose()
        }
    }
}

function Stop-ProcessTree {
    param(
        [int]$ProcessId
    )

    $children = Get-CimInstance Win32_Process -Filter "ParentProcessId = $ProcessId" -ErrorAction SilentlyContinue
    foreach ($child in $children) {
        Stop-ProcessTree -ProcessId ([int]$child.ProcessId)
    }

    Stop-Process -Id $ProcessId -Force -ErrorAction SilentlyContinue
}

if (-not (Test-Path $electronPath)) {
    throw "Electron introuvable: $electronPath"
}

if (-not (Test-Path $viteScriptPath)) {
    throw "Vite introuvable: $viteScriptPath"
}

$nodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
if (-not $nodeCommand) {
    throw "Node introuvable: node.exe"
}
$nodePath = $nodeCommand.Source

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
    $viteProcess = Start-Process -FilePath $nodePath `
        -ArgumentList @($viteScriptPath, '--host', '127.0.0.1', '--strictPort') `
        -WorkingDirectory $repoRoot `
        -WindowStyle Hidden `
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
        $electronProcess = Start-Process -FilePath $electronPath `
            -ArgumentList @('.') `
            -WorkingDirectory $repoRoot `
            -PassThru
        $electronProcess.WaitForExit()
    }
    finally {
        Pop-Location
    }
}
finally {
    if ($viteProcess -and -not $viteProcess.HasExited) {
        Stop-ProcessTree -ProcessId $viteProcess.Id
    }
}
