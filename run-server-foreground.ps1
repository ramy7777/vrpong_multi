Write-Host "Starting VR Pong Server in FOREGROUND..." -ForegroundColor Green

# Kill ALL existing Node.js processes to be safe
Write-Host "Stopping any existing Node.js processes..." -ForegroundColor Yellow
Stop-Process -Name node -Force -ErrorAction SilentlyContinue

# Wait a moment to ensure all processes are fully terminated
Start-Sleep -Seconds 2

# Ensure we're in the right directory
Set-Location $PSScriptRoot
Write-Host "Running from directory: $PSScriptRoot" -ForegroundColor Cyan

# Show current directory contents
Write-Host "Files in current directory:" -ForegroundColor Cyan
Get-ChildItem -Path . -File | ForEach-Object { Write-Host " - $($_.Name)" }

# Verify server.js exists
if (Test-Path -Path ".\server.js") {
    Write-Host "Found server.js in current directory" -ForegroundColor Green
} else {
    Write-Host "ERROR: server.js not found in current directory!" -ForegroundColor Red
    Write-Host "Current directory: $PSScriptRoot" -ForegroundColor Red
    Exit 1
}

# Start the server with the full path to Node.js
Write-Host "Starting server with Node.js from: C:\Program Files\nodejs\node.exe" -ForegroundColor Green
& "C:\Program Files\nodejs\node.exe" server.js 