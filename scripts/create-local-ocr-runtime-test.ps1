[CmdletBinding()]
param(
    [ValidateSet('Fake', 'ExistingBundle')]
    [string]$Mode = 'Fake',

    [string]$OutputRoot = 'build\ocr-runtime-local-test',

    [string]$SourceRuntime = 'build-resources\ocr-bundle',

    [string]$RuntimeVersion = 'local-test-1.0.0',

    [switch]$VerifyArchive,

    [switch]$Force
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$workspace = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$outputRootPath = [System.IO.Path]::GetFullPath((Join-Path $workspace $OutputRoot))
$sourceRuntimePath = [System.IO.Path]::GetFullPath((Join-Path $workspace $SourceRuntime))
$stagingRoot = Join-Path $outputRootPath 'staging'
$stagedRuntime = Join-Path $stagingRoot 'ocr-runtime'
$archivePath = Join-Path $outputRootPath 'ocr-runtime-local-test.zip'
$manifestPath = Join-Path $outputRootPath 'manifest.json'
$envScriptPath = Join-Path $outputRootPath 'use-local-manifest.ps1'
$verifyRoot = Join-Path $outputRootPath 'verify'
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)

function Assert-InWorkspace {
    param([string]$PathToCheck)

    $fullPath = [System.IO.Path]::GetFullPath($PathToCheck)
    if (-not $fullPath.StartsWith($workspace, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "Refusing to write outside workspace: $fullPath"
    }
}

function Convert-ToFileUrl {
    param([string]$PathToConvert)

    return ([System.Uri][System.IO.Path]::GetFullPath($PathToConvert)).AbsoluteUri
}

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

function Get-DirectorySize {
    param([string]$DirectoryPath)

    $size = (Get-ChildItem -LiteralPath $DirectoryPath -Recurse -File | Measure-Object -Property Length -Sum).Sum
    if ($null -eq $size) {
        return 0
    }
    return [int64]$size
}

function Write-Utf8NoBomFile {
    param(
        [string]$FilePath,
        [string]$Content
    )

    $parentDirectory = Split-Path -Parent $FilePath
    if ($parentDirectory) {
        New-Item -ItemType Directory -Path $parentDirectory -Force | Out-Null
    }

    [System.IO.File]::WriteAllText($FilePath, $Content, $utf8NoBom)
}

function Write-RuntimeMetadata {
    param([string]$RuntimePath)

    $metadata = [ordered]@{
        schemaVersion = 1
        runtimeVersion = $RuntimeVersion
        platform = 'win32-x64'
        compatibleAppVersions = '>=1.0.0 <2.0.0'
        installedAt = (Get-Date).ToUniversalTime().ToString('o')
        sourceManifestUrl = 'local-test-staging'
        installPath = $RuntimePath
        supportsGpu = $false
    }

    Write-Utf8NoBomFile -FilePath (Join-Path $RuntimePath 'runtime-metadata.json') -Content ($metadata | ConvertTo-Json -Depth 10)
}

function Get-PythonCommandPath {
    $pythonCommand = Get-Command python.exe -ErrorAction SilentlyContinue | Select-Object -First 1
    if (-not $pythonCommand) {
        throw "python.exe introuvable dans le PATH. Installe Python ou utilise -Mode ExistingBundle."
    }

    return [string]$pythonCommand.Source
}

function Copy-LocalPythonForFakeRuntime {
    param([string]$TargetPythonDir)

    $pythonExe = Get-PythonCommandPath
    $pythonRoot = Split-Path -Parent $pythonExe
    $pythonLib = Join-Path $pythonRoot 'Lib'
    $pythonDlls = Join-Path $pythonRoot 'DLLs'

    if (-not (Test-Path -LiteralPath $pythonLib)) {
        throw "Le dossier Lib de Python est introuvable: $pythonLib"
    }

    New-Item -ItemType Directory -Path $TargetPythonDir -Force | Out-Null
    Copy-Item -LiteralPath $pythonExe -Destination (Join-Path $TargetPythonDir 'python.exe') -Force

    Get-ChildItem -LiteralPath $pythonRoot -File -ErrorAction SilentlyContinue |
        Where-Object { $_.Name -like 'python*.dll' -or $_.Name -like 'vcruntime*.dll' } |
        ForEach-Object {
            Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $TargetPythonDir $_.Name) -Force
        }

    $targetLib = Join-Path $TargetPythonDir 'Lib'
    New-Item -ItemType Directory -Path $targetLib -Force | Out-Null
    Copy-Item -Path (Join-Path $pythonLib '*') -Destination $targetLib -Recurse -Force

    if (Test-Path -LiteralPath $pythonDlls) {
        $targetDlls = Join-Path $TargetPythonDir 'DLLs'
        New-Item -ItemType Directory -Path $targetDlls -Force | Out-Null
        Copy-Item -Path (Join-Path $pythonDlls '*') -Destination $targetDlls -Recurse -Force
    }
}

