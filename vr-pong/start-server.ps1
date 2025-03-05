Write-Host "Starting VR Pong Server..." -ForegroundColor Green

# Kill Adobe Creative Cloud Node.js processes
Get-Process -Name node -ErrorAction SilentlyContinue | Where-Object {$_.Path -like "*Adobe*"} | Stop-Process -Force -ErrorAction SilentlyContinue

# Ensure we're in the right directory
Set-Location $PSScriptRoot

# Start the server with the full path to Node.js
& "C:\Program Files\nodejs\node.exe" server.js 