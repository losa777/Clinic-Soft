<#
  სკანერის აგენტის საერთო ფუნქციები (setup.ps1, tray.ps1, uninstall.ps1).
  ყველაფერი მიმდინარე მომხმარებლისთვისაა — ადმინის უფლება არ სჭირდება.
#>

$AppName = "ClinicScanAgent"
# CLINIC_AGENT_HOME / _STARTUP / _REGKEY — მხოლოდ ტესტირებისთვის (რეალური ინსტალაციისგან იზოლირებულად)
$InstallDir = if ($env:CLINIC_AGENT_HOME) { $env:CLINIC_AGENT_HOME } else { Join-Path $env:LOCALAPPDATA $AppName }
$AgentExe = Join-Path $InstallDir "ClinicScanAgent.exe"
$ConfigFile = Join-Path $InstallDir "config.json"
$LogFile = Join-Path $InstallDir "agent.log"
$TrayVbs = Join-Path $InstallDir "tray-hidden.vbs"
$UninstallKey = if ($env:CLINIC_AGENT_REGKEY) { $env:CLINIC_AGENT_REGKEY } else { "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\$AppName" }
$StartupDir = if ($env:CLINIC_AGENT_STARTUP) { $env:CLINIC_AGENT_STARTUP } else { [Environment]::GetFolderPath("Startup") }
$AgentShortcut = Join-Path $StartupDir "ClinicScanAgent.lnk"
$TrayShortcut = Join-Path $StartupDir "ClinicScanAgent Tray.lnk"
$DefaultPort = 7777
$Naps2Url = "https://www.naps2.com/download"

function Find-Naps2 {
  @("$env:ProgramFiles\NAPS2\NAPS2.Console.exe", "${env:ProgramFiles(x86)}\NAPS2\NAPS2.Console.exe") |
    Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1
}

function Read-AgentConfig {
  if (-not (Test-Path $ConfigFile)) { return $null }
  try { return Get-Content $ConfigFile -Raw -Encoding UTF8 | ConvertFrom-Json } catch { return $null }
}

<#
  საიტის მისამართები ტექსტიდან (მძიმით, ცარიელით ან ახალ ხაზზე გამოყოფილი): ბოლო "/" იშლება,
  მისამართი უნდა იყოს http(s)://host[:port] — ზუსტად ისე, როგორც ბრაუზერის მისამართის ზოლშია (გზის გარეშე).
#>
function ConvertTo-Origins([string]$Text) {
  $origins = @()
  foreach ($part in ($Text -split "[,;\s]+")) {
    $o = $part.Trim().TrimEnd("/")
    if (-not $o) { continue }
    if ($o -notmatch "^https?://") {
      return @{ Ok = $false; Error = "მისამართი უნდა იწყებოდეს http:// ან https://-ით: $o" }
    }
    try { $uri = [Uri]$o } catch { return @{ Ok = $false; Error = "მისამართი არასწორია: $o" } }
    if ($uri.AbsolutePath -ne "/" -or $uri.Query -or $uri.Fragment) {
      return @{ Ok = $false; Error = "მიუთითეთ მხოლოდ საიტის მისამართი, გვერდის გარეშე. მაგ. $($uri.Scheme)://$($uri.Authority)" }
    }
    $origins += "$($uri.Scheme)://$($o.Substring($uri.Scheme.Length + 3))"
  }
  if (-not $origins.Count) { return @{ Ok = $false; Error = "შეიყვანეთ საიტის მისამართი" } }
  return @{ Ok = $true; Origins = [string[]]($origins | Select-Object -Unique) }
}

function Write-AgentConfig([string[]]$Origins, [int]$Port, [string]$Naps2Path) {
  $config = [ordered]@{ port = $Port; allowedOrigins = [object[]]$Origins; naps2Path = $Naps2Path }
  $utf8 = New-Object System.Text.UTF8Encoding $false
  [System.IO.File]::WriteAllText($ConfigFile, ($config | ConvertTo-Json), $utf8)
}

function Get-AgentPort {
  $c = Read-AgentConfig
  if ($c -and $c.port) { return [int]$c.port }
  return $DefaultPort
}

<# მხოლოდ ამ საქაღალდის აგენტის პროცესები: exe ან ძველი ვერსია (node agent.mjs). #>
function Get-AgentProcesses {
  Get-CimInstance Win32_Process -Filter "Name = 'ClinicScanAgent.exe' OR Name = 'node.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.ExecutablePath -eq $AgentExe -or $_.CommandLine -like "*$InstallDir\agent.mjs*" }
}

function Stop-Agent {
  Get-AgentProcesses | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
  # ფაილის გათავისუფლება
  for ($i = 0; $i -lt 20 -and (Get-AgentProcesses); $i++) { Start-Sleep -Milliseconds 200 }
}

function Start-Agent {
  if (Test-Path $AgentExe) { Start-Process -FilePath $AgentExe -WorkingDirectory $InstallDir }
}

function Stop-Tray {
  Get-CimInstance Win32_Process -Filter "Name = 'powershell.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.ProcessId -ne $PID -and $_.CommandLine -like "*$InstallDir\tray.ps1*" } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
}

function Start-Tray {
  if (Test-Path $TrayVbs) { Start-Process -FilePath "$env:WINDIR\System32\wscript.exe" -ArgumentList "`"$TrayVbs`"" }
}

<# აგენტის მდგომარეობა: $null — არ პასუხობს; სხვაგვარად { ok, version, naps2 }. #>
function Get-AgentHealth([int]$Port = (Get-AgentPort), [int]$TimeoutMs = 2000) {
  try {
    $req = [System.Net.HttpWebRequest]::Create("http://127.0.0.1:$Port/health")
    $req.Proxy = $null
    $req.Timeout = $TimeoutMs
    $res = $req.GetResponse()
    try {
      $reader = New-Object System.IO.StreamReader($res.GetResponseStream(), [System.Text.Encoding]::UTF8)
      return $reader.ReadToEnd() | ConvertFrom-Json
    } finally { $res.Close() }
  } catch { return $null }
}

function Wait-AgentHealth([int]$Port, [int]$Seconds = 10) {
  for ($i = 0; $i -lt $Seconds * 2; $i++) {
    $h = Get-AgentHealth -Port $Port -TimeoutMs 1000
    if ($h) { return $h }
    Start-Sleep -Milliseconds 500
  }
  return $null
}
