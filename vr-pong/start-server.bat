@echo off
echo Starting VR Pong Server...

REM Kill any existing Node.js processes from Adobe (prevents conflicts)
taskkill /F /IM node.exe /FI "MODULES eq C:\Program Files\Adobe\Adobe Creative Cloud Experience\libs\node.exe" 2>nul

REM Run the server with the full path to Node.js
"C:\Program Files\nodejs\node.exe" server.js

echo Server stopped.
pause 