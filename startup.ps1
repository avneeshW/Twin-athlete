<#
.SYNOPSIS
    Digital Twin Athlete — Live Data Collection Backend Startup Script
.DESCRIPTION
    Initializes the Python runtime, verifies core dependencies, checks port availability,
    discovers LAN IP addresses for ESP32 Wi-Fi firmware, inspects USB COM ports,
    and runs the live telemetry collection backend with optional serial bridge or mock feeds.
.PARAMETER Mode
    Execution mode:
      - 'Server'   : Starts the Flask backend with live telemetry endpoints (Default)
      - 'Bridge'   : Starts the backend and launches the USB Serial bridge (twin/bridge.py)
      - 'MockFeed' : Starts the backend and activates the background live sensor feed
      - 'Verify'   : Runs the automated live sensor pipeline verification script
.PARAMETER Port
    HTTP Port to bind (default: 5000).
.PARAMETER NoBrowser
    If specified, prevents automatically opening the web browser upon successful startup.
.PARAMETER ForceRestart
    Automatically terminates any existing process occupying the target port.
.EXAMPLE
    .\startup.ps1
.EXAMPLE
    powershell -ExecutionPolicy Bypass -File .\startup.ps1
.EXAMPLE
    .\startup.ps1 -Mode Bridge
.EXAMPLE
    .\startup.ps1 -Mode MockFeed -Port 5000
#>

[CmdletBinding()]
param(
    [ValidateSet("Server", "Bridge", "MockFeed", "Verify")]
    [string]$Mode = "Server",

    [int]$Port = 5000,

    [switch]$NoBrowser,

    [switch]$ForceRestart
)

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$ErrorActionPreference = "Continue"

Clear-Host
Write-Host "==========================================================================" -ForegroundColor Cyan
Write-Host "         DIGITAL TWIN ATHLETE -- LIVE DATA COLLECTION ENGINE               " -ForegroundColor Cyan
Write-Host "              Predictive Biometrics * ESP32 Telemetry * AI                 " -ForegroundColor DarkCyan
Write-Host "==========================================================================" -ForegroundColor Cyan
Write-Host ""

# 1. Resolve Project Root Directory
$ProjectRoot = $PSScriptRoot
if (-not $ProjectRoot) { $ProjectRoot = (Get-Location).Path }
Set-Location -Path $ProjectRoot

Write-Host "[1/6] Validating Python Runtime and Environment..." -ForegroundColor Yellow

# Check Python executable
$PythonCmd = (Get-Command python -ErrorAction SilentlyContinue)
if (-not $PythonCmd) {
    Write-Host " [!] ERROR: Python was not found in your PATH." -ForegroundColor Red
    Write-Host "     Please install Python 3.10+ and ensure 'Add Python to PATH' is checked." -ForegroundColor Red
    exit 1
}

$PyVer = (& python --version 2>&1)
Write-Host " [+] Python detected: $PyVer" -ForegroundColor Green

# Check for virtual environment in project root
$VenvPaths = @(".venv\Scripts\Activate.ps1", "venv\Scripts\Activate.ps1", "env\Scripts\Activate.ps1")
foreach ($v in $VenvPaths) {
    $fullVenv = Join-Path $ProjectRoot $v
    if (Test-Path $fullVenv) {
        Write-Host " [+] Activating Virtual Environment: $v" -ForegroundColor Green
        & $fullVenv
        break
    }
}

# 2. Check Required Packages
Write-Host "`n[2/6] Verifying Core Dependencies..." -ForegroundColor Yellow
$CorePackages = @("flask", "numpy", "pandas", "sklearn", "serial")
$MissingPackages = @()

foreach ($pkg in $CorePackages) {
    $null = (& python -c "import $pkg" 2>&1)
    if ($LASTEXITCODE -ne 0) {
        $MissingPackages += $pkg
    }
}

