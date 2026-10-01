@echo off
setlocal
cd /d "%~dp0"
title Digital Twin Athlete - Background Service Manager

echo ==========================================================================
echo        DIGITAL TWIN ATHLETE -- PERMANENT BACKGROUND SERVICE
echo ==========================================================================
echo.

:: Check if already running on port 5000
netstat -ano | findstr :5000 | findstr LISTENING >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    echo [+] Digital Twin Athlete is ALREADY RUNNING in the background on port 5000.
    goto OPEN_BROWSER
)

echo [*] Starting Digital Twin Athlete server in background (silent mode)...
wscript.exe "%~dp0run_background.vbs"

echo [*] Waiting for server to initialize...
set RETRIES=0
:WAIT_LOOP
ping 127.0.0.1 -n 2 >nul 2>&1
powershell -Command "try { $r = Invoke-RestMethod -Uri 'http://127.0.0.1:5000/api/status' -TimeoutSec 1; if ($r.status -eq 'online') { exit 0 } else { exit 1 } } catch { exit 1 }" >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    echo [+] Server is ONLINE and operational!
    goto OPEN_BROWSER
)
set /a RETRIES+=1
if %RETRIES% LEQ 15 goto WAIT_LOOP

echo [!] Notice: Server took longer than expected to report status.
echo     Attempting to open browser anyway...

:OPEN_BROWSER
echo.
echo ==========================================================================
echo  Access Cockpit:  http://127.0.0.1:5000
echo  LAN Access:      http://10.1.7.223:5000
echo ==========================================================================
echo.
echo [*] Opening Cockpit in default browser...
start http://127.0.0.1:5000

echo.
echo The server is running permanently in the background.
echo You can safely close this window at any time.
echo To stop the server at any point, run: stop_server.bat
echo.
ping 127.0.0.1 -n 4 >nul 2>&1
endlocal
