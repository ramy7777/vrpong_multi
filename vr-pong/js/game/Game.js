import * as THREE from 'three';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import { XRControllerModelFactory } from 'three/addons/webxr/XRControllerModelFactory.js';
import { VRController } from '../controllers/VRController.js';
import { GameEnvironment } from '../environment/GameEnvironment.js';
import { Paddle } from './Paddle.js';
import { Ball } from './Ball.js';
import { SoundManager } from '../audio/SoundManager.js';
import { StartButton } from '../ui/StartButton.js';
import { ScoreDisplay } from '../ui/ScoreDisplay.js';
import { Timer } from '../ui/Timer.js';
import { MultiplayerMenu } from '../ui/MultiplayerMenu.js';
import { MultiplayerManager } from '../network/MultiplayerManager.js';

export class Game {
    constructor() {
        // Initialize Three.js scene and renderer
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.shadowMap.enabled = true;
        
        // Game state
        this.isGameStarted = false;
        this.isMultiplayer = false;
        this.isLocalPlayer = true; // Player is host by default
        this.isInVR = false; // Track if user is in VR
        
        // Scoring
        this.playerScore = 0;
        this.aiScore = 0;
        
        // Clock for animation
        this.clock = new THREE.Clock();
        
        // Create a group for player elements
        this.playerGroup = new THREE.Group();
        this.scene.add(this.playerGroup);
        
        // Desktop input tracking
        this.desktopControls = {
            keys: {
                'ArrowLeft': false,
                'ArrowRight': false,
                'a': false,
                'd': false,
                ' ': false
            },
            isMouseDown: false,
            mouseX: 0,
            mouseY: 0
        };
        
        this.init();
        this.createGameElements();
        this.setupVR();
        this.setupDesktopControls();
        
        // Initialize multiplayer manager
        this.multiplayerManager = new MultiplayerManager(this);
        
        // Set up multiplayer menu callbacks (will create the menu)
        this.setupMultiplayerCallbacks();
        
        this.animate();
    }

    init() {
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.xr.enabled = true;
        document.body.appendChild(this.renderer.domElement);
        document.body.appendChild(VRButton.createButton(this.renderer));

        // Position camera for desktop view
        this.camera.position.set(0, 1.7, 0.8);
        this.camera.lookAt(0, 0.9, -1.0); // Look at the center of the table

        window.addEventListener('resize', () => {
            this.camera.aspect = window.innerWidth / window.innerHeight;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(window.innerWidth, window.innerHeight);
        });
    }

    setupVR() {
        this.renderer.xr.addEventListener('sessionstart', () => {
            console.log('Setting up VR session');
            // Removed problematic transform code
        });

        this.vrController = new VRController(this.renderer, this.playerGroup);
    }

    setupMultiplayerCallbacks() {
        this.multiplayerMenu = new MultiplayerMenu(this.scene);
        
        // Set up the callbacks for the multiplayer menu buttons
        this.multiplayerMenu.setCallbacks({
            onHost: () => {
                if (this.multiplayerManager.isConnected) {
                    console.log("Attempting to host a game...");
                    this.multiplayerManager.hostGame();
                    this.multiplayerMenu.hide();
                    // Hide start button until someone joins
                    this.startButton.hide();
                    this.showMessage('Hosting a game. Waiting for players...');
                } else {
                    console.log("Not connected to server");
                    this.showMessage('Not connected to server. Please try again.');
                }
            },
            onJoin: () => {
                if (this.multiplayerManager.isConnected) {
                    console.log("Attempting to join a game...");
                    this.multiplayerManager.quickJoin();
                    this.multiplayerMenu.hide();
                    // Hide start button for guest
                    this.startButton.hide();
                    this.showMessage('Searching for a game to join...');
                } else {
                    console.log("Not connected to server");
                    this.showMessage('Not connected to server. Please try again.');
                }
            },
            onBack: () => {
                // Return to main menu
                console.log("Returning to main menu");
                this.multiplayerMenu.hide();
                this.startButton.show();
            }
        });
    }

