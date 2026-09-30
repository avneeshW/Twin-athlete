@echo off
REM ==========================================================================
REM Digital Twin Athlete - Live Data Collection Launcher
REM Runs startup.ps1 with ExecutionPolicy Bypass for seamless Windows startup
REM ==========================================================================
setlocal
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0startup.ps1" %*
endlocal
