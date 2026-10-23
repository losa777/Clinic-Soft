<#
  სკანერის აგენტის წაშლა («პარამეტრები → აპლიკაციები»-დან ან ხელით): აჩერებს აგენტს და ხატულას,
  შლის ავტოგაშვებას, წაშლის ჩანაწერს და საქაღალდეს. -Quiet — დადასტურების გარეშე.
#>
param([switch]$Quiet)

$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "common.ps1")
Add-Type -AssemblyName System.Windows.Forms

if (-not $Quiet) {
  $answer = [System.Windows.Forms.MessageBox]::Show("წაიშალოს კლინიკის სკანერის აგენტი?`nსაიტზე სკანირება ამ კომპიუტერზე აღარ იმუშავებს.", "სკანერის აგენტი", "YesNo", "Question")
  if ($answer -ne "Yes") { exit }
}

Set-Location $env:TEMP
Stop-Tray
Stop-Agent
foreach ($p in @($AgentShortcut, $TrayShortcut)) { if (Test-Path $p) { Remove-Item $p -Force } }
if (Test-Path $UninstallKey) { Remove-Item $UninstallKey -Recurse -Force }
for ($i = 0; $i -lt 10 -and (Test-Path $InstallDir); $i++) {
  try { Remove-Item $InstallDir -Recurse -Force } catch { Start-Sleep -Milliseconds 500 }
}

if (-not $Quiet) {
  [System.Windows.Forms.MessageBox]::Show("✔ სკანერის აგენტი წაიშალა.", "სკანერის აგენტი", "OK", "Information") | Out-Null
}
