<#
  HTTPS-ის დაყენება სერვერზე (ClinicHttpsServerSetup.exe-დან ეშვება, ადმინისტრატორის უფლებით):
  1. კლინიკის „სანდო ცენტრი“ (CA) — Windows-ის საცავში (LocalMachine\My, გასაღები არ გაიტანება); ხელახლა
     გაშვებისას იგივე გამოიყენება — კომპიუტერებზე ხელახლა დაყენება არ სჭირდება.
  2. სერვერის სერტიფიკატი ამ კომპიუტერის სახელზე და ყველა IP-ზე (+ დამატებითი) → certs\server.key / server.crt (PEM).
  3. .env.local: HTTPS_KEY_FILE, HTTPS_CERT_FILE, AUTH_TRUST_HOST (+ PORT, HTTP_REDIRECT_PORT).
  4. Windows Firewall: პორტ(ებ)ის გახსნა; ნდობა თავად სერვერზე (LocalMachine\Root).
  5. კლიენტის ინსტალატორი: certs\ClinicCertificateSetup.exe (CA + სერვერის მისამართი, IExpress).
  OpenSSL არ სჭირდება — სერტიფიკატებს ქმნის Windows (New-SelfSignedCertificate).

  -Test: ადმინის გარეშე, CurrentUser-ის საცავით, firewall-ისა და Root-ის გარეშე (მხოლოდ შემოწმებისთვის).
