const express = require('express');
const https = require('https');
const http = require('http');
const path = require('path');
const selfsigned = require('selfsigned');
const socketIo = require('socket.io');
const OpenAI = require('openai');
const fs = require('fs');
const { Readable } = require('stream');
const os = require('os');
const fetch = require('node-fetch'); // For making direct API calls
const { Blob } = require('buffer'); // For creating Blobs from buffers
const FormData = require('form-data'); // For creating multipart form data

// Initialize variables for OpenAI
let openaiClient = null;
let openaiApiKey = process.argv[2]; // Get API key from command line

// Try to initialize OpenAI with the API key if available
if (openaiApiKey) {
    try {
        openaiClient = new OpenAI({
            apiKey: openaiApiKey
        });
        console.log("OpenAI client initialized successfully with provided API key");
    } catch (error) {
        console.error("Error initializing OpenAI client:", error);
    }
} else {
    console.log("No OpenAI API key found. AI features will be disabled.");
}

// Game rooms storage
const gameRooms = {};

// Store chat histories for each user
const userChatHistories = {};

// Store WebRTC conversation sessions for each user
const userConversationSessions = {};

const app = express();
app.use(express.static('./'));

// Handle all routes by serving index.html
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Check if we're running on Render
const isRender = process.env.RENDER === 'true';

let server;

if (isRender) {
    // On Render.com - use HTTP
    const PORT = process.env.PORT || 3000;
    server = app.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
    });
} else {
    // Local development - use HTTPS
    const attrs = [{ name: 'commonName', value: 'localhost' }];
    const pems = selfsigned.generate(attrs, { days: 365 });

    const options = {
        key: pems.private,
        cert: pems.cert
    };

    const PORT = 8443;
    server = https.createServer(options, app).listen(PORT, () => {
        console.log(`Secure server running at https://localhost:${PORT}`);
        console.log(`Access from Quest: https://[your-local-ip]:${PORT}`);
        console.log('Note: You will need to accept the self-signed certificate warning in your browser');
        console.log('To see the certificate warning:');
        console.log('1. Open https://localhost:8443 in your browser');
        console.log('2. You should see a warning about the certificate');
        console.log('3. Click "Advanced" and then "Proceed to localhost (unsafe)"');
        console.log('4. Once accepted in your browser, it should work in the Quest browser as well');
    });
}

// Initialize Socket.io
const io = socketIo(server);

// Global error handlers to prevent crashes
process.on('uncaughtException', (error) => {
    console.error('UNCAUGHT EXCEPTION - keeping process alive:', error);
    
    // Log error details
    console.error({
        message: error.message,
        stack: error.stack,
        timestamp: new Date().toISOString()
    });
    
    // Optionally write to a log file
    try {
        const fs = require('fs');
        fs.appendFileSync('server-error.log', `\n[${new Date().toISOString()}] UNCAUGHT EXCEPTION: ${error.message}\n${error.stack}\n---\n`);
    } catch (logError) {
        console.error('Failed to write to error log:', logError);
    }
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('UNHANDLED REJECTION - keeping process alive:', reason);
    
    // Log rejection details
    console.error({
        reason: reason,
        stack: reason.stack,
        timestamp: new Date().toISOString()
    });
    
    // Optionally write to a log file
    try {
        const fs = require('fs');
        fs.appendFileSync('server-error.log', `\n[${new Date().toISOString()}] UNHANDLED REJECTION: ${reason}\n${reason.stack || 'No stack trace'}\n---\n`);
    } catch (logError) {
        console.error('Failed to write to error log:', logError);
    }
});

// Log when process is exiting and why
process.on('exit', (code) => {
    console.log(`Process is about to exit with code: ${code}`);
});

// Handle termination signals
process.on('SIGINT', () => {
    console.log('SIGINT received. Server shutting down...');
    cleanup();
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('SIGTERM received. Server shutting down...');
    cleanup();
    process.exit(0);
});

// Cleanup function to handle resources before shutdown
function cleanup() {
    console.log('Cleaning up resources...');
    
    // Close all temporary files
    try {
        // Delete any temp audio files if they exist
        const tempDir = os.tmpdir();
        const tempFiles = fs.readdirSync(tempDir).filter(file => file.startsWith('audio-stream-'));
        tempFiles.forEach(file => {
            try {
                fs.unlinkSync(path.join(tempDir, file));
                console.log(`Cleaned up temporary file: ${file}`);
            } catch (err) {
                console.error(`Failed to delete temp file ${file}:`, err);
            }
        });
    } catch (err) {
        console.error('Error during cleanup:', err);
    }
    
    // Close any open connections
    if (io) {
        console.log('Closing Socket.IO connections...');
        io.close();
    }
}

