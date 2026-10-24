# კლინიკის CA-ს დაყენება Windows-ის სანდო ცენტრებში (Local Machine → Trusted Root Certification Authorities).
# Edge, Chrome და Firefox Windows-ზე ამ საცავს ენდობიან — https://<სერვერი> გაფრთხილების გარეშე იხსნება.
# გაშვება: install-clinic-ca.cmd (ადმინისტრატორის უფლებას თავად ითხოვს). ფაილი clinic-ca.crt უნდა იყოს იმავე საქაღალდეში.

$ErrorActionPreference = "Stop"
$cert = Join-Path $PSScriptRoot "clinic-ca.crt"
if (-not (Test-Path $cert)) {
    Write-Host "clinic-ca.crt ვერ მოიძებნა საქაღალდეში $PSScriptRoot" -ForegroundColor Red
    exit 1
}

$principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Start-Process powershell.exe -Verb RunAs -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`""
    exit
}

$imported = Import-Certificate -FilePath $cert -CertStoreLocation Cert:\LocalMachine\Root
Write-Host "კლინიკის სერტიფიკატი დაყენდა: $($imported.Subject) (ვადა: $($imported.NotAfter.ToString('dd.MM.yyyy')))" -ForegroundColor Green
Write-Host "გადატვირთეთ ბრაუზერი."
Read-Host "დააჭირეთ Enter-ს დასახურად"
