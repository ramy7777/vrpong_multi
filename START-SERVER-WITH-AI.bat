@echo off
echo ========================================
echo     VR PONG SERVER LAUNCHER WITH AI
echo ========================================

set /p OPENAI_API_KEY=Enter your OpenAI API key: 

echo.
echo Starting VR Pong Server with OpenAI integration...
echo When the server is running, open https://localhost:8443 in your browser
echo API Key configured: %OPENAI_API_KEY:~0,5%*********************

cd vr-pong
set NODE_ENV=production

:: Start server with API key passed as command line argument
node server.js %OPENAI_API_KEY%

pause 