@echo off
echo Creating VR Pong Server shortcut on desktop...

set SCRIPT_PATH=%~dp0START-VR-PONG-SERVER.ps1
set SHORTCUT_PATH=%USERPROFILE%\Desktop\VR-Pong-Server.lnk

echo Set oWS = WScript.CreateObject("WScript.Shell") > CreateShortcut.vbs
echo sLinkFile = "%SHORTCUT_PATH%" >> CreateShortcut.vbs
echo Set oLink = oWS.CreateShortcut(sLinkFile) >> CreateShortcut.vbs
echo oLink.TargetPath = "powershell.exe" >> CreateShortcut.vbs
echo oLink.Arguments = "-ExecutionPolicy Bypass -File ""%SCRIPT_PATH%""" >> CreateShortcut.vbs
echo oLink.Description = "Start VR Pong Server" >> CreateShortcut.vbs
echo oLink.IconLocation = "C:\Windows\System32\SHELL32.dll,27" >> CreateShortcut.vbs
echo oLink.WorkingDirectory = "%~dp0" >> CreateShortcut.vbs
echo oLink.Save >> CreateShortcut.vbs

cscript //nologo CreateShortcut.vbs
del CreateShortcut.vbs

echo.
echo Shortcut created on your desktop!
echo You can now start the VR Pong server by double-clicking the "VR-Pong-Server" icon on your desktop.
echo.

pause 