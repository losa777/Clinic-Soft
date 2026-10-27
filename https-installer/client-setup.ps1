<#
  ClinicCertificateSetup.exe — კლინიკის კომპიუტერებზე (სერვერზე იქმნება server-setup.ps1-ით).
  1. კლინიკის სანდო ცენტრი → Windows (client-trust.ps1, ადმინის უფლებით — Windows ერთხელ იკითხავს)
  2. სამუშაო მაგიდაზე ბმული „კლინიკა“ (https მისამართით)
  3. სკანერის აგენტი (თუ დაყენებულია): https მისამართების დამატება და გადატვირთვა
  ფაილები იმავე საქაღალდეშია: clinic-ca.crt, clinic.json (urls, primaryUrl), client-trust.ps1.
#>
param([switch]$Quiet)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Windows.Forms, System.Drawing

$Utf8 = New-Object System.Text.UTF8Encoding $false
$Info = Get-Content (Join-Path $PSScriptRoot "clinic.json") -Raw -Encoding UTF8 | ConvertFrom-Json
$Url = $Info.primaryUrl
$AgentDir = Join-Path $env:LOCALAPPDATA "ClinicScanAgent"
$AgentConfig = Join-Path $AgentDir "config.json"

function Show-Message([string]$Text, [string]$Title = "კლინიკის სერტიფიკატი", [string]$Icon = "Information") {
  if ($Quiet) { Write-Host "${Title}: $Text"; return }
  [System.Windows.Forms.MessageBox]::Show($Text, $Title, "OK", $Icon) | Out-Null
}

