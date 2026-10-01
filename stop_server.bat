@echo off
setlocal
cd /d "%~dp0"
title Stop Digital Twin Athlete Server

echo ==========================================================================
echo        DIGITAL TWIN ATHLETE -- STOP BACKGROUND SERVICE
echo ==========================================================================
echo.

powershell -NoProfile -ExecutionPolicy Bypass -Command "$c = Get-NetTCPConnection -LocalPort 5000 -State Listen -ErrorAction SilentlyContinue; if ($c) { $c | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue; Write-Host ('[+] Stopped server process PID: ' + $_.OwningProcess) -ForegroundColor Green } } else { Write-Host '[-] No server currently running on port 5000.' -ForegroundColor Gray }"

echo.
ping 127.0.0.1 -n 3 >nul 2>&1
endlocal
