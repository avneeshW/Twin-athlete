@echo off
setlocal
cd /d "%~dp0"
title Digital Twin Athlete - Remove AutoStart

echo ==========================================================================
echo    DIGITAL TWIN ATHLETE -- REMOVE WINDOWS AUTO-START
echo ==========================================================================
echo.

cscript //nologo "%~dp0remove_autostart.vbs"

echo.
ping 127.0.0.1 -n 3 >nul 2>&1
endlocal
