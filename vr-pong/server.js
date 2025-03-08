const express = require('express');
const https = require('https');
const path = require('path');
const selfsigned = require('selfsigned');
const socketIo = require('socket.io');

// Game rooms storage
const gameRooms = {};

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
    });
});

// Generate a random room ID
function generateRoomId() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}
