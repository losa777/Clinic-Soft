<#
  კლინიკის სკანერის აგენტის ინსტალაცია (ClinicScanAgentSetup.exe-დან ეშვება).
  ფანჯარა: საიტის მისამართი, NAPS2-ის შემოწმება → ფაილები %LOCALAPPDATA%\ClinicScanAgent-ში, ავტოგაშვება,
  tray-ის ხატულა, «პროგრამების» სიაში წაშლის ჩანაწერი. ადმინის უფლება არ სჭირდება.

  ფანჯრის გარეშე (მრავალ კომპიუტერზე ერთბაშად):
    powershell -ExecutionPolicy Bypass -File setup.ps1 -Origin "http://10.1.20.5:3000" -Quiet
#>
param(
  [string]$Origin,
  [switch]$Quiet
)

$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "common.ps1")
$Version = "1.1.0"

function Install-Agent([string[]]$Origins) {
  Stop-Tray
  Stop-Agent
  New-Item -ItemType Directory -Force $InstallDir | Out-Null

  # ფაილები (exe შეიძლება ცოტა ხანს ჯერ კიდევ დაკავებული იყოს)
  foreach ($f in @("ClinicScanAgent.exe", "common.ps1", "tray.ps1", "uninstall.ps1")) {
    $copied = $false
    for ($i = 0; $i -lt 10 -and -not $copied; $i++) {
      try { Copy-Item (Join-Path $PSScriptRoot $f) $InstallDir -Force; $copied = $true } catch { Start-Sleep -Milliseconds 500 }
    }
    if (-not $copied) { throw "ფაილი ვერ ჩაიწერა: $f (დახურეთ აგენტი და სცადეთ თავიდან)" }
  }
  # ძველი ვერსიის (node) ფაილები
  foreach ($old in @("agent.mjs", "start-hidden.vbs")) {
    $p = Join-Path $InstallDir $old
    if (Test-Path $p) { Remove-Item $p -Force }
  }

  $existing = Read-AgentConfig
  $port = if ($existing -and $existing.port) { [int]$existing.port } else { $DefaultPort }
  $naps2 = Find-Naps2
  if (-not $naps2) { $naps2 = "$env:ProgramFiles\NAPS2\NAPS2.Console.exe" }
  Write-AgentConfig -Origins $Origins -Port $port -Naps2Path $naps2

  # tray — ფანჯრის გარეშე (UTF-16: WSH ასე სწორად კითხულობს არალათინურ გზებს)
  $trayPs1 = Join-Path $InstallDir "tray.ps1"
  $vbs = "CreateObject(""WScript.Shell"").Run ""powershell.exe -NoProfile -ExecutionPolicy Bypass -STA -WindowStyle Hidden -File """"$trayPs1"""""", 0, False"
  [System.IO.File]::WriteAllText($TrayVbs, $vbs, [System.Text.Encoding]::Unicode)

  # ავტოგაშვება Windows-ში შესვლისას
  $shell = New-Object -ComObject WScript.Shell
  $lnk = $shell.CreateShortcut($AgentShortcut)
  $lnk.TargetPath = $AgentExe
  $lnk.WorkingDirectory = $InstallDir
  $lnk.Description = "Clinic scanner agent"
  $lnk.Save()
  $lnk = $shell.CreateShortcut($TrayShortcut)
  $lnk.TargetPath = "$env:WINDIR\System32\wscript.exe"
  $lnk.Arguments = "`"$TrayVbs`""
  $lnk.WorkingDirectory = $InstallDir
  $lnk.Description = "Clinic scanner agent (tray)"
  $lnk.Save()

  # «პარამეტრები → აპლიკაციები» — წაშლა
  New-Item -Path $UninstallKey -Force | Out-Null
  $uninstall = "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$(Join-Path $InstallDir 'uninstall.ps1')`""
  $values = @{
    DisplayName = "Clinic Scan Agent (კლინიკის სკანერის აგენტი)"
    DisplayVersion = $Version
    Publisher = "Clinic-Soft"
    InstallLocation = $InstallDir
    DisplayIcon = $AgentExe
    UninstallString = $uninstall
    QuietUninstallString = "$uninstall -Quiet"
  }
  foreach ($k in $values.Keys) { New-ItemProperty -Path $UninstallKey -Name $k -Value $values[$k] -PropertyType String -Force | Out-Null }
  New-ItemProperty -Path $UninstallKey -Name NoModify -Value 1 -PropertyType DWord -Force | Out-Null
  New-ItemProperty -Path $UninstallKey -Name NoRepair -Value 1 -PropertyType DWord -Force | Out-Null

  Start-Agent
  Start-Tray
  return Wait-AgentHealth -Port $port -Seconds 10
}

# ─── ფანჯრის გარეშე ───
if ($Quiet) {
  $parsed = ConvertTo-Origins $Origin
  if (-not $parsed.Ok) { Write-Error $parsed.Error; exit 2 }
  $health = Install-Agent $parsed.Origins
  if ($health) { Write-Host "OK: აგენტი $($health.version), NAPS2: $($health.naps2)"; exit 0 }
  Write-Error "აგენტი არ პასუხობს — ლოგი: $LogFile"
  exit 1
}

# ─── ფანჯარა ───
Add-Type -AssemblyName System.Windows.Forms, System.Drawing
[System.Windows.Forms.Application]::EnableVisualStyles()

$font = New-Object System.Drawing.Font("Segoe UI", 10)
$form = New-Object System.Windows.Forms.Form -Property @{
  Text = "კლინიკის სკანერის აგენტი — ინსტალაცია"
  Size = New-Object System.Drawing.Size(560, 385)
  StartPosition = "CenterScreen"
  FormBorderStyle = "FixedDialog"
  MaximizeBox = $false
  MinimizeBox = $false
  Font = $font
  TopMost = $true
}

$title = New-Object System.Windows.Forms.Label -Property @{
  Text = "კლინიკის სკანერის აგენტი $Version"
  Font = New-Object System.Drawing.Font("Segoe UI", 13, [System.Drawing.FontStyle]::Bold)
  Location = New-Object System.Drawing.Point(20, 15); AutoSize = $true
}
$label = New-Object System.Windows.Forms.Label -Property @{
  Text = "საიტის მისამართი — ზუსტად ისე, როგორც ბრაუზერის მისამართის ზოლშია:"
  Location = New-Object System.Drawing.Point(20, 58); Size = New-Object System.Drawing.Size(510, 42)
}
$existing = Read-AgentConfig
$box = New-Object System.Windows.Forms.TextBox -Property @{
  Location = New-Object System.Drawing.Point(20, 103); Size = New-Object System.Drawing.Size(505, 26)
  Text = if ($Origin) { $Origin } elseif ($existing -and $existing.allowedOrigins) { ($existing.allowedOrigins -join ", ") } else { "http://" }
}
$hint = New-Object System.Windows.Forms.Label -Property @{
  Text = "მაგ. http://10.1.20.5:3000  ·  რამდენიმე მისამართი — მძიმით გამოყავით"
  ForeColor = [System.Drawing.Color]::Gray
  Location = New-Object System.Drawing.Point(20, 133); Size = New-Object System.Drawing.Size(510, 20)
}
$naps2Label = New-Object System.Windows.Forms.Label -Property @{
  Location = New-Object System.Drawing.Point(20, 168); Size = New-Object System.Drawing.Size(510, 22)
}
$naps2Link = New-Object System.Windows.Forms.LinkLabel -Property @{
  Text = "NAPS2-ის ჩამოტვირთვა (naps2.com)"
  Location = New-Object System.Drawing.Point(20, 193); AutoSize = $true
}
$recheck = New-Object System.Windows.Forms.LinkLabel -Property @{
  Text = "ხელახლა შემოწმება"
  Location = New-Object System.Drawing.Point(300, 193); AutoSize = $true
}
$errorLabel = New-Object System.Windows.Forms.Label -Property @{
  ForeColor = [System.Drawing.Color]::Firebrick
  Location = New-Object System.Drawing.Point(20, 226); Size = New-Object System.Drawing.Size(510, 44)
}
$install = New-Object System.Windows.Forms.Button -Property @{
  Text = "დაყენება"; Location = New-Object System.Drawing.Point(300, 290); Size = New-Object System.Drawing.Size(110, 34)
}
$cancel = New-Object System.Windows.Forms.Button -Property @{
  Text = "გაუქმება"; Location = New-Object System.Drawing.Point(418, 290); Size = New-Object System.Drawing.Size(110, 34)
  DialogResult = [System.Windows.Forms.DialogResult]::Cancel
}
$form.AcceptButton = $install
$form.CancelButton = $cancel

function Update-Naps2 {
  $found = Find-Naps2
  if ($found) {
    $naps2Label.Text = "✔ NAPS2 ნაპოვნია: $found"
    $naps2Label.ForeColor = [System.Drawing.Color]::ForestGreen
    $naps2Link.Visible = $false
    $recheck.Visible = $false
  } else {
    $naps2Label.Text = "✘ NAPS2 ვერ მოიძებნა — სკანირებისთვის საჭიროა (შეიძლება შემდეგაც დააყენოთ)"
    $naps2Label.ForeColor = [System.Drawing.Color]::DarkOrange
    $naps2Link.Visible = $true
    $recheck.Visible = $true
  }
}
Update-Naps2
$naps2Link.Add_LinkClicked({ Start-Process $Naps2Url })
$recheck.Add_LinkClicked({ Update-Naps2 })

$install.Add_Click({
  $parsed = ConvertTo-Origins $box.Text
  if (-not $parsed.Ok) { $errorLabel.Text = $parsed.Error; $box.Focus(); return }
  $errorLabel.Text = ""
  $install.Enabled = $false; $cancel.Enabled = $false; $box.Enabled = $false
  $install.Text = "ყენდება..."
  $form.Cursor = [System.Windows.Forms.Cursors]::WaitCursor
  [System.Windows.Forms.Application]::DoEvents()
  try {
    $health = Install-Agent $parsed.Origins
    $form.Cursor = [System.Windows.Forms.Cursors]::Default
    if ($health) {
      $naps2Note = if ($health.naps2) { "NAPS2: ✔" } else { "NAPS2: ✘ ვერ მოიძებნა — დააყენეთ naps2.com-დან, აგენტი თავად იპოვის." }
      [System.Windows.Forms.MessageBox]::Show(
        "✔ სკანერის აგენტი დაყენდა და გაშვებულია (ვერსია $($health.version)).`n`nსაიტი: $($parsed.Origins -join ', ')`n$naps2Note`n`n" +
        "Windows-ში შესვლისას ავტომატურად ჩაირთვება. ხატულა — ეკრანის ქვედა მარჯვენა კუთხეში.`n`n" +
        "ბრაუზერში გახსენით საიტი და სცადეთ სკანირება. პირველად Chrome/Edge შეიძლება ითხოვდეს ლოკალურ ქსელზე წვდომის ნებართვას — დააჭირეთ «Allow».",
        "ინსტალაცია დასრულდა", "OK", "Information") | Out-Null
      $form.DialogResult = [System.Windows.Forms.DialogResult]::OK
      $form.Close()
    } else {
      [System.Windows.Forms.MessageBox]::Show(
        "ფაილები დაყენდა, მაგრამ აგენტი არ პასუხობს.`nშესაძლოა პორტი $(Get-AgentPort) დაკავებულია ან ანტივირუსმა დაბლოკა.`n`nლოგი: $LogFile",
        "აგენტი არ პასუხობს", "OK", "Warning") | Out-Null
      $form.Close()
    }
  } catch {
    $form.Cursor = [System.Windows.Forms.Cursors]::Default
    $errorLabel.Text = "შეცდომა: $($_.Exception.Message)"
    $install.Text = "დაყენება"; $install.Enabled = $true; $cancel.Enabled = $true; $box.Enabled = $true
  }
})

$form.Controls.AddRange(@($title, $label, $box, $hint, $naps2Label, $naps2Link, $recheck, $errorLabel, $install, $cancel))
$form.Add_Shown({ $form.Activate(); $box.Focus(); $box.SelectionStart = $box.Text.Length })
[void]$form.ShowDialog()