#>
param(
  [string]$ProjectDir,
  [string]$Extra,
  [int]$Port = 0,
  [switch]$Redirect,
  [switch]$Quiet,
  [switch]$Test
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Windows.Forms, System.Drawing

function Show-Message([string]$Text, [string]$Title = "კლინიკის HTTPS", [string]$Icon = "Information") {
  if ($Quiet) { Write-Host "${Title}: $Text"; return }
  [System.Windows.Forms.MessageBox]::Show($Text, $Title, "OK", $Icon) | Out-Null
}

# ─── ადმინისტრატორის უფლება (ფაილები IExpress-ის დროებით საქაღალდეშია — -Wait, სანამ არ დასრულდება) ───
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $Test -and -not $isAdmin) {
  $argList = @("-NoProfile", "-ExecutionPolicy", "Bypass", "-STA", "-WindowStyle", "Hidden", "-File", "`"$PSCommandPath`"")
  if ($Quiet) { $argList += "-Quiet" }
  try { Start-Process powershell.exe -Verb RunAs -ArgumentList $argList -Wait } catch { Show-Message "ინსტალაციისთვის საჭიროა ადმინისტრატორის უფლება." "კლინიკის HTTPS" "Warning" }
  exit
}

$Store = if ($Test) { "Cert:\CurrentUser\My" } else { "Cert:\LocalMachine\My" }
$CaSubject = "CN=Clinic-Soft Local CA, O=Clinic"
$ServerDays = 825
$Utf8 = New-Object System.Text.UTF8Encoding $false

# ─── პროექტი ───
function Test-Project([string]$Dir) {
  if (-not $Dir -or -not (Test-Path (Join-Path $Dir "package.json")) -or -not (Test-Path (Join-Path $Dir "server.ts"))) { return $false }
  return (Get-Content (Join-Path $Dir "package.json") -Raw -Encoding UTF8) -match '"name"\s*:\s*"clinic-soft"'
}

function Find-Project {
  $candidates = @("C:\Clinic-Soft", "D:\Clinic-Soft", "C:\inetpub\Clinic-Soft", "$env:USERPROFILE\Desktop\Clinic-Soft")
  $candidates += Get-ChildItem "C:\Users\*\Desktop\Clinic-Soft", "C:\Users\*\Documents\Clinic-Soft" -Directory -ErrorAction SilentlyContinue | ForEach-Object { $_.FullName }
  return $candidates | Where-Object { Test-Project $_ } | Select-Object -First 1
}

function Read-EnvValue([string]$File, [string]$Key) {
  if (-not (Test-Path $File)) { return $null }
  $line = Get-Content $File -Encoding UTF8 | Where-Object { $_ -match "^\s*$Key\s*=" } | Select-Object -Last 1
  if ($line) { return ($line -replace "^\s*$Key\s*=\s*", "").Trim().Trim('"') }
  return $null
}

<# .env.local-ის მნიშვნელობები: არსებული ხაზი იცვლება, ახალი ემატება ბოლოს; $null — ხაზი კომენტარდება. #>
function Set-EnvValues([string]$File, [hashtable]$Values) {
  $lines = [System.Collections.Generic.List[string]]::new()
  if (Test-Path $File) { foreach ($l in [System.IO.File]::ReadAllLines($File, [System.Text.Encoding]::UTF8)) { $lines.Add($l) } }
  foreach ($key in $Values.Keys) {
    $value = $Values[$key]
    $index = -1
    for ($i = 0; $i -lt $lines.Count; $i++) { if ($lines[$i] -match "^\s*$key\s*=") { $index = $i } }
    if ($null -eq $value) {
      if ($index -ge 0) { $lines[$index] = "# $($lines[$index])" }
    } elseif ($index -ge 0) {
      $lines[$index] = "$key=$value"
    } else {
      if (-not ($lines | Where-Object { $_ -like "*HTTPS (ClinicHttpsServerSetup)*" })) { $lines.Add(""); $lines.Add("# HTTPS (ClinicHttpsServerSetup)") }
      $lines.Add("$key=$value")
    }
  }
  [System.IO.File]::WriteAllLines($File, $lines, $Utf8)
}

# ─── მისამართები ───
function Get-ServerAddresses([string]$ExtraText) {
  $names = [System.Collections.Generic.List[string]]::new()
  $ips = [System.Collections.Generic.List[string]]::new()
  foreach ($n in @("localhost", $env:COMPUTERNAME.ToLower())) { if (-not $names.Contains($n)) { $names.Add($n) } }
  try {
    $fqdn = [System.Net.Dns]::GetHostEntry("").HostName.ToLower()
    if ($fqdn -and -not $names.Contains($fqdn)) { $names.Add($fqdn) }
  } catch {}
  $ips.Add("127.0.0.1")
  # ჯერ ქსელის ბარათები, რომლებსაც gateway აქვს (ლოკალური ქსელი) — პირველი IP ხდება მთავარი მისამართი
  $adapters = [System.Net.NetworkInformation.NetworkInterface]::GetAllNetworkInterfaces() |
    Sort-Object { if ($_.GetIPProperties().GatewayAddresses | Where-Object { $_.Address.AddressFamily -eq "InterNetwork" -and $_.Address.ToString() -ne "0.0.0.0" }) { 0 } else { 1 } }
  foreach ($a in $adapters) {
    if ($a.OperationalStatus -ne "Up") { continue }
    foreach ($u in $a.GetIPProperties().UnicastAddresses) {
      $ip = $u.Address.ToString()
      if ($u.Address.AddressFamily -eq "InterNetwork" -and $ip -notlike "169.254.*" -and -not $ips.Contains($ip)) { $ips.Add($ip) }
    }
  }
  foreach ($part in ($ExtraText -split "[,;\s]+")) {
    $p = $part.Trim().ToLower() -replace "^https?://", "" -replace "[:/].*$", ""
    if (-not $p) { continue }
    $parsed = $null
    if ([System.Net.IPAddress]::TryParse($p, [ref]$parsed)) { if (-not $ips.Contains($p)) { $ips.Add($p) } }
    elseif ($p -match "^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$") { if (-not $names.Contains($p)) { $names.Add($p) } }
    else { throw "მისამართი არასწორია: $part" }
  }
  return @{ Names = $names; Ips = $ips }
}

# ─── სერტიფიკატები ───
function ConvertTo-Pem([byte[]]$Der, [string]$Label) {
  $b64 = [Convert]::ToBase64String($Der, [Base64FormattingOptions]::InsertLineBreaks) -replace "`r`n", "`n"
  return "-----BEGIN $Label-----`n$b64`n-----END $Label-----`n"
}

function Get-DerLength([int]$Length) {
  if ($Length -lt 0x80) { return , ([byte[]]@($Length)) }
  $bytes = [System.Collections.Generic.List[byte]]::new()
  while ($Length -gt 0) { $bytes.Insert(0, [byte]($Length -band 0xFF)); $Length = $Length -shr 8 }
  $bytes.Insert(0, [byte](0x80 + $bytes.Count))
  return , $bytes.ToArray()
}

function Get-DerInteger([byte[]]$Value) {
  $i = 0
  while ($i -lt $Value.Length - 1 -and $Value[$i] -eq 0) { $i++ }
  $v = [System.Collections.Generic.List[byte]]::new()
  if ($Value[$i] -band 0x80) { $v.Add(0) }
  for ($j = $i; $j -lt $Value.Length; $j++) { $v.Add($Value[$j]) }
  $out = [System.Collections.Generic.List[byte]]::new()
  $out.Add(0x02); $out.AddRange([byte[]](Get-DerLength $v.Count)); $out.AddRange($v)
  return , $out.ToArray()
}

<# RSA გასაღები → PKCS#1 PEM („RSA PRIVATE KEY“) — Node.js-ის https სერვერისთვის. #>
function ConvertTo-RsaPem($Rsa) {
  $p = $Rsa.ExportParameters($true)
  $body = [System.Collections.Generic.List[byte]]::new()
  $body.AddRange([byte[]](Get-DerInteger ([byte[]]@(0))))
  foreach ($part in @($p.Modulus, $p.Exponent, $p.D, $p.P, $p.Q, $p.DP, $p.DQ, $p.InverseQ)) { $body.AddRange([byte[]](Get-DerInteger $part)) }
  $der = [System.Collections.Generic.List[byte]]::new()
  $der.Add(0x30); $der.AddRange([byte[]](Get-DerLength $body.Count)); $der.AddRange($body)
  return ConvertTo-Pem $der.ToArray() "RSA PRIVATE KEY"
}

function Get-OrCreateCa {
  $ca = Get-ChildItem $Store | Where-Object { $_.Subject -eq $CaSubject -and $_.HasPrivateKey -and $_.NotAfter -gt (Get-Date).AddDays(60) } |
    Sort-Object NotAfter -Descending | Select-Object -First 1
  if ($ca) { return @{ Cert = $ca; New = $false } }
  $ca = New-SelfSignedCertificate -Subject $CaSubject -FriendlyName "Clinic-Soft Local CA" -CertStoreLocation $Store `
    -KeyAlgorithm RSA -KeyLength 3072 -HashAlgorithm SHA256 -KeyExportPolicy NonExportable `
    -KeyUsage CertSign, CRLSign, DigitalSignature -TextExtension @("2.5.29.19={critical}{text}ca=1&pathlength=0") `
    -NotAfter (Get-Date).AddYears(10)
  return @{ Cert = $ca; New = $true }
}

function New-ServerCertificate($Ca, $Names, $Ips) {
  $san = "2.5.29.17={text}" + ((@($Names | ForEach-Object { "DNS=$_" }) + @($Ips | ForEach-Object { "IPAddress=$_" })) -join "&")
  # CAPI provider — გასაღების გატანა PEM-ში (.NET Framework-ის ExportParameters)
  return New-SelfSignedCertificate -Subject "CN=$($env:COMPUTERNAME.ToLower())" -FriendlyName "Clinic-Soft server" -Signer $Ca `
    -CertStoreLocation $Store -Provider "Microsoft Enhanced RSA and AES Cryptographic Provider" -KeyAlgorithm RSA -KeyLength 2048 `
    -HashAlgorithm SHA256 -KeyExportPolicy Exportable -KeyUsage DigitalSignature, KeyEncipherment `
    -TextExtension @($san, "2.5.29.37={text}1.3.6.1.5.5.7.3.1", "2.5.29.19={critical}{text}ca=0") `
    -NotAfter (Get-Date).AddDays($ServerDays)
}

# ─── კლიენტის ინსტალატორი (IExpress) ───
function New-ClientInstaller([string]$CertsDir, [string[]]$Urls) {
  $iexpress = Join-Path $env:WINDIR "System32\iexpress.exe"
  if (-not (Test-Path $iexpress)) { throw "IExpress ვერ მოიძებნა — კლიენტის ინსტალატორი ვერ შეიქმნა (ფაილები: certs\client)" }
  # IExpress ბრჭყალებიან / ჰარიან გზას ვერ კითხულობს — დროებითი საქაღალდე ჰარების გარეშე, შემდეგ exe → certs
  $tempRoot = if (-not $Test) { Join-Path $env:WINDIR "Temp" } else { $env:TEMP }
  $work = Join-Path $tempRoot ("clinic-cert-" + [guid]::NewGuid().ToString("N").Substring(0, 8))
  if ($work -match "\s") { throw "დროებითი საქაღალდის გზაში ჰარია: $work" }
  New-Item -ItemType Directory -Force $work | Out-Null
  foreach ($f in @("client-setup.ps1", "client-trust.ps1")) { Copy-Item (Join-Path $PSScriptRoot $f) $work }
  Copy-Item (Join-Path $CertsDir "clinic-ca.crt") $work
  $json = [ordered]@{ urls = [object[]]$Urls; primaryUrl = $Urls[0]; created = (Get-Date).ToString("yyyy-MM-dd") } | ConvertTo-Json
  [System.IO.File]::WriteAllText((Join-Path $work "clinic.json"), $json, $Utf8)
  $files = @("client-setup.ps1", "client-trust.ps1", "clinic-ca.crt", "clinic.json")
  $built = Join-Path $work "ClinicCertificateSetup.exe"
  $target = Join-Path $CertsDir "ClinicCertificateSetup.exe"
  $sed = @(
    "[Version]", "Class=IEXPRESS", "SEDVersion=3", "[Options]", "PackagePurpose=InstallApp", "ShowInstallProgramWindow=1",
    "HideExtractAnimation=1", "UseLongFileName=1", "InsideCompressed=0", "CAB_FixedSize=0", "CAB_ResvCodeSigning=0", "RebootMode=N",
    "InstallPrompt=%InstallPrompt%", "DisplayLicense=%DisplayLicense%", "FinishMessage=%FinishMessage%", "TargetName=%TargetName%",
    "FriendlyName=%FriendlyName%", "AppLaunched=%AppLaunched%", "PostInstallCmd=%PostInstallCmd%", "AdminQuietInstCmd=%AdminQuietInstCmd%",
    "UserQuietInstCmd=%UserQuietInstCmd%", "SourceFiles=SourceFiles", "[Strings]", "InstallPrompt=", "DisplayLicense=", "FinishMessage=",
    "TargetName=$built", "FriendlyName=Clinic Certificate",
    "AppLaunched=powershell.exe -NoProfile -ExecutionPolicy Bypass -STA -WindowStyle Hidden -File client-setup.ps1",
    "PostInstallCmd=<None>", "AdminQuietInstCmd=", "UserQuietInstCmd="
  )
  for ($i = 0; $i -lt $files.Count; $i++) { $sed += "FILE$i=`"$($files[$i])`"" }
  $sed += @("[SourceFiles]", "SourceFiles0=$work\", "[SourceFiles0]")
  for ($i = 0; $i -lt $files.Count; $i++) { $sed += "%FILE$i%=" }
  $sedFile = Join-Path $work "client.sed"
  [System.IO.File]::WriteAllLines($sedFile, $sed, [System.Text.Encoding]::Default)
  Start-Process $iexpress -ArgumentList "/N /Q $sedFile" -Wait -WindowStyle Hidden
  try {
    if (-not (Test-Path $built)) { throw "კლიენტის ინსტალატორი ვერ შეიქმნა (IExpress)" }
    Move-Item $built $target -Force
  } finally { Remove-Item $work -Recurse -Force -ErrorAction SilentlyContinue }
  return $target
}

# ─── ინსტალაცია ───
function Install-Https([string]$Dir, [string]$ExtraText, [int]$HttpsPort, [bool]$WithRedirect, [bool]$WithFirewall) {
  $addresses = Get-ServerAddresses $ExtraText
  $certs = Join-Path $Dir "certs"
  New-Item -ItemType Directory -Force $certs | Out-Null
  # წინა ფაილები — სარეზერვოდ
  $old = @("server.key", "server.crt", "clinic-ca.crt", "clinic-ca.key") | Where-Object { Test-Path (Join-Path $certs $_) }
  if ($old) {
    $backup = Join-Path $certs ("backup-" + (Get-Date).ToString("yyyyMMdd-HHmmss"))
    New-Item -ItemType Directory -Force $backup | Out-Null
    foreach ($f in $old) { Move-Item (Join-Path $certs $f) $backup }
  }

  $ca = Get-OrCreateCa
  $server = New-ServerCertificate $ca.Cert $addresses.Names $addresses.Ips
  try {
    [System.IO.File]::WriteAllText((Join-Path $certs "server.key"), (ConvertTo-RsaPem $server.PrivateKey), $Utf8)
    [System.IO.File]::WriteAllText((Join-Path $certs "server.crt"), (ConvertTo-Pem $server.RawData "CERTIFICATE"), $Utf8)
    [System.IO.File]::WriteAllText((Join-Path $certs "clinic-ca.crt"), (ConvertTo-Pem $ca.Cert.RawData "CERTIFICATE"), $Utf8)
  } finally {
    # სერვერის სერტიფიკატი საცავში აღარ სჭირდება (ფაილებშია); CA რჩება — ვადის განახლებისთვის
    Remove-Item "$Store\$($server.Thumbprint)" -Force -ErrorAction SilentlyContinue
  }

  $envPath = Join-Path $Dir ".env.local"
  $values = @{
    HTTPS_KEY_FILE = "certs/server.key"
    HTTPS_CERT_FILE = "certs/server.crt"
    AUTH_TRUST_HOST = "true"
    HTTP_REDIRECT_PORT = if ($WithRedirect) { "80" } else { $null }
  }
  if ($HttpsPort -ne 3000 -or (Read-EnvValue $envPath "PORT")) { $values.PORT = "$HttpsPort" }
  Set-EnvValues $envPath $values

  if (-not $Test) {
    # ნდობა თავად სერვერზე (ბრაუზერი სერვერზეც გაფრთხილების გარეშე)
    $root = New-Object System.Security.Cryptography.X509Certificates.X509Store("Root", "LocalMachine")
    $root.Open("ReadWrite"); $root.Add($ca.Cert); $root.Close()
    if ($WithFirewall) {
      $ports = @($HttpsPort) + $(if ($WithRedirect) { @(80) } else { @() })
      foreach ($p in $ports) {
        $name = "Clinic-Soft TCP $p"
        if (-not (Get-NetFirewallRule -DisplayName $name -ErrorAction SilentlyContinue)) {
          New-NetFirewallRule -DisplayName $name -Direction Inbound -Protocol TCP -LocalPort $p -Action Allow -Profile Any | Out-Null
        }
      }
    }
  }

  $hostPart = { param($h) if ($HttpsPort -eq 443) { "https://$h" } else { "https://${h}:$HttpsPort" } }
  $lanIps = @($addresses.Ips | Where-Object { $_ -ne "127.0.0.1" })
  $urls = @($lanIps | ForEach-Object { & $hostPart $_ }) + @($addresses.Names | Where-Object { $_ -ne "localhost" } | ForEach-Object { & $hostPart $_ })
  if (-not $urls) { $urls = @(& $hostPart "localhost") }
  $client = New-ClientInstaller $certs $urls
  return @{ Urls = $urls; Client = $client; NewCa = $ca.New; Addresses = $addresses; Until = $server.NotAfter }
}

function Get-ResultText($r) {
  $caNote = if ($r.NewCa) { "შეიქმნა კლინიკის ახალი სანდო ცენტრი — კომპიუტერებზე დააყენეთ ახალი ClinicCertificateSetup.exe." } else { "კლინიკის სანდო ცენტრი იგივეა — უკვე დაყენებულ კომპიუტერებზე არაფერი იცვლება." }
  return "✔ HTTPS მომზადდა (სერტიფიკატის ვადა: $($r.Until.ToString('dd.MM.yyyy'))).`n`n" +
    "1) გადატვირთეთ სერვერი: გაჩერება (Ctrl+C) და ხელახლა npm run start.`n" +
    "2) მისამართი: $($r.Urls[0])`n" +
    "3) ყველა კომპიუტერზე გაუშვით:`n   $($r.Client)`n`n$caNote"
}

# ─── ფანჯრის გარეშე ───
if ($Quiet) {
  $dir = if ($ProjectDir) { $ProjectDir } else { Find-Project }
  if (-not (Test-Project $dir)) { Write-Error "პროექტის საქაღალდე ვერ მოიძებნა: $dir"; exit 2 }
  $p = if ($Port) { $Port } elseif ($v = Read-EnvValue (Join-Path $dir ".env.local") "PORT") { [int]$v } else { 3000 }
  $r = Install-Https $dir $Extra $p $Redirect.IsPresent (-not $Test)
  Write-Host (Get-ResultText $r)
  exit 0
}

# ─── ფანჯარა ───
[System.Windows.Forms.Application]::EnableVisualStyles()
$font = New-Object System.Drawing.Font("Segoe UI", 10)
$form = New-Object System.Windows.Forms.Form -Property @{
  Text = "კლინიკის HTTPS — სერვერი"; Size = New-Object System.Drawing.Size(600, 520); StartPosition = "CenterScreen"
  FormBorderStyle = "FixedDialog"; MaximizeBox = $false; MinimizeBox = $false; Font = $font; TopMost = $true
}
function Add-Label([string]$Text, [int]$Y, [int]$H = 22, $Color = $null, [bool]$Bold = $false) {
  $l = New-Object System.Windows.Forms.Label -Property @{ Text = $Text; Location = New-Object System.Drawing.Point(20, $Y); Size = New-Object System.Drawing.Size(550, $H) }
  if ($Color) { $l.ForeColor = $Color }
  if ($Bold) { $l.Font = New-Object System.Drawing.Font("Segoe UI", 12, [System.Drawing.FontStyle]::Bold) }
  $form.Controls.Add($l); return $l
}

[void](Add-Label "უსაფრთხო კავშირი (HTTPS) — სერვერი" 15 28 $null $true)
[void](Add-Label "პროექტის საქაღალდე (Clinic-Soft):" 55)
$dirBox = New-Object System.Windows.Forms.TextBox -Property @{ Location = New-Object System.Drawing.Point(20, 78); Size = New-Object System.Drawing.Size(445, 26); Text = (Find-Project) }
$browse = New-Object System.Windows.Forms.Button -Property @{ Text = "არჩევა..."; Location = New-Object System.Drawing.Point(472, 76); Size = New-Object System.Drawing.Size(98, 30) }
$browse.Add_Click({
  $dlg = New-Object System.Windows.Forms.FolderBrowserDialog -Property @{ Description = "აირჩიეთ Clinic-Soft-ის საქაღალდე"; SelectedPath = $dirBox.Text }
  if ($dlg.ShowDialog() -eq "OK") { $dirBox.Text = $dlg.SelectedPath; Update-Defaults }
})
$form.Controls.AddRange(@($dirBox, $browse))

$addr = Get-ServerAddresses ""
[void](Add-Label "სერვერის მისამართები (ავტომატურად):" 118)
$addrLabel = Add-Label (($addr.Names + $addr.Ips) -join ", ") 140 40 ([System.Drawing.Color]::DimGray)
[void](Add-Label "დამატებითი სახელი ან IP (საჭიროების შემთხვევაში, მძიმით):" 185)
$extraBox = New-Object System.Windows.Forms.TextBox -Property @{ Location = New-Object System.Drawing.Point(20, 208); Size = New-Object System.Drawing.Size(550, 26) }
$form.Controls.Add($extraBox)

[void](Add-Label "პორტი:" 250)
$portBox = New-Object System.Windows.Forms.NumericUpDown -Property @{ Location = New-Object System.Drawing.Point(90, 247); Size = New-Object System.Drawing.Size(90, 26) }
$portBox.Maximum = 65535; $portBox.Minimum = 1; $portBox.Value = 3000  # Maximum — Value-მდე (ნაგულისხმევი 100)
$form.Controls.Add($portBox)
$redirectBox = New-Object System.Windows.Forms.CheckBox -Property @{ Text = "http:// მისამართის გადამისამართება https-ზე (პორტი 80)"; Location = New-Object System.Drawing.Point(20, 285); Size = New-Object System.Drawing.Size(550, 24) }
$firewallBox = New-Object System.Windows.Forms.CheckBox -Property @{ Text = "Windows Firewall-ში პორტ(ებ)ის გახსნა"; Location = New-Object System.Drawing.Point(20, 312); Size = New-Object System.Drawing.Size(550, 24); Checked = $true }
$form.Controls.AddRange(@($redirectBox, $firewallBox))

$errorLabel = Add-Label "" 345 48 ([System.Drawing.Color]::Firebrick)
$install = New-Object System.Windows.Forms.Button -Property @{ Text = "დაყენება"; Location = New-Object System.Drawing.Point(340, 420); Size = New-Object System.Drawing.Size(110, 34) }
$cancel = New-Object System.Windows.Forms.Button -Property @{ Text = "გაუქმება"; Location = New-Object System.Drawing.Point(460, 420); Size = New-Object System.Drawing.Size(110, 34); DialogResult = "Cancel" }
$form.AcceptButton = $install; $form.CancelButton = $cancel
$form.Controls.AddRange(@($install, $cancel))

function Update-Defaults {
  $envFile = Join-Path $dirBox.Text ".env.local"
  $p = Read-EnvValue $envFile "PORT"
  if ($p -match "^\d+$") { $portBox.Value = [int]$p }
  $redirectBox.Checked = [bool](Read-EnvValue $envFile "HTTP_REDIRECT_PORT")
}
Update-Defaults

$install.Add_Click({
  if (-not (Test-Project $dirBox.Text)) { $errorLabel.Text = "აირჩიეთ Clinic-Soft-ის საქაღალდე (სადაც package.json და server.ts არის)."; return }
  $errorLabel.Text = ""
  foreach ($c in @($install, $cancel, $browse, $dirBox, $extraBox, $portBox, $redirectBox, $firewallBox)) { $c.Enabled = $false }
  $install.Text = "ყენდება..."; $form.Cursor = "WaitCursor"
  [System.Windows.Forms.Application]::DoEvents()
  try {
    $r = Install-Https $dirBox.Text $extraBox.Text ([int]$portBox.Value) $redirectBox.Checked $firewallBox.Checked
    $form.Cursor = "Default"
    $form.TopMost = $false
    Show-Message (Get-ResultText $r) "HTTPS მზადაა"
    if ($r.Client) { Start-Process explorer.exe -ArgumentList "/select,`"$($r.Client)`"" }
    $form.Close()
  } catch {
    $form.Cursor = "Default"
    $errorLabel.Text = "შეცდომა: $($_.Exception.Message)"
    foreach ($c in @($install, $cancel, $browse, $dirBox, $extraBox, $portBox, $redirectBox, $firewallBox)) { $c.Enabled = $true }
    $install.Text = "დაყენება"
  }
})

$form.Add_Shown({ $form.Activate() })
[void]$form.ShowDialog()
