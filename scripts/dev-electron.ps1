$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$electronPath = Join-Path $repoRoot 'node_modules\electron\dist\electron.exe'
$electronPackagePath = Join-Path $repoRoot 'node_modules\electron\package.json'
$viteScriptPath = Join-Path $repoRoot 'node_modules\vite\bin\vite.js'
$typescriptScriptPath = Join-Path $repoRoot 'node_modules\typescript\bin\tsc'
$typescriptCacheDir = Join-Path $repoRoot 'node_modules\.cache\scaramanga'
$typescriptBuildInfoPath = Join-Path $typescriptCacheDir 'electron.tsbuildinfo'
$rendererIndexPath = Join-Path $repoRoot 'dist\renderer\index.html'
$rendererReadyPath = Join-Path $repoRoot 'dist\renderer\.dev-ready'
$viteStdout = Join-Path $repoRoot '.vite-build.stdout.log'
$viteStderr = Join-Path $repoRoot '.vite-build.stderr.log'

function Test-RendererBuildReady {
    return (Test-Path $rendererIndexPath) -and (Test-Path $rendererReadyPath)
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

function Test-ElectronInstallation {
    if (-not (Test-Path $electronPackagePath) -or -not (Test-Path $electronPath)) {
        return $false
    }

    $versionPath = Join-Path $repoRoot 'node_modules\electron\dist\version'
    $pathFile = Join-Path $repoRoot 'node_modules\electron\path.txt'
    if (-not (Test-Path $versionPath) -or -not (Test-Path $pathFile)) {
        return $false
    }

    try {
        $packageVersion = (Get-Content -Raw $electronPackagePath | ConvertFrom-Json).version
        $installedVersion = (Get-Content -Raw $versionPath).Trim().TrimStart('v')
        $installedExecutable = (Get-Content -Raw $pathFile).Trim()
        return $installedVersion -eq $packageVersion -and $installedExecutable -eq 'electron.exe'
    }
    catch {
        return $false
    }
}

function Get-Sha256Hash {
    param(
        [string]$Path
    )

    $stream = [System.IO.File]::OpenRead($Path)
    $sha256 = [System.Security.Cryptography.SHA256]::Create()
    try {
        $hashBytes = $sha256.ComputeHash($stream)
        return ([System.BitConverter]::ToString($hashBytes)).Replace('-', '')
    }
    finally {
        $sha256.Dispose()
        $stream.Dispose()
    }
}

function Restore-ElectronFromCache {
    param(
        [string]$NodePath
    )

    $packageVersion = (Get-Content -Raw $electronPackagePath | ConvertFrom-Json).version
    $nodeArchitecture = (& $NodePath -p 'process.arch').Trim()
    if ($LASTEXITCODE -ne 0) {
        return $false
    }

    $archiveName = "electron-v$packageVersion-win32-$nodeArchitecture.zip"
    $cacheRoot = if ($env:electron_config_cache) {
        $env:electron_config_cache
    }
    else {
        Join-Path $env:LOCALAPPDATA 'electron\Cache'
    }

    if (-not (Test-Path $cacheRoot)) {
        return $false
    }

    $archive = Get-ChildItem -LiteralPath $cacheRoot -Filter $archiveName -File -Recurse -ErrorAction SilentlyContinue |
        Sort-Object LastWriteTime -Descending |
        Select-Object -First 1
    if (-not $archive) {
        return $false
    }

    $checksumsPath = Join-Path $repoRoot 'node_modules\electron\checksums.json'
    $checksums = Get-Content -Raw $checksumsPath | ConvertFrom-Json
    $expectedHash = $checksums.PSObject.Properties[$archiveName].Value
    $actualHash = Get-Sha256Hash -Path $archive.FullName
    if (-not $expectedHash -or $actualHash -ne $expectedHash) {
        Write-Warning "Archive Electron invalide dans le cache: $($archive.FullName)"
        return $false
    }

    Write-Host 'Extraction du binaire Electron depuis le cache local...'
    $distPath = Join-Path $repoRoot 'node_modules\electron\dist'
    $previousProgressPreference = $global:ProgressPreference
    try {
        $global:ProgressPreference = 'SilentlyContinue'
        Expand-Archive -LiteralPath $archive.FullName -DestinationPath $distPath -Force
    }
    finally {
        $global:ProgressPreference = $previousProgressPreference
    }
    Set-Content -LiteralPath (Join-Path $repoRoot 'node_modules\electron\path.txt') `
        -Value 'electron.exe' `
        -NoNewline

    return Test-ElectronInstallation
}

function Repair-ElectronInstallation {
    param(
        [string]$NodePath,
        [string]$NpmPath
    )

    if (-not (Test-Path $electronPackagePath)) {
        throw 'Dependances npm absentes. Executez npm install, puis relancez npm run electron:dev.'
    }

    Write-Host 'Installation Electron incomplete. Reparation automatique en cours...'
    if (Restore-ElectronFromCache -NodePath $NodePath) {
        return
    }

    Push-Location $repoRoot
    try {
        & $NpmPath rebuild electron
        if ($LASTEXITCODE -ne 0) {
            throw "La reparation d'Electron a echoue avec le code $LASTEXITCODE."
        }
    }
    finally {
        Pop-Location
    }

    if (-not (Test-ElectronInstallation) -and -not (Restore-ElectronFromCache -NodePath $NodePath)) {
        throw "Electron reste incomplet apres reparation: $electronPath"
    }
}

function Build-ElectronForDevelopment {
    param(
        [string]$NodePath
    )

    New-Item -ItemType Directory -Path $typescriptCacheDir -Force | Out-Null

    Push-Location $repoRoot
    try {
        & $NodePath $typescriptScriptPath `
            '--project' 'tsconfig.electron.json' `
            '--incremental' `
            '--tsBuildInfoFile' $typescriptBuildInfoPath
        if ($LASTEXITCODE -ne 0) {
            throw "La compilation Electron a echoue avec le code $LASTEXITCODE."
        }
    }
    finally {
        Pop-Location
    }
}

$nodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
if (-not $nodeCommand) {
    throw "Node introuvable: node.exe"
}
$nodePath = $nodeCommand.Source

$npmCommand = Get-Command npm.cmd -ErrorAction SilentlyContinue
if (-not $npmCommand) {
    throw "npm introuvable: npm.cmd"
}

Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue

if (-not (Test-ElectronInstallation)) {
    Repair-ElectronInstallation -NodePath $nodePath -NpmPath $npmCommand.Source
}

if (-not (Test-Path $viteScriptPath)) {
    throw "Vite introuvable: $viteScriptPath. Executez npm install."
}

if (-not (Test-Path $typescriptScriptPath)) {
    throw "TypeScript introuvable: $typescriptScriptPath. Executez npm install."
}

if (Test-Path $viteStdout) { Remove-Item $viteStdout -Force -ErrorAction SilentlyContinue }
if (Test-Path $viteStderr) { Remove-Item $viteStderr -Force -ErrorAction SilentlyContinue }
if (Test-Path $rendererReadyPath) { Remove-Item $rendererReadyPath -Force -ErrorAction SilentlyContinue }

Write-Host 'Compilation rapide du renderer...'
$env:SCARAMANGA_DEV_PARENT_PID = "$PID"
try {
    $viteProcess = Start-Process -FilePath $nodePath `
        -ArgumentList @($viteScriptPath, 'build', '--watch', '--mode', 'development', '--minify=false', '--sourcemap') `
        -WorkingDirectory $repoRoot `
        -WindowStyle Hidden `
        -PassThru `
        -RedirectStandardOutput $viteStdout `
        -RedirectStandardError $viteStderr
}
finally {
    Remove-Item Env:SCARAMANGA_DEV_PARENT_PID -ErrorAction SilentlyContinue
}

try {
    Build-ElectronForDevelopment -NodePath $nodePath

    $ready = $false
    for ($i = 0; $i -lt 480; $i++) {
        Start-Sleep -Milliseconds 250

        if ($viteProcess.HasExited) {
            $stdout = if (Test-Path $viteStdout) { Get-Content $viteStdout -Raw } else { '' }
            $stderr = if (Test-Path $viteStderr) { Get-Content $viteStderr -Raw } else { '' }
            throw "La compilation Vite s'est arretee avant le demarrage d'Electron.`nSTDOUT:`n$stdout`nSTDERR:`n$stderr"
        }

        if (Test-RendererBuildReady) {
            $ready = $true
            break
        }
    }

    if (-not $ready) {
        $stdout = if (Test-Path $viteStdout) { Get-Content $viteStdout -Raw } else { '' }
        $stderr = if (Test-Path $viteStderr) { Get-Content $viteStderr -Raw } else { '' }
        throw "Timeout en attendant la compilation Vite.`nSTDOUT:`n$stdout`nSTDERR:`n$stderr"
    }

    Write-Host 'Renderer pret. Demarrage d Electron...'
    $env:ELECTRON_DEV_RENDERER_BUILD = '1'
    Remove-Item Env:VITE_DEV_SERVER_URL -ErrorAction SilentlyContinue

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

    Remove-Item Env:ELECTRON_DEV_RENDERER_BUILD -ErrorAction SilentlyContinue
}
