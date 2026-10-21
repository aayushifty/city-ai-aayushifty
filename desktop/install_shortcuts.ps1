# Creates "City AI" shortcuts on your Desktop and in the Start Menu that open the desktop app
# (no console window). Run once:  powershell -ExecutionPolicy Bypass -File desktop\install_shortcuts.ps1
# Remove them by deleting the two "City AI.lnk" files.

$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$launcher = Join-Path $here 'city_ai_desktop.py'
$icon = Join-Path $here 'city_ai.ico'

$python = (Get-Command python -ErrorAction Stop).Source
$pythonw = Join-Path (Split-Path -Parent $python) 'pythonw.exe'
if (-not (Test-Path $pythonw)) { throw "pythonw.exe not found next to $python" }

$shell = New-Object -ComObject WScript.Shell
$targets = @(
    (Join-Path ([Environment]::GetFolderPath('Desktop')) 'City AI.lnk'),
    (Join-Path ([Environment]::GetFolderPath('Programs')) 'City AI.lnk')
)
foreach ($lnkPath in $targets) {
    $lnk = $shell.CreateShortcut($lnkPath)
    $lnk.TargetPath = $pythonw
    $lnk.Arguments = "`"$launcher`""
    $lnk.WorkingDirectory = Split-Path -Parent $here
    $lnk.IconLocation = "$icon,0"
    $lnk.Description = 'City AI - Autonomous 3D AI Metropolis'
    $lnk.Save()
    Write-Host "Created $lnkPath"
}