    setupDesktopControls() {
        // Add event listeners for keyboard controls
        window.addEventListener('keydown', (event) => {
            if (this.desktopControls.keys.hasOwnProperty(event.key)) {
                this.desktopControls.keys[event.key] = true;
            } else {
                this.desktopControls.keys[event.key] = true;
            }
            
            // Space bar to start game or interact with buttons
            if (event.key === ' ' && !this.isGameStarted) {
                if (this.multiplayerManager.isInMultiplayerGame()) {
                    // If we're in a multiplayer game and we're the host, start the game
                    if (this.multiplayerManager.isHosting()) {
                        console.log("Host starting multiplayer game (desktop)");
                        this.multiplayerManager.startGame();
                        this.startButton.hide();
                    } else {
                        this.showMessage("Waiting for host to start the game...");
                    }
                } else {
                    // Always show multiplayer menu first in desktop mode
                    this.startButton.hide();
                    this.multiplayerMenu.show();
                }
            }
            
            // Handle 'ESC' key to exit menus or pause
            if (event.key === 'Escape') {
                if (this.multiplayerMenu.isVisible) {
                    this.multiplayerMenu.hide();
                    this.startButton.show();
                }
                // Could add pause functionality here
            }
        });
        
        window.addEventListener('keyup', (event) => {
            if (this.desktopControls.keys.hasOwnProperty(event.key)) {
                this.desktopControls.keys[event.key] = false;
            }
        });

        // Add mouse controls for paddle
        window.addEventListener('mousedown', () => {
            this.desktopControls.isMouseDown = true;
        });

        window.addEventListener('mouseup', () => {
            this.desktopControls.isMouseDown = false;
        });
        
        // Track mouse position for desktop paddle control
        window.addEventListener('mousemove', (event) => {
            // Convert mouse position to normalized coordinates (-1 to 1)
            this.desktopControls.mouseX = (event.clientX / window.innerWidth) * 2 - 1;
            this.desktopControls.mouseY = -(event.clientY / window.innerHeight) * 2 + 1;
        });

        // Handle click events for UI buttons
        window.addEventListener('click', (event) => {
            if (!this.isInVR) {
                // Create a raycaster for mouse picking
                const raycaster = new THREE.Raycaster();
                const mouse = new THREE.Vector2(
                    (event.clientX / window.innerWidth) * 2 - 1,
                    -(event.clientY / window.innerHeight) * 2 + 1
                );
                
                raycaster.setFromCamera(mouse, this.camera);
                
                // Check start button intersection
                if (!this.isGameStarted && this.startButton) {
                    const startButtonIntersects = raycaster.intersectObject(this.startButton.getMesh(), true);
                    if (startButtonIntersects.length > 0) {
                        // Prevent double-clicks
                        if (this.startButton.isPressed) return;
                        
                        this.startButton.press();
                        
                        if (this.multiplayerManager.isConnected) {
                            // Only show multiplayer menu if not already in a multiplayer game
                            if (!this.multiplayerManager.isInMultiplayerGame()) {
                                this.startButton.hide();
                                this.multiplayerMenu.show();
                            } else if (this.multiplayerManager.isHosting()) {
                                // If already hosting, start the game
                                console.log("Already hosting, starting the game");
                                this.multiplayerManager.startGame();
                            }
                        } else {
                            this.isGameStarted = true;
                            this.playerScore = 0;
                            this.aiScore = 0;
                            this.playerScoreDisplay.updateScore(0);
                            this.aiScoreDisplay.updateScore(0);
                            
                            this.ball.start();
                            this.timer.start();
                            if (this.soundManager) {
                                this.soundManager.startBackgroundMusic();
                            }
                            this.startButton.hide();
                        }
                    }
                }
                
                // Check multiplayer menu button intersections
                if (this.multiplayerMenu.isVisible) {
                    const hostIntersects = raycaster.intersectObject(this.multiplayerMenu.buttons.host, true);
                    const joinIntersects = raycaster.intersectObject(this.multiplayerMenu.buttons.join, true);
                    const backIntersects = raycaster.intersectObject(this.multiplayerMenu.buttons.back, true);
                    
                    if (hostIntersects.length > 0) {
                        this.multiplayerMenu.pressButton('host');
                    } else if (joinIntersects.length > 0) {
                        this.multiplayerMenu.pressButton('join');
                    } else if (backIntersects.length > 0) {
                        this.multiplayerMenu.pressButton('back');
                    }
                }
            }
        });
    }

