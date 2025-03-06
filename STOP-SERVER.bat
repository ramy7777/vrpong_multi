@echo off
echo ========================================
echo     VR PONG SERVER SHUTDOWN
echo ========================================
echo.
echo Stopping VR Pong Server...

:: Kill any existing Node.js processes
taskkill /F /IM node.exe /FI "MODULES ne C:\Program Files\Adobe\Adobe Creative Cloud Experience\libs\node.exe" 2>nul

if %ERRORLEVEL% EQU 0 (
    echo Server successfully stopped!
) else (
    echo No running VR Pong server found.
)

echo.
pause 