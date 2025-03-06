@echo off
echo ========================================
echo     VR PONG SERVER LAUNCHER (BACKGROUND)
echo ========================================
echo.
echo Starting VR Pong Server in background mode...
echo This version will keep the server running even when you close this window.
echo.

:: Kill any existing Node.js processes
echo Stopping any existing Node.js processes...
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
echo Starting server with Node.js in background mode...
echo Once the server is running, open https://localhost:8443 in your browser
echo.

:: Start the server in background mode
start "VR Pong Server" /b "C:\Program Files\nodejs\node.exe" server.js

echo.
echo Server is now running in the background!
echo You can close this window and the server will continue running.
echo.
echo To stop the server later, run STOP-SERVER.bat or use Task Manager to end node.exe processes.
echo.
pause 