    createGameElements() {
        this.environment = new GameEnvironment(this.scene);
        // Initialize sound manager
        this.soundManager = new SoundManager();
        this.table = this.environment.getTable();
        this.scene.add(this.table);

        this.ball = new Ball(this.scene);
        this.playerPaddle = new Paddle(this.scene, false);
        this.aiPaddle = new Paddle(this.scene, true);
        this.startButton = new StartButton(this.scene);
        
        // Initialize game timer
        this.timer = new Timer(this.scene, 180); // 3 minute game timer
        
        // Create message display for notifications
        this.messageDisplay = this.createMessageDisplay();
        this.scene.add(this.messageDisplay);
        this.messageDisplay.visible = false;
        
        this.lastHitTime = 0;
        this.hitCooldown = 100;

        // Track previous ball position for sound triggers
        this.prevBallZ = this.ball.getBall().position.z;
        this.prevBallX = this.ball.getBall().position.x;

        // Initialize score displays
        this.playerScoreDisplay = new ScoreDisplay(
            this.scene,
            new THREE.Vector3(1.90, 1.5, -1),  // Player score on right wall
            new THREE.Euler(0, -Math.PI / 2, 0),
            'PONG MASTER'
        );
        
        this.aiScoreDisplay = new ScoreDisplay(
            this.scene,
            new THREE.Vector3(-1.90, 1.5, -1),  // AI score on left wall
            new THREE.Euler(0, Math.PI / 2, 0),
            'YOU'
        );

        // Create start button
        this.startButton.button.addEventListener('click', () => {
            if (!this.isInVR) {
                // In desktop mode, clicking the start button should show the multiplayer menu
                this.startButton.hide();
                this.multiplayerMenu.show();
            } else {
                // In VR mode, proceed with existing behavior
                if (this.multiplayerManager.isInMultiplayerGame()) {
                    if (this.multiplayerManager.isHosting()) {
                        this.multiplayerManager.startGame();
                    } else {
                        this.showMessage("Waiting for host to start the game...");
                    }
                } else {
                    this.isGameStarted = true;
                    this.playerScore = 0;
                    this.aiScore = 0;
                    this.playerScoreDisplay.updateScore(0);
                    this.aiScoreDisplay.updateScore(0);
                    this.ball.start();
                    this.timer.start();
                    if (this.soundManager) {
                        this.soundManager.startBackgroundMusic();
                    }
                    this.startButton.hide();
                }
            }
        });
    }

    createMessageDisplay() {
        const group = new THREE.Group();
        
        // Create background panel
        const panelGeometry = new THREE.PlaneGeometry(1.5, 0.5);
        const panelMaterial = new THREE.MeshBasicMaterial({
            color: 0x000033,
            transparent: true,
            opacity: 0.7
        });
        const panel = new THREE.Mesh(panelGeometry, panelMaterial);
        group.add(panel);
        
        // Create text
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.width = 512;
        canvas.height = 256;
        
        context.fillStyle = '#ffffff';
        context.font = 'bold 24px Arial';
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillText('', canvas.width / 2, canvas.height / 2);
        
        const textTexture = new THREE.CanvasTexture(canvas);
        this.messageTexture = textTexture;
        this.messageCanvas = canvas;
        this.messageContext = context;
        
        const textMaterial = new THREE.MeshBasicMaterial({
            map: textTexture,
            transparent: true
        });
        
        const textGeometry = new THREE.PlaneGeometry(1.4, 0.4);
        const textMesh = new THREE.Mesh(textGeometry, textMaterial);
        textMesh.position.z = 0.01;
        group.add(textMesh);
        
        group.position.set(0, 1.3, -1.2);
        
        return group;
    }