if ($MissingPackages.Count -gt 0) {
    Write-Host " [!] Warning: Missing package(s): $($MissingPackages -join ', ')" -ForegroundColor Yellow
    Write-Host "     Attempting to install required packages via pip..." -ForegroundColor Cyan
    & python -m pip install -r (Join-Path $ProjectRoot "requirements.txt") pyserial
    if ($LASTEXITCODE -ne 0) {
        Write-Host " [!] Dependency installation reported notices. Continuing..." -ForegroundColor Yellow
    } else {
        Write-Host " [+] All dependencies successfully installed!" -ForegroundColor Green
    }
} else {
    Write-Host " [+] Core dependencies verified (Flask, NumPy, Pandas, Scikit-Learn, PySerial)" -ForegroundColor Green
}

# 3. Detect Local Network IP for ESP32 Wi-Fi
Write-Host "`n[3/6] Detecting Network and ESP32 Configuration..." -ForegroundColor Yellow
$LocalIPs = @()
try {
    $allIPs = [System.Net.Dns]::GetHostAddresses([System.Net.Dns]::GetHostName())
    foreach ($ip in $allIPs) {
        if ($ip.AddressFamily -eq [System.Net.Sockets.AddressFamily]::InterNetwork -and -not $ip.IPAddressToString.StartsWith("127.")) {
            $LocalIPs += $ip.IPAddressToString
        }
    }
} catch {
    $LocalIPs = @("127.0.0.1")
}

$PrimaryIP = if ($LocalIPs.Count -gt 0) { $LocalIPs[0] } else { "127.0.0.1" }

Write-Host " [+] Local Machine URL : http://127.0.0.1:$Port" -ForegroundColor Green
if ($LocalIPs.Count -gt 0) {
    Write-Host " [+] LAN / Wi-Fi URL   : http://${PrimaryIP}:$Port" -ForegroundColor Green
    Write-Host "     --> For ESP32 Wi-Fi firmware, set SERVER_URL to:" -ForegroundColor DarkCyan
    Write-Host "         http://${PrimaryIP}:${Port}/api/esp32/telemetry" -ForegroundColor Cyan
}

# 4. Check for Connected USB Serial (COM) Devices
Write-Host "`n[4/6] Scanning USB Serial / COM Ports..." -ForegroundColor Yellow
$SerialPorts = @()
try {
    $SerialPorts = [System.IO.Ports.SerialPort]::GetPortNames()
} catch {}

if ($SerialPorts.Count -gt 0) {
    Write-Host " [+] Found active COM port(s): $($SerialPorts -join ', ')" -ForegroundColor Green
} else {
    Write-Host " [-] No USB COM ports currently detected (Wi-Fi and Simulated streams ready)." -ForegroundColor Gray
}

# 5. Check if Port is Already in Use
Write-Host "`n[5/6] Checking Port Availability ($Port)..." -ForegroundColor Yellow
$PortInUse = $false
try {
    $conns = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
    if ($conns) {
        $PortInUse = $true
        $owningPids = ($conns | Select-Object -ExpandProperty OwningProcess -Unique)
        Write-Host " [!] Port $Port is currently in use by PID(s): $($owningPids -join ', ')" -ForegroundColor Yellow
        
        if ($ForceRestart) {
            foreach ($pidToKill in $owningPids) {
                Write-Host "     Terminating PID $pidToKill..." -ForegroundColor Yellow
                Stop-Process -Id $pidToKill -Force -ErrorAction SilentlyContinue
            }
            Start-Sleep -Seconds 1
            $PortInUse = $false
            Write-Host " [+] Port $Port is now cleared." -ForegroundColor Green
        } else {
            Write-Host " [+] Existing server running on port $Port will be reused or connected." -ForegroundColor Green
        }
    }
} catch {
    # Fallback if Get-NetTCPConnection is not available
}

if (-not $PortInUse) {
    Write-Host " [+] Port $Port is ready for binding." -ForegroundColor Green
}

# 6. Launch Backend in Selected Mode
Write-Host "`n[6/6] Launching Digital Twin Athlete Backend (Mode: $Mode)..." -ForegroundColor Yellow

if ($Mode -eq "Verify") {
    Write-Host "`n--> Running automated live system verification script..." -ForegroundColor Cyan
    & python (Join-Path $ProjectRoot "scripts\verify_live_system.py")
    exit $LASTEXITCODE
}