function New-FakeWorkerScript {
    param([string]$WorkerPath)

    $workerContent = @'
import json
import sys
import time
import traceback


def send(payload):
    sys.stdout.write(json.dumps(payload, ensure_ascii=False) + "\n")
    sys.stdout.flush()


def recognize(image_path):
    return {
        "version": "local-test-worker-v1",
        "img_width": 1000,
        "img_height": 1400,
        "blocks": [
            {
                "box": [120, 180, 560, 360],
                "vertical": False,
                "font_size": 32,
                "prob": 1.0,
                "language": "ja",
                "lines": ["テストOCR"],
                "lines_coords": [],
            }
        ],
        "profile": {
            "version": "local-test-profile-v1",
            "duration_ms": 1,
            "passes": [],
        },
    }


for line in sys.stdin:
    try:
        request = json.loads(line)
        request_id = request.get("id")
        request_type = request.get("type")

        if request_type == "ping":
            send({"id": request_id, "ok": True, "python": sys.executable})
        elif request_type == "prewarm":
            send({"id": request_id, "ok": True, "result": True})
        elif request_type == "recognize":
            send({"id": request_id, "ok": True, "result": recognize(request.get("imagePath", ""))})
        elif request_type == "terminate":
            send({"id": request_id, "ok": True, "result": True})
            break
        else:
            send({"id": request_id, "ok": False, "error": "Unknown request type"})
    except Exception as error:
        send({
            "id": None,
            "ok": False,
            "error": str(error),
            "traceback": traceback.format_exc(),
        })

    time.sleep(0.001)
'@

    Write-Utf8NoBomFile -FilePath $WorkerPath -Content $workerContent
}

function New-FakeRuntime {
    if (Test-Path -LiteralPath $stagedRuntime) {
        Remove-Item -LiteralPath $stagedRuntime -Recurse -Force
    }

    New-Item -ItemType Directory -Path $stagedRuntime -Force | Out-Null
    Copy-LocalPythonForFakeRuntime -TargetPythonDir (Join-Path $stagedRuntime 'python')

    $scriptsDir = Join-Path $stagedRuntime 'scripts'
    $modelDir = Join-Path $stagedRuntime 'models\manga-ocr-base'
    $cacheDir = Join-Path $stagedRuntime 'cache\manga-ocr'
    New-Item -ItemType Directory -Path $scriptsDir, $modelDir, $cacheDir -Force | Out-Null

    New-FakeWorkerScript -WorkerPath (Join-Path $scriptsDir 'ocr_worker.py')
    Write-Utf8NoBomFile -FilePath (Join-Path $modelDir 'config.json') -Content '{"model_type":"local-test"}'
    Write-Utf8NoBomFile -FilePath (Join-Path $modelDir 'tokenizer_config.json') -Content '{"tokenizer_class":"local-test"}'
    Write-Utf8NoBomFile -FilePath (Join-Path $cacheDir 'comictextdetector.pt') -Content 'local-test-detector'
    Write-RuntimeMetadata -RuntimePath $stagedRuntime
}

