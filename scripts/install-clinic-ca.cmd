@echo off
rem Clinic-Soft: install the clinic CA certificate (double-click). clinic-ca.crt must be in the same folder.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0install-clinic-ca.ps1"
