$ErrorActionPreference = 'Stop'

$workspace = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$outputRoot = Join-Path $workspace 'build-resources\ocr-bundle'
$workerScript = Join-Path $workspace 'scripts\ocr_worker.py'
$prepareScript = Join-Path $workspace 'scripts\prepare_ocr_bundle.py'
$paramsPath = Join-Path $env:APPDATA 'manga-helper\data\params.json'

function Resolve-OcrPythonPath {
    if ($env:MANGA_HELPER_OCR_PYTHON -and (Test-Path -LiteralPath $env:MANGA_HELPER_OCR_PYTHON)) {
        return [System.IO.Path]::GetFullPath($env:MANGA_HELPER_OCR_PYTHON)
    }

    if (Test-Path -LiteralPath $paramsPath) {
        try {
            $params = Get-Content -LiteralPath $paramsPath -Raw | ConvertFrom-Json
            if ($params.ocrPythonPath -and (Test-Path -LiteralPath $params.ocrPythonPath)) {
                return [System.IO.Path]::GetFullPath([string]$params.ocrPythonPath)
            }
        } catch {
            Write-Warning "Impossible de lire $paramsPath : $($_.Exception.Message)"
        }
    }

    $fallbacks = @(
        'C:\Program Files\Python311\python.exe',
        'C:\Python311\python.exe'
    )

    foreach ($candidate in $fallbacks) {
        if (Test-Path -LiteralPath $candidate) {
            return $candidate
        }
    }

    return 'python'
}

function Resolve-RepoRoot {
    if ($env:MANGA_HELPER_OCR_REPO_ROOT -and (Test-Path -LiteralPath $env:MANGA_HELPER_OCR_REPO_ROOT)) {
        return [System.IO.Path]::GetFullPath($env:MANGA_HELPER_OCR_REPO_ROOT)
    }

    if (Test-Path -LiteralPath $paramsPath) {
        try {
            $params = Get-Content -LiteralPath $paramsPath -Raw | ConvertFrom-Json
            if ($params.ocrRepoPath -and (Test-Path -LiteralPath $params.ocrRepoPath)) {
                return [System.IO.Path]::GetFullPath([string]$params.ocrRepoPath)
            }
        } catch {
            Write-Warning "Impossible de lire le repo OCR depuis $paramsPath : $($_.Exception.Message)"
        }
    }

    $fallback = 'D:\Cacahouete\projects\Manga OCR'
    if (Test-Path -LiteralPath $fallback) {
        return $fallback
    }

    return $null
}

$pythonPath = Resolve-OcrPythonPath
$repoRoot = Resolve-RepoRoot
$hfModelRoot = if ($env:MANGA_HELPER_OCR_HF_MODEL_ROOT) {
    $env:MANGA_HELPER_OCR_HF_MODEL_ROOT
} else {
    Join-Path $env:USERPROFILE '.cache\huggingface\hub\models--kha-white--manga-ocr-base'
}
$mokuroCacheRoot = if ($env:MANGA_HELPER_OCR_MOKURO_CACHE_ROOT) {
    $env:MANGA_HELPER_OCR_MOKURO_CACHE_ROOT
} else {
    Join-Path $env:USERPROFILE '.cache\manga-ocr'
}

$args = @(
    $prepareScript,
    '--output-root', $outputRoot,
    '--python-executable', $pythonPath,
    '--worker-script', $workerScript,
    '--hf-model-root', $hfModelRoot,
    '--mokuro-cache-root', $mokuroCacheRoot,
    '--clean'
)

if ($repoRoot) {
    $args += @('--repo-root', $repoRoot)
}

Write-Host "Preparation du bundle OCR..."
Write-Host "Python OCR : $pythonPath"
Write-Host "Modele manga-ocr : $hfModelRoot"
Write-Host "Cache mokuro : $mokuroCacheRoot"
if ($repoRoot) {
    Write-Host "Repo OCR source : $repoRoot"
}

& $pythonPath @args

if ($LASTEXITCODE -ne 0) {
    throw "La preparation du bundle OCR a echoue avec le code $LASTEXITCODE."
}

Write-Host "Bundle OCR pret dans $outputRoot"
