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

// Add this at the top of the file where other variables are declared
const userChatHistories = {}; // Store chat histories for each user

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
    
    // Handle disconnection
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
        
        // Clean up chat history
        if (userChatHistories[socket.id]) {
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
                    { role: "system", content: "You are a friendly and helpful AI assistant in a VR Pong game environment. While you can provide tips and guidance about the game, you're also capable of having general conversations on a wide range of topics. Be engaging, informative, and personable." }
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
            });
            
            const response = completion.choices[0].message.content;
            
            // Add assistant response to history
            userChatHistories[socket.id].push({ role: "assistant", content: response });
            
            console.log(`Sending response to ${socket.id}: ${response.substring(0, 50)}...`);
            socket.emit('openai-response', { response });
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
    
    // Handle setting the OpenAI API key from the browser
    socket.on('set-openai-key', (data) => {
        const { key } = data;
        if (!key) {
            socket.emit('openai-key-status', { 
                success: false, 
                error: 'No API key provided' 
            });
            return;
        }
        
        // Basic validation to ensure it's an OpenAI API key
        if (!key.trim().startsWith('sk-')) {
            socket.emit('openai-key-status', { 
                success: false, 
                error: 'Invalid API key format. OpenAI API keys should start with "sk-"' 
            });
            return;
        }
        
        try {
            // Initialize OpenAI with the provided key
            console.log(`Attempting to initialize OpenAI client with key from user ${socket.id}`);
            
            // Clean the key of any non-standard characters
            const cleanKey = key.trim();
            
            openaiClient = new OpenAI({
                apiKey: cleanKey
            });
            
            // Store the key for future use
            openaiApiKey = cleanKey;
            
            console.log(`Valid OpenAI API key set for user ${socket.id}`);
            socket.emit('openai-key-status', { success: true });
            
            // Test the API key with a simple completion to verify it works
            openaiClient.chat.completions.create({
                messages: [{ role: "system", content: "You are a friendly and helpful AI assistant capable of general conversation as well as providing guidance for a VR Pong game." }],
                model: "gpt-4o-mini",
                max_tokens: 5
            }).then(() => {
                console.log(`API key for ${socket.id} verified successfully`);
            }).catch(error => {
                console.error(`API key verification failed for ${socket.id}:`, error);
                // We don't need to notify the client here as the key was already accepted
            });
        } catch (error) {
            console.error(`Error initializing OpenAI with key from user ${socket.id}:`, error);
            socket.emit('openai-key-status', { 
                success: false, 
                error: error.message || 'Failed to initialize OpenAI client' 
            });
        }
    });

    // Handle OpenAI realtime audio chat
    socket.on('openai-audio-chat', async (data) => {
        console.log(`Received audio chat request from ${socket.id}`);
        
        if (!openaiClient) {
            console.log(`No OpenAI client available for ${socket.id}, notifying client`);
            socket.emit('openai-error', { error: 'OpenAI not initialized. Please provide an API key.' });
            return;
        }
        
        try {
            // Create a temporary file with the audio data
            const tempDir = os.tmpdir();
            const tempFilePath = path.join(tempDir, `audio-${socket.id}-${Date.now()}.webm`);
            
            // Write base64 audio to file
            const audioBuffer = base64ToBuffer(data.audio);
            fs.writeFileSync(tempFilePath, audioBuffer);
            
            console.log(`Created temporary audio file at ${tempFilePath} for ${socket.id}`);
            
            // Initialize chat history if it doesn't exist
            if (!userChatHistories[socket.id]) {
                userChatHistories[socket.id] = [
                    { role: "system", content: "You are a friendly and helpful AI assistant in a VR Pong game environment. While you can provide tips and guidance about the game, you're also capable of having general conversations on a wide range of topics. Be engaging, informative, and personable." }
                ];
            }
            
            console.log(`Processing audio with OpenAI API for ${socket.id}`);
            
            // Step 1: Transcribe the audio using the file path
            const transcriptionResponse = await openaiClient.audio.transcriptions.create({
                file: fs.createReadStream(tempFilePath),
                model: "whisper-1",
            });
            
            const transcription = transcriptionResponse.text;
            console.log(`Transcription for ${socket.id}: ${transcription}`);
            
            // Clean up the temporary file
            try {
                fs.unlinkSync(tempFilePath);
                console.log(`Deleted temporary file ${tempFilePath}`);
            } catch (cleanupError) {
                console.error(`Error deleting temporary file ${tempFilePath}:`, cleanupError);
            }
            
            // If the transcription is empty, send an error
            if (!transcription || transcription.trim() === '') {
                socket.emit('openai-error', { error: 'Could not transcribe audio. Please try again.' });
                return;
            }
            
            // Add user message to history
            userChatHistories[socket.id].push({ role: "user", content: transcription });
            
            // Limit history to last 10 messages to prevent context overflow
            if (userChatHistories[socket.id].length > 11) { // 1 system + 10 messages
                userChatHistories[socket.id] = [
                    userChatHistories[socket.id][0], // Keep system message
                    ...userChatHistories[socket.id].slice(-10) // Keep last 10 messages
                ];
            }
            
            // Send the transcription to the client immediately
            socket.emit('openai-transcription', { transcription });
            
            // Step 2: Generate a streaming response using GPT-4o mini's streaming capability
            let fullResponse = ''; // Variable to collect the full response
            
            const completion = await openaiClient.chat.completions.create({
                messages: userChatHistories[socket.id],
                model: "gpt-4o-mini",
                stream: true, // Enable streaming
            });
            
            // Set up streaming response
            for await (const chunk of completion) {
                if (chunk.choices[0]?.delta?.content) {
                    const contentChunk = chunk.choices[0].delta.content;
                    fullResponse += contentChunk;
                    
                    // Send each chunk to the client for real-time display
                    socket.emit('openai-stream-chunk', { text: contentChunk });
                }
            }
            
            // Add assistant response to history
            userChatHistories[socket.id].push({ role: "assistant", content: fullResponse });
            
            console.log(`Generated full text response for ${socket.id}: ${fullResponse.substring(0, 50)}...`);
            
            // Step 3: Convert the text response to speech using OpenAI's TTS
            const audioResponse = await openaiClient.audio.speech.create({
                model: "tts-1-hd",  // Upgraded to the high-definition TTS model
                voice: "nova",      // Using nova, which is more natural and conversational
                input: fullResponse,
            });
            
            // Get audio as binary data and convert to base64
            const speechBuffer = Buffer.from(await audioResponse.arrayBuffer());
            const audioBase64 = `data:audio/mp3;base64,${speechBuffer.toString('base64')}`;
            
            // Send the audio response to the client
            socket.emit('openai-speech-response', { audio: audioBase64 });
            
        } catch (error) {
            console.error(`OpenAI API error for ${socket.id}:`, error);
            
            let errorMessage = "An error occurred while processing your audio request.";
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

    // Handle OpenAI audio streaming
    socket.on('openai-audio-stream', async (audioBase64) => {
        try {
            // Check if OpenAI client is initialized
            if (!openaiClient) {
                socket.emit('openai-error', 'OpenAI client not initialized');
                return;
            }

            // Create a temporary file for the audio data
            const tempFilePath = path.join(os.tmpdir(), `audio-stream-${socket.id}-${Date.now()}.webm`);
            const audioData = base64ToBuffer(audioBase64);
            fs.writeFileSync(tempFilePath, audioData);
            
            console.log(`Created temporary audio file at ${tempFilePath} for realtime audio streaming`);
            
            // Check if we have access to the audio API and it's properly set up
            if (!openaiClient.audio || !openaiClient.audio.speech || !openaiClient.audio.transcriptions) {
                console.log("OpenAI Audio API not available. Falling back to transcription and completion.");
                
                // Fallback to our existing transcription and completion flow
                // First transcribe the audio
                const transcriptionResponse = await openaiClient.audio.transcriptions.create({
                    file: fs.createReadStream(tempFilePath),
                    model: "whisper-1"
                });
                
                const transcript = transcriptionResponse.text;
                console.log(`Transcription for ${socket.id}: ${transcript}`);
                
                // Then generate a text response
                const completion = await openaiClient.chat.completions.create({
                    model: "gpt-4o-mini",
                    messages: [
                        {role: "system", content: "You are a helpful assistant in a VR Pong game."},
                        {role: "user", content: transcript}
                    ]
                });
                
                const responseText = completion.choices[0].message.content;
                console.log(`Generated text response for ${socket.id}: ${responseText.substring(0, 50)}...`);
                
                // Then convert to speech
                const mp3 = await openaiClient.audio.speech.create({
                    model: "tts-1-hd",
                    voice: "nova",
                    input: responseText
                });
                
                // Convert to base64
                const buffer = Buffer.from(await mp3.arrayBuffer());
                const base64Audio = buffer.toString('base64');
                
                // Send both text and audio back to the client
                socket.emit('openai-transcription', transcript);
                socket.emit('openai-audio-stream-response', {
                    audioData: base64Audio,
                    text: responseText
                });
            } else {
                // Try the audio.conversations API if it exists (newer OpenAI API versions)
                try {
                    if (openaiClient.audio.conversations && typeof openaiClient.audio.conversations.create === 'function') {
                        // This is the preferred path for newer OpenAI SDK versions
                        const audioStream = fs.createReadStream(tempFilePath);
                        
                        const response = await openaiClient.audio.conversations.create({
                            model: "gpt-4o-mini",
                            messages: [
                                {
                                    role: "user",
                                    file_data: [
                                        {
                                            type: "audio",
                                            audio: audioStream
                                        }
                                    ]
                                }
                            ]
                        });
                        
                        // Process the response and send it back to the client
                        const buffer = Buffer.from(await response.arrayBuffer());
                        const base64Audio = buffer.toString('base64');
                        
                        socket.emit('openai-audio-stream-response', {
                            audioData: base64Audio,
                            text: "I've processed your audio input."
                        });
                    } else {
                        throw new Error("Audio conversations API not available");
                    }
                } catch (conversionError) {
                    console.log(`OpenAI Audio Conversation API not available or error: ${conversionError.message}`);
                    console.log("Falling back to transcription + speech synthesis flow");
                    
                    // Fallback to our existing transcription and completion flow (same as above)
                    const transcriptionResponse = await openaiClient.audio.transcriptions.create({
                        file: fs.createReadStream(tempFilePath),
                        model: "whisper-1"
                    });
                    
                    const transcript = transcriptionResponse.text;
                    console.log(`Transcription for ${socket.id}: ${transcript}`);
                    
                    // Then generate a text response
                    const completion = await openaiClient.chat.completions.create({
                        model: "gpt-4o-mini",
                        messages: [
                            {role: "system", content: "You are a helpful assistant in a VR Pong game."},
                            {role: "user", content: transcript}
                        ]
                    });
                    
                    const responseText = completion.choices[0].message.content;
                    console.log(`Generated text response for ${socket.id}: ${responseText.substring(0, 50)}...`);
                    
                    // Then convert to speech
                    const mp3 = await openaiClient.audio.speech.create({
                        model: "tts-1-hd",
                        voice: "nova",
                        input: responseText
                    });
                    
                    // Convert to base64
                    const buffer = Buffer.from(await mp3.arrayBuffer());
                    const base64Audio = buffer.toString('base64');
                    
                    // Send both text and audio back to the client
                    socket.emit('openai-transcription', transcript);
                    socket.emit('openai-audio-stream-response', {
                        audioData: base64Audio,
                        text: responseText
                    });
                }
            }
            
            // Clean up the temporary file
            fs.unlink(tempFilePath, (err) => {
                if (err) console.error(`Error deleting temporary file ${tempFilePath}:`, err);
                else console.log(`Deleted temporary file ${tempFilePath}`);
            });
        } catch (error) {
            console.error(`OpenAI Audio Conversation API error for ${socket.id}:`, error);
            socket.emit('openai-error', error.message);
        }
    });
});

// Generate a random room ID
function generateRoomId() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// Helper function to convert base64 audio to a buffer
function base64ToBuffer(base64) {
    return Buffer.from(base64.split(',')[1], 'base64');
}
