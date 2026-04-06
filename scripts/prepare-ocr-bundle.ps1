param(
    [switch]$ForceRebuild
)

$ErrorActionPreference = 'Stop'

$workspace = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$outputRoot = Join-Path $workspace 'build-resources\ocr-bundle'
$workerScript = Join-Path $workspace 'scripts\ocr_worker.py'
$prepareScript = Join-Path $workspace 'scripts\prepare_ocr_bundle.py'
$paramsPath = Join-Path $env:APPDATA 'manga-helper\data\params.json'
$dotEnvPath = Join-Path $workspace '.env'

function Import-DotEnvFile {
    param(
        [string]$Path
    )

    if (-not (Test-Path -LiteralPath $Path)) {
        return 0
    }

    $loadedCount = 0

    foreach ($rawLine in Get-Content -LiteralPath $Path) {
        $line = $rawLine.Trim()
        if (-not $line -or $line.StartsWith('#')) {
            continue
        }

        if ($line.StartsWith('export ')) {
            $line = $line.Substring(7).TrimStart()
        }

        $separatorIndex = $line.IndexOf('=')
        if ($separatorIndex -lt 1) {
            continue
        }

        $name = $line.Substring(0, $separatorIndex).Trim()
        if (-not $name) {
            continue
        }

        $existingValue = [Environment]::GetEnvironmentVariable($name)
        if ($null -ne $existingValue) {
            continue
        }

        $value = $line.Substring($separatorIndex + 1)
        if ($value.Length -ge 2) {
            $hasDoubleQuotes = $value.StartsWith('"') -and $value.EndsWith('"')
            $hasSingleQuotes = $value.StartsWith("'") -and $value.EndsWith("'")
            if ($hasDoubleQuotes -or $hasSingleQuotes) {
                $value = $value.Substring(1, $value.Length - 2)
            }
        }

        [Environment]::SetEnvironmentVariable($name, $value, 'Process')
        $loadedCount += 1
    }

    return $loadedCount
}

function Test-TruthyEnvVar {
    param(
        [string]$Name
    )

    $envValue = [Environment]::GetEnvironmentVariable($Name)
    $rawValue = if ($null -eq $envValue) { '' } else { [string]$envValue }
    if (-not $rawValue) {
        return $false
    }

    switch ($rawValue.Trim().ToLowerInvariant()) {
        '1' { return $true }
        'true' { return $true }
        'yes' { return $true }
        'on' { return $true }
        default { return $false }
    }
}

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

$loadedDotEnvCount = Import-DotEnvFile -Path $dotEnvPath

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
$disableBundleCache = $ForceRebuild -or (Test-TruthyEnvVar -Name 'MANGA_HELPER_DISABLE_OCR_BUNDLE_CACHE')

$args = @(
    $prepareScript,
    '--output-root', $outputRoot,
    '--python-executable', $pythonPath,
    '--worker-script', $workerScript,
    '--hf-model-root', $hfModelRoot,
    '--mokuro-cache-root', $mokuroCacheRoot,
    '--clean'
)

if (-not $disableBundleCache) {
    $args += '--skip-if-fresh'
}

if ($repoRoot) {
    $args += @('--repo-root', $repoRoot)
}

Write-Host "Preparation du bundle OCR..."
if ($loadedDotEnvCount -gt 0) {
    Write-Host "Variables .env chargees : $loadedDotEnvCount"
}
Write-Host "Python OCR : $pythonPath"
Write-Host "Modele manga-ocr : $hfModelRoot"
Write-Host "Cache mokuro : $mokuroCacheRoot"
Write-Host "Cache bundle OCR : $(if ($disableBundleCache) { 'disabled' } else { 'enabled' })"
if ($repoRoot) {
    Write-Host "Repo OCR source : $repoRoot"
}

& $pythonPath @args

if ($LASTEXITCODE -ne 0) {
    throw "La preparation du bundle OCR a echoue avec le code $LASTEXITCODE."
}

Write-Host "Bundle OCR pret dans $outputRoot"