    showMessage(message, duration = 3000) {
        // Update message text
        this.messageContext.clearRect(0, 0, this.messageCanvas.width, this.messageCanvas.height);
        this.messageContext.fillStyle = '#ffffff';
        this.messageContext.font = 'bold 24px Arial';
        this.messageContext.textAlign = 'center';
        this.messageContext.textBaseline = 'middle';
        
        // Handle multi-line messages
        const maxWidth = this.messageCanvas.width - 40;
        const words = message.split(' ');
        let lines = [];
        let currentLine = words[0];
        
        for (let i = 1; i < words.length; i++) {
            const testLine = currentLine + ' ' + words[i];
            const metrics = this.messageContext.measureText(testLine);
            
            if (metrics.width > maxWidth) {
                lines.push(currentLine);
                currentLine = words[i];
            } else {
                currentLine = testLine;
            }
        }
        lines.push(currentLine);
        
        // Draw lines
        const lineHeight = 30;
        const startY = this.messageCanvas.height / 2 - (lines.length - 1) * lineHeight / 2;
        
        lines.forEach((line, i) => {
            this.messageContext.fillText(line, this.messageCanvas.width / 2, startY + i * lineHeight);
        });
        
        this.messageTexture.needsUpdate = true;
        this.messageDisplay.visible = true;
        
        // Hide after duration
        if (this.messageTimeout) {
            clearTimeout(this.messageTimeout);
        }
        
        this.messageTimeout = setTimeout(() => {
            this.messageDisplay.visible = false;
        }, duration);
    }

    updateMultiplayerStatus(isActive, isHost) {
        this.isMultiplayer = isActive;
        this.isLocalPlayer = isHost;
        
        // Update UI labels based on multiplayer status
        if (isActive) {
            this.playerScoreDisplay.updateLabel(isHost ? 'YOU' : 'OPPONENT');
            this.aiScoreDisplay.updateLabel(isHost ? 'OPPONENT' : 'YOU');
        } else {
            this.playerScoreDisplay.updateLabel('PONG MASTER');
            this.aiScoreDisplay.updateLabel('YOU');
        }
    }

    startMultiplayerGame(isHost) {
        console.log(`Starting multiplayer game as ${isHost ? 'host' : 'guest'}`);
        this.isGameStarted = true;
        this.isMultiplayer = true;
        this.isLocalPlayer = isHost;
        
        // Reset scores
        this.playerScore = 0;
        this.aiScore = 0;
        this.playerScoreDisplay.updateScore(0);
        this.aiScoreDisplay.updateScore(0);
        
        // Hide the start button if it's visible
        this.startButton.hide();
        this.multiplayerMenu.hide();
        
        // Position paddles correctly for multiplayer
        // In multiplayer, player paddle is always on near side, opponent on far side
        // For host: playerPaddle near, aiPaddle far
        // For guest: playerPaddle near, aiPaddle far (same positioning but different controls)
        this.playerPaddle.getPaddle().position.z = -0.1; // Near side of table
        this.aiPaddle.getPaddle().position.z = -1.9;     // Far side of table
        
        // Show a message
        this.showMessage('Game started!', 3000);
        
        // Start the ball if we're the host
        if (isHost) {
            this.ball.start();
        }
        
        // Start the timer and music
        if (this.timer) {
            this.timer.start();
        }
        
        if (this.soundManager) {
            this.soundManager.startBackgroundMusic();
        }
        
        // Add haptic feedback when game starts
        const session = this.renderer.xr.getSession();
        if (session) {
            session.inputSources.forEach(inputSource => {
                if (inputSource.gamepad?.hapticActuators?.[0]) {
                    inputSource.gamepad.hapticActuators[0].pulse(1.0, 50);
                }
            });
        }
    }

    triggerPaddleHaptics(intensity = 1.0, duration = 100) {
        const currentTime = performance.now();
        if (currentTime - this.lastHitTime < this.hitCooldown) {
            return;
        }

        const session = this.renderer.xr.getSession();
        if (!session) return;

        session.inputSources.forEach(inputSource => {
            if (inputSource.gamepad?.hapticActuators?.[0]) {
                inputSource.gamepad.hapticActuators[0].pulse(intensity, duration);
            }
        });

        this.lastHitTime = currentTime;
    }

