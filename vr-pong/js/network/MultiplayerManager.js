// Use the global io from socket.io CDN
import * as THREE from 'three';
import { VoiceChat } from '../audio/VoiceChat.js';

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
            
            // Initialize voice chat
            this.voiceChat = null;
            
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
            
            // If we're reconnecting and we're a host with a restart pending, try again
            if (this.game && this.game.gameOver && this.isHost) {
                console.log('RESTART EVENT: Reconnected as host with game over - retrying restart');
                setTimeout(() => {
                    this.restartGame();
                }, 1000);
            }
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
                // As a guest, our opponent is the host
                this.opponentId = data.hostId;
                console.log('As guest, joined host with ID:', this.opponentId);
                this.game.showMessage('Joined game successfully! Waiting for the host to start...', 5000);
            } else {
                // As a host, our opponent is the guest
                this.opponentId = data.guestId;
                console.log('As host, opponent (guest) joined with ID:', this.opponentId);
                this.game.showMessage('A player has joined your game! You can now start the game.', 5000);
                // Show the start button for the host
                if (this.game.startButton) {
                    this.game.startButton.show();
                }
            }
            
            // Only initialize voice chat if we have a valid opponent ID
            if (this.opponentId) {
                console.log('OpponentId is now set to:', this.opponentId);
                
                // Initialize voice chat when a player joins
                if (!this.voiceChat) {
                    console.log('Initializing voice chat with opponent:', this.opponentId);
                    this.voiceChat = new VoiceChat(this);
                }
                
                // Wait a bit to let the game UI update before requesting voice chat
                setTimeout(() => {
                    console.log('Requesting voice chat with opponent:', this.opponentId);
                    this.voiceChat.requestVoiceChat();
                }, 2000);
            } else {
                console.error('OpponentId is undefined, cannot initialize voice chat');
            }
        });

        // Game started
        this.socket.on('gameStarted', () => {
            console.log('Game started!');
            this.game.startMultiplayerGame(this.isHost);
        });
        
        // Game restarted (by host)
        this.socket.on('gameRestarted', (data = {}) => {
            console.log('RESTART EVENT: Received gameRestarted event from server!', data);
            
            // Check for force reset flag (added for more robust client resets)
            if (data && data.forceReset) {
                console.log('RESTART EVENT: forceReset flag detected, performing complete reset');
                
                // Force direct manipulation of game properties for client
                if (this.game) {
                    // Reset core game state
                    this.game.gameOver = false;
                    this.game.playerScore = 0;
                    this.game.aiScore = 0;
                    
                    // Force hide UI elements directly
                    if (this.game.finalScoreDisplay && this.game.finalScoreDisplay.mesh) {
                        this.game.finalScoreDisplay.mesh.visible = false;
                    }
                    
                    if (this.game.restartButton && this.game.restartButton.getMesh) {
                        const mesh = this.game.restartButton.getMesh();
                        if (mesh) mesh.visible = false;
                    }
                }
            }
            
            // Perform the restart regardless of who we are (host or guest)
            this.performGameRestart();
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

        // When a player leaves
        this.socket.on('playerLeft', () => {
            console.log('Player left the game');
            
            // Clean up voice chat when a player leaves
            if (this.voiceChat) {
                console.log('Cleaning up voice chat resources due to player disconnect');
                this.voiceChat.cleanup();
                this.voiceChat = null;
            }
            
            this.opponentId = null;
            // Reset multiplayer state
            this.isMultiplayerActive = false;
            this.game.showMessage('The other player has left the game', 3000);
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

    // Restart the game (host only)
    restartGame() {
        console.log('RESTART EVENT: MultiplayerManager.restartGame called - isHost:', this.isHost, 'roomId:', this.roomId);
        
        if (!this.isHost || !this.roomId) {
            console.log('RESTART EVENT: Cannot restart game: not a host or no room ID');
            return false;
        }
        
        console.log('RESTART EVENT: Emitting restartGame event to server for room:', this.roomId);
        this.socket.emit('restartGame', { roomId: this.roomId });
        
        // For the host, we'll add a fallback direct restart
        // This ensures the host's game restarts regardless of server issues
        if (this.isHost) {
            console.log('RESTART EVENT: Host initiating fallback restart timer');
            
            // Fallback restart for the host player after 1 second if server event fails
            setTimeout(() => {
                if (this.game.gameOver) {
                    console.log('RESTART EVENT: Fallback restart activating for host - server event may have failed');
                    this.performGameRestart();
                } else {
                    console.log('RESTART EVENT: Fallback not needed, game already restarted');
                }
            }, 1000);
        }
        
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
        
        // Get head position - try multiple approaches to ensure we have the most accurate data
        let headPosition = null;
        let headRotation = null;
        
        // Approach 1: Use the player's VR camera directly for most accurate position
        if (this.game && this.game.camera && this.game.renderer.xr.isPresenting) {
            headPosition = new THREE.Vector3();
            headRotation = new THREE.Quaternion();
            
            // Camera's world position includes player movement from locomotion
            this.game.camera.getWorldPosition(headPosition);
            this.game.camera.getWorldQuaternion(headRotation);
        } 
        // Approach 2: Use the player head object if available
        else if (this.game && this.game.playerHead && this.game.playerHead.getHeadGroup()) {
            headPosition = new THREE.Vector3();
            headRotation = new THREE.Quaternion();
            
            const headGroup = this.game.playerHead.getHeadGroup();
            headGroup.getWorldPosition(headPosition);
            headGroup.getWorldQuaternion(headRotation);
        }

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
        
        // Add head data if available
        if (headPosition && headRotation) {
            controllerData.head = {
                position: { x: headPosition.x, y: headPosition.y, z: headPosition.z },
                rotation: { x: headRotation.x, y: headRotation.y, z: headRotation.z, w: headRotation.w }
            };
        }
        
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

    // Helper method to perform the actual game restart
    performGameRestart() {
        console.log('RESTART EVENT: Performing game restart');
        
        // Reset game state completely
        console.log('RESTART EVENT: Setting gameOver to false');
        this.game.gameOver = false;
        
        // Force hide game over UI elements - more aggressively for clients
        console.log('RESTART EVENT: Force hiding game over UI elements');
        
        // Handle the final score display
        if (this.game.finalScoreDisplay) {
            // Force hide and check visibility
            this.game.finalScoreDisplay.hide();
            console.log('RESTART EVENT: Forced finalScoreDisplay hide');
            
            // For client-side, try direct DOM manipulation if mesh exists
            if (this.game.finalScoreDisplay.mesh) {
                this.game.finalScoreDisplay.mesh.visible = false;
                console.log('RESTART EVENT: Directly set finalScoreDisplay mesh visibility to false');
            }
        }
        
        // Handle the restart button - only visible for host but clear for everyone
        if (this.game.restartButton) {
            this.game.restartButton.hide();
            console.log('RESTART EVENT: Forced restartButton hide');
            
            // For client-side, try direct DOM manipulation if mesh exists
            if (this.game.restartButton.getMesh) {
                const buttonMesh = this.game.restartButton.getMesh();
                if (buttonMesh) {
                    buttonMesh.visible = false;
                    console.log('RESTART EVENT: Directly set restartButton mesh visibility to false');
                }
            }
        }
        
        // Clear any pending timeouts that might impact the game state
        if (typeof window !== 'undefined') {
            // Clear a wide range of timeouts to be sure
            for (let i = 0; i < 1000; i++) {
                window.clearTimeout(i);
            }
            console.log('RESTART EVENT: Cleared pending timeouts');
        }
        
        // Reset the game state
        console.log('RESTART EVENT: Calling game.resetGame()');
        this.game.resetGame();
        
        // Start the game again
        console.log('RESTART EVENT: Calling game.startGame()');
        this.game.startGame();
        
        // Show notification specifically indicating this was a remote restart for clients
        if (!this.isHost) {
            this.game.showMessage('Game restarted by host!', 3000);
        } else {
            this.game.showMessage('Game restarted!', 3000);
        }
        
        // Confirm game over menu is gone
        setTimeout(() => {
            // Double-check UI elements are hidden
            if (this.game.finalScoreDisplay && this.game.finalScoreDisplay.mesh && 
                this.game.finalScoreDisplay.mesh.visible) {
                console.log('RESTART EVENT: WARNING - finalScoreDisplay still visible after restart, forcing hide');
                this.game.finalScoreDisplay.mesh.visible = false;
            } else {
                console.log('RESTART EVENT: Confirmed finalScoreDisplay is hidden');
            }
            
            console.log('RESTART EVENT: Verifying restart: gameOver =', this.game.gameOver, 
                        'ballVelocity =', this.game.ball ? this.game.ball.ballVelocity : 'n/a',
                        'scores =', this.game.playerScore, this.game.aiScore);
        }, 500);
    }

    // Update multiplayer state (called every frame)
    update() {
        if (!this.socket || !this.game) return;
        
        // Send player position if we're the host/client
        if (this.isHost || this.isClient) {
            this.sendPlayerPosition();
        }
        
        // Send ball position if we're the host
        if (this.isHost) {
            this.sendBallState();
        }
        
        // Send controller states if in VR mode
        if (this.game.vrMode && this.game.controllers && this.game.controllers.length > 0) {
            this.sendControllerState();
        }
        
        // Check connection state periodically
        if (Date.now() - this.lastPingTime > this.pingInterval) {
            this.checkConnection();
            this.lastPingTime = Date.now();
        }
        
        // Process any pending events
        this.processEvents();
    }
    
    // Toggle mute status
    toggleMute() {
        if (this.voiceChat) {
            return this.voiceChat.toggleMute();
        }
        return false;
    }
    
    // Check if voice chat is connected
    isVoiceChatConnected() {
        return this.voiceChat && this.voiceChat.isConnected;
    }
    
    // Check if microphone is muted
    isMicrophoneMuted() {
        return this.voiceChat ? this.voiceChat.isMuted : false;
    }

    // Start voice chat
    startVoiceChat() {
        if (this.voiceChat) {
            // Clean up any existing voice chat
            this.voiceChat.cleanup();
            this.voiceChat = null;
        }
        
        if (!this.opponentId) {
            console.error('Cannot start voice chat without opponent');
            return;
        }
        
        try {
            // Import VoiceChat class
            import('../audio/VoiceChat.js').then(module => {
                console.log('Creating new voice chat instance');
                this.voiceChat = new module.VoiceChat(this);
                this.voiceChat.requestVoiceChat();
            }).catch(err => {
                console.error('Error importing VoiceChat module:', err);
            });
        } catch (err) {
            console.error('Error starting voice chat:', err);
        }
    }
    
    // Stop voice chat
    stopVoiceChat() {
        if (this.voiceChat) {
            console.log('Stopping voice chat');
            this.voiceChat.cleanup();
            this.voiceChat = null;
        }
    }
}
