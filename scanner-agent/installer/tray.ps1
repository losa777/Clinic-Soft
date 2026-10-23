<#
  სკანერის აგენტის ხატულა (tray): მწვანე — მუშაობს, ნარინჯისფერი — NAPS2 ვერ მოიძებნა, წითელი — არ მუშაობს.
  მენიუ: საიტის მისამართის შეცვლა, აგენტის გადატვირთვა, ლოგი. ეშვება Windows-ში შესვლისას (tray-hidden.vbs).
#>
$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "common.ps1")
Add-Type -AssemblyName System.Windows.Forms, System.Drawing, Microsoft.VisualBasic

# ერთი ასლი
$mutex = New-Object System.Threading.Mutex($false, "Local\ClinicScanAgentTray")
if (-not $mutex.WaitOne(0)) { exit }

[System.Windows.Forms.Application]::EnableVisualStyles()

<# ხატულა: სკანერის სილუეტი სტატუსის ფერის წერტილით. #>
function New-StatusIcon([System.Drawing.Color]$Color) {
  $bmp = New-Object System.Drawing.Bitmap 32, 32
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.Clear([System.Drawing.Color]::Transparent)
  $body = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(70, 80, 90))
  $g.FillRectangle($body, 2, 14, 28, 12)
  $g.FillRectangle((New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(120, 200, 230))), 4, 16, 24, 3)
  $g.FillPolygon($body, @((New-Object System.Drawing.Point 4, 13), (New-Object System.Drawing.Point 28, 5), (New-Object System.Drawing.Point 29, 8), (New-Object System.Drawing.Point 8, 13)))
  $g.FillEllipse((New-Object System.Drawing.SolidBrush $Color), 18, 18, 13, 13)
  $g.DrawEllipse((New-Object System.Drawing.Pen ([System.Drawing.Color]::White), 1.5), 18, 18, 13, 13)
  $g.Dispose()
  return [System.Drawing.Icon]::FromHandle($bmp.GetHicon())
}
$icons = @{
  ok = New-StatusIcon ([System.Drawing.Color]::FromArgb(34, 160, 80))
  warn = New-StatusIcon ([System.Drawing.Color]::FromArgb(230, 140, 20))
  down = New-StatusIcon ([System.Drawing.Color]::FromArgb(210, 50, 50))
}

$notify = New-Object System.Windows.Forms.NotifyIcon
$notify.Icon = $icons.down
$notify.Text = "სკანერის აგენტი"
$notify.Visible = $true

$menu = New-Object System.Windows.Forms.ContextMenuStrip
$statusItem = $menu.Items.Add("მოწმდება...")
$statusItem.Enabled = $false
[void]$menu.Items.Add("-")
$originItem = $menu.Items.Add("საიტის მისამართის შეცვლა...")
$restartItem = $menu.Items.Add("აგენტის გადატვირთვა")
$logItem = $menu.Items.Add("ლოგის გახსნა")
$naps2Item = $menu.Items.Add("NAPS2-ის ჩამოტვირთვა...")
[void]$menu.Items.Add("-")
$exitItem = $menu.Items.Add("ხატულის დახურვა (აგენტი გააგრძელებს მუშაობას)")
$notify.ContextMenuStrip = $menu

$script:lastState = $null

function Update-Status {
  $h = Get-AgentHealth
  if (-not $h) {
    $state = "down"; $text = "✘ აგენტი არ მუშაობს"
  } elseif (-not $h.naps2) {
    $state = "warn"; $text = "⚠ მუშაობს, მაგრამ NAPS2 ვერ მოიძებნა"
  } else {
    $state = "ok"; $text = "✔ მუშაობს (ვერსია $($h.version))"
  }
  $statusItem.Text = $text
  $naps2Item.Visible = $state -eq "warn"
  $notify.Icon = $icons[$state]
  # NotifyIcon.Text — მაქს. 63 სიმბოლო
  $tip = "სკანერის აგენტი: $text"
  $notify.Text = if ($tip.Length -gt 63) { $tip.Substring(0, 63) } else { $tip }
  if ($script:lastState -and $script:lastState -ne $state -and $state -ne "ok") {
    $notify.ShowBalloonTip(5000, "სკანერის აგენტი", $text, [System.Windows.Forms.ToolTipIcon]::Warning)
  }
  $script:lastState = $state
}

function Restart-Agent {
  Stop-Agent
  Start-Agent
  [void](Wait-AgentHealth -Port (Get-AgentPort) -Seconds 8)
  Update-Status
}

$originItem.Add_Click({
  $c = Read-AgentConfig
  $current = if ($c -and $c.allowedOrigins) { $c.allowedOrigins -join ", " } else { "http://" }
  $text = [Microsoft.VisualBasic.Interaction]::InputBox(
    "საიტის მისამართი — ზუსტად ისე, როგორც ბრაუზერის მისამართის ზოლშია.`nრამდენიმე — მძიმით.`n`nმაგ. http://10.1.20.5:3000",
    "საიტის მისამართის შეცვლა", $current)
  if (-not $text) { return }
  $parsed = ConvertTo-Origins $text
  if (-not $parsed.Ok) {
    [System.Windows.Forms.MessageBox]::Show($parsed.Error, "მისამართი არასწორია", "OK", "Warning") | Out-Null
    return
  }
  $naps2 = if ($c -and $c.naps2Path) { $c.naps2Path } else { Find-Naps2 }
  Write-AgentConfig -Origins $parsed.Origins -Port (Get-AgentPort) -Naps2Path $naps2
  Restart-Agent
  $notify.ShowBalloonTip(4000, "სკანერის აგენტი", "საიტი: $($parsed.Origins -join ', ')", [System.Windows.Forms.ToolTipIcon]::Info)
})
$restartItem.Add_Click({ Restart-Agent })
$logItem.Add_Click({ if (Test-Path $LogFile) { Start-Process notepad.exe -ArgumentList "`"$LogFile`"" } })
$naps2Item.Add_Click({ Start-Process $Naps2Url })
$notify.Add_DoubleClick({
  $c = Read-AgentConfig
  $sites = if ($c -and $c.allowedOrigins) { $c.allowedOrigins -join ", " } else { "—" }
  [System.Windows.Forms.MessageBox]::Show("$($statusItem.Text)`n`nსაიტი: $sites`nპორტი: $(Get-AgentPort)`nსაქაღალდე: $InstallDir", "სკანერის აგენტი", "OK", "Information") | Out-Null
})
$exitItem.Add_Click({
  $timer.Stop()
  $notify.Visible = $false
  [System.Windows.Forms.Application]::Exit()
})

$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 10000
$timer.Add_Tick({ Update-Status })
$timer.Start()
Update-Status

[System.Windows.Forms.Application]::Run()
$notify.Dispose()
$mutex.ReleaseMutex()
