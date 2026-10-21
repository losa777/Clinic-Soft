<#
  სკანერის აგენტის წაშლა: აჩერებს, შლის ავტოგაშვებას და საქაღალდეს.
  powershell -ExecutionPolicy Bypass -File .\uninstall.ps1
#>
$ErrorActionPreference = "Stop"
$target = Join-Path $env:LOCALAPPDATA "ClinicScanAgent"

Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" |
  Where-Object { $_.CommandLine -like "*ClinicScanAgent*agent.mjs*" } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force }

$lnk = Join-Path ([Environment]::GetFolderPath("Startup")) "ClinicScanAgent.lnk"
if (Test-Path $lnk) { Remove-Item $lnk -Force }
if (Test-Path $target) { Remove-Item $target -Recurse -Force }

Write-Host "✔ სკანერის აგენტი წაიშალა" -ForegroundColor Green