# Start Flask Backend Process if not already active
$serverProc = $null
if (-not $PortInUse) {
    $appPath = Join-Path $ProjectRoot "app.py"
    $serverProc = Start-Process -FilePath "python" -ArgumentList "app.py" -WorkingDirectory $ProjectRoot -PassThru
    Write-Host " [+] Backend process started (PID: $($serverProc.Id)). Initializing models and routes..." -ForegroundColor Green
} else {
    Write-Host " [+] Backend is already running on port $Port." -ForegroundColor Green
}

# Poll Health Check Endpoint
$healthUrl = "http://127.0.0.1:$Port/api/status"
$isReady = $false
$retries = 15

for ($i = 1; $i -le $retries; $i++) {
    Start-Sleep -Milliseconds 600
    try {
        $resp = Invoke-RestMethod -Uri $healthUrl -TimeoutSec 2 -ErrorAction SilentlyContinue
        if ($resp -and $resp.status -eq "online") {
            $isReady = $true
            break
        }
    } catch {}
}

if ($isReady) {
    Write-Host ""
    Write-Host "==========================================================================" -ForegroundColor Green
    Write-Host " [+] SUCCESS: DIGITAL TWIN ATHLETE BACKEND IS LIVE AND INGESTING!" -ForegroundColor Green
    Write-Host "==========================================================================" -ForegroundColor Green
    Write-Host " Access Cockpit URL      : http://127.0.0.1:$Port" -ForegroundColor Cyan
    Write-Host " ESP32 Telemetry Ingest  : http://${PrimaryIP}:${Port}/api/esp32/telemetry" -ForegroundColor Cyan
    Write-Host " Live Telemetry Stream   : http://127.0.0.1:$Port/api/telemetry-stream" -ForegroundColor Cyan
    Write-Host " Health Status Endpoint  : http://127.0.0.1:$Port/api/status" -ForegroundColor Cyan
    Write-Host "==========================================================================" -ForegroundColor Green
    Write-Host ""
} else {
    Write-Host " [!] Notice: Server starting up in background." -ForegroundColor Yellow
}

# Launch Mode Extras
if ($Mode -eq "MockFeed") {
    Write-Host " [+] Activating background simulated athlete runner feed..." -ForegroundColor Cyan
    try {
        $body = '{"action":"start"}'
        $mockResp = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/api/esp32/mock-feed" -Method Post -Body $body -ContentType "application/json" -ErrorAction SilentlyContinue
        Write-Host " [+] Real-time simulated telemetry feed is ACTIVE." -ForegroundColor Green
    } catch {
        Write-Host " [!] Could not trigger mock feed automatically: $_" -ForegroundColor Yellow
    }
} elseif ($Mode -eq "Bridge") {
    Write-Host " [+] Launching ESP32 USB Serial Bridge companion window..." -ForegroundColor Cyan
    $bridgeScript = Join-Path $ProjectRoot "twin\bridge.py"
    Start-Process -FilePath "python" -ArgumentList "`"$bridgeScript`"" -WorkingDirectory $ProjectRoot
}

# Open Web Browser
if (-not $NoBrowser -and $isReady) {
    Write-Host " [+] Launching default browser to Digital Twin Cockpit..." -ForegroundColor Green
    Start-Process "http://127.0.0.1:$Port"
}

Write-Host "`nBackend is actively listening for telemetry packets." -ForegroundColor White
Write-Host "Press Ctrl+C or close this window to exit.`n" -ForegroundColor Gray

if ($serverProc -ne $null) {
    try {
        Wait-Process -Id $serverProc.Id
    } catch {
        # Catch Ctrl+C
    } finally {
        if ($serverProc -and -not $serverProc.HasExited) {
            Write-Host "`n[+] Terminating backend server (PID: $($serverProc.Id))..." -ForegroundColor Yellow
            Stop-Process -Id $serverProc.Id -Force -ErrorAction SilentlyContinue
        }
        Write-Host "[+] Digital Twin Athlete Backend stopped cleanly." -ForegroundColor Green
    }
}