    updateRemotePaddlePosition(position, isHostPaddle) {
        // Update the appropriate paddle
        const targetPaddle = isHostPaddle ? 
            (this.isLocalPlayer ? this.playerPaddle : this.aiPaddle) :
            (this.isLocalPlayer ? this.aiPaddle : this.playerPaddle);
        
        targetPaddle.setPosition(position);
    }

    updateRemoteBallPosition(position, velocity) {
        // Only non-host should update ball position from network
        if (!this.isLocalPlayer) {
            this.ball.getBall().position.copy(position);
            this.ball.ballVelocity.copy(velocity);
        }
    }

    updateRemoteScore(hostScore, guestScore) {
        if (this.isLocalPlayer) {
            this.playerScore = hostScore;
            this.aiScore = guestScore;
        } else {
            this.playerScore = guestScore;
            this.aiScore = hostScore;
        }
        
        this.playerScoreDisplay.updateScore(this.playerScore);
        this.aiScoreDisplay.updateScore(this.aiScore);
    }

    handleRemoteCollision(type, position) {
        if (type === 'paddle') {
            // Remote player hit the paddle
            if (this.soundManager) {
                this.soundManager.playPaddleHit();
            }
        } else if (type === 'wall') {
            if (this.soundManager) {
                this.soundManager.playWallHit();
            }
        } else if (type === 'goal') {
            if (this.soundManager) {
                this.soundManager.playLose();
            }
        }
        
        // Create a visual effect at the collision point
    }

