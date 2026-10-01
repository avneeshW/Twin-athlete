@echo off
setlocal
cd /d "%~dp0"
title Digital Twin Athlete - AutoStart Setup

echo ==========================================================================
echo    DIGITAL TWIN ATHLETE -- CONFIGURE PERMANENT WINDOWS AUTO-START
echo ==========================================================================
echo.

cscript //nologo "%~dp0setup_autostart.vbs"

echo.
ping 127.0.0.1 -n 4 >nul 2>&1
endlocal