function Install-Trust {
  $argList = @("-NoProfile", "-ExecutionPolicy", "Bypass", "-WindowStyle", "Hidden", "-File", "`"$(Join-Path $PSScriptRoot 'client-trust.ps1')`"")
  try {
    $p = Start-Process powershell.exe -Verb RunAs -ArgumentList $argList -Wait -PassThru -WindowStyle Hidden
  } catch {
    throw "სერტიფიკატის დასაყენებლად საჭიროა ადმინისტრატორის უფლება (დაადასტურეთ Windows-ის შეკითხვა)."
  }
  $resultFile = Join-Path $PSScriptRoot "trust-result.txt"
  $text = if (Test-Path $resultFile) { (Get-Content $resultFile -Raw -Encoding UTF8).Trim() } else { "" }
  if ($p.ExitCode -ne 0 -or $text -ne "ok") { throw "სერტიფიკატი ვერ დაყენდა: $text" }
}

function New-DesktopLink {
  $desktop = [Environment]::GetFolderPath("Desktop")
  $content = "[InternetShortcut]`r`nURL=$Url`r`nIconIndex=0`r`n"
  [System.IO.File]::WriteAllText((Join-Path $desktop "კლინიკა.url"), $content, [System.Text.Encoding]::Unicode)
}

<# სკანერის აგენტი Origin-ს ამოწმებს — https მისამართები უნდა ჩაემატოს (http-ებიც რჩება). #>
function Update-ScanAgent {
  if (-not (Test-Path $AgentConfig)) { return $false }
  $config = Get-Content $AgentConfig -Raw -Encoding UTF8 | ConvertFrom-Json
  $origins = [System.Collections.Generic.List[string]]::new()
  foreach ($o in @($config.allowedOrigins)) { if ($o) { $origins.Add($o) } }
  foreach ($u in @($Info.urls)) { if (-not $origins.Contains($u)) { $origins.Add($u) } }
  $config.allowedOrigins = [object[]]$origins
  [System.IO.File]::WriteAllText($AgentConfig, ($config | ConvertTo-Json), $Utf8)

  $exe = Join-Path $AgentDir "ClinicScanAgent.exe"
  Get-CimInstance Win32_Process -Filter "Name = 'ClinicScanAgent.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.ExecutablePath -eq $exe } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
  Start-Sleep -Milliseconds 800
  if (Test-Path $exe) { Start-Process -FilePath $exe -WorkingDirectory $AgentDir }
  return $true
}

function Install-Client([bool]$WithLink, [bool]$WithAgent) {
  Install-Trust
  if ($WithLink) { New-DesktopLink }
  $agent = if ($WithAgent) { Update-ScanAgent } else { $false }
  $text = "✔ კომპიუტერი მზადაა.`n`nკლინიკის მისამართი: $Url"
  if ($WithLink) { $text += "`nსამუშაო მაგიდაზე დაემატა ბმული «კლინიკა»." }
  if ($agent) { $text += "`nსკანერის აგენტი განახლდა." }
  return $text + "`n`nთუ ბრაუზერი ღიაა, დახურეთ და თავიდან გახსენით."
}

if ($Quiet) {
  Write-Host (Install-Client $true $true)
  exit 0
}

# ─── ფანჯარა ───
[System.Windows.Forms.Application]::EnableVisualStyles()
$form = New-Object System.Windows.Forms.Form -Property @{
  Text = "კლინიკის სერტიფიკატი"; Size = New-Object System.Drawing.Size(520, 360); StartPosition = "CenterScreen"
  FormBorderStyle = "FixedDialog"; MaximizeBox = $false; MinimizeBox = $false; Font = New-Object System.Drawing.Font("Segoe UI", 10); TopMost = $true
}
function Add-Label([string]$Text, [int]$Y, [int]$H = 22, $Color = $null, [bool]$Bold = $false) {
  $l = New-Object System.Windows.Forms.Label -Property @{ Text = $Text; Location = New-Object System.Drawing.Point(20, $Y); Size = New-Object System.Drawing.Size(470, $H) }
  if ($Color) { $l.ForeColor = $Color }
  if ($Bold) { $l.Font = New-Object System.Drawing.Font("Segoe UI", 12, [System.Drawing.FontStyle]::Bold) }
  $form.Controls.Add($l); return $l
}

[void](Add-Label "კლინიკის უსაფრთხო კავშირი (HTTPS)" 15 28 $null $true)
[void](Add-Label "ეს კომპიუტერი ენდობა კლინიკის სერვერს — ბრაუზერი უსაფრთხო კავშირზე (https) გაფრთხილებას აღარ აჩვენებს." 50 44 ([System.Drawing.Color]::DimGray))
[void](Add-Label "სერვერის მისამართი:" 102)
[void](Add-Label $Url 124 22 ([System.Drawing.Color]::RoyalBlue))
$link = New-Object System.Windows.Forms.CheckBox -Property @{ Text = "სამუშაო მაგიდაზე ბმული «კლინიკა»"; Location = New-Object System.Drawing.Point(20, 160); Size = New-Object System.Drawing.Size(470, 24); Checked = $true }
$agent = New-Object System.Windows.Forms.CheckBox -Property @{ Text = "სკანერის აგენტის განახლება (ახალი მისამართი)"; Location = New-Object System.Drawing.Point(20, 187); Size = New-Object System.Drawing.Size(470, 24) }
$agent.Checked = $agent.Enabled = (Test-Path $AgentConfig)
if (-not $agent.Enabled) { $agent.Text += " — არ არის დაყენებული" }
$form.Controls.AddRange(@($link, $agent))

$errorLabel = Add-Label "" 218 44 ([System.Drawing.Color]::Firebrick)
$install = New-Object System.Windows.Forms.Button -Property @{ Text = "დაყენება"; Location = New-Object System.Drawing.Point(260, 270); Size = New-Object System.Drawing.Size(110, 34) }
$cancel = New-Object System.Windows.Forms.Button -Property @{ Text = "გაუქმება"; Location = New-Object System.Drawing.Point(380, 270); Size = New-Object System.Drawing.Size(110, 34); DialogResult = "Cancel" }
$form.AcceptButton = $install; $form.CancelButton = $cancel
$form.Controls.AddRange(@($install, $cancel))

$install.Add_Click({
  $errorLabel.Text = ""
  foreach ($c in @($install, $cancel, $link, $agent)) { $c.Enabled = $false }
  $install.Text = "ყენდება..."; $form.Cursor = "WaitCursor"
  $form.TopMost = $false
  [System.Windows.Forms.Application]::DoEvents()
  try {
    $text = Install-Client $link.Checked ($agent.Checked -and (Test-Path $AgentConfig))
    $form.Cursor = "Default"
    Show-Message $text "მზადაა"
    $form.Close()
  } catch {
    $form.Cursor = "Default"
    $errorLabel.Text = $_.Exception.Message
    foreach ($c in @($install, $cancel, $link)) { $c.Enabled = $true }
    $agent.Enabled = (Test-Path $AgentConfig)
    $install.Text = "დაყენება"
  }
})

$form.Add_Shown({ $form.Activate() })
[void]$form.ShowDialog()
