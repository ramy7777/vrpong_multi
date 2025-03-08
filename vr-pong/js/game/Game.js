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
import { TimerDisplay } from '../ui/TimerDisplay.js';
import { MultiplayerMenu } from '../ui/MultiplayerMenu.js';
import { MultiplayerManager } from '../network/MultiplayerManager.js';
import { RestartButton } from '../ui/RestartButton.js';
import { FinalScoreDisplay } from '../ui/FinalScoreDisplay.js';
import { HeadModel } from '../player/HeadModel.js';
import { HandModel } from '../player/HandModel.js';
import { MobileController } from '../controllers/MobileController.js';

export class Game {
    constructor() {
        // Initialize Three.js scene and renderer
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.shadowMap.enabled = true;
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.xr.enabled = true;
        document.body.appendChild(this.renderer.domElement);
        this.clock = new THREE.Clock();
        
        // Add event emitter functionality
        this.eventListeners = {};
        
        // Create a group for the player (camera + controllers)
        this.playerGroup = new THREE.Group();
        this.scene.add(this.playerGroup);
        
        // Game state
        this.isGameStarted = false;
        this.isInVR = false;
        this.isMultiplayer = false;
        this.isLocalPlayer = true; // By default, we're the local player
        this.playerId = Math.random().toString(36).substring(2, 15); // Generate a random ID
        
        // Desktop controls
        this.desktopControls = {
            keys: {
                'ArrowLeft': false,
                'ArrowRight': false,
                'ArrowUp': false,
                'ArrowDown': false,
                'a': false,
                'd': false,
                'w': false,
                's': false,
                ' ': false
            },
            mouseX: 0,
            mouseY: 0,
            isMouseDown: false,
            isRightMouseDown: false,
            lastMouseX: 0,
            lastMouseY: 0
        };
        
        // Initialize controllers
        this.vrController = null;
        this.mobileController = null;
        
        // Initialize game elements
        this.environment = null;
        this.playerPaddle = null;
        this.aiPaddle = null;
        this.ball = null;
        this.paddles = [];
        
        // Initialize UI elements
        this.startButton = null;
        this.scoreDisplay = null;
        this.timer = null;
        this.timerDisplay = null;
        this.multiplayerMenu = null;
        this.restartButton = null;
        this.finalScoreDisplay = null;
        
        // Initialize multiplayer manager
        this.multiplayerManager = new MultiplayerManager(this);
        
        // Initialize the game
        this.init();
        this.createGameElements();
        this.setupVR();
        this.setupDesktopControls();
        
        // Set up multiplayer menu callbacks (will create the menu)
        this.setupMultiplayerCallbacks();
        
        // Initialize mobile controller if needed
        this.detectAndSetupMobileControls();
        
        this.animate();
    }

    init() {
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.xr.enabled = true;
        document.body.appendChild(this.renderer.domElement);
        
        // Check if we're on a mobile device
        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        
        // Only add VR button if not on mobile
        if (!isMobile) {
            const vrButton = VRButton.createButton(this.renderer);
            document.body.appendChild(vrButton);
        } else {
            console.log("Mobile device detected, VR button hidden");
        }

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
        // Define a standard floor height for VR
        const floorHeight = 0.1; // Lowered by 1.5 units from previous value (1.6)
        
        this.renderer.xr.addEventListener('sessionstart', () => {
            console.log('Setting up VR session');
            
            // Create player head model for VR
            this.createPlayerHead();
            
            // Create player hand models for VR
            this.createPlayerHands();
            
            // Ensure the camera is in the playerGroup for locomotion
            if (!this.playerGroup.children.includes(this.camera)) {
                // Reset position for VR
                this.camera.position.set(0, 0, 0);
                
                // Remove camera from scene if it's there
                this.scene.remove(this.camera);
                
                // Add camera to player group
                this.playerGroup.add(this.camera);
                
                // Position the player group for good initial view
                // X and Z position the player in the play area, Y sets the floor height
                this.playerGroup.position.set(0, floorHeight, 0.8); 
                
                // Set player rotation to make them face the table
                // If player is facing opposite direction, we need to face them toward -Z
                this.playerGroup.rotation.y = 0; // No rotation needed to face the table
                
                console.log('Camera attached to player group for VR locomotion facing the table');
            }

            // In VR, we need to create our controller helpers
            if (!this.vrController) {
                this.vrController = new VRController(this.renderer, this.playerGroup);
            }
            
            // Store initial Y position to help maintain consistent floor height
            this.initialFloorHeight = this.playerGroup.position.y;
        });
        
        // Set session end event to restore desktop view
        this.renderer.xr.addEventListener('sessionend', () => {
            console.log('VR session ended, restoring desktop view');
            
            // Restore desktop camera setup when exiting VR
            this.playerGroup.remove(this.camera);
            this.scene.add(this.camera);
            
            // Restore desktop camera position and orientation
            this.camera.position.set(0, 1.7, 0.8);
            this.camera.lookAt(0, 0.9, -1.0);
        });
    }

