param(
    [switch]$SkipBuild
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$workspace = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $workspace

function Write-Step {
    param([Parameter(Mandatory = $true)][string]$Message)
    Write-Host "==> $Message"
}

function Invoke-NpmScript {
    param([Parameter(Mandatory = $true)][string]$ScriptName)

    & npm run $ScriptName
    if ($LASTEXITCODE -ne 0) {
        throw "The npm script '$ScriptName' failed with exit code $LASTEXITCODE."
    }
}

function Get-AppIdentity {
    $identityJson = & node -e "process.stdout.write(JSON.stringify(require('./scripts/app-identity.cjs').resolveAppIdentity()))"
    if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($identityJson)) {
        throw "Unable to resolve the application identity."
    }

    return $identityJson | ConvertFrom-Json
}

function Get-UninstallEntries {
    $registryRoots = @(
        "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall",
        "HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall",
        "HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall"
    )

    return $registryRoots | ForEach-Object {
        if (-not (Test-Path -LiteralPath $_)) {
            return
        }

        Get-ChildItem -LiteralPath $_ -ErrorAction SilentlyContinue | ForEach-Object {
            Get-ItemProperty -LiteralPath $_.PSPath -ErrorAction SilentlyContinue
        }
    }
}

function Get-ExecutablePathFromCommand {
    param([AllowNull()][string]$Command)

    if ([string]::IsNullOrWhiteSpace($Command)) {
        return $null
    }

    $quotedPath = [System.Text.RegularExpressions.Regex]::Match($Command, '^\s*"(?<path>[^"]+)"')
    if ($quotedPath.Success) {
        return $quotedPath.Groups["path"].Value
    }

    $plainPath = [System.Text.RegularExpressions.Regex]::Match($Command, "^\s*(?<path>.+?\.exe)(?:\s|$)")
    return if ($plainPath.Success) { $plainPath.Groups["path"].Value } else { $null }
}

function Get-ExistingInstallationDirectory {
    param([Parameter(Mandatory = $true)][object]$Identity)

    $productNames = @($Identity.productName) + @($Identity.legacy.productNames)
    $entry = Get-UninstallEntries | Where-Object {
        $displayNameProperty = $_.PSObject.Properties["DisplayName"]
        $displayName = if ($null -ne $displayNameProperty) {
            [string]$displayNameProperty.Value
        } else {
            ""
        }
        $productNames | Where-Object {
            $displayName.StartsWith($_, [System.StringComparison]::OrdinalIgnoreCase)
        }
    } | Select-Object -First 1

    if ($null -ne $entry) {
        $installLocationProperty = $entry.PSObject.Properties["InstallLocation"]
        $installLocation = if ($null -ne $installLocationProperty) {
            [string]$installLocationProperty.Value
        } else {
            ""
        }
        if (-not [string]::IsNullOrWhiteSpace($installLocation)) {
            return [System.IO.Path]::GetFullPath($installLocation)
        }

        $uninstallStringProperty = $entry.PSObject.Properties["UninstallString"]
        $uninstallString = if ($null -ne $uninstallStringProperty) {
            [string]$uninstallStringProperty.Value
        } else {
            ""
        }
        $uninstallerPath = Get-ExecutablePathFromCommand -Command $uninstallString
        if (-not [string]::IsNullOrWhiteSpace($uninstallerPath)) {
            return [System.IO.Path]::GetDirectoryName(
                [System.IO.Path]::GetFullPath($uninstallerPath)
            )
        }
    }

    $defaultDirectory = Join-Path $env:LOCALAPPDATA ("Programs\{0}" -f $Identity.productName)
    $defaultExecutable = Join-Path $defaultDirectory ("{0}.exe" -f $Identity.productName)
    return if (Test-Path -LiteralPath $defaultExecutable) { $defaultDirectory } else { $null }
}

function Stop-ApplicationProcesses {
    param([Parameter(Mandatory = $true)][object]$Identity)

    $processNames = @(
        $Identity.productName,
        $Identity.packageName
    ) + @($Identity.legacy.processNames)
    $normalizedNames = [System.Collections.Generic.HashSet[string]]::new(
        [System.StringComparer]::OrdinalIgnoreCase
    )
    foreach ($processName in $processNames) {
        if (-not [string]::IsNullOrWhiteSpace([string]$processName)) {
            [void]$normalizedNames.Add(
                [System.IO.Path]::GetFileNameWithoutExtension([string]$processName)
            )
        }
    }

    $running = Get-Process -ErrorAction SilentlyContinue | Where-Object {
        $normalizedNames.Contains($_.ProcessName)
    }
    if (-not $running) {
        Write-Host "Application is not currently running."
        return
    }

    foreach ($process in $running) {
        if ($process.MainWindowHandle -ne 0) {
            [void]$process.CloseMainWindow()
        }
    }

    $deadline = [DateTime]::UtcNow.AddSeconds(5)
    do {
        Start-Sleep -Milliseconds 250
        $remaining = Get-Process -ErrorAction SilentlyContinue | Where-Object {
            $normalizedNames.Contains($_.ProcessName)
        }
    } while ($remaining -and [DateTime]::UtcNow -lt $deadline)

    foreach ($process in $remaining) {
        Stop-Process -Id $process.Id -Force -ErrorAction Stop
    }
}