    animate() {
        this.renderer.setAnimationLoop(() => {
            const delta = this.clock.getDelta();

            // Check if we're in VR
            this.isInVR = this.renderer.xr.isPresenting;

            if (this.vrController && this.isInVR) {
                this.vrController.checkControllerState(
                    this.vrController.controllers[0],
                    'left',
                    this.playerPaddle.getPaddle()
                );
                this.vrController.checkControllerState(
                    this.vrController.controllers[1],
                    'right',
                    this.playerPaddle.getPaddle()
                );
            }

            // Handle desktop controls when not in VR
            if (!this.isInVR && this.isGameStarted) {
                // Handle keyboard paddle movement
                const paddleSpeed = 0.02;
                const paddle = this.playerPaddle.getPaddle();
                
                if (this.desktopControls.keys['ArrowLeft'] || this.desktopControls.keys['a']) {
                    paddle.position.x -= paddleSpeed;
                }
                if (this.desktopControls.keys['ArrowRight'] || this.desktopControls.keys['d']) {
                    paddle.position.x += paddleSpeed;
                }
                
                // Clamp paddle position
                paddle.position.x = THREE.MathUtils.clamp(paddle.position.x, -0.6, 0.6);
            }

            // For desktop mode, use mouse position for paddle control when mouse is down
            if (!this.isInVR && this.desktopControls.isMouseDown) {
                const paddleX = THREE.MathUtils.clamp(this.desktopControls.mouseX * 1.2, -0.6, 0.6);
                this.playerPaddle.getPaddle().position.x = paddleX;
            }

            // Handle multiplayer menu interactions
            if (this.multiplayerMenu.isVisible && this.isInVR) {
                const leftIntersects = this.multiplayerMenu.checkIntersection(this.vrController.controllers[0]);
                const rightIntersects = this.multiplayerMenu.checkIntersection(this.vrController.controllers[1]);
                
                // Unhighlight all buttons first
                ['host', 'join', 'back'].forEach(buttonKey => {
                    this.multiplayerMenu.unhighlightButton(buttonKey);
                });
                
                if (leftIntersects) {
                    this.multiplayerMenu.highlightButton(leftIntersects.button);
                    if (this.vrController.controllers[0].userData.isSelecting) {
                        this.multiplayerMenu.pressButton(leftIntersects.button);
                    }
                }
                
                if (rightIntersects) {
                    this.multiplayerMenu.highlightButton(rightIntersects.button);
                    if (this.vrController.controllers[1].userData.isSelecting) {
                        this.multiplayerMenu.pressButton(rightIntersects.button);
                    }
                }
            }

            const prevBallZ = this.ball.getBall().position.z;
            const prevBallX = this.ball.getBall().position.x;

            if (!this.isGameStarted && this.isInVR) {
                const leftIntersects = this.startButton.checkIntersection(this.vrController.controllers[0]);
                const rightIntersects = this.startButton.checkIntersection(this.vrController.controllers[1]);
                
                if (leftIntersects || rightIntersects) {
                    this.startButton.highlight();
                    if (this.vrController.controllers[0].userData.isSelecting || 
                        this.vrController.controllers[1].userData.isSelecting) {
                        this.startButton.press();
                        
                        // Check if we're showing the multiplayer menu instead of starting
                        if (this.multiplayerManager.isConnected && !this.multiplayerManager.isInMultiplayerGame()) {
                            this.startButton.hide();
                            this.multiplayerMenu.show();
                        } else if (this.multiplayerManager.isInMultiplayerGame()) {
                            // If we're in a multiplayer game and we're the host, start the game
                            if (this.multiplayerManager.isHosting()) {
                                console.log("Host starting multiplayer game");
                                this.multiplayerManager.startGame();
                                this.startButton.hide();
                            } else {
                                this.showMessage("Waiting for host to start the game...");
                            }
                        } else {
                            // Start single player mode
                            this.isGameStarted = true;
                            // Reset scores when game starts
                            this.playerScore = 0;
                            this.aiScore = 0;
                            this.playerScoreDisplay.updateScore(0);
                            this.aiScoreDisplay.updateScore(0);
                            
                            // Add haptic feedback when pressing start
                            const session = this.renderer.xr.getSession();
                            if (session) {
                                session.inputSources.forEach(inputSource => {
                                    if (inputSource.handedness === 'right' && inputSource.gamepad?.hapticActuators?.[0]) {
                                        // Strong, short pulse for button press
                                        inputSource.gamepad.hapticActuators[0].pulse(1.0, 50);
                                    }
                                });
                            }
                            
                            this.ball.start();
                            this.timer.start();
                            // Start background music
                            if (this.soundManager) {
                                this.soundManager.startBackgroundMusic();
                            }
                            this.startButton.hide();
                        }
                    }
                } else {
                    this.startButton.unhighlight();
                }
            }

            if (this.isGameStarted) {
                // Update paddle position in network if in multiplayer mode
                if (this.isMultiplayer) {
                    // Send paddle position to other player
                    this.multiplayerManager.updatePaddlePosition(this.playerPaddle.getPosition());
                    
                    // If host, also send ball position updates
                    if (this.isLocalPlayer) {
                        this.multiplayerManager.updateBallPosition(
                            this.ball.getBall().position,
                            this.ball.ballVelocity
                        );
                    }
                }
                
                // In single player or if host in multiplayer, use AI paddle
                if (!this.isMultiplayer || this.isLocalPlayer) {
                    this.aiPaddle.updateAI(this.ball.getBall());
                }
                
                const collision = this.ball.update(delta, this.playerPaddle.getPaddle(), this.aiPaddle.getPaddle());
                
                // Update music speed based on ball speed
                if (this.isGameStarted && this.ball) {
                    const ballSpeed = Math.sqrt(
                        this.ball.ballVelocity.x * this.ball.ballVelocity.x + 
                        this.ball.ballVelocity.z * this.ball.ballVelocity.z
                    );
                    // Scale down the speed factor to make acceleration more gradual
                    const normalizedSpeed = 1.0 + (ballSpeed / this.ball.initialSpeed - 1.0) * 0.3; 
                    if (this.soundManager) {
                        this.soundManager.updateMusicSpeed(normalizedSpeed);
                    }
                }

                // Update timer
                if (this.timer && this.timer.update()) {
                    // Timer has finished
                    this.isGameStarted = false;
                    if (this.soundManager) {
                        this.soundManager.stopBackgroundMusic();
                    }
                    this.startButton.show();
                    this.ball.reset();
                }

                // Handle collisions
                if (collision === 'player') {
                    this.soundManager.playPaddleHit();
                    
                    // Send collision event in multiplayer mode
                    if (this.isMultiplayer && this.isLocalPlayer) {
                        this.multiplayerManager.sendCollisionEvent('paddle', this.ball.getBall().position);
                    }
                    
                    const session = this.renderer.xr.getSession();
                    if (session) {
                        session.inputSources.forEach(inputSource => {
                            if (inputSource.handedness === 'right' && inputSource.gamepad?.hapticActuators?.[0]) {
                                inputSource.gamepad.hapticActuators[0].pulse(1.0, 100);
                            }
                        });
                    }
                } else if (collision === 'ai') {
                    this.soundManager.playAIHit();
                    
                    // Send collision event in multiplayer mode
                    if (this.isMultiplayer && !this.isLocalPlayer) {
                        this.multiplayerManager.sendCollisionEvent('paddle', this.ball.getBall().position);
                    }
                    
                    const session = this.renderer.xr.getSession();
                    if (session) {
                        session.inputSources.forEach(inputSource => {
                            if (inputSource.handedness === 'right' && inputSource.gamepad?.hapticActuators?.[0]) {
                                inputSource.gamepad.hapticActuators[0].pulse(0.5, 50);
                            }
                        });
                    }
                } else if (collision === 'player_score' || collision === 'ai_score') {
                    // Stop music when ball goes out of bounds
                    this.soundManager.stopBackgroundMusic();
                    
                    if (collision === 'player_score') {
                        this.playerScore++;
                        this.playerScoreDisplay.updateScore(this.playerScore);
                        this.environment.flashRail('right');
                        
                        // Update score in multiplayer mode
                        if (this.isMultiplayer && this.isLocalPlayer) {
                            if (this.isLocalPlayer) {
                                this.multiplayerManager.updateScore(this.playerScore, this.aiScore);
                            } else {
                                this.multiplayerManager.updateScore(this.aiScore, this.playerScore);
                            }
                        }
                    } else {
                        this.aiScore++;
                        this.aiScoreDisplay.updateScore(this.aiScore);
                        this.environment.flashRail('left');
                        
                        // Update score in multiplayer mode
                        if (this.isMultiplayer && this.isLocalPlayer) {
                            if (this.isLocalPlayer) {
                                this.multiplayerManager.updateScore(this.playerScore, this.aiScore);
                            } else {
                                this.multiplayerManager.updateScore(this.aiScore, this.playerScore);
                            }
                        }
                    }

                    // Play out of bounds sound and trigger haptics
                    if (this.soundManager) {
                        this.soundManager.playLose();
                    }
                    
                    // Send collision event in multiplayer mode
                    if (this.isMultiplayer && this.isLocalPlayer) {
                        this.multiplayerManager.sendCollisionEvent('score', this.ball.getBall().position);
                    }
                    
                    const session = this.renderer.xr.getSession();
                    if (session) {
                        session.inputSources.forEach(inputSource => {
                            if (inputSource.handedness === 'right' && inputSource.gamepad?.hapticActuators?.[0]) {
                                inputSource.gamepad.hapticActuators[0].pulse(0.7, 100);
                            }
                        });
                    }
                    
                    // Restart ball and music after a short delay
                    setTimeout(() => {
                        if (this.isGameStarted) {
                            // Only host restarts the ball in multiplayer
                            if (!this.isMultiplayer || this.isLocalPlayer) {
                                this.ball.start();
                            }
                            if (this.soundManager) {
                                this.soundManager.startBackgroundMusic();
                            }
                        }
                    }, 1000);
                }

                // Handle wall collisions for audio
                const currentBallX = this.ball.getBall().position.x;
                const wallHitThreshold = 1.39; // Adjust based on your wall positioning
                
                // Check for wall collision and play sound
                if ((Math.abs(prevBallX) < wallHitThreshold && Math.abs(currentBallX) >= wallHitThreshold) ||
                    (Math.abs(prevBallX) >= wallHitThreshold && Math.abs(currentBallX) < wallHitThreshold)) {
                    this.soundManager.playWallHit();
                    
                    // Send collision event in multiplayer mode
                    if (this.isMultiplayer && this.isLocalPlayer) {
                        this.multiplayerManager.sendCollisionEvent('wall', this.ball.getBall().position);
                    }
                    
                    // Provide subtle haptic feedback for wall hits
                    const session = this.renderer.xr.getSession();
                    if (session) {
                        session.inputSources.forEach(inputSource => {
                            if (inputSource.gamepad?.hapticActuators?.[0]) {
                                inputSource.gamepad.hapticActuators[0].pulse(0.3, 30);
                            }
                        });
                    }
                }

                // Paddle-ball collision detection
                if (this.ball.checkPaddleCollision(this.playerPaddle)) {
                    if (this.multiplayerManager.isInMultiplayerGame() && !this.multiplayerManager.isHosting()) {
                        // If we're a guest, send the collision event
                        this.multiplayerManager.sendCollisionEvent('paddle', this.ball.getBall().position.clone());
                    }
                    if (this.soundManager) {
                        this.soundManager.playPaddleHit();
                    }
                }

                // AI paddle-ball collision detection
                if (this.ball.checkPaddleCollision(this.aiPaddle)) {
                    if (this.multiplayerManager.isInMultiplayerGame() && this.multiplayerManager.isHosting()) {
                        // If we're the host, send the collision event
                        this.multiplayerManager.sendCollisionEvent('paddle', this.ball.getBall().position.clone());
                    }
                    if (this.soundManager) {
                        this.soundManager.playAIHit();
                    }
                }

                // Check if ball is out of bounds and reset if needed
                const outOfBounds = this.ball.checkOutOfBounds();
                if (outOfBounds) {
                    this.isGameStarted = false;
                    if (this.soundManager) {
                        this.soundManager.stopBackgroundMusic();
                    }
                    
                    // Reset the ball
                    this.ball.reset();
                    
                    // Update score based on which side the ball went out
                    if (outOfBounds === 'player_score') {
                        this.playerScore++;
                        this.playerScoreDisplay.updateScore(this.playerScore);
                        this.environment.flashRail('right');
                        
                        // Update score in multiplayer mode
                        if (this.isMultiplayer && this.isLocalPlayer) {
                            if (this.isLocalPlayer) {
                                this.multiplayerManager.updateScore(this.playerScore, this.aiScore);
                            } else {
                                this.multiplayerManager.updateScore(this.aiScore, this.playerScore);
                            }
                        }
                    } else {
                        this.aiScore++;
                        this.aiScoreDisplay.updateScore(this.aiScore);
                        this.environment.flashRail('left');
                        
                        // Update score in multiplayer mode
                        if (this.isMultiplayer && this.isLocalPlayer) {
                            if (this.isLocalPlayer) {
                                this.multiplayerManager.updateScore(this.playerScore, this.aiScore);
                            } else {
                                this.multiplayerManager.updateScore(this.aiScore, this.playerScore);
                            }
                        }
                    }

                    // Play out of bounds sound and trigger haptics
                    if (this.soundManager) {
                        this.soundManager.playLose();
                    }
                    
                    // Send collision event in multiplayer mode
                    if (this.isMultiplayer && this.isLocalPlayer) {
                        this.multiplayerManager.sendCollisionEvent('score', this.ball.getBall().position);
                    }
                    
                    const session = this.renderer.xr.getSession();
                    if (session) {
                        session.inputSources.forEach(inputSource => {
                            if (inputSource.handedness === 'right' && inputSource.gamepad?.hapticActuators?.[0]) {
                                inputSource.gamepad.hapticActuators[0].pulse(0.7, 100);
                            }
                        });
                    }
                    
                    // Restart ball and music after a short delay
                    setTimeout(() => {
                        if (this.isGameStarted) {
                            // Only host restarts the ball in multiplayer
                            if (!this.isMultiplayer || this.isLocalPlayer) {
                                this.ball.start();
                            }
                            if (this.soundManager) {
                                this.soundManager.startBackgroundMusic();
                            }
                        }
                    }, 1000);
                }
            }

            this.renderer.render(this.scene, this.camera);
        });
    }
}
