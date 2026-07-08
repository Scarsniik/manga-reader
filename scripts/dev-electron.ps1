$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$electronPath = Join-Path $repoRoot 'node_modules\electron\dist\electron.exe'
$viteScriptPath = Join-Path $repoRoot 'node_modules\vite\bin\vite.js'
$viteStdout = Join-Path $repoRoot '.vite-dev.stdout.log'
$viteStderr = Join-Path $repoRoot '.vite-dev.stderr.log'
$viteHost = '127.0.0.1'
$vitePort = 3000
$viteUrl = "http://${viteHost}:${vitePort}"

function Test-TcpPortOpen {
    param(
        [string]$HostName,
        [int]$Port,
        [int]$TimeoutMs = 250
    )

    $client = [System.Net.Sockets.TcpClient]::new()
    try {
        $connectTask = $client.ConnectAsync($HostName, $Port)
        if (-not $connectTask.Wait($TimeoutMs)) {
            return $false
        }

        if ($connectTask.IsFaulted -or $connectTask.IsCanceled) {
            return $false
        }

        return $client.Connected
    }
    catch {
        return $false
    }
    finally {
        $client.Dispose()
    }
}

function Test-ViteLogReady {
    param(
        [string]$StdoutPath
    )

    if (-not (Test-Path $StdoutPath)) {
        return $false
    }

    $stdout = Get-Content $StdoutPath -Raw -ErrorAction SilentlyContinue
    $ansiPattern = "$([char]27)\[[0-?]*[ -/]*[@-~]"
    $plainStdout = $stdout -replace $ansiPattern, ''
    return $plainStdout -match 'ready in\s+\d+\s*ms' -or $plainStdout -match 'Local:\s+http://'
}

function Test-VitePortOwner {
    param(
        [int]$Port,
        [string]$ExpectedScriptPath
    )

    $connections = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
    foreach ($connection in $connections) {
        $processInfo = Get-CimInstance Win32_Process -Filter "ProcessId = $($connection.OwningProcess)" -ErrorAction SilentlyContinue
        if (-not $processInfo) {
            continue
        }

        $commandLine = if ($processInfo.CommandLine) { $processInfo.CommandLine } else { '' }
        if ($commandLine.IndexOf($ExpectedScriptPath, [System.StringComparison]::OrdinalIgnoreCase) -ge 0) {
            return $true
        }
    }

    return $false
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

$reuseExistingServer = Test-VitePortOwner -Port $vitePort -ExpectedScriptPath $viteScriptPath
$viteProcess = $null

if (-not $reuseExistingServer) {
    if (Test-TcpPortOpen -HostName $viteHost -Port $vitePort) {
        throw "Un serveur utilise deja le port $vitePort, mais ce n'est pas le serveur Vite attendu."
    }

    if (Test-Path $viteStdout) { Remove-Item $viteStdout -Force -ErrorAction SilentlyContinue }
    if (Test-Path $viteStderr) { Remove-Item $viteStderr -Force -ErrorAction SilentlyContinue }

    $viteProcess = Start-Process -FilePath $nodePath `
        -ArgumentList @($viteScriptPath, '--host', $viteHost, '--strictPort') `
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
            Start-Sleep -Milliseconds 250

            if ($viteProcess.HasExited) {
                $stdout = if (Test-Path $viteStdout) { Get-Content $viteStdout -Raw } else { '' }
                $stderr = if (Test-Path $viteStderr) { Get-Content $viteStderr -Raw } else { '' }
                throw "Le serveur Vite s'est arrêté avant qu'Electron puisse démarrer.`nSTDOUT:`n$stdout`nSTDERR:`n$stderr"
            }

            if ((Test-ViteLogReady -StdoutPath $viteStdout) -and (Test-TcpPortOpen -HostName $viteHost -Port $vitePort)) {
                $ready = $true
                break
            }
        }

        if (-not $ready) {
            $stdout = if (Test-Path $viteStdout) { Get-Content $viteStdout -Raw } else { '' }
            $stderr = if (Test-Path $viteStderr) { Get-Content $viteStderr -Raw } else { '' }
            throw "Timeout en attendant Vite sur $viteUrl.`nSTDOUT:`n$stdout`nSTDERR:`n$stderr"
        }
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