    setupMultiplayerCallbacks() {
        this.multiplayerMenu = new MultiplayerMenu(this.scene);
        
        // Set up the callbacks for the multiplayer menu buttons
        this.multiplayerMenu.setCallbacks({
            onSinglePlayer: () => {
                console.log("Starting single player game...");
                this.multiplayerMenu.hide();
                
                // Reset existing game state
                this.resetGame();
                
                // Start a single player game against AI
                this.isMultiplayer = false;
                this.isGameStarted = true;
                
                // Reset scores
                this.playerScore = 0;
                this.aiScore = 0;
                this.playerScoreDisplay.updateScore(0);
                this.aiScoreDisplay.updateScore(0);
                
                // Make sure the AI paddle is positioned correctly
                this.aiPaddle.getPaddle().position.z = -1.9;
                this.playerPaddle.getPaddle().position.z = -0.1;
                
                // Hide the start button
                this.startButton.hide();
                
                // Start game directly
                this.ball.start();
                this.timer.start();
                if (this.soundManager) {
                    this.soundManager.startBackgroundMusic();
                }
                
                this.showMessage('Single Player Game Started!');
            },
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
        window.addEventListener('mousedown', (event) => {
            if (event.button === 0) { // Left mouse button
                this.desktopControls.isMouseDown = true;
            } else if (event.button === 2) { // Right mouse button
                this.desktopControls.isRightMouseDown = true;
                this.desktopControls.lastMouseX = event.clientX;
                this.desktopControls.lastMouseY = event.clientY;
            }
        });

        window.addEventListener('mouseup', (event) => {
            if (event.button === 0) { // Left mouse button
                this.desktopControls.isMouseDown = false;
            } else if (event.button === 2) { // Right mouse button
                this.desktopControls.isRightMouseDown = false;
            }
        });
        
        // Track mouse position for desktop paddle control
        window.addEventListener('mousemove', (event) => {
            // Convert mouse position to normalized coordinates (-1 to 1)
            this.desktopControls.mouseX = (event.clientX / window.innerWidth) * 2 - 1;
            this.desktopControls.mouseY = -(event.clientY / window.innerHeight) * 2 + 1;
            
            // Handle camera rotation with right mouse button
            if (this.desktopControls.isRightMouseDown) {
                const deltaX = event.clientX - this.desktopControls.lastMouseX;
                const deltaY = event.clientY - this.desktopControls.lastMouseY;
                
                // Rotate camera based on mouse movement
                this.camera.rotation.y -= deltaX * 0.01;
                this.camera.rotation.x -= deltaY * 0.01;
                
                // Clamp vertical rotation to prevent flipping
                this.camera.rotation.x = Math.max(-Math.PI / 3, Math.min(Math.PI / 3, this.camera.rotation.x));
                
                // Update last mouse position
                this.desktopControls.lastMouseX = event.clientX;
                this.desktopControls.lastMouseY = event.clientY;
            }
            
            // Handle mouse hover for multiplayer menu buttons in desktop mode
            if (!this.isInVR && this.multiplayerMenu && this.multiplayerMenu.isVisible) {
                // Get the current mouse coordinates
                const mouseX = this.desktopControls.mouseX;
                const mouseY = this.desktopControls.mouseY;
                
                // Create a raycaster and check for intersections
                const hoverIntersect = this.multiplayerMenu.checkMouseIntersection(mouseX, mouseY, this.camera);
                
                if (hoverIntersect) {
                    this.multiplayerMenu.highlightButton(hoverIntersect.button);
                } else {
                    // Unhighlight current button if mouse is no longer over any button
                    ['singleplayer', 'host', 'join', 'back'].forEach(buttonKey => {
                        this.multiplayerMenu.unhighlightButton(buttonKey);
                    });
                }
            }
            
            // Handle mouse hover for start button in desktop mode
            if (!this.isInVR && !this.isGameStarted && this.startButton && this.startButton.getMesh().visible) {
                const raycaster = new THREE.Raycaster();
                const mouse = new THREE.Vector2(this.desktopControls.mouseX, this.desktopControls.mouseY);
                
                raycaster.setFromCamera(mouse, this.camera);
                
                const startButtonIntersects = raycaster.intersectObject(this.startButton.getMesh(), true);
                if (startButtonIntersects.length > 0) {
                    this.startButton.highlight();
                } else {
                    this.startButton.unhighlight();
                }
            }
            
            // Handle mouse hover for restart button in desktop mode
            if (!this.isInVR && this.gameOver && this.restartButton && this.restartButton.isVisible()) {
                const raycaster = new THREE.Raycaster();
                const mouse = new THREE.Vector2(this.desktopControls.mouseX, this.desktopControls.mouseY);
                
                raycaster.setFromCamera(mouse, this.camera);
                
                const restartButtonIntersects = raycaster.intersectObject(this.restartButton.getMesh(), true);
                if (restartButtonIntersects.length > 0) {
                    this.restartButton.highlight();
                } else {
                    this.restartButton.unhighlight();
                }
            }
        });

        // Prevent context menu on right-click
        window.addEventListener('contextmenu', (event) => {
            event.preventDefault();
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
                        // Button press is now handled in the StartButton.press() method
                        // which includes cooldown and automatic unhighlight
                        this.startButton.press();
                        
                        // Log button press time for debugging
                        console.log(`Start button pressed at ${Date.now()}`);
                        
                        // Proceed with game logic after successful press
                        if (this.multiplayerManager.isConnected) {
                            // Only show multiplayer menu if not already in a multiplayer game
                            if (!this.multiplayerManager.isInMultiplayerGame()) {
                                console.log('Showing multiplayer menu');
                                this.startButton.hide();
                                this.multiplayerMenu.show();
                            } else if (this.multiplayerManager.isHosting()) {
                                // If already hosting, start the game
                                console.log("Already hosting, starting the game");
                                this.multiplayerManager.startGame();
                            }
                        } else {
                            console.log('Starting single player game');
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
                
                // Check restart button intersection when game is over
                if (this.gameOver && this.restartButton && this.restartButton.isVisible()) {
                    const restartButtonIntersects = raycaster.intersectObject(this.restartButton.getMesh(), true);
                    if (restartButtonIntersects.length > 0) {
                        if (this.restartButton.press()) {
                            console.log("Restart button pressed - restarting game");
                            
                            // Play sound if available
                            if (this.soundManager) {
                                this.soundManager.playPaddleHit(); // Using an existing sound
                            }
                            
                            // For multiplayer games, use the MultiplayerManager to restart
                            if (this.isMultiplayer && this.multiplayerManager) {
                                console.log("Using MultiplayerManager to restart the game");
                                
                                // Hide UI locally immediately for better user feedback
                                this.finalScoreDisplay.hide();
                                this.restartButton.hide();
                                
                                // Send restart request to server via MultiplayerManager
                                const restartSent = this.multiplayerManager.restartGame();
                                
                                if (restartSent) {
                                    this.showMessage("Restarting game for all players...", 3000);
                                } else {
                                    // If restart failed, show error message
                                    this.showMessage("Failed to restart the game!", 3000);
                                    
                                    // Show the UI elements again 
                                    this.finalScoreDisplay.show(this.playerScore, this.aiScore);
                                    this.restartButton.show();
                                }
                            } else {
                                // For single player, reset and start locally
                                this.finalScoreDisplay.hide();
                                this.restartButton.hide();
                                this.resetGame();
                                this.startGame();
                            }
                        }
                    }
                }
                
                // Check multiplayer menu button intersections
                if (this.multiplayerMenu.isVisible) {
                    const singleplayerIntersects = raycaster.intersectObject(this.multiplayerMenu.buttons.singleplayer, true);
                    const hostIntersects = raycaster.intersectObject(this.multiplayerMenu.buttons.host, true);
                    const joinIntersects = raycaster.intersectObject(this.multiplayerMenu.buttons.join, true);
                    const backIntersects = raycaster.intersectObject(this.multiplayerMenu.buttons.back, true);
                    
                    if (singleplayerIntersects.length > 0) {
                        this.multiplayerMenu.pressButton('singleplayer');
                    } else if (hostIntersects.length > 0) {
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
        
        // Initialize the restart button (initially hidden)
        this.restartButton = new RestartButton(this.scene);
        
        // Initialize the final score display (initially hidden)
        this.finalScoreDisplay = new FinalScoreDisplay(this.scene);
        
        // Initialize game timer
        this.timer = new Timer(this.scene, 150); // 2 minutes and 30 seconds
        
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
        
        // Add timer displays above both score displays
        this.playerTimerDisplay = new TimerDisplay(
            this.scene,
            new THREE.Vector3(1.90, 2.2, -1),  // Above player score on right wall
            new THREE.Euler(0, -Math.PI / 2, 0)
        );
        
        this.aiTimerDisplay = new TimerDisplay(
            this.scene,
            new THREE.Vector3(-1.90, 2.2, -1),  // Above AI score on left wall
            new THREE.Euler(0, Math.PI / 2, 0)
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

        // Create remote controller visualizations for multiplayer
        this.createRemoteControllerVisuals();
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
            // Always show the local player's score as "YOU" and the remote player's as "OPPONENT"
            // regardless of whether they're host or guest
            this.playerScoreDisplay.updateLabel('YOU');
            this.aiScoreDisplay.updateLabel('OPPONENT');
        } else {
            this.playerScoreDisplay.updateLabel('PONG MASTER');
            this.aiScoreDisplay.updateScore(0);
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
        
        // Setup our player ID - using isHost as an indicator
        this.playerId = isHost ? 'host-player' : 'guest-player';
        
        // IMPORTANT: Create two independent paddles
        // Remove existing paddles if they exist
        if (this.playerPaddle && this.playerPaddle.getPaddle()) {
            this.scene.remove(this.playerPaddle.getPaddle());
        }
        if (this.aiPaddle && this.aiPaddle.getPaddle()) {
            this.scene.remove(this.aiPaddle.getPaddle());
        }
        
        // Create new paddles with correct indices
        // Both players start at the same position with both paddles available
        this.paddles = [
            new Paddle(this.scene, false, 0), // Near paddle (player side)
            new Paddle(this.scene, false, 1)  // Far paddle (opponent side)
        ];
        
        // For backward compatibility, maintain the old paddle references
        this.playerPaddle = this.paddles[0];
        this.aiPaddle = this.paddles[1];
        
        console.log(`Created two independent paddles at positions: Near(${this.paddles[0].getPaddle().position.z}), Far(${this.paddles[1].getPaddle().position.z})`);
        
        // Show a message about picking paddles
        this.showMessage('Game started! Grab a paddle to claim it.', 5000);
        
        // Start the ball if we're the host
        if (isHost) {
            this.ball.start();
        }
        
        // Start the timer and music
        if (this.timer) {
            this.timer.start();
            
            // Initialize timer displays with the current time
            if (this.playerTimerDisplay) this.playerTimerDisplay.updateTime(this.timer.timeLeft);
            if (this.aiTimerDisplay) this.aiTimerDisplay.updateTime(this.timer.timeLeft);
        }
        
        if (this.soundManager) {
            this.soundManager.startBackgroundMusic();
        }
        
        // Add haptic feedback when game starts
        const session = this.renderer.xr.getSession();
        if (session) {
            for (let i = 0; i < session.inputSources.length; i++) {
                const inputSource = session.inputSources[i];
                if (inputSource.gamepad && inputSource.gamepad.hapticActuators) {
                    inputSource.gamepad.hapticActuators[0].pulse(1.0, 100);
                }
            }
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

    updateRemotePaddlePosition(position, isHostPaddle, paddleIndex = null) {
        // If we have a specific paddle index, use that
        if (paddleIndex !== null && this.paddles && this.paddles.length > paddleIndex) {
            const targetPaddle = this.paddles[paddleIndex];
            
            // Only update X and Y positions, preserve Z position
            const currentPos = targetPaddle.getPaddle().position.clone();
            targetPaddle.getPaddle().position.set(position.x, position.y, currentPos.z);
            
            // console.log(`Remote paddle ${paddleIndex} updated: (${position.x.toFixed(2)}, ${position.y.toFixed(2)}, ${currentPos.z.toFixed(2)})`);
            return;
        }
        
        // Backward compatibility - determine paddle based on host/guest status
        const targetPaddle = isHostPaddle ? 
            (this.isLocalPlayer ? this.playerPaddle : this.aiPaddle) :
            (this.isLocalPlayer ? this.aiPaddle : this.playerPaddle);
        
        // console.log(`Remote paddle update: ${isHostPaddle ? 'Host' : 'Guest'} paddle position before: ${JSON.stringify({
        //     x: targetPaddle.getPaddle().position.x,
        //     y: targetPaddle.getPaddle().position.y,
        //     z: targetPaddle.getPaddle().position.z
        // })}`);
        
        // Only update X and Y positions, preserve Z position
        const currentPos = targetPaddle.getPaddle().position.clone();
        targetPaddle.getPaddle().position.set(position.x, position.y, currentPos.z);
        
        // console.log(`Remote paddle update: ${isHostPaddle ? 'Host' : 'Guest'} paddle position after: ${JSON.stringify({
        //     x: targetPaddle.getPaddle().position.x,
        //     y: targetPaddle.getPaddle().position.y,
        //     z: targetPaddle.getPaddle().position.z
        // })}`);
    }

    updateRemoteBallPosition(position, velocity) {
        // Only non-host should update ball position from network
        if (!this.isLocalPlayer) {
            this.ball.getBall().position.copy(position);
            this.ball.ballVelocity.copy(velocity);
        }
    }

    updateRemoteScore(hostScore, guestScore) {
        // Determine which score belongs to the local player based on their role
        let localPlayerScore, remotePlayerScore;
        
        if (this.isLocalPlayer) {  // If local player is host
            localPlayerScore = hostScore;
            remotePlayerScore = guestScore;
        } else {  // If local player is guest
            localPlayerScore = guestScore;
            remotePlayerScore = hostScore;
        }
        
        // Update the internal score variables for consistency with the rest of the code
        this.playerScore = localPlayerScore;
        this.aiScore = remotePlayerScore;
        
        // Update the score displays
        // playerScoreDisplay always shows the local player's score (YOU)
        // aiScoreDisplay always shows the remote player's score (OPPONENT)
        this.playerScoreDisplay.updateScore(localPlayerScore);
        this.aiScoreDisplay.updateScore(remotePlayerScore);
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
                // Updated to pass both paddles to the controller
                this.vrController.checkControllerState(
                    this.vrController.controllers[0],
                    'left',
                    this.paddles,
                    this.playerId,
                    this.isLocalPlayer  // isHost
                );
                this.vrController.checkControllerState(
                    this.vrController.controllers[1],
                    'right',
                    this.paddles,
                    this.playerId,
                    this.isLocalPlayer  // isHost
                );
                
                // Update the player's head position to match the camera
                if (this.playerHead && this.camera) {
                    const headPosition = new THREE.Vector3();
                    const headRotation = new THREE.Quaternion();
                    
                    // Get the XR camera and its position
                    if (this.renderer.xr.isPresenting) {
                        // The camera is in the player group, so its world position already includes
                        // any movement from the thumbstick locomotion
                        this.camera.getWorldPosition(headPosition);
                        this.camera.getWorldQuaternion(headRotation);
                        
                        // Set the player head to match the camera's world position
                        this.playerHead.updatePosition(headPosition, headRotation);
                    }
                }
                
                // Update player hand positions to match controllers
                if (this.playerHands) {
                    // Left hand
                    if (this.playerHands.left && this.vrController.controllers[0]) {
                        const handPosition = new THREE.Vector3();
                        const handRotation = new THREE.Quaternion();
                        
                        this.vrController.controllers[0].getWorldPosition(handPosition);
                        this.vrController.controllers[0].getWorldQuaternion(handRotation);
                        
                        this.playerHands.left.updatePosition(handPosition, handRotation);
                    }
                    
                    // Right hand
                    if (this.playerHands.right && this.vrController.controllers[1]) {
                        const handPosition = new THREE.Vector3();
                        const handRotation = new THREE.Quaternion();
                        
                        this.vrController.controllers[1].getWorldPosition(handPosition);
                        this.vrController.controllers[1].getWorldQuaternion(handRotation);
                        
                        this.playerHands.right.updatePosition(handPosition, handRotation);
                    }
                }
                
                // Send VR controller data over the network in multiplayer mode
                if (this.isMultiplayer && this.multiplayerManager && this.multiplayerManager.isMultiplayerActive) {
                    this.multiplayerManager.updateControllerData(
                        this.vrController.controllers[0],
                        this.vrController.controllers[1]
                    );
                }
            }

            // Handle desktop controls when not in VR
            if (!this.isInVR && this.isGameStarted) {
                // Find the paddle that belongs to this player in desktop mode
                const ownedPaddle = this.paddles ? this.paddles.find(p => p.isOwnedBy(this.playerId)) : null;
                // If no paddle is owned, try to claim paddle 0 in desktop mode
                if (!ownedPaddle && this.paddles && this.paddles.length > 0) {
                    this.paddles[0].claimOwnership(this.playerId, this.isLocalPlayer);
                }
                
                // Use the owned paddle or fallback to player paddle
                const paddle = ownedPaddle ? ownedPaddle.getPaddle() : this.playerPaddle.getPaddle();
                
                // Handle keyboard paddle movement
                const paddleSpeed = 0.02;
                
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
                // Find the owned paddle or use playerPaddle as fallback
                const ownedPaddle = this.paddles ? this.paddles.find(p => p.isOwnedBy(this.playerId)) : null;
                const paddle = ownedPaddle ? ownedPaddle.getPaddle() : this.playerPaddle.getPaddle();
                
                const paddleX = THREE.MathUtils.clamp(this.desktopControls.mouseX * 1.2, -0.6, 0.6);
                paddle.position.x = paddleX;
            }

            // Update mobile controller if available
            if (this.mobileController) {
                this.mobileController.update();
            }

            // For VR mode, ensure controller inputs are properly handled
            if (this.isInVR && this.vrController) {
                const session = this.renderer.xr.getSession();
                if (session) {
                    // Check for input sources and their gamepads
                    for (let i = 0; i < session.inputSources.length; i++) {
                        const inputSource = session.inputSources[i];
                        if (inputSource.gamepad) {
                            const handedness = inputSource.handedness;
                            const controller = handedness === 'left' ? 
                                this.vrController.controllers[0] : 
                                this.vrController.controllers[1];
                            
                            // Ensure controller movement is checked regardless of paddle interaction
                            const side = handedness === 'left' ? 'left' : 'right';
                            this.vrController.checkControllerState(
                                controller,
                                side,
                                this.playerPaddle.getPaddle()
                            );
                        }
                    }
                    
                    // Ensure player stays at the correct floor height
                    if (this.initialFloorHeight !== undefined) {
                        // Smoothly correct any vertical drift
                        const currentY = this.playerGroup.position.y;
                        const targetY = this.initialFloorHeight;
                        if (Math.abs(currentY - targetY) > 0.01) {
                            // Apply a small correction to gradually bring player back to floor level
                            this.playerGroup.position.y = THREE.MathUtils.lerp(
                                currentY, 
                                targetY, 
                                0.1 // Smooth correction factor
                            );
                        }
                    }
                }
            }
                
            // Handle multiplayer menu interactions
            if (this.multiplayerMenu.isVisible && this.isInVR) {
                const leftIntersects = this.multiplayerMenu.checkIntersection(this.vrController.controllers[0]);
                const rightIntersects = this.multiplayerMenu.checkIntersection(this.vrController.controllers[1]);
                
                // Unhighlight all buttons first
                ['singleplayer', 'host', 'join', 'back'].forEach(buttonKey => {
                    this.multiplayerMenu.unhighlightButton(buttonKey);
                });
                
                if (leftIntersects) {
                    this.multiplayerMenu.highlightButton(leftIntersects.button);
                    // Only process button press on the initial press event, not while holding
                    if (this.vrController.controllers[0].userData.isSelecting && 
                        this.vrController.controllers[0].userData.isNewPress) {
                        console.log(`VR multiplayer menu button press: ${leftIntersects.button}`);
                        this.multiplayerMenu.pressButton(leftIntersects.button);
                    }
                }
                
                if (rightIntersects) {
                    this.multiplayerMenu.highlightButton(rightIntersects.button);
                    // Only process button press on the initial press event, not while holding
                    if (this.vrController.controllers[1].userData.isSelecting && 
                        this.vrController.controllers[1].userData.isNewPress) {
                        console.log(`VR multiplayer menu button press: ${rightIntersects.button}`);
                        this.multiplayerMenu.pressButton(rightIntersects.button);
                    }
                }
            }

            // Get previous ball position for physics/sound calculations
            const prevBallZ = this.ball ? this.ball.getBall().position.z : 0;
            const prevBallX = this.ball ? this.ball.getBall().position.x : 0;

            if (!this.isGameStarted && this.isInVR) {
                const leftIntersects = this.startButton.checkIntersection(this.vrController.controllers[0]);
                const rightIntersects = this.startButton.checkIntersection(this.vrController.controllers[1]);
                
                // Add debug logging for intersections
                if (leftIntersects || rightIntersects) {
                    console.log(`VR controller intersecting start button: Left: ${leftIntersects ? 'YES' : 'NO'}, Right: ${rightIntersects ? 'YES' : 'NO'}`);
                    console.log(`Left controller selecting: ${this.vrController.controllers[0].userData.isSelecting}, Right controller selecting: ${this.vrController.controllers[1].userData.isSelecting}`);
                    console.log(`Left controller isNewPress: ${this.vrController.controllers[0].userData.isNewPress}, Right controller isNewPress: ${this.vrController.controllers[1].userData.isNewPress}`);
                
                    this.startButton.highlight();
                    
                    // Only process button press on the initial press event, not while holding
                    const leftIsNewPress = leftIntersects && this.vrController.controllers[0].userData.isSelecting && this.vrController.controllers[0].userData.isNewPress;
                    const rightIsNewPress = rightIntersects && this.vrController.controllers[1].userData.isSelecting && this.vrController.controllers[1].userData.isNewPress;
                    
                    if (leftIsNewPress || rightIsNewPress) {
                        console.log(`New VR button press detected: Left=${leftIsNewPress}, Right=${rightIsNewPress}`);
                        
                        // The press method now handles the cooldown
                        console.log(`Attempting to press start button at ${Date.now()}`);
                        const pressResult = this.startButton.press();
                        console.log(`Start button press result: ${pressResult ? 'PRESSED' : 'IGNORED (cooldown)'}`);
                        
                        // Store which controller pressed the button
                        if (pressResult) {
                            this.lastButtonPressController = leftIsNewPress ? this.vrController.controllers[0] : this.vrController.controllers[1];
                            this.lastButtonPressTime = Date.now();
                            
                            // Log button press time for debugging
                            console.log(`VR start button pressed at ${this.lastButtonPressTime} by ${leftIsNewPress ? 'LEFT' : 'RIGHT'} controller`);
                            
                            // Schedule a delayed action to check for button release before showing menu
                            setTimeout(() => {
                                // Only proceed if the controller has been fully released
                                if (this.vrController.hasBeenReleasedSince(this.lastButtonPressController, this.lastButtonPressTime)) {
                                    console.log("Controller has been released since button press, safe to proceed");
                                    
                                    // Check if we're showing the multiplayer menu instead of starting
                                    if (this.multiplayerManager.isConnected && !this.multiplayerManager.isInMultiplayerGame()) {
                                        console.log('Showing multiplayer menu in VR');
                                        this.startButton.hide();
                                        this.multiplayerMenu.show();
                                    } else if (this.multiplayerManager.isInMultiplayerGame()) {
                                        // If we're in a multiplayer game and we're the host, start the game
                                        console.log(`Multiplayer game status - isHosting: ${this.multiplayerManager.isHosting()}`);
                                        if (this.multiplayerManager.isHosting()) {
                                            console.log("Host starting multiplayer game");
                                            this.multiplayerManager.startGame();
                                            this.startButton.hide();
                                        } else {
                                            console.log("Player is waiting for host to start game");
                                            this.showMessage("Waiting for host to start the game...");
                                        }
                                    } else {
                                        console.log('Starting single player game in VR');
                                        console.log(`Game state before starting: isGameStarted=${this.isGameStarted}, isGamePaused=${this.isGamePaused}`);
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
                                        console.log(`Game state after starting: isGameStarted=${this.isGameStarted}, isGamePaused=${this.isGamePaused}`);
                                    }
                                } else {
                                    console.log("Controller has NOT been released since button press, waiting for release");
                                }
                            }, 300);
                        }
                    }
                } else {
                    // Unhighlight when not intersecting
                    this.startButton.unhighlight();
                }
            }

            // Handle restart button interaction when game is over
            if (this.gameOver && this.restartButton && this.restartButton.isVisible() && this.isInVR) {
                const leftIntersects = this.restartButton.checkIntersection(this.vrController.controllers[0]);
                const rightIntersects = this.restartButton.checkIntersection(this.vrController.controllers[1]);
                
                if (leftIntersects || rightIntersects) {
                    console.log(`VR controller intersecting restart button: Left: ${leftIntersects ? 'YES' : 'NO'}, Right: ${rightIntersects ? 'YES' : 'NO'}`);
                    
                    this.restartButton.highlight();
                    
                    // Only process button press on the initial press event
                    const leftIsNewPress = leftIntersects && this.vrController.controllers[0].userData.isSelecting && this.vrController.controllers[0].userData.isNewPress;
                    const rightIsNewPress = rightIntersects && this.vrController.controllers[1].userData.isSelecting && this.vrController.controllers[1].userData.isNewPress;
                    
                    if (leftIsNewPress || rightIsNewPress) {
                        if (this.restartButton.press()) {
                            console.log("Restart button pressed - restarting game");
                            
                            // Play sound if available
                            if (this.soundManager) {
                                this.soundManager.playPaddleHit(); // Using an existing sound
                            }
                            
                            // For multiplayer games, use the MultiplayerManager to restart
                            if (this.isMultiplayer && this.multiplayerManager) {
                                console.log("Using MultiplayerManager to restart the game");
                                
                                // Hide UI locally immediately for better user feedback
                                this.finalScoreDisplay.hide();
                                this.restartButton.hide();
                                
                                // Send restart request to server via MultiplayerManager
                                const restartSent = this.multiplayerManager.restartGame();
                                
                                if (restartSent) {
                                    this.showMessage("Restarting game for all players...", 3000);
                                } else {
                                    // If restart failed, show error message
                                    this.showMessage("Failed to restart the game!", 3000);
                                    
                                    // Show the UI elements again 
                                    this.finalScoreDisplay.show(this.playerScore, this.aiScore);
                                    this.restartButton.show();
                                }
                            } else {
                                // For single player, reset and start locally
                                this.finalScoreDisplay.hide();
                                this.restartButton.hide();
                                this.resetGame();
                                this.startGame();
                            }
                        }
                    }
                } else {
                    this.restartButton.unhighlight();
                }
            }

            if (this.isGameStarted) {
                // Update the timer if the game is active
                if (!this.isGamePaused) {
                    const timerFinished = this.timer.update();
                    
                    // Update the timer displays with current time remaining
                    if (this.playerTimerDisplay && this.aiTimerDisplay) {
                        this.playerTimerDisplay.updateTime(this.timer.timeLeft);
                        this.aiTimerDisplay.updateTime(this.timer.timeLeft);
                    }
                    
                    // Check if timer has finished and game is not already over
                    if (timerFinished && !this.gameOver) {
                        this.handleGameOver();
                    }
                    
                    // Only update ball movement if the game is not over
                    if (!this.gameOver) {
                        // Update ball movement
                        const collision = this.ball.update(this.clock.getDelta(), this.playerPaddle, this.aiPaddle);
                        
                        // Handle collisions and scoring
                        if (collision === 'player' || collision === 'ai') {
                            // Play sound and trigger haptics for paddle hits
                            if (this.soundManager) {
                                this.soundManager.playPaddleHit();
                            }
                            this.triggerPaddleHaptics(0.7, 50);
                            
                            // Emit paddle hit event for haptic feedback on mobile
                            this.emit('paddleHit', { side: collision });
                        } else if (collision === 'wall') {
                            // Play wall bounce sound
                            if (this.soundManager) {
                                this.soundManager.playWallBounce();
                            }
                            
                            // Emit wall hit event for haptic feedback on mobile
                            this.emit('wallHit', { position: 'wall' });
                        } else if (collision === 'player_score') {
                            // AI scored
                            this.aiScore++;
                            this.aiScoreDisplay.updateScore(this.aiScore);
                            if (this.soundManager) {
                                this.soundManager.playScore();
                            }
                            
                            // Emit score event for haptic feedback
                            this.emit('score', { side: 'ai' });
                            
                            // Sync scores in multiplayer mode
                            if (this.isMultiplayer && this.multiplayerManager && this.isLocalPlayer) {
                                this.multiplayerManager.updateScore(this.playerScore, this.aiScore);
                            }
                            
                            // Start the ball again after short delay
                            setTimeout(() => {
                                if (this.isGameStarted && !this.isGamePaused && !this.gameOver) {
                                    this.ball.start();
                                }
                            }, 1000);
                        } else if (collision === 'ai_score') {
                            // Player scored
                            this.playerScore++;
                            this.playerScoreDisplay.updateScore(this.playerScore);
                            if (this.soundManager) {
                                this.soundManager.playScore();
                            }
                            
                            // Emit score event for haptic feedback
                            this.emit('score', { side: 'player' });
                            
                            // Sync scores in multiplayer mode
                            if (this.isMultiplayer && this.multiplayerManager && this.isLocalPlayer) {
                                this.multiplayerManager.updateScore(this.playerScore, this.aiScore);
                            }
                            
                            // Start the ball again after short delay
                            setTimeout(() => {
                                if (this.isGameStarted && !this.isGamePaused && !this.gameOver) {
                                    this.ball.start();
                                }
                            }, 1000);
                        }

                        // Handle paddle collision
                        if (collision === 'paddle') {
                            // Play paddle hit sound
                            if (this.soundManager) {
                                this.soundManager.playPaddleHit();
                            }
                            
                            // Emit paddle hit event for haptic feedback
                            this.emit('paddleHit', { position: collision });
                            
                            // Trigger haptic feedback for the player's paddle
                            if (this.isInVR && collision === this.paddles[0]) {
                                this.triggerPaddleHaptics();
                            }
                            
                            // Send collision event in multiplayer
                            if (this.isMultiplayer && this.multiplayerManager) {
                                this.multiplayerManager.sendCollisionEvent('paddle', collision);
                            }
                        }
                        // Handle wall collision
                        else if (collision === 'wall') {
                            // Play wall bounce sound
                            if (this.soundManager) {
                                this.soundManager.playWallBounce();
                            }
                            
                            // Emit wall hit event for haptic feedback
                            this.emit('wallHit', { position: 'wall' });
                            
                            // Send collision event in multiplayer
                            if (this.isMultiplayer && this.multiplayerManager) {
                                this.multiplayerManager.sendCollisionEvent('wall', collision);
                            }
                        }
                    }
                    
                    // Update AI paddle for single player mode
                    if (!this.isMultiplayer && this.aiPaddle && this.ball) {
                        console.log("Updating AI paddle position to track ball");
                        this.aiPaddle.updateAI(this.ball.getBall());
                    }
                    
                    // In multiplayer mode, send paddle position to the other player
                    if (this.isMultiplayer && this.multiplayerManager) {
                        // Find paddles owned by this player and send their positions
                        if (this.paddles) {
                            this.paddles.forEach((paddle, index) => {
                                if (paddle.isOwnedBy(this.playerId)) {
                                    this.multiplayerManager.updatePaddlePosition(paddle, index);
                                }
                            });
                        }
                        
                        // If we're the host, send ball position too
                        if (this.isLocalPlayer) {
                            this.multiplayerManager.updateBallPosition(
                                this.ball.getBall().position,
                                this.ball.ballVelocity
                            );
                        }
                    }
                }
            }

            // Render the scene
            this.renderer.render(this.scene, this.camera);
        });
    }

    // Add method to reset the game state
    resetGame() {
        console.log("Resetting game state...");
        
        // Reset game state flags
        this.isGameStarted = false;
        this.isGamePaused = false;
        this.gameOver = false;
        
        // Keep multiplayer state if in multiplayer mode
        if (!this.isMultiplayer) {
            this.isMultiplayer = false;
        }
        
        // Reset scores
        this.playerScore = 0;
        this.aiScore = 0;
        
        // Update score displays
        if (this.playerScoreDisplay) this.playerScoreDisplay.updateScore(0);
        if (this.aiScoreDisplay) this.aiScoreDisplay.updateScore(0);
        
        // Reset ball position and ensure it's not moving
        if (this.ball) {
            this.ball.reset();
            this.ball.ballVelocity.set(0, 0, 0);
        }
        
        // Reset timer
        if (this.timer) this.timer.reset();
        
        // Reset timer displays
        if (this.playerTimerDisplay) this.playerTimerDisplay.updateTime(this.timer.timeLeft);
        if (this.aiTimerDisplay) this.aiTimerDisplay.updateTime(this.timer.timeLeft);
        
        // Reset paddle positions
        if (this.playerPaddle && this.playerPaddle.getPaddle()) {
            console.log("Resetting player paddle position to z=-0.1");
            this.playerPaddle.getPaddle().position.set(0, 1.0, -0.1);
        }
        
        if (this.aiPaddle && this.aiPaddle.getPaddle()) {
            console.log("Resetting AI paddle position to z=-1.9");
            this.aiPaddle.getPaddle().position.set(0, 1.0, -1.9);
        }
        
        // Hide multiplayer menu if visible and not in multiplayer mode
        if (this.multiplayerMenu && this.multiplayerMenu.isVisible && !this.isMultiplayer) {
            this.multiplayerMenu.hide();
        }
        
        // Show and reset start button if not in multiplayer mode
        if (this.startButton && !this.isMultiplayer) {
            console.log("Resetting and showing start button");
            this.startButton.reset();
            this.startButton.show();
        }
        
        // Hide final score display if visible
        if (this.finalScoreDisplay) {
            this.finalScoreDisplay.hide();
        }
        
        // Hide restart button if visible
        if (this.restartButton) {
            this.restartButton.hide();
        }
        
        // Reset sound
        if (this.soundManager) {
            this.soundManager.stopBackgroundMusic();
        }
        
        console.log("Game reset completed");
    }

    // Create visual representations of remote player's controllers
    createRemoteControllerVisuals() {
        // Create group to hold remote controller models
        this.remoteControllerGroup = new THREE.Group();
        this.scene.add(this.remoteControllerGroup);
        
        const controllerModelFactory = new XRControllerModelFactory();
        
        // Left remote controller
        this.remoteControllers = {
            left: new THREE.Group(),
            right: new THREE.Group()
        };
        
        // Create 3D hand models for remote player
        this.remoteHands = {
            left: new HandModel(this.scene, true),  // Left hand
            right: new HandModel(this.scene, false) // Right hand
        };
        
        // Hide hands initially
        this.remoteHands.left.hide();
        this.remoteHands.right.hide();
        
        // Create basic controller models
        for (const side of ['left', 'right']) {
            // Add controller grip for model
            const grip = new THREE.Group();
            grip.add(controllerModelFactory.createControllerModel(grip));
            this.remoteControllers[side].add(grip);
            
            // Add a ray to represent controller direction
            const ray = new THREE.Group();
            const rayGeometry = new THREE.BufferGeometry().setFromPoints([
                new THREE.Vector3(0, 0, 0),
                new THREE.Vector3(0, 0, -1)
            ]);
            
            const rayMaterial = new THREE.LineBasicMaterial({
                color: side === 'left' ? 0x0088ff : 0xff8800,
                linewidth: 2
            });
            
            const rayLine = new THREE.Line(rayGeometry, rayMaterial);
            rayLine.scale.z = 0.5;
            ray.add(rayLine);
            
            this.remoteControllers[side].add(ray);
            
            // Initially hide remote controllers
            this.remoteControllers[side].visible = false;
            
            // Add to remote controller group
            this.remoteControllerGroup.add(this.remoteControllers[side]);
        }
        
        // Create the remote player's head model
        this.remoteHead = new HeadModel(this.scene);
        this.remoteHead.hide(); // Initially hidden
    }

    // Create the local player's head model for tracking in VR
    createPlayerHead() {
        this.playerHead = new HeadModel(this.scene);
        this.playerHead.hide(); // Initially hidden, only visible to remote players
    }

    // Create the local player's hand models for tracking in VR
    createPlayerHands() {
        this.playerHands = {
            left: new HandModel(this.scene, true),  // Left hand
            right: new HandModel(this.scene, false) // Right hand
        };
        
        // Hide local hands as they're only visible to remote players
        this.playerHands.left.hide();
        this.playerHands.right.hide();
    }

    // Update remote controller visualizations based on network data
    updateRemoteControllers(data) {
        if (!this.isMultiplayer) return;
        
        // Only show remote controllers/hands in multiplayer mode
        const isRemotePlayerInVR = (data.isHost !== this.isLocalPlayer);
        if (!isRemotePlayerInVR) return;
        
        // Update left controller/hand
        if (data.leftController) {
            const position = data.leftController.position;
            const rotation = data.leftController.rotation;
            
            // Update hand model instead of controller rays
            if (this.remoteHands && this.remoteHands.left) {
                this.remoteHands.left.show();
                this.remoteHands.left.updatePosition(position, rotation);
            }
            
            // Keep controllers updated for compatibility but hide them
            if (this.remoteControllers) {
                this.remoteControllers.left.visible = false; // Hide ray controller
                this.remoteControllers.left.position.set(position.x, position.y, position.z);
                this.remoteControllers.left.quaternion.set(rotation.x, rotation.y, rotation.z, rotation.w);
            }
        }
        
        // Update right controller/hand
        if (data.rightController) {
            const position = data.rightController.position;
            const rotation = data.rightController.rotation;
            
            // Update hand model instead of controller rays
            if (this.remoteHands && this.remoteHands.right) {
                this.remoteHands.right.show();
                this.remoteHands.right.updatePosition(position, rotation);
            }
            
            // Keep controllers updated for compatibility but hide them
            if (this.remoteControllers) {
                this.remoteControllers.right.visible = false; // Hide ray controller
                this.remoteControllers.right.position.set(position.x, position.y, position.z);
                this.remoteControllers.right.quaternion.set(rotation.x, rotation.y, rotation.z, rotation.w);
            }
        }
        
        // Update remote head if data is available
        if (data.head && this.remoteHead) {
            this.remoteHead.show(); // Make the head visible
            this.remoteHead.updatePosition(data.head.position, data.head.rotation);
        }
    }

    // New method to handle remote paddle ownership claims
    updateRemotePaddleOwnership(paddleIndex, playerId, isHost) {
        if (!this.paddles || this.paddles.length <= paddleIndex) return;
        
        // Only update if this paddle is not already owned by the local player
        if (!this.paddles[paddleIndex].isOwnedBy(this.playerId)) {
            console.log(`Remote player claimed paddle ${paddleIndex}`);
            this.paddles[paddleIndex].claimOwnership(playerId, isHost);
        }
    }

    // Add a method to handle game over
    handleGameOver() {
        console.log("Game over - timer finished!");
        this.gameOver = true;
        
        // Stop the ball by resetting it and setting velocity to zero
        if (this.ball) {
            // Completely stop the ball from moving
            this.ball.reset();
            this.ball.ballVelocity.set(0, 0, 0);
            
            // Ensure the ball is stationary by positioning it above the table
            this.ball.getBall().position.set(0, 2.5, -1.0);
            
            // Debug log to confirm ball position and velocity
            console.log("Ball stopped at position:", this.ball.getBall().position);
            console.log("Ball velocity reset:", this.ball.ballVelocity);
        }
        
        // Show the final score display for all players
        this.finalScoreDisplay.show(this.playerScore, this.aiScore);
        
        // Only show the restart button to the host in multiplayer mode
        if (!this.isMultiplayer || (this.isMultiplayer && this.multiplayerManager && this.multiplayerManager.isHost)) {
            this.restartButton.show();
        } else {
            // For non-host players in multiplayer, show a message
            this.showMessage("Game Over! Waiting for host to restart...", 5000);
        }
        
        // Play a sound if available
        if (this.soundManager) {
            this.soundManager.playScore(); // Using an existing sound for game over
        }
        
        // Trigger haptic feedback for game over
        this.triggerPaddleHaptics(1.0, 200);
    }

    // Method to start or restart the game
    startGame() {
        if (this.isGameStarted) return;
        
        console.log("Starting game");
        this.isGameStarted = true;
        
        // Hide start button
        if (this.startButton) {
            this.startButton.hide();
        }
        
        // Reset scores
        this.playerScore = 0;
        this.aiScore = 0;
        
        // Reset and start timer
        if (this.timer) {
            this.timer.reset();
            this.timer.start();
        }
        
        // Reset and start ball
        if (this.ball) {
            this.ball.reset();
            setTimeout(() => {
                this.ball.start();
            }, 1000);
        }
        
        // Reset game over state
        this.gameOver = false;
        
        // Emit gameStarted event for mobile controls
        this.emit('gameStarted');
    }

    // Event emitter methods
    addEventListener(event, callback) {
        if (!this.eventListeners[event]) {
            this.eventListeners[event] = [];
        }
        this.eventListeners[event].push(callback);
    }
    
    removeEventListener(event, callback) {
        if (this.eventListeners[event]) {
            this.eventListeners[event] = this.eventListeners[event].filter(cb => cb !== callback);
        }
    }
    
    emit(event, ...args) {
        console.log(`Emitting event: ${event}`, args);
        if (this.eventListeners[event]) {
            this.eventListeners[event].forEach(callback => callback(...args));
        }
    }
    
    detectAndSetupMobileControls() {
        // Initialize mobile controller
        this.mobileController = new MobileController(this);
    }
}
