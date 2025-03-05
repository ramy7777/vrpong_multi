# ====================================================
#  VR PONG SERVER LAUNCHER
# ====================================================
# This is the CORRECT way to start the VR Pong server.
# Run this file from the main project directory.
# 
# USAGE:
#   Right-click this file -> "Run with PowerShell"
#   OR
#   In PowerShell: powershell -ExecutionPolicy Bypass -File .\START-VR-PONG-SERVER.ps1
# ====================================================

Write-Host "Starting VR Pong Server..." -ForegroundColor Green
Write-Host "This is the CORRECT launcher for the server!" -ForegroundColor Yellow

# Kill ALL existing Node.js processes to be safe
Write-Host "Stopping any existing Node.js processes..." -ForegroundColor Yellow
Stop-Process -Name node -Force -ErrorAction SilentlyContinue

# Wait a moment to ensure all processes are fully terminated
Start-Sleep -Seconds 2

# Change to the vr-pong directory
Set-Location -Path "$PSScriptRoot\vr-pong"
Write-Host "Changed directory to: $((Get-Location).Path)" -ForegroundColor Cyan

# List files to verify server.js exists
Write-Host "Files in current directory:" -ForegroundColor Cyan
Get-ChildItem -Path . -File | Where-Object { $_.Name -eq "server.js" } | ForEach-Object { Write-Host " - $($_.Name)" -ForegroundColor Green }

# Verify server.js exists
if (Test-Path -Path ".\server.js") {
    Write-Host "Found server.js in directory" -ForegroundColor Green
} else {
    Write-Host "ERROR: server.js not found in vr-pong directory!" -ForegroundColor Red
    Write-Host "Please make sure this script is in the correct location (C:\Users\ramih\CascadeProjects\vr-pong-Multi)" -ForegroundColor Red
    Exit 1
}

# Start the server with the full path to Node.js
Write-Host "Starting server with Node.js from: C:\Program Files\nodejs\node.exe" -ForegroundColor Green
Write-Host "Once the server is running, open https://localhost:8443 in your browser" -ForegroundColor Magenta
& "C:\Program Files\nodejs\node.exe" ".\server.js" 