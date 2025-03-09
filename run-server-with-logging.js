const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

// Create logs directory if it doesn't exist
const logsDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir);
}

// Create log file for this run
const logFile = path.join(logsDir, `server-log-${new Date().toISOString().replace(/:/g, '-')}.txt`);
const logStream = fs.createWriteStream(logFile, { flags: 'a' });

console.log('Starting VR Pong server with enhanced error logging...');
console.log(`Log file: ${logFile}`);

// Function to log both to console and file
function log(message) {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] ${message}`;
    console.log(logMessage);
    logStream.write(logMessage + '\n');
}

// Start the server process
const serverPath = path.join(__dirname, 'vr-pong', 'server.js');
log(`Starting server from: ${serverPath}`);

const serverProcess = spawn('node', [serverPath], {
    stdio: 'pipe',
    detached: true
});

// Set up error handlers
serverProcess.on('error', (err) => {
    log(`Server process error: ${err.message}`);
});

serverProcess.stdout.on('data', (data) => {
    log(`SERVER OUT: ${data.toString().trim()}`);
});

serverProcess.stderr.on('data', (data) => {
    log(`SERVER ERROR: ${data.toString().trim()}`);
});

serverProcess.on('exit', (code, signal) => {
    log(`Server process exited with code ${code} and signal ${signal}`);
    if (code !== 0) {
        log('Server crashed or stopped unexpectedly');
    }
});

// Log process info
log(`Server process started with PID: ${serverProcess.pid}`);

// Handle this process exit
process.on('exit', () => {
    log('Wrapper script exiting, but server will continue running in background');
});

// Keep the script running for a bit to collect initial logs
setTimeout(() => {
    log('Initial logging complete, server will continue running in background');
    process.exit(0);
}, 10000); 