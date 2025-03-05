# VR Pong Multiplayer Server Guide

## Important: Always Use the Correct Method to Start the Server

The VR Pong server must be started from the correct directory to work properly. We've created specialized scripts to ensure this always happens correctly.

## Starting the Server (Recommended Method)

1. Double-click the desktop shortcut created by running `CREATE-DESKTOP-SHORTCUT.bat`
   - If you haven't created the shortcut yet, right-click this file and select "Run as administrator"

OR

2. Run the PowerShell script directly:
   - Right-click `START-VR-PONG-SERVER.ps1` and select "Run with PowerShell"
   - Or in PowerShell: `powershell -ExecutionPolicy Bypass -File .\START-VR-PONG-SERVER.ps1`

## Accessing the Game

Once the server is running:
1. Open your browser and go to `https://localhost:8443`
2. The first time, you'll need to accept the security certificate warning:
   - Click "Advanced" and then "Proceed to localhost (unsafe)"
3. You should see the VR Pong game interface

## For Quest Users

To access from Quest:
1. Make sure your Quest is on the same WiFi network as your computer
2. Get your computer's local IP address (shown in the server output)
3. In the Quest browser, navigate to: `https://[your-computer-ip]:8443`
4. Accept the security certificate warning

## Troubleshooting

If you see any of these errors, you're using the wrong method to start the server:

```
Error: Cannot find module 'C:\Users\ramih\CascadeProjects\vr-pong-Multi\server.js'
```

Always use the recommended methods above to avoid this error.

## Common Issues

1. **Server won't start**
   - Make sure no other processes are using port 8443
   - Try restarting your computer

2. **Can't connect from Quest**
   - Verify both devices are on the same network
   - Check your computer's firewall settings

3. **Certificate warnings**
   - This is normal for development. Accept the certificate warning.

Remember: Always use `START-VR-PONG-SERVER.ps1` to run the server correctly! 