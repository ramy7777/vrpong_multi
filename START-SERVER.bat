@echo off
echo ========================================
echo     VR PONG SERVER LAUNCHER
echo ========================================
echo.
echo Starting VR Pong Server...
echo This is the CORRECT way to start the server!
echo.

:: Kill any existing Node.js processes
taskkill /F /IM node.exe /FI "MODULES ne C:\Program Files\Adobe\Adobe Creative Cloud Experience\libs\node.exe" 2>nul

:: Wait a moment
timeout /t 2 /nobreak > nul

:: Change to the vr-pong directory
cd /d "%~dp0vr-pong"
echo Changed directory to: %CD%
echo.

:: Verify server.js exists
if exist "server.js" (
    echo Found server.js in directory
) else (
    echo ERROR: server.js not found in vr-pong directory!
    echo Please make sure this batch file is in the correct location
    pause
    exit /b 1
)

echo.
echo Starting server with Node.js...
echo Once the server is running, open https://localhost:8443 in your browser
echo.

:: Start the server
"C:\Program Files\nodejs\node.exe" server.js

pause 