function Test-RuntimeStructure {
    param([string]$RuntimePath)

    $requiredPaths = @(
        'python\python.exe',
        'scripts\ocr_worker.py',
        'models\manga-ocr-base',
        'cache\manga-ocr\comictextdetector.pt'
    )

    foreach ($relativePath in $requiredPaths) {
        $candidate = Join-Path $RuntimePath $relativePath
        if (-not (Test-Path -LiteralPath $candidate)) {
            throw "Runtime incomplet, fichier manquant: $candidate"
        }
    }
}

function Set-ProcessEnvironmentValue {
    param(
        [string]$Name,
        [string]$Value
    )

    if ($null -eq $Value) {
        Remove-Item "Env:$Name" -ErrorAction SilentlyContinue
        return
    }

    [Environment]::SetEnvironmentVariable($Name, $Value, 'Process')
}

function Test-FakeWorker {
    param([string]$RuntimePath)

    $pythonPath = Join-Path $RuntimePath 'python\python.exe'
    $workerPath = Join-Path $RuntimePath 'scripts\ocr_worker.py'
    $previousPythonHome = [Environment]::GetEnvironmentVariable('PYTHONHOME')
    $previousPythonPath = [Environment]::GetEnvironmentVariable('PYTHONPATH')

    try {
        Set-ProcessEnvironmentValue -Name 'PYTHONHOME' -Value (Join-Path $RuntimePath 'python')
        Set-ProcessEnvironmentValue -Name 'PYTHONPATH' -Value (Join-Path $RuntimePath 'scripts')

        $responses = @(
            '{"id":"local-test-ping","type":"ping"}',
            '{"id":"local-test-terminate","type":"terminate"}'
        ) | & $pythonPath -u $workerPath 2>&1

        if ($LASTEXITCODE -ne 0) {
            throw "Fake worker exited with code $LASTEXITCODE. Output: $($responses -join "`n")"
        }
    } finally {
        Set-ProcessEnvironmentValue -Name 'PYTHONHOME' -Value $previousPythonHome
        Set-ProcessEnvironmentValue -Name 'PYTHONPATH' -Value $previousPythonPath
    }

    $pingResponse = $responses |
        ForEach-Object { [string]$_ } |
        Where-Object { $_.Contains('local-test-ping') } |
        Select-Object -First 1
    if (-not $pingResponse) {
        throw 'Fake worker verification failed: no ping response.'
    }

    $parsedResponse = $pingResponse | ConvertFrom-Json
    if (-not $parsedResponse.ok) {
        throw "Fake worker verification failed: $pingResponse"
    }
}

function New-RuntimeArchive {
    param([string]$RuntimePath)

    if (Test-Path -LiteralPath $archivePath) {
        Remove-Item -LiteralPath $archivePath -Force
    }

    Compress-Archive -Path (Join-Path $RuntimePath '*') -DestinationPath $archivePath -CompressionLevel Fastest -Force
}

function Test-ArchiveRoundTrip {
    if (Test-Path -LiteralPath $verifyRoot) {
        Remove-Item -LiteralPath $verifyRoot -Recurse -Force
    }

    New-Item -ItemType Directory -Path $verifyRoot -Force | Out-Null
    Expand-Archive -LiteralPath $archivePath -DestinationPath $verifyRoot -Force
    Test-RuntimeStructure -RuntimePath $verifyRoot
    Remove-Item -LiteralPath $verifyRoot -Recurse -Force
}

function Test-ManifestFile {
    param(
        [string]$ManifestFilePath,
        [string]$ExpectedSha256,
        [int64]$ExpectedSizeBytes
    )

    $manifestContent = [System.IO.File]::ReadAllText($ManifestFilePath, [System.Text.Encoding]::UTF8)
    $manifestObject = $manifestContent | ConvertFrom-Json
    $download = $manifestObject.downloads | Select-Object -First 1

    if ($manifestObject.schemaVersion -ne 1) {
        throw 'Manifest verification failed: schemaVersion must be 1.'
    }
    if ($download.platform -ne 'win32-x64') {
        throw "Manifest verification failed: unsupported platform $($download.platform)."
    }
    if ($download.delivery -ne 'single') {
        throw "Manifest verification failed: unsupported delivery $($download.delivery)."
    }
    if ([int64]$download.sizeBytes -ne $ExpectedSizeBytes) {
        throw 'Manifest verification failed: archive size mismatch.'
    }
    if ([string]$download.sha256 -ne $ExpectedSha256) {
        throw 'Manifest verification failed: archive SHA256 mismatch.'
    }
}

Assert-InWorkspace -PathToCheck $outputRootPath

if ((Test-Path -LiteralPath $outputRootPath) -and -not $Force) {
    throw "Le dossier existe deja: $outputRootPath. Relance avec -Force pour le remplacer."
}

if (Test-Path -LiteralPath $outputRootPath) {
    Remove-Item -LiteralPath $outputRootPath -Recurse -Force
}

New-Item -ItemType Directory -Path $outputRootPath, $stagingRoot -Force | Out-Null

if ($Mode -eq 'Fake') {
    Write-Host "Creation du runtime OCR local factice..."
    New-FakeRuntime
    $runtimeToArchive = $stagedRuntime
} else {
    Write-Host "Preparation du runtime OCR existant..."
    if (-not (Test-Path -LiteralPath $sourceRuntimePath)) {
        throw "Runtime source introuvable: $sourceRuntimePath"
    }
    $runtimeToArchive = $sourceRuntimePath
}

Test-RuntimeStructure -RuntimePath $runtimeToArchive

if ($Mode -eq 'Fake') {
    Write-Host "Verification du worker factice..."
    Test-FakeWorker -RuntimePath $runtimeToArchive
}

Write-Host "Creation de l'archive locale..."
New-RuntimeArchive -RuntimePath $runtimeToArchive

$archiveSize = (Get-Item -LiteralPath $archivePath).Length
$archiveSha256 = Get-Sha256 -FilePath $archivePath
$archiveUrl = Convert-ToFileUrl -PathToConvert $archivePath
$sourceSize = Get-DirectorySize -DirectoryPath $runtimeToArchive

$manifest = [ordered]@{
    schemaVersion = 1
    runtimeVersion = $RuntimeVersion
    compatibleAppVersions = '>=1.0.0 <2.0.0'
    recommended = $true
    downloads = @(
        [ordered]@{
            platform = 'win32-x64'
            archiveType = 'zip'
            delivery = 'single'
            url = $archiveUrl
            sizeBytes = $archiveSize
            sha256 = $archiveSha256
        }
    )
}

$manifestJson = $manifest | ConvertTo-Json -Depth 10
Write-Utf8NoBomFile -FilePath $manifestPath -Content $manifestJson

$envScript = @"
`$env:MANGA_HELPER_OCR_MANIFEST_PATH = '$manifestPath'
Write-Host "MANGA_HELPER_OCR_MANIFEST_PATH=`$env:MANGA_HELPER_OCR_MANIFEST_PATH"
Write-Host "Lance ensuite: npm run dev:electron"
"@
Write-Utf8NoBomFile -FilePath $envScriptPath -Content $envScript

Write-Host "Verification du manifeste..."
Test-ManifestFile -ManifestFilePath $manifestPath -ExpectedSha256 $archiveSha256 -ExpectedSizeBytes $archiveSize

if ($Mode -eq 'Fake' -or $VerifyArchive) {
    Write-Host "Verification de l'archive extraite..."
    Test-ArchiveRoundTrip
} else {
    Write-Host "Verification de l'archive extraite ignoree pour ExistingBundle. Ajoute -VerifyArchive si necessaire."
}

Write-Host ""
Write-Host "Manifest local pret : $manifestPath"
Write-Host "Archive locale  : $archivePath"
Write-Host "Source runtime  : $runtimeToArchive"
Write-Host "Taille source   : $([math]::Round($sourceSize / 1MB, 2)) MB"
Write-Host "Taille archive  : $([math]::Round($archiveSize / 1MB, 2)) MB"
Write-Host "SHA256          : $archiveSha256"
Write-Host ""
Write-Host "Pour tester dans cette session PowerShell :"
Write-Host ". '$envScriptPath'"
Write-Host "npm run dev:electron"