function Get-InstallerPath {
    param(
        [Parameter(Mandatory = $true)][object]$Identity,
        [Parameter(Mandatory = $true)][string]$Version
    )

    $installerPath = Join-Path $workspace (
        "build\{0}-{1}-x64.exe" -f $Identity.artifactBaseName, $Version
    )
    if (-not (Test-Path -LiteralPath $installerPath -PathType Leaf)) {
        throw "The expected installer was not created: $installerPath"
    }

    return [System.IO.Path]::GetFullPath($installerPath)
}

function Install-ApplicationSilently {
    param(
        [Parameter(Mandatory = $true)][string]$InstallerPath,
        [AllowNull()][string]$InstallationDirectory
    )

    $arguments = @("/S")
    if (-not [string]::IsNullOrWhiteSpace($InstallationDirectory)) {
        $arguments += "/D=$InstallationDirectory"
    }

    $installerParameters = @{
        FilePath = $InstallerPath
        ArgumentList = $arguments
        WindowStyle = "Hidden"
        PassThru = $true
        Wait = $true
    }
    $installerProcess = Start-Process @installerParameters
    if ($installerProcess.ExitCode -ne 0) {
        throw "The silent installer failed with exit code $($installerProcess.ExitCode)."
    }
}

function Get-InstalledExecutable {
    param(
        [Parameter(Mandatory = $true)][object]$Identity,
        [AllowNull()][string]$PreferredDirectory
    )

    $directories = @(
        $PreferredDirectory,
        (Join-Path $env:LOCALAPPDATA ("Programs\{0}" -f $Identity.productName))
    ) | Where-Object { -not [string]::IsNullOrWhiteSpace($_) } | Select-Object -Unique

    $executableNames = @(
        ("{0}.exe" -f $Identity.productName),
        ("{0}.exe" -f $Identity.packageName)
    )
    $deadline = [DateTime]::UtcNow.AddSeconds(20)
    do {
        foreach ($directory in $directories) {
            foreach ($executableName in $executableNames) {
                $candidate = Join-Path $directory $executableName
                if (Test-Path -LiteralPath $candidate -PathType Leaf) {
                    return [System.IO.Path]::GetFullPath($candidate)
                }
            }
        }
        Start-Sleep -Milliseconds 250
    } while ([DateTime]::UtcNow -lt $deadline)

    throw "The installed application executable could not be found."
}

function Start-InstalledApplication {
    param([Parameter(Mandatory = $true)][string]$ExecutablePath)

    $savedElectronRunAsNode = [Environment]::GetEnvironmentVariable(
        "ELECTRON_RUN_AS_NODE",
        "Process"
    )
    try {
        [Environment]::SetEnvironmentVariable("ELECTRON_RUN_AS_NODE", $null, "Process")
        $launchedProcess = Start-Process -FilePath $ExecutablePath -PassThru
    } finally {
        [Environment]::SetEnvironmentVariable(
            "ELECTRON_RUN_AS_NODE",
            $savedElectronRunAsNode,
            "Process"
        )
    }

    Start-Sleep -Seconds 4
    $expectedPath = [System.IO.Path]::GetFullPath($ExecutablePath)
    $runningProcesses = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object {
        -not [string]::IsNullOrWhiteSpace($_.ExecutablePath) -and
        [System.IO.Path]::GetFullPath($_.ExecutablePath).Equals(
            $expectedPath,
            [System.StringComparison]::OrdinalIgnoreCase
        )
    }
    if (-not $runningProcesses) {
        $exitDetail = if ($launchedProcess.HasExited) {
            " It exited with code $($launchedProcess.ExitCode)."
        } else {
            ""
        }
        throw "No installed application process remained active after launch.$exitDetail"
    }

    return $runningProcesses
}

$identity = Get-AppIdentity
$packageJson = Get-Content -Raw -LiteralPath (Join-Path $workspace "package.json") | ConvertFrom-Json
$installationDirectory = Get-ExistingInstallationDirectory -Identity $identity

if (-not $SkipBuild) {
    Write-Step "Building the NSIS installer"
    Invoke-NpmScript -ScriptName "package:app:installer"
}

$installerPath = Get-InstallerPath -Identity $identity -Version ([string]$packageJson.version)
Write-Step "Stopping $($identity.productName)"
Stop-ApplicationProcesses -Identity $identity

Write-Step "Installing silently from $installerPath"
Install-ApplicationSilently -InstallerPath $installerPath -InstallationDirectory $installationDirectory

$installedExecutable = Get-InstalledExecutable -Identity $identity -PreferredDirectory $installationDirectory
$installedVersion = (Get-Item -LiteralPath $installedExecutable).VersionInfo.FileVersion
if (-not ([string]$installedVersion).StartsWith([string]$packageJson.version)) {
    throw "Installed version '$installedVersion' does not match package version '$($packageJson.version)'."
}

Write-Step "Launching $installedExecutable"
$runningProcesses = Start-InstalledApplication -ExecutablePath $installedExecutable

Write-Host ""
Write-Host "Reinstallation completed."
Write-Host "Installer: $installerPath"
Write-Host "Application: $installedExecutable"
Write-Host "Version: $installedVersion"
Write-Host "Processes: $(@($runningProcesses).Count)"
