// Use the global io from socket.io CDN
import * as THREE from 'three';

export class MultiplayerManager {
    constructor(game) {
        this.game = game;
        try {
            // Access the global socket.io instance
            if (typeof io === 'undefined') {
                throw new Error('Socket.IO not loaded');
            }
            
            // Try to get the server address, defaulting to localhost if the page is served locally
            const protocol = window.location.protocol === 'https:' ? 'https://' : 'http://';
            const isLocalhost = window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost';
            const isLocalNetwork = /^192\.168\.\d+\.\d+$/.test(window.location.hostname);
            
            let host;
            if (isLocalhost || isLocalNetwork) {
                // For localhost or local network (192.168.x.x), include the port
                host = `${window.location.hostname}:8443`;
            } else {
                // For Render.com deployment
                host = window.location.hostname;
            }
                
            console.log(`Connecting to server at ${protocol}${host}`);
            
            // Connect with explicit URL to avoid connection issues
            this.socket = io(`${protocol}${host}`, {
                reconnectionAttempts: 5,
                timeout: 10000,
                transports: ['websocket', 'polling']
            });
            
            this.roomId = null;
            this.isHost = false;
            this.isConnected = false;
            this.isMultiplayerActive = false;
            this.opponentId = null;
            
            this.setupSocketListeners();
        } catch (e) {
            console.error('Error connecting to server:', e);
            if (this.game && this.game.showMessage) {
                this.game.showMessage('Error connecting to multiplayer server');
            }
        }
    }

    setupSocketListeners() {
        // Connection established
        this.socket.on('connect', () => {
            console.log('Connected to server with ID:', this.socket.id);
            this.isConnected = true;
        });

        // Disconnect event
        this.socket.on('disconnect', () => {
            console.log('Disconnected from server');
            this.isConnected = false;
            this.isMultiplayerActive = false;
            this.roomId = null;
            this.isHost = false;
            this.opponentId = null;
            
            // Show disconnect message in VR
            this.game.showMessage('Disconnected from multiplayer session');
        });

        // Game hosted successfully
        this.socket.on('gameHosted', (data) => {
            this.roomId = data.roomId;
            this.isHost = true;
            this.isMultiplayerActive = true;
            
            console.log('Game hosted with room ID:', this.roomId);
            this.game.showMessage(`Game hosted! Room code: ${this.roomId}`);
            this.game.showMessage('Waiting for an opponent to join...', 5000);
            this.game.updateMultiplayerStatus(true, true);
        });

        // Another player joined the game
        this.socket.on('playerJoined', (data) => {
            console.log('Player joined event received:', data);
            
            // Set the room ID if we're joining
            if (!this.isHost) {
                this.roomId = data.roomId;
                this.isMultiplayerActive = true;
                this.game.updateMultiplayerStatus(true, false);
            }
            
            if (this.isHost) {
                this.opponentId = data.guestId;
                console.log('As host, opponent joined with ID:', this.opponentId);
                this.game.showMessage('A player has joined your game! You can now start the game.', 5000);
                // Show the start button for the host
                if (this.game.startButton) {
                    this.game.startButton.show();
                }
            } else {
                this.opponentId = data.hostId;
                console.log('As guest, joined host with ID:', this.opponentId);
                this.game.showMessage('Joined game successfully! Waiting for the host to start...', 5000);
            }
        });

        // Game started
        this.socket.on('gameStarted', () => {
            console.log('Game started!');
            this.game.startMultiplayerGame(this.isHost);
        });

        // No games available to join
        this.socket.on('noGamesAvailable', () => {
            console.log('No games available to join');
            this.game.showMessage('No games available to join. Try hosting a game instead!');
            // Reset multiplayer state
            this.isMultiplayerActive = false;
            this.roomId = null;
            this.isHost = false;
            this.opponentId = null;
        });

        // Error message
        this.socket.on('errorMessage', (data) => {
            console.log('Error:', data.message);
            this.game.showMessage(`Error: ${data.message}`);
        });

        // Receive remote paddle position updates
        this.socket.on('paddlePositionUpdated', (data) => {
            // Removed paddle position log
            // console.log(`Received paddle position: x=${data.x.toFixed(2)}, y=${data.y.toFixed(2)}, z=${data.z.toFixed(2)}, isHost=${data.isHost}, paddleIndex=${data.paddleIndex}`);
            
            // Create position object from the received data
            const position = { x: data.x, y: data.y, z: data.z };
            
            // Pass along paddle index if it exists
            const paddleIndex = data.paddleIndex !== undefined ? data.paddleIndex : null;
            this.game.updateRemotePaddlePosition(position, data.isHost, paddleIndex);
            
            // Handle paddle ownership if this is the first update for this paddle
            if (data.ownerId && paddleIndex !== null) {
                this.game.updateRemotePaddleOwnership(paddleIndex, data.ownerId, data.isHost);
            }
        });

        // Receive ball position updates (guest only)
        this.socket.on('ballPositionUpdated', (data) => {
            if (!this.isHost) {
                this.game.updateRemoteBallPosition(data.position, data.velocity);
            }
        });

        // Receive score updates
        this.socket.on('scoreUpdated', (data) => {
            this.game.updateRemoteScore(data.hostScore, data.guestScore);
        });

        // Receive collision events
        this.socket.on('remoteCollision', (data) => {
            this.game.handleRemoteCollision(data.type, data.position);
        });

        // Receive remote controller data
        this.socket.on('remoteControllerData', (data) => {
            // Forward controller data to the game to update remote controller visualizations
            this.game.updateRemoteControllers(data);
        });

        // New listener for paddle ownership claims
        this.socket.on('paddleOwnershipUpdated', (data) => {
            // Removed paddle ownership log
            // console.log(`Received paddle ownership update: Paddle ${data.paddleIndex} claimed by ${data.isHost ? 'Host' : 'Guest'}`);
            this.game.updateRemotePaddleOwnership(data.paddleIndex, data.ownerId, data.isHost);
        });
    }

