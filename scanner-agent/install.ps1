<#
  კლინიკის სკანერის აგენტის ინსტალაცია მიმდინარე მომხმარებლისთვის (ადმინის უფლება არ სჭირდება).

  - აკოპირებს აგენტს: %LOCALAPPDATA%\ClinicScanAgent
  - წერს config.json-ს (საიტის მისამართი, პორტი, NAPS2-ის გზა)
  - ამატებს Startup-ის მალსახმობს: აგენტი ავტომატურად ეშვება Windows-ში შესვლისას, ფანჯრის გარეშე
  - უშვებს აგენტს ახლავე

  გამოყენება (PowerShell, ამ საქაღალდიდან):
    powershell -ExecutionPolicy Bypass -File .\install.ps1 -Origin "https://clinic.example.ge"
  რამდენიმე მისამართი: -Origin "https://clinic.example.ge","http://10.1.20.5:3000"
#>
param(
  [Parameter(Mandatory = $true)][string[]]$Origin,
  [int]$Port = 7777,
  [string]$Naps2Path
)

$ErrorActionPreference = "Stop"

if (-not $Naps2Path) {
  $Naps2Path = @("$env:ProgramFiles\NAPS2\NAPS2.Console.exe", "${env:ProgramFiles(x86)}\NAPS2\NAPS2.Console.exe") |
    Where-Object { Test-Path $_ } | Select-Object -First 1
  if (-not $Naps2Path) { $Naps2Path = "$env:ProgramFiles\NAPS2\NAPS2.Console.exe" }
}
$target = Join-Path $env:LOCALAPPDATA "ClinicScanAgent"

$node = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $node) { throw "Node.js ვერ მოიძებნა. დააყენეთ Node.js 20+ (nodejs.org) და გაუშვით თავიდან." }
if (-not (Test-Path $Naps2Path)) {
  Write-Warning "NAPS2 ვერ მოიძებნა: $Naps2Path. დააყენეთ NAPS2 (naps2.com) — მის გარეშე სკანირება არ იმუშავებს."
}
# -File-ით გაშვებისას "a,b" ერთ სტრიქონად მოდის
$Origin = @($Origin | ForEach-Object { $_ -split "," } | ForEach-Object { $_.Trim() } | Where-Object { $_ })
foreach ($o in $Origin) {
  if ($o -notmatch '^https?://[^/]+$') { throw "საიტის მისამართი უნდა იყოს ფორმატით https://host[:port] (ბოლო / გარეშე): $o" }
}

# გაშვებული აგენტის გაჩერება (განახლებისას)
Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" |
  Where-Object { $_.CommandLine -like "*ClinicScanAgent*agent.mjs*" } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force }

New-Item -ItemType Directory -Force $target | Out-Null
Copy-Item (Join-Path $PSScriptRoot "agent.mjs") $target -Force

$config = [ordered]@{ port = $Port; allowedOrigins = @($Origin); naps2Path = $Naps2Path }
$utf8 = New-Object System.Text.UTF8Encoding $false
[System.IO.File]::WriteAllText((Join-Path $target "config.json"), ($config | ConvertTo-Json), $utf8)

# ფანჯრის გარეშე გამშვები
$vbs = Join-Path $target "start-hidden.vbs"
$vbsBody = "CreateObject(""WScript.Shell"").Run """"""$node"""" """"$target\agent.mjs"""""", 0, False"
# UTF-16: WSH ასე სწორად კითხულობს არალათინურ გზებს (მაგ. ქართული მომხმარებლის სახელი)
[System.IO.File]::WriteAllText($vbs, $vbsBody, [System.Text.Encoding]::Unicode)

# ავტოგაშვება Windows-ში შესვლისას
$startup = [Environment]::GetFolderPath("Startup")
$shell = New-Object -ComObject WScript.Shell
$lnk = $shell.CreateShortcut((Join-Path $startup "ClinicScanAgent.lnk"))
$lnk.TargetPath = "$env:WINDIR\System32\wscript.exe"
$lnk.Arguments = """$vbs"""
$lnk.WorkingDirectory = $target
$lnk.Description = "Clinic scanner agent"
$lnk.Save()

Start-Process "$env:WINDIR\System32\wscript.exe" -ArgumentList """$vbs"""
Start-Sleep -Seconds 2

try {
  $status = Invoke-RestMethod "http://127.0.0.1:$Port/status" -Headers @{ Origin = $Origin[0] } -TimeoutSec 5
  Write-Host "✔ აგენტი გაშვებულია (ვერსია $($status.version)), NAPS2: $($status.naps2)" -ForegroundColor Green
} catch {
  Write-Warning "აგენტი არ პასუხობს. იხილეთ ლოგი: $target\agent.log"
}
Write-Host "საქაღალდე: $target"
Write-Host "ავტოგაშვება: $startup\ClinicScanAgent.lnk"