// Handle socket connections
io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);
    
    // Voice chat signaling events
    socket.on('voice-signal', (data) => {
        console.log(`Voice signal from ${socket.id} to ${data.to}`);
        if (data.to) {
            socket.to(data.to).emit('voice-signal', {
                from: socket.id,
                signal: data.signal
            });
        }
    });
    
    socket.on('voice-request', (data) => {
        console.log(`Voice request from ${socket.id} to ${data.to}`);
        if (data.to) {
            socket.to(data.to).emit('voice-request', {
                from: socket.id
            });
        }
    });
    
    // Host a new game
    socket.on('hostGame', () => {
        // Check if already hosting a game
        let alreadyHosting = false;
        for (const roomId in gameRooms) {
            if (gameRooms[roomId].host === socket.id) {
                socket.emit('gameHosted', { roomId });
                console.log(`Player ${socket.id} already hosting game: ${roomId}`);
                alreadyHosting = true;
                break;
            }
        }
        
        if (alreadyHosting) return;
        
        const roomId = generateRoomId();
        
        // Create a new game room
        gameRooms[roomId] = {
            host: socket.id,
            guest: null,
            gameData: {
                ballPosition: { x: 0, y: 0.9, z: -1.0 },
                hostPaddlePosition: { x: 0, y: 0.9, z: -0.1 },
                guestPaddlePosition: { x: 0, y: 0.9, z: -1.9 },
                paddlePositions: {
                    0: { x: 0, y: 0.9, z: -0.1 },  // Near paddle
                    1: { x: 0, y: 0.9, z: -1.9 }   // Far paddle
                },
                paddleOwnership: {
                    0: null,  // Near paddle
                    1: null   // Far paddle
                },
                hostScore: 0,
                guestScore: 0,
                isPlaying: false
            }
        };
        
        // Join the room
        socket.join(roomId);
        socket.emit('gameHosted', { roomId });
        
        console.log(`Game hosted: ${roomId} by ${socket.id}`);
    });
    
    // Join a game by quick matching
    socket.on('quickJoin', () => {
        // Check if already in a game as guest
        for (const roomId in gameRooms) {
            if (gameRooms[roomId].guest === socket.id) {
                console.log(`Player ${socket.id} already joined game: ${roomId}`);
                socket.emit('playerJoined', {
                    roomId,
                    hostId: gameRooms[roomId].host,
                    guestId: socket.id
                });
                return;
            }
            // Also check if already hosting (shouldn't try to join others then)
            if (gameRooms[roomId].host === socket.id) {
                console.log(`Player ${socket.id} trying to join but already hosting: ${roomId}`);
                socket.emit('errorMessage', { message: 'You are already hosting a game' });
                return;
            }
        }
        
        let joinedRoom = null;
        
        // Find an available room
        for (const roomId in gameRooms) {
            if (gameRooms[roomId].guest === null) {
                gameRooms[roomId].guest = socket.id;
                joinedRoom = roomId;
                
                // Join the room
                socket.join(roomId);
                
                // Notify both players
                io.to(roomId).emit('playerJoined', {
                    roomId,
                    hostId: gameRooms[roomId].host,
                    guestId: socket.id
                });
                
                console.log(`Player ${socket.id} joined game: ${roomId}`);
                break;
            }
        }
        
        // If no room found
        if (!joinedRoom) {
            socket.emit('noGamesAvailable');
            console.log(`No games available for player ${socket.id}`);
        }
    });
    
    // Update paddle position
    socket.on('updatePaddlePosition', (data) => {
        const { x, y, z, isHost, paddleIndex, ownerId } = data;
        const position = { x, y, z };
        
        // Find the room this socket is in
        const roomId = [...socket.rooms].find(room => room !== socket.id && gameRooms[room]);
        
        if (roomId && gameRooms[roomId]) {
            // Store position based on paddle index or host/guest status
            if (paddleIndex !== undefined) {
                if (!gameRooms[roomId].gameData.paddlePositions) {
                    gameRooms[roomId].gameData.paddlePositions = {
                        0: { x: 0, y: 0.9, z: -0.1 },
                        1: { x: 0, y: 0.9, z: -1.9 }
                    };
                }
                gameRooms[roomId].gameData.paddlePositions[paddleIndex] = position;
                
                // Also update ownership if provided
                if (ownerId && gameRooms[roomId].gameData.paddleOwnership) {
                    gameRooms[roomId].gameData.paddleOwnership[paddleIndex] = {
                        ownerId: ownerId,
                        isHost: isHost
                    };
                }
            }
            
            // Also maintain the legacy data structure
            if (isHost) {
                gameRooms[roomId].gameData.hostPaddlePosition = position;
            } else {
                gameRooms[roomId].gameData.guestPaddlePosition = position;
            }
            
            // Broadcast to other player in the room
            socket.to(roomId).emit('paddlePositionUpdated', {
                x, y, z,
                isHost,
                paddleIndex,
                ownerId
            });
        }
    });
    
    // Handle paddle ownership claims
    socket.on('updatePaddleOwnership', (data) => {
        const { paddleIndex, ownerId, isHost } = data;
        
        // Find the room this socket is in
        const roomId = [...socket.rooms].find(room => room !== socket.id && gameRooms[room]);
        
        if (roomId && gameRooms[roomId]) {
            // Initialize paddleOwnership if it doesn't exist
            if (!gameRooms[roomId].gameData.paddleOwnership) {
                gameRooms[roomId].gameData.paddleOwnership = {
                    0: null,
                    1: null
                };
            }
            
            // Update ownership
            gameRooms[roomId].gameData.paddleOwnership[paddleIndex] = {
                ownerId: ownerId,
                isHost: isHost
            };
            
            // Broadcast to other player in the room
            socket.to(roomId).emit('paddleOwnershipUpdated', {
                paddleIndex,
                ownerId,
                isHost
            });
        }
    });
    
    // Update ball position (only host sends this)
    socket.on('updateBallPosition', (data) => {
        const { roomId, position, velocity } = data;
        
        if (gameRooms[roomId] && gameRooms[roomId].host === socket.id) {
            gameRooms[roomId].gameData.ballPosition = position;
            
            // Broadcast to guest
            socket.to(roomId).emit('ballPositionUpdated', {
                position,
                velocity
            });
        }
    });
    
    // Update score
    socket.on('updateScore', (data) => {
        const { roomId, hostScore, guestScore } = data;
        
        if (gameRooms[roomId]) {
            gameRooms[roomId].gameData.hostScore = hostScore;
            gameRooms[roomId].gameData.guestScore = guestScore;
            
            // Broadcast to all players
            io.to(roomId).emit('scoreUpdated', {
                hostScore,
                guestScore
            });
        }
    });
    
    // Start game
    socket.on('startGame', (data) => {
        const { roomId } = data;
        
        if (gameRooms[roomId]) {
            // Only the host can start the game
            if (gameRooms[roomId].host !== socket.id) {
                console.log(`Non-host ${socket.id} attempted to start game in room ${roomId}`);
                socket.emit('errorMessage', { message: 'Only the host can start the game' });
                return;
            }
            
            // Cannot start without a guest
            if (gameRooms[roomId].guest === null) {
                console.log(`Host ${socket.id} attempted to start game in room ${roomId} without a guest`);
                socket.emit('errorMessage', { message: 'Cannot start game without an opponent' });
                return;
            }
            
            console.log(`Starting game in room ${roomId} by host ${socket.id} with guest ${gameRooms[roomId].guest}`);
            gameRooms[roomId].gameData.isPlaying = true;
            
            // Broadcast to all players in the room
            io.to(roomId).emit('gameStarted');
        } else {
            console.log(`Attempted to start game in non-existent room ${roomId}`);
            socket.emit('errorMessage', { message: 'Game room not found' });
        }
    });
    
    // Restart game (after timer has finished)
    socket.on('restartGame', (data) => {
        const { roomId } = data;
        console.log(`RESTART EVENT: Received restartGame event for room ${roomId} from socket ${socket.id}`);
        
        if (!roomId) {
            console.error(`Missing roomId in restartGame event from socket ${socket.id}`);
            socket.emit('errorMessage', { message: 'Room ID is required for restart' });
            return;
        }
        
        if (gameRooms[roomId]) {
            // Only the host can restart the game
            if (gameRooms[roomId].host !== socket.id) {
                console.log(`Non-host ${socket.id} attempted to restart game in room ${roomId}`);
                socket.emit('errorMessage', { message: 'Only the host can restart the game' });
                return;
            }
            
            console.log(`RESTART EVENT: Restarting game in room ${roomId} by host ${socket.id}`);
            
            // Reset game data
            gameRooms[roomId].gameData.hostScore = 0;
            gameRooms[roomId].gameData.guestScore = 0;
            gameRooms[roomId].gameData.isPlaying = true;
            
            // Get room sockets for direct emission
            const roomSockets = io.sockets.adapter.rooms.get(roomId);
            if (roomSockets) {
                console.log(`RESTART EVENT: Room ${roomId} has ${roomSockets.size} connected clients`);
                
                // Log all connected socket IDs in this room
                console.log(`RESTART EVENT: Connected sockets in room ${roomId}:`, 
                           Array.from(roomSockets).join(', '));
            } else {
                console.log(`RESTART EVENT: No sockets found in room ${roomId}`);
            }
            
            // Try both methods of emitting to room
            try {
                // Method 1: Broadcast restart to all players in the room
                console.log(`RESTART EVENT: Broadcasting gameRestarted event to room ${roomId} using io.to()`);
                io.to(roomId).emit('gameRestarted', { forceReset: true });
                
                // Method 2: Also try socket.to() as a backup
                console.log(`RESTART EVENT: Broadcasting gameRestarted event using socket.to()`);
                socket.to(roomId).emit('gameRestarted', { forceReset: true });
                
                // Method 3: Direct emission to host socket (always works for the host at least)
                console.log(`RESTART EVENT: Emitting gameRestarted directly to host socket ${socket.id}`);
                socket.emit('gameRestarted', { forceReset: true });
                
                // Success log
                console.log(`RESTART EVENT: Successfully broadcast gameRestarted event to room ${roomId}`);
            } catch (error) {
                console.error(`Error broadcasting restart event: ${error.message}`);
            }
        } else {
            console.log(`Attempted to restart game in non-existent room ${roomId}`);
            socket.emit('errorMessage', { message: 'Game room not found' });
        }
    });
    
    // Handle collision events
    socket.on('collisionEvent', (data) => {
        const { roomId, type, position } = data;
        
        if (gameRooms[roomId]) {
            // Broadcast collision to other player
            socket.to(roomId).emit('remoteCollision', {
                type,
                position
            });
        }
    });
    
    // Handle VR controller data
    socket.on('updateControllerData', (data) => {
        const { roomId, isHost, leftController, rightController, head } = data;
        
        if (gameRooms[roomId]) {
            // Broadcast controller data to the other player in the room
            socket.to(roomId).emit('remoteControllerData', {
                isHost,
                leftController,
                rightController,
                head  // Include head data if available
            });
        }
    });
    
    // Handle disconnect to clean up WebRTC sessions
    socket.on('disconnect', () => {
        console.log(`User disconnected: ${socket.id}`);
        
        // Find and clean up any rooms with this player
        for (const roomId in gameRooms) {
            if (gameRooms[roomId].host === socket.id || gameRooms[roomId].guest === socket.id) {
                // Notify other player if exists
                if (gameRooms[roomId].host === socket.id && gameRooms[roomId].guest) {
                    io.to(gameRooms[roomId].guest).emit('opponentDisconnected');
                } else if (gameRooms[roomId].guest === socket.id && gameRooms[roomId].host) {
                    io.to(gameRooms[roomId].host).emit('opponentDisconnected');
                }
                
                // Remove the room
                delete gameRooms[roomId];
                console.log(`Game room ${roomId} removed due to player disconnect`);
                break;
            }
        }
        
        // Clean up any WebRTC conversation sessions
        if (userConversationSessions && userConversationSessions[socket.id]) {
            const sessionId = userConversationSessions[socket.id];
            
            // Clean up the session with OpenAI
            try {
                fetch(`https://api.openai.com/v1/audio/conversations/${sessionId}`, {
                    method: 'DELETE',
                    headers: {
                        'Authorization': `Bearer ${openaiApiKey}`,
                        'OpenAI-Beta': 'audio-conversations=v1'
                    }
                }).then(response => {
                    if (response.ok) {
                        console.log(`Successfully closed WebRTC session ${sessionId} for ${socket.id}`);
                    } else {
                        console.error(`Failed to close WebRTC session ${sessionId} for ${socket.id}`);
                    }
                }).catch(error => {
                    console.error(`Error closing WebRTC session ${sessionId}:`, error);
                });
            } catch (error) {
                console.error(`Error closing WebRTC session for ${socket.id}:`, error);
            }
            
            // Remove from tracking
            delete userConversationSessions[socket.id];
        }
        
        // Clean up any chat history
        if (userChatHistories && userChatHistories[socket.id]) {
            delete userChatHistories[socket.id];
        }
    });
    
    // Handle OpenAI chat requests
    socket.on('openai-chat', async (data) => {
        console.log(`Received chat request from ${socket.id}: ${data.message}`);
        
        if (!openaiClient) {
            console.log(`No OpenAI client available for ${socket.id}, notifying client`);
            socket.emit('openai-error', { error: 'OpenAI not initialized. Please provide an API key.' });
            return;
        }
        
        try {
            console.log(`Processing OpenAI request for ${socket.id}`);
            
            // Initialize chat history if it doesn't exist
            if (!userChatHistories[socket.id]) {
                userChatHistories[socket.id] = [
                    { role: "system", content: "You are GPT-4o mini, a helpful assistant in a VR Pong game environment. While you can provide tips and guidance about the game, you're also capable of having general conversations on a wide range of topics. Be engaging, informative, and personable. ALWAYS identify yourself as GPT-4o mini when asked about your model or capabilities." }
                ];
            }
            
            // Add user message to history
            userChatHistories[socket.id].push({ role: "user", content: data.message });
            
            // Limit history to last 10 messages to prevent context overflow
            if (userChatHistories[socket.id].length > 11) { // 1 system + 10 messages
                userChatHistories[socket.id] = [
                    userChatHistories[socket.id][0], // Keep system message
                    ...userChatHistories[socket.id].slice(-10) // Keep last 10 messages
                ];
            }
            
            const completion = await openaiClient.chat.completions.create({
                messages: userChatHistories[socket.id],
                model: "gpt-4o-mini",
                temperature: 0.7
            });
            
            const response = completion.choices[0].message.content;
            const modelUsed = completion.model || "gpt-4o-mini";
            
            // Add assistant response to history
            userChatHistories[socket.id].push({ role: "assistant", content: response });
            
            console.log(`Sending response from ${modelUsed} to ${socket.id}: ${response.substring(0, 50)}...`);
            socket.emit('openai-response', { response, model: modelUsed });
        } catch (error) {
            console.error(`OpenAI API error for ${socket.id}:`, error);
            
            let errorMessage = "An error occurred while processing your request.";
            if (error.message) {
                errorMessage = error.message;
                
                // Check for common API key issues
                if (error.message.includes("API key")) {
                    errorMessage = "Invalid API key. Please provide a valid OpenAI API key.";
                } else if (error.message.includes("rate limit")) {
                    errorMessage = "Rate limit exceeded. Please try again in a moment.";
                }
            }
            
            socket.emit('openai-error', { error: errorMessage });
        }
    });
    
    // Handle OpenAI API key setup
    socket.on('set-openai-key', async (data) => {
        console.log(`Attempting to initialize OpenAI client with key from user ${socket.id}`);
        
        // Extract key from data object
        const key = data && data.key;
        
        // Clean the key (remove whitespace)
        const cleanKey = typeof key === 'string' ? key.trim() : null;
        
        if (!cleanKey || cleanKey.length < 10) {
            console.error(`Invalid OpenAI API key from user ${socket.id}: too short or empty`);
            socket.emit('openai-key-status', { success: false, error: 'Invalid API key format - key is too short or empty' });
            return;
        }
        
        try {
            // Create OpenAI client with the provided key
            openaiClient = new OpenAI({ apiKey: cleanKey });
            
            // Store the key for future use
            openaiApiKey = cleanKey;
            
            // Debug info about the OpenAI SDK version and structure
            console.log(`OpenAI client initialized for ${socket.id} with structure:`, {
                hasClient: !!openaiClient,
                hasChat: !!openaiClient.chat,
                hasBeta: !!openaiClient.beta,
                betaKeys: openaiClient.beta ? Object.keys(openaiClient.beta).join(', ') : 'no beta available',
                betaChatKeys: openaiClient.beta?.chat ? Object.keys(openaiClient.beta.chat).join(', ') : 'no beta.chat available',
                hasCreateWebSocket: typeof openaiClient.beta?.chat?.createWebSocket === 'function',
                version: openaiClient._options ? openaiClient._options.apiVersion || 'unknown' : 'unknown',
                sdkInfo: openaiClient.clientVersion || 'unknown sdk version'
            });
            
            // Verify the key
            const listResponse = await openaiClient.models.list();
            
            const models = listResponse.data.map(model => model.id).join(', ');
            console.log(`API key for ${socket.id} verified successfully`);
            
            socket.emit('openai-key-status', { 
                success: true, 
                models: models.substring(0, 100) + (models.length > 100 ? '...' : '')
            });
        } catch (error) {
            console.error(`Error initializing OpenAI with key from user ${socket.id}:`, error);
            socket.emit('openai-key-status', { 
                success: false, 
                error: error.message || 'Failed to initialize OpenAI client' 
            });
        }
    });

    // Handle separate traditional audio processing path
    socket.on('openai-audio-traditional', async (data) => {
        console.log(`Received traditional audio request from ${socket.id}`);
        
        if (!openaiClient) {
            console.log(`No OpenAI client available for ${socket.id}, notifying client`);
            socket.emit('openai-error', { error: 'OpenAI not initialized. Please provide an API key.' });
            return;
        }
        
        try {
            // Convert the audio data to buffer
            let audioBuffer;
            try {
                audioBuffer = base64ToBuffer(data);
                if (audioBuffer.length === 0) {
                    throw new Error("Empty or invalid audio data received");
                }
                console.log(`Received ${audioBuffer.length} bytes of audio data from ${socket.id} for traditional processing`);
            } catch (bufferError) {
                console.error(`Error processing audio data for ${socket.id}:`, bufferError);
                socket.emit('openai-error', { error: 'Invalid audio format received. Please try again.' });
                return;
            }
            
            // Create a temporary file with the audio data
            const tempDir = os.tmpdir();
            const tempFilePath = path.join(tempDir, `audio-stream-${socket.id}-${Date.now()}.webm`);
            
            // Write audio to file
            fs.writeFileSync(tempFilePath, audioBuffer);
            console.log(`Created temporary audio file at ${tempFilePath} for traditional audio processing (${audioBuffer.length} bytes)`);
            
            // Initialize chat history if it doesn't exist
            if (!userChatHistories[socket.id]) {
                userChatHistories[socket.id] = [
                    { role: "system", content: "You are a friendly and helpful AI assistant in a VR Pong game environment. Keep responses concise but helpful. ALWAYS identify yourself as GPT-4o when asked about your model or capabilities." }
                ];
            }
            
            // First transcribe the audio using Whisper
            const transcriptionResponse = await openaiClient.audio.transcriptions.create({
                file: fs.createReadStream(tempFilePath),
                model: "whisper-1"
            });
            
            const transcript = transcriptionResponse.text;
            console.log(`Transcription for ${socket.id}: ${transcript}`);
            
            // Send transcription immediately to client for feedback
            socket.emit('openai-transcription', transcript);
            
            // Now use GPT-4o for the response
            const messages = [
                { role: "system", content: "You are GPT-4o, a helpful assistant in a VR Pong game. Keep responses concise but informative. ALWAYS identify yourself as GPT-4o when asked about your model or capabilities." },
                ...userChatHistories[socket.id].slice(-4), // Include a few recent messages for context
                { role: "user", content: transcript }
            ];
            
            // Make a completion request
            console.log(`Making GPT-4o request for ${socket.id} with transcript: ${transcript}`);
            const completion = await openaiClient.chat.completions.create({
                model: "gpt-4o",
                temperature: 0.7,
                messages: messages
            });
            
            const responseText = completion.choices[0].message.content;
            const modelUsed = completion.model || "gpt-4o";
            
            console.log(`Generated text response with ${modelUsed} for ${socket.id}: ${responseText.substring(0, 50)}...`);
            
            // Store the conversation
            userChatHistories[socket.id].push({ role: "user", content: transcript });
            userChatHistories[socket.id].push({ role: "assistant", content: responseText });
            
            // Send the response to the client
            socket.emit('openai-response', {
                text: responseText,
                model: modelUsed
            });
            
            // Generate speech from the response
            try {
                // Convert to speech with enhanced TTS model
                const mp3 = await openaiClient.audio.speech.create({
                    model: "tts-1-hd",
                    voice: "nova",
                    input: responseText,
                    speed: 1.1
                });
                
                // Convert to base64
                const buffer = Buffer.from(await mp3.arrayBuffer());
                const base64Audio = buffer.toString('base64');
                
                // Send audio to the client
                socket.emit('openai-audio-stream-response', {
                    audioData: base64Audio,
                    text: responseText,
                    model: modelUsed
                });
                console.log(`Generated speech for ${socket.id} with ${modelUsed}`);
            } catch (speechError) {
                console.error(`Error generating speech for ${socket.id}:`, speechError);
                socket.emit('openai-error', { error: 'Failed to generate speech, but text response is available' });
            }
            
            // Clean up the temporary file
            try {
                fs.unlinkSync(tempFilePath);
                console.log(`Deleted temporary file ${tempFilePath}`);
            } catch (cleanupError) {
                console.error(`Error deleting temporary file ${tempFilePath}:`, cleanupError);
            }
        } catch (apiError) {
            console.error(`Error in traditional audio processing for ${socket.id}:`, apiError);
            socket.emit('openai-error', { error: apiError.message || 'An error occurred while processing audio' });
        }
    });

    // Handle WebRTC Audio Conversations API (no fallback)
    socket.on('openai-audio-stream', async (data) => {
        console.log(`Received audio stream request from ${socket.id} (${typeof data === 'string' ? data.substring(0, 20) + '...' : 'non-string data'})`);
        
        if (!openaiClient) {
            console.log(`No OpenAI client available for ${socket.id}, notifying client`);
            socket.emit('openai-webrtc-error', { error: 'OpenAI not initialized. Please provide an API key.' });
            return;
        }
        
        // Debug OpenAI client details - wrap in try/catch to prevent crashes
        try {
            console.log(`OpenAI client for WebRTC debug info:`, {
                apiKey: openaiApiKey ? `${openaiApiKey.substring(0, 5)}...${openaiApiKey.substring(openaiApiKey.length - 4)}` : 'undefined',
                hasClient: !!openaiClient,
                clientType: typeof openaiClient,
                hasBeta: !!openaiClient.beta,
                betaProperties: openaiClient.beta ? Object.keys(openaiClient.beta) : 'none',
                audioProperties: openaiClient.audio ? Object.keys(openaiClient.audio) : 'none',
                sdkVersion: openaiClient.clientVersion || 'unknown',
                packageVersion: require('openai/package.json').version
            });
        } catch (debugError) {
            console.error('Error while logging debug info:', debugError);
        }
        
        // Use a unique identifier for this request to track it through the logs
        const requestId = Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
        console.log(`WebRTC request ${requestId} starting`);
        
        // Process the audio data regardless of WebRTC availability
        try {
            // Convert the audio data to buffer if not an initialization request
            let audioBuffer;
            let tempFilePath = null;
            
            if (data && data.length > 0) {
                try {
                    audioBuffer = base64ToBuffer(data);
                    if (!audioBuffer || audioBuffer.length === 0) {
                        throw new Error("Empty or invalid audio data received");
                    }
                    
                    console.log(`Request ${requestId}: Received ${audioBuffer.length} bytes of audio data from ${socket.id}`);
                    
                    // Create a temporary file with the audio data if needed later
                    const tempDir = os.tmpdir();
                    tempFilePath = path.join(tempDir, `audio-stream-${socket.id}-${requestId}.webm`);
                    
                    // Write audio to file
                    fs.writeFileSync(tempFilePath, audioBuffer);
                    console.log(`Request ${requestId}: Created temporary audio file at ${tempFilePath} (${audioBuffer.length} bytes)`);
                } catch (bufferError) {
                    console.error(`Request ${requestId}: Error processing audio data:`, bufferError);
                    socket.emit('openai-webrtc-error', { error: 'Invalid audio format received: ' + bufferError.message });
                    cleanupTempFile(tempFilePath);
                    return;
                }
            }
            
            // Check if the package version is new enough to support audio conversations
            let packageVersion;
            try {
                packageVersion = require('openai/package.json').version;
                const versionParts = packageVersion.split('.');
                const majorVersion = parseInt(versionParts[0], 10);
                const minorVersion = parseInt(versionParts[1], 10);
                
                // Audio conversations requires v4.28.0+
                const hasCompatibleVersion = majorVersion > 4 || (majorVersion === 4 && minorVersion >= 28);
                console.log(`Request ${requestId}: OpenAI SDK version check: ${packageVersion}, compatible: ${hasCompatibleVersion}`);
                
                if (!hasCompatibleVersion) {
                    console.error(`Request ${requestId}: Audio Conversations API requires OpenAI SDK v4.28.0+, but found ${packageVersion}`);
                    socket.emit('openai-webrtc-error', { 
                        error: `Audio Conversations API requires OpenAI SDK v4.28.0+, but found ${packageVersion}`
                    });
                    cleanupTempFile(tempFilePath);
                    return;
                }
            } catch (versionError) {
                console.error(`Request ${requestId}: Error checking SDK version:`, versionError);
            }
            
            // APPROACH: Direct REST API to Realtime API
            try {
                // Check if fetch is available
                if (typeof fetch !== 'function') {
                    throw new Error("Fetch API not available in this Node.js environment");
                }
                
                console.log(`Request ${requestId}: Creating WebRTC audio conversation via REST API`);
                
                // Use the newer Realtime API endpoint structure as documented
                const realtimeUrl = 'https://api.openai.com/v1/realtime/sessions';
                
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 8000);
                
                // Make the request with the correct headers for Realtime API
                const sessionResponse = await fetch(realtimeUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${openaiApiKey}`,
                        'OpenAI-Beta': 'realtime=v1' // Use realtime beta header
                    },
                    body: JSON.stringify({
                        model: "gpt-4o-realtime-preview-2024-12-17", // Use realtime model string
                        voice: "shimmer", // Specify a voice
                        instructions: "You are GPT-4o, a helpful assistant speaking in a VR Pong game environment. Keep responses concise but informative. Always identify yourself as GPT-4o when asked about your model or capabilities.",
                        input_audio_transcription: { model: "whisper-1" }, // Use Whisper for transcription
                        turn_detection: { type: "server_vad" } // Server-side voice activity detection
                    }),
                    signal: controller.signal
                });
                
                clearTimeout(timeoutId);
                
                // Log detailed response information for debugging
                console.log(`Request ${requestId}: API Response status: ${sessionResponse.status}`);
                console.log(`Request ${requestId}: API Response headers:`, [...sessionResponse.headers.entries()]);
                
                if (!sessionResponse.ok) {
                    let errorText = '';
                    let errorJson = null;
                    
                    try {
                        // Try to parse as JSON first
                        errorJson = await sessionResponse.json();
                        errorText = JSON.stringify(errorJson);
                        console.log(`Request ${requestId}: Error JSON:`, errorJson);
                    } catch (e) {
                        // Fall back to text if not JSON
                        try {
                            errorText = await sessionResponse.text();
                        } catch (e2) {
                            errorText = `[Error reading response: ${e2.message}]`;
                        }
                    }
                    
                    console.error(`Request ${requestId}: API failed with status ${sessionResponse.status}: ${errorText}`);
                    
                    if (sessionResponse.status === 404) {
                        throw new Error(`Realtime API endpoint not found (404). The feature may be unavailable or the URL has changed.`);
                    } else if (sessionResponse.status === 403 || sessionResponse.status === 401) {
                        throw new Error(`Authorization error (${sessionResponse.status}). Your API key may not have access to the Realtime API.`);
                    } else {
                        throw new Error(`REST API approach failed: ${sessionResponse.status} - ${errorText}`);
                    }
                }
                
                const sessionData = await sessionResponse.json();
                console.log(`Request ${requestId}: Session data:`, sessionData);
                
                // Check that the session data has the expected structure
                if (!sessionData.id || !sessionData.client_secret || !sessionData.client_secret.value) {
                    throw new Error(`Unexpected session data structure from API. Missing id or client_secret.`);
                }
                
                const sessionId = sessionData.id;
                const clientSecret = sessionData.client_secret.value;
                
                console.log(`Request ${requestId}: Successfully created Realtime session with ID ${sessionId}`);
                
                // Send token to client for WebRTC
                socket.emit('openai-webrtc-token', {
                    sessionId: sessionId,
                    token: clientSecret,
                    model: "gpt-4o-realtime-preview-2024-12-17",
                    // Include default ICE servers since Realtime API doesn't provide them
                    iceServers: [
                        { urls: 'stun:stun.l.google.com:19302' },
                        { urls: 'stun:stun1.l.google.com:19302' },
                        { urls: 'stun:stun2.l.google.com:19302' },
                        { urls: 'stun:stun3.l.google.com:19302' },
                        { urls: 'stun:stun4.l.google.com:19302' }
                    ]
                });
                
                console.log(`Request ${requestId}: Sent Realtime token to client ${socket.id}`);
                
                // Store session ID for cleanup
                if (!userConversationSessions) {
                    userConversationSessions = {};
                }
                userConversationSessions[socket.id] = sessionId;
                
                cleanupTempFile(tempFilePath);
                return; // Exit the function if the approach was successful
                
            } catch (apiError) {
                console.error(`Request ${requestId}: REST API approach failed:`, apiError);
                
                // Let the client know the approach failed with detailed error information
                socket.emit('openai-webrtc-error', { 
                    error: `WebRTC approach failed: ${apiError.message}`
                });
            }
            
            // If we reach here, all approaches failed
            cleanupTempFile(tempFilePath);
            
        } catch (generalError) {
            console.error(`Request ${requestId}: General error in audio processing:`, generalError);
            socket.emit('openai-webrtc-error', { error: 'Unexpected error: ' + generalError.message });
        }
    });
    
    // Helper function to clean up temp files
    function cleanupTempFile(filePath) {
        if (filePath) {
            try {
                if (fs.existsSync(filePath)) {
                    fs.unlinkSync(filePath);
                    console.log(`Deleted temporary file ${filePath}`);
                }
            } catch (cleanupError) {
                console.error(`Error deleting temporary file ${filePath}:`, cleanupError);
            }
        }
    }
    
    // Signaling for WebRTC
    socket.on('webrtc-offer', async (data) => {
        console.log(`Received WebRTC offer from client ${socket.id}`);
        
        if (!openaiApiKey) {
            console.log(`No OpenAI API key available for ${socket.id}`);
            socket.emit('openai-error', { error: 'OpenAI API key not set' });
            return;
        }
        
        try {
            // Forward the offer to OpenAI's WebRTC service
            const conversationsUrl = `https://api.openai.com/v1/audio/conversations/${data.sessionId}/signal`;
            
            const signalResponse = await fetch(conversationsUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${openaiApiKey}`,
                    'OpenAI-Beta': 'audio-conversations=v1'
                },
                body: JSON.stringify({
                    token: data.token,
                    signal: {
                        type: data.offer.type,
                        sdp: data.offer.sdp
                    }
                })
            });
            
            if (!signalResponse.ok) {
                const errorText = await signalResponse.text();
                throw new Error(`Failed to send WebRTC offer: ${signalResponse.status} - ${errorText}`);
            }
            
            // Wait for the answer from OpenAI
            const answerResponse = await fetch(`${conversationsUrl}/poll`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${openaiApiKey}`,
                    'OpenAI-Beta': 'audio-conversations=v1'
                },
                body: JSON.stringify({
                    token: data.token
                })
            });
            
            if (!answerResponse.ok) {
                const errorText = await answerResponse.text();
                throw new Error(`Failed to poll for WebRTC answer: ${answerResponse.status} - ${errorText}`);
            }
            
            const answerData = await answerResponse.json();
            
            // Send answer back to client
            socket.emit('webrtc-answer', {
                answer: {
                    type: answerData.signal.type,
                    sdp: answerData.signal.sdp
                }
            });
            
            console.log(`Sent WebRTC answer to client ${socket.id}`);
            
        } catch (error) {
            console.error(`Error handling WebRTC offer for ${socket.id}:`, error);
            socket.emit('openai-error', { 
                error: `WebRTC signaling error: ${error.message}`,
                useFallback: true
            });
        }
    });
    
    // Handle ICE candidates from client
    socket.on('webrtc-ice-candidate', async (data) => {
        console.log(`Received ICE candidate from client ${socket.id}`);
        
        if (!openaiApiKey) {
            console.log(`No OpenAI API key available for ${socket.id}`);
            return;
        }
        
        try {
            // Forward ICE candidate to OpenAI
            const conversationsUrl = `https://api.openai.com/v1/audio/conversations/${data.sessionId}/signal`;
            
            const response = await fetch(conversationsUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${openaiApiKey}`,
                    'OpenAI-Beta': 'audio-conversations=v1'
                },
                body: JSON.stringify({
                    token: data.token,
                    signal: {
                        type: 'ice-candidate',
                        ice: data.candidate
                    }
                })
            });
            
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Failed to send ICE candidate: ${response.status} - ${errorText}`);
            }
            
            console.log(`Forwarded ICE candidate for ${socket.id}`);
            
        } catch (error) {
            console.error(`Error handling ICE candidate for ${socket.id}:`, error);
        }
    });
    
    // Handle session close request
    socket.on('close-webrtc-session', async (data) => {
        console.log(`Received request to close WebRTC session ${data.sessionId} from ${socket.id}`);
        
        if (!openaiApiKey) {
            return;
        }
        
        try {
            // Close the session with OpenAI
            const response = await fetch(`https://api.openai.com/v1/audio/conversations/${data.sessionId}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${openaiApiKey}`,
                    'OpenAI-Beta': 'audio-conversations=v1'
                }
            });
            
            if (response.ok) {
                console.log(`Successfully closed WebRTC session ${data.sessionId} for ${socket.id}`);
            } else {
                console.error(`Failed to close WebRTC session ${data.sessionId} for ${socket.id}`);
            }
        } catch (error) {
            console.error(`Error closing WebRTC session ${data.sessionId}:`, error);
        }
        
        // Clean up session tracking
        if (userConversationSessions && userConversationSessions[socket.id]) {
            delete userConversationSessions[socket.id];
        }
    });
    
    // Handle direct request to create a realtime session without audio data
    socket.on('create-realtime-session', async () => {
        console.log(`Received request to create a Realtime session from ${socket.id}`);
        
        if (!openaiClient) {
            console.log(`No OpenAI client available for ${socket.id}, notifying client`);
            socket.emit('openai-webrtc-error', { error: 'OpenAI not initialized. Please provide an API key.' });
            return;
        }
        
        // Use a unique identifier for this request to track it through the logs
        const requestId = Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
        console.log(`Realtime session request ${requestId} starting`);
        
        try {
            // Check if fetch is available
            if (typeof fetch !== 'function') {
                throw new Error("Fetch API not available in this Node.js environment");
            }
            
            console.log(`Request ${requestId}: Creating Realtime session via REST API`);
            
            // Use the newer Realtime API endpoint structure as documented
            const realtimeUrl = 'https://api.openai.com/v1/realtime/sessions';
            
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 8000);
            
            // Make the request with the correct headers for Realtime API
            const sessionResponse = await fetch(realtimeUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${openaiApiKey}`,
                    'OpenAI-Beta': 'realtime=v1' // Use realtime beta header
                },
                body: JSON.stringify({
                    model: "gpt-4o-realtime-preview-2024-12-17", // Use realtime model string
                    voice: "shimmer", // Specify a voice
                    instructions: "You are GPT-4o, a helpful assistant speaking in a VR Pong game environment. Keep responses concise but informative. Always identify yourself as GPT-4o when asked about your model or capabilities.",
                    input_audio_transcription: { model: "whisper-1" }, // Use Whisper for transcription
                    turn_detection: { type: "server_vad" } // Server-side voice activity detection
                }),
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);
            
            // Log detailed response information for debugging
            console.log(`Request ${requestId}: API Response status: ${sessionResponse.status}`);
            
            if (!sessionResponse.ok) {
                let errorText = '';
                let errorJson = null;
                
                try {
                    // Try to parse as JSON first
                    errorJson = await sessionResponse.json();
                    errorText = JSON.stringify(errorJson);
                    console.log(`Request ${requestId}: Error JSON:`, errorJson);
                } catch (e) {
                    // Fall back to text if not JSON
                    try {
                        errorText = await sessionResponse.text();
                    } catch (e2) {
                        errorText = `[Error reading response: ${e2.message}]`;
                    }
                }
                
                console.error(`Request ${requestId}: API failed with status ${sessionResponse.status}: ${errorText}`);
                
                if (sessionResponse.status === 404) {
                    throw new Error(`Realtime API endpoint not found (404). The feature may be unavailable or the URL has changed.`);
                } else if (sessionResponse.status === 403 || sessionResponse.status === 401) {
                    throw new Error(`Authorization error (${sessionResponse.status}). Your API key may not have access to the Realtime API.`);
                } else {
                    throw new Error(`REST API approach failed: ${sessionResponse.status} - ${errorText}`);
                }
            }
            
            const sessionData = await sessionResponse.json();
            console.log(`Request ${requestId}: Session data received (details omitted for security)`);
            
            // Check that the session data has the expected structure
            if (!sessionData.id || !sessionData.client_secret || !sessionData.client_secret.value) {
                throw new Error(`Unexpected session data structure from API. Missing id or client_secret.`);
            }
            
            const sessionId = sessionData.id;
            const clientSecret = sessionData.client_secret.value;
            
            console.log(`Request ${requestId}: Successfully created Realtime session with ID ${sessionId}`);
            
            // Send token to client for WebRTC
            socket.emit('openai-webrtc-token', {
                sessionId: sessionId,
                token: clientSecret,
                model: "gpt-4o-realtime-preview-2024-12-17",
                // Include default ICE servers since Realtime API doesn't provide them
                iceServers: [
                    { urls: 'stun:stun.l.google.com:19302' },
                    { urls: 'stun:stun1.l.google.com:19302' },
                    { urls: 'stun:stun2.l.google.com:19302' },
                    { urls: 'stun:stun3.l.google.com:19302' },
                    { urls: 'stun:stun4.l.google.com:19302' }
                ]
            });
            
            console.log(`Request ${requestId}: Sent Realtime token to client ${socket.id}`);
            
            // Store session ID for cleanup
            if (!userConversationSessions) {
                userConversationSessions = {};
            }
            userConversationSessions[socket.id] = sessionId;
            
        } catch (error) {
            console.error(`Request ${requestId}: Error creating Realtime session:`, error);
            socket.emit('openai-webrtc-error', { 
                error: `Failed to create Realtime session: ${error.message}`,
                useFallback: false
            });
        }
    });
});

// Generate a random room ID
function generateRoomId() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// Helper function to convert base64 audio to a buffer
function base64ToBuffer(base64) {
    if (!base64) {
        console.error("Empty base64 data received");
        return Buffer.from([]);
    }
    
    try {
        // Handle case where base64 might be a string or an object with audio property
        let base64String = base64;
        
        // If it's an object with audio property, extract that
        if (typeof base64 === 'object' && base64.audio) {
            base64String = base64.audio;
        }
        
        // Check if base64String is valid
        if (!base64String) {
            console.error("Invalid base64 data structure");
            return Buffer.from([]);
        }

        // If the base64 data includes a data URL prefix (common with FileReader), remove it
        if (typeof base64String === 'string' && base64String.includes('base64,')) {
            base64String = base64String.split('base64,')[1];
        }
        
        return Buffer.from(base64String, 'base64');
    } catch (error) {
        console.error("Error converting base64 to buffer:", error);
        return Buffer.from([]);
    }
}

// Handle creating a new Realtime API session
app.post('/api/create-realtime-session', async (req, res) => {
    console.log('Creating a new Realtime API session');
    
    if (!openaiApiKey) {
        console.error('No OpenAI API key available for Realtime session');
        return res.status(401).json({ 
            error: 'OpenAI API key not configured. Please set your API key first.' 
        });
    }
    
    try {
        // Log OpenAI SDK version
        const openaiVersion = require('openai/package.json').version;
        console.log(`Using OpenAI SDK version: ${openaiVersion}`);
        
        // Create a session with the OpenAI Realtime API
        const sessionResponse = await fetch("https://api.openai.com/v1/realtime/sessions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${openaiApiKey}`,
                "Content-Type": "application/json",
                "OpenAI-Beta": "realtime=v1" // Ensure beta header is set
            },
            body: JSON.stringify({
                model: "gpt-4o-realtime-preview-2024-12-17", // Use the realtime model as specified in docs
                voice: "shimmer", // Use a voice preset
                instructions: "You are GPT-4o, a helpful assistant speaking in a VR Pong game environment. " +
                              "Keep responses concise but informative. Always identify yourself as GPT-4o " +
                              "when asked about your model or capabilities.",
                input_audio_transcription: { model: "whisper-1" }, // Use Whisper for transcription
                turn_detection: { type: "server_vad" } // Server-side voice activity detection
            })
        });
        
        // Log the response status and headers for debugging
        console.log(`Realtime session creation response status: ${sessionResponse.status}`);
        console.log('Response headers:', [...sessionResponse.headers.entries()]);
        
        if (!sessionResponse.ok) {
            let errorText;
            try {
                // Try to parse as JSON first
                const errorJson = await sessionResponse.json();
                errorText = JSON.stringify(errorJson);
            } catch {
                // Fallback to text if not JSON
                errorText = await sessionResponse.text();
            }
            
            console.error(`Failed to create Realtime session: ${sessionResponse.status} - ${errorText}`);
            
            // Provide specific guidance based on the error
            if (sessionResponse.status === 404) {
                return res.status(404).json({ 
                    error: `Realtime API not available for your API key (404 Not Found). This feature is in limited beta.`,
                    details: `To use this feature, you need:
                    1. A paid OpenAI API account with GPT-4 access
                    2. Access to the Realtime API beta program
                    3. The latest OpenAI SDK version
                    
                    Please check your OpenAI dashboard to ensure you have access to the gpt-4o-realtime model.
                    If not visible there, you may need to request access through OpenAI's website.`
                });
            } else {
                return res.status(sessionResponse.status).json({ 
                    error: `OpenAI Realtime API error: ${errorText}`
                });
            }
        }
        
        // Parse the successful response
        const session = await sessionResponse.json();
        console.log('Session response data structure:', Object.keys(session));
        
        // Check the structure of the response based on docs
        if (!session.client_secret || !session.client_secret.value || !session.id) {
            console.error('Unexpected Realtime API response structure:', session);
            return res.status(500).json({
                error: 'Unexpected API response structure'
            });
        }
        
        // Extract the ephemeral key (client secret) - this is short-lived (~60 seconds)
        const ephemeralKey = session.client_secret.value;
        const sessionId = session.id;
        
        console.log(`Created Realtime session ${sessionId} with ephemeral key ${ephemeralKey.substring(0, 10)}...`);
        
        // Return only the necessary information to the client
        res.json({
            ephemeralKey: ephemeralKey,
            sessionId: sessionId,
            model: "gpt-4o-realtime-preview-2024-12-17",
            voice: "shimmer"
        });
        
    } catch (error) {
        console.error('Error creating Realtime session:', error);
        res.status(500).json({ 
            error: 'Failed to create Realtime session: ' + error.message,
            solution: 'This may be due to SDK version mismatch or API access restrictions. Please ensure you have the latest OpenAI SDK and proper API access.'
        });
    }
});
