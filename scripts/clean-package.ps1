$ErrorActionPreference = 'Stop'

$workspace = [System.IO.Path]::GetFullPath((Get-Location).Path)
$buildDir = [System.IO.Path]::GetFullPath((Join-Path $workspace 'build'))
$workspaceElectronPath = [System.IO.Path]::GetFullPath(
    (Join-Path $workspace 'node_modules\electron\dist\electron.exe')
)

if (-not $buildDir.StartsWith($workspace, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw 'Refusing to clean outside the workspace.'
}

function Resolve-FullPath {
    param(
        [Parameter(Mandatory = $true)]
        [AllowEmptyString()]
        [string]$PathValue
    )

    if ([string]::IsNullOrWhiteSpace($PathValue)) {
        return $null
    }

    try {
        return [System.IO.Path]::GetFullPath($PathValue)
    } catch {
        return $null
    }
}

function Stop-WorkspacePackagingProcesses {
    $workspaceProcesses = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
        Where-Object {
            $executablePath = Resolve-FullPath $_.ExecutablePath
            if ($null -eq $executablePath) {
                return $false
            }

            if ($executablePath.StartsWith($buildDir, [System.StringComparison]::OrdinalIgnoreCase)) {
                return $true
            }

            return $executablePath.Equals(
                $workspaceElectronPath,
                [System.StringComparison]::OrdinalIgnoreCase
            )
        }

    foreach ($workspaceProcess in $workspaceProcesses) {
        try {
            Stop-Process -Id $workspaceProcess.ProcessId -Force -ErrorAction Stop
        } catch {
            Write-Warning (
                "Could not stop process {0} ({1}): {2}" -f `
                    $workspaceProcess.Name, `
                    $workspaceProcess.ProcessId, `
                    $_.Exception.Message
            )
        }
    }
}

Stop-WorkspacePackagingProcesses
Start-Sleep -Milliseconds 500

if (-not (Test-Path -LiteralPath $buildDir)) {
    exit 0
}

Get-ChildItem -LiteralPath $buildDir -File -ErrorAction SilentlyContinue |
    Where-Object {
        $_.Extension -in '.exe', '.lnk', '.blockmap' -or
        $_.Name -in 'latest.yml', 'builder-debug.yml', 'builder-effective-config.yaml'
    } |
    Remove-Item -Force -ErrorAction SilentlyContinue

$winUnpacked = Join-Path $buildDir 'win-unpacked'
if (Test-Path -LiteralPath $winUnpacked) {
    Remove-Item -LiteralPath $winUnpacked -Recurse -Force -ErrorAction SilentlyContinue
}