    // Host a new game
    hostGame() {
        if (!this.isConnected) {
            console.log('Cannot host: not connected to server');
            return false;
        }
        
        // Prevent hosting multiple games
        if (this.isHost && this.roomId) {
            console.log('Already hosting a game with room ID:', this.roomId);
            this.game.showMessage(`Already hosting! Room code: ${this.roomId}`);
            return false;
        }
        
        // Reset any previous multiplayer state
        this.isMultiplayerActive = false;
        this.opponentId = null;
        
        console.log('Requesting to host a new game');
        this.socket.emit('hostGame');
        return true;
    }

    // Join a game via quick match
    quickJoin() {
        if (!this.isConnected) {
            console.log('Cannot join: not connected to server');
            return false;
        }
        
        // Prevent joining if already in a game
        if (this.isMultiplayerActive) {
            console.log('Already in a multiplayer game');
            this.game.showMessage('Already in a multiplayer game');
            return false;
        }
        
        // Reset any previous host state
        this.isHost = false;
        this.roomId = null;
        
        console.log('Requesting to quick join a game');
        this.socket.emit('quickJoin');
        return true;
    }

    // Start the game (host only)
    startGame() {
        if (!this.isHost || !this.roomId) {
            console.log('Cannot start game: not a host or no room ID');
            return false;
        }
        
        if (!this.opponentId) {
            console.log('Cannot start game: no opponent has joined');
            this.game.showMessage('Waiting for an opponent to join...', 5000);
            return false;
        }
        
        console.log('Starting game in room:', this.roomId);
        this.socket.emit('startGame', { roomId: this.roomId });
        return true;
    }

    // Send paddle position update
    updatePaddlePosition(paddle, paddleIndex) {
        if (!this.socket || !this.socket.connected) return;
        
        const paddlePos = paddle.getPaddle().position;
        console.log(`Sending paddle position: x=${paddlePos.x.toFixed(2)}, y=${paddlePos.y.toFixed(2)}, z=${paddlePos.z.toFixed(2)}, index=${paddleIndex}`);
        
        this.socket.emit('updatePaddlePosition', {
            x: paddlePos.x,
            y: paddlePos.y,
            z: paddlePos.z,
            isHost: this.isHost,
            paddleIndex: paddleIndex,
            ownerId: paddle.ownerId
        });
    }
    
    // Send paddle ownership update
    updatePaddleOwnership(paddle, paddleIndex) {
        if (!this.socket || !this.socket.connected) return;
        
        console.log(`Sending paddle ownership update: Paddle ${paddleIndex} claimed by ${this.isHost ? 'Host' : 'Guest'}`);
        
        this.socket.emit('updatePaddleOwnership', {
            paddleIndex: paddleIndex,
            ownerId: paddle.ownerId,
            isHost: this.isHost
        });
    }

    // Send ball position update (host only)
    updateBallPosition(position, velocity) {
        if (!this.isMultiplayerActive || !this.roomId || !this.isHost) return;
        
        this.socket.emit('updateBallPosition', {
            roomId: this.roomId,
            position,
            velocity
        });
    }

    // Send score update (host only)
    updateScore(hostScore, guestScore) {
        if (!this.isMultiplayerActive || !this.roomId || !this.isHost) return;
        
        this.socket.emit('updateScore', {
            roomId: this.roomId,
            hostScore,
            guestScore
        });
    }

    // Send collision event (host only)
    sendCollisionEvent(type, position) {
        if (!this.isMultiplayerActive || !this.roomId || !this.isHost) return;
        
        this.socket.emit('collisionEvent', {
            roomId: this.roomId,
            type,
            position
        });
    }

    // Send VR controller positions and orientations
    updateControllerData(leftController, rightController) {
        if (!this.socket || !this.socket.connected || !this.isMultiplayerActive) return;
        
        // Only send controller data if we have valid controllers
        if (!leftController || !rightController) return;

        const leftPosition = new THREE.Vector3();
        const leftRotation = new THREE.Quaternion();
        leftController.getWorldPosition(leftPosition);
        leftController.getWorldQuaternion(leftRotation);

        const rightPosition = new THREE.Vector3();
        const rightRotation = new THREE.Quaternion();
        rightController.getWorldPosition(rightPosition);
        rightController.getWorldQuaternion(rightRotation);

        const controllerData = {
            roomId: this.roomId,
            isHost: this.isHost,
            leftController: {
                position: { x: leftPosition.x, y: leftPosition.y, z: leftPosition.z },
                rotation: { x: leftRotation.x, y: leftRotation.y, z: leftRotation.z, w: leftRotation.w }
            },
            rightController: {
                position: { x: rightPosition.x, y: rightPosition.y, z: rightPosition.z },
                rotation: { x: rightRotation.x, y: rightRotation.y, z: rightRotation.z, w: rightRotation.w }
            }
        };
        
        // Send controller data to server
        this.socket.emit('updateControllerData', controllerData);
    }

    // Check if we're in a multiplayer game
    isInMultiplayerGame() {
        return this.isMultiplayerActive;
    }

    // Check if we're the host
    isHosting() {
        return this.isHost;
    }
}
