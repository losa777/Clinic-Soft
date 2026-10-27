<#
  კლინიკის სანდო ცენტრის (clinic-ca.crt) დაყენება კომპიუტერზე — ადმინისტრატორის უფლებით (client-setup.ps1-დან).
  - LocalMachine\Root: Chrome, Edge, Windows — ყველა მომხმარებლისთვის
  - Firefox: ImportEnterpriseRoots პოლიტიკა (Firefox Windows-ის სანდო ცენტრებს გამოიყენებს)
  გასვლის კოდი: 0 — წარმატება, 1 — შეცდომა (ტექსტი: trust-result.txt იმავე საქაღალდეში).
#>
$ErrorActionPreference = "Stop"
$result = Join-Path $PSScriptRoot "trust-result.txt"
try {
  $cert = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2 (Join-Path $PSScriptRoot "clinic-ca.crt")
  $store = New-Object System.Security.Cryptography.X509Certificates.X509Store("Root", "LocalMachine")
  $store.Open("ReadWrite")
  try { $store.Add($cert) } finally { $store.Close() }

  $ff = "HKLM:\SOFTWARE\Policies\Mozilla\Firefox\Certificates"
  New-Item -Path $ff -Force | Out-Null
  New-ItemProperty -Path $ff -Name "ImportEnterpriseRoots" -Value 1 -PropertyType DWord -Force | Out-Null

  Set-Content $result "ok" -Encoding UTF8
  exit 0
} catch {
  Set-Content $result $_.Exception.Message -Encoding UTF8
  exit 1
}
