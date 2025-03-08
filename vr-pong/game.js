import * as THREE from 'three';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import { XRControllerModelFactory } from 'three/addons/webxr/XRControllerModelFactory.js';
import { Stats } from 'three/addons/libs/stats.module.js';
import { Ball } from './js/entities/Ball.js';
import { Paddle } from './js/entities/Paddle.js';
import { MultiplayerManager } from './js/network/MultiplayerManager.js';
import { VoiceChat } from './js/audio/VoiceChat.js';

export class Game {
    constructor(container) {
        // Reference to the container element
        this.container = container;
        
        // Scene setup
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.controls = null;
        
        // Game objects
        this.paddle1 = null;
        this.paddle2 = null;
        this.ball = null;
        
        // UI elements
        this.scoreElement = null;
        this.messageElement = null;
        
        // VR controllers
        this.controller1 = null;
        this.controller2 = null;
        this.controllerGrip1 = null;
        this.controllerGrip2 = null;
        this.controllers = [];
        
        // Voice chat
        this.voiceChat = null;
        
        // Multiplayer
        this.multiplayerManager = null;
        
        // Game state
        this.vrMode = false;
        this.multiplayer = false;
        this.gameOver = false;
        this.paused = false;
        this.maxScore = 10;
        
        // Performance stats
        this.stats = null;
        
        // Animation frame ID for cancellation
        this.animationFrameId = null;
        
        // Delta time tracking
        this.lastUpdateTime = Date.now();
        this.deltaTime = 0;
        
        // Initialize the game
        this.init();
    }
    
    // Initialize the game
    init() {
        // Create scene
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x000000);
        
        // Create camera
        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.camera.position.z = 3;
        
        // Create renderer
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.renderer.xr.enabled = true;
        this.container.appendChild(this.renderer.domElement);
        
        // Add VR button
        const vrButton = VRButton.createButton(this.renderer);
        this.container.appendChild(vrButton);
        
        // Track VR session
        this.renderer.xr.addEventListener('sessionstart', () => {
            console.log('VR session started');
            this.vrMode = true;
        });
        
        this.renderer.xr.addEventListener('sessionend', () => {
            console.log('VR session ended');
            this.vrMode = false;
        });
        
        // Create objects
        this.createObjects();
        
        // Create VR controllers
        this.createControllers();
        
        // Set up UI
        this.createUI();
        
        // Set up lighting
        this.createLighting();
        
        // Set up stats
        this.stats = new Stats();
        this.container.appendChild(this.stats.dom);
        
        // Set up event listeners
        this.setupEventListeners();
        
        // Start animation loop
        this.lastUpdateTime = Date.now();
        this.animate();
    }
    
    // Create game objects
    createObjects() {
        // Create ball
        this.ball = new Ball(this.scene);
        
        // Create paddles
        this.paddle1 = new Paddle(this.scene, 1, this.camera); // Player paddle
        this.paddle1.position.x = -2.5;
        
        this.paddle2 = new Paddle(this.scene, 2); // AI or opponent paddle
        this.paddle2.position.x = 2.5;
    }
    
    // Create VR controllers
    createControllers() {
        // Controller model factory
        const controllerModelFactory = new XRControllerModelFactory();
        
        // Controller 1
        this.controller1 = this.renderer.xr.getController(0);
        this.controller1.name = 'controller-right';
        this.scene.add(this.controller1);
        
        this.controllerGrip1 = this.renderer.xr.getControllerGrip(0);
        this.controllerGrip1.add(controllerModelFactory.createControllerModel(this.controllerGrip1));
        this.scene.add(this.controllerGrip1);
        
        // Controller 2
        this.controller2 = this.renderer.xr.getController(1);
        this.controller2.name = 'controller-left';
        this.scene.add(this.controller2);
        
        this.controllerGrip2 = this.renderer.xr.getControllerGrip(1);
        this.controllerGrip2.add(controllerModelFactory.createControllerModel(this.controllerGrip2));
        this.scene.add(this.controllerGrip2);
        
        // Store references for easier access
        this.controllers = [this.controller1, this.controller2];
        
        // Controller event listeners
        this.controller1.addEventListener('selectstart', () => this.onControllerSelectStart(this.controller1));
        this.controller1.addEventListener('selectend', () => this.onControllerSelectEnd(this.controller1));
        this.controller2.addEventListener('selectstart', () => this.onControllerSelectStart(this.controller2));
        this.controller2.addEventListener('selectend', () => this.onControllerSelectEnd(this.controller2));
    }
    
    // Create UI elements
    createUI() {
        // Score display
        this.scoreElement = document.createElement('div');
        this.scoreElement.id = 'score';
        this.scoreElement.style.position = 'absolute';
        this.scoreElement.style.top = '10px';
        this.scoreElement.style.width = '100%';
        this.scoreElement.style.textAlign = 'center';
        this.scoreElement.style.fontSize = '24px';
        this.scoreElement.style.fontFamily = 'Arial, sans-serif';
        this.scoreElement.style.color = 'white';
        this.scoreElement.style.textShadow = '2px 2px 4px #000000';
        this.container.appendChild(this.scoreElement);
        
        // Message display
        this.messageElement = document.createElement('div');
        this.messageElement.id = 'message';
        this.messageElement.style.position = 'absolute';
        this.messageElement.style.top = '50%';
        this.messageElement.style.left = '50%';
        this.messageElement.style.transform = 'translate(-50%, -50%)';
        this.messageElement.style.fontSize = '32px';
        this.messageElement.style.fontFamily = 'Arial, sans-serif';
        this.messageElement.style.color = 'white';
        this.messageElement.style.textShadow = '2px 2px 4px #000000';
        this.messageElement.style.textAlign = 'center';
        this.messageElement.style.display = 'none';
        this.container.appendChild(this.messageElement);
        
        // Update score display
        this.updateScoreDisplay();
    }
    
    // Create lighting
    createLighting() {
        // Ambient light
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
        this.scene.add(ambientLight);
        
        // Directional light
        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.5);
        directionalLight.position.set(0, 1, 1);
        this.scene.add(directionalLight);
    }
    
    // Set up event listeners
    setupEventListeners() {
        // Window resize
        window.addEventListener('resize', this.onWindowResize.bind(this));
        
        // Keyboard controls
        window.addEventListener('keydown', this.onKeyDown.bind(this));
        window.addEventListener('keyup', this.onKeyUp.bind(this));
        
        // Mouse controls
        window.addEventListener('mousemove', this.onMouseMove.bind(this));
        
        // Touch controls
        this.container.addEventListener('touchmove', this.onTouchMove.bind(this));
    }
    
    // Initialize multiplayer
    initMultiplayer() {
        this.multiplayer = true;
        
        // Create multiplayer manager
        this.multiplayerManager = new MultiplayerManager(this);
        
        // Initialize voice chat if multiplayer
        if (this.multiplayer && this.multiplayerManager) {
            if (this.voiceChat) {
                this.voiceChat.cleanup();
            }
            this.voiceChat = new VoiceChat(this.multiplayerManager);
            this.voiceChat.requestVoiceChat();
        }
        
        // Setup resize handler
        window.addEventListener('resize', this.onWindowResize.bind(this));
    }
    
    // Start a match
    startMatch() {
        console.log('Starting match...');
        this.resetGame();
        this.paused = false;
        this.showMessage('Get Ready!', 2000);
        
        // Start multiplayer sync
        if (this.multiplayer && this.multiplayerManager) {
            this.multiplayerManager.startMatch();
        }
    }
    
    // End a match
    endMatch() {
        console.log('Ending match...');
        this.paused = true;
    }
    
    // Main animation loop
    animate() {
        // Request next frame
        this.animationFrameId = requestAnimationFrame(this.animate.bind(this));
        
        // Update controls
        this.controls.update();
        
        // Update game state
        this.update();
        
        // Render the scene
        this.renderer.render(this.scene, this.camera);
        
        // Update stats
        if (this.stats) {
            this.stats.update();
        }
    }
    
    // Update game state
    update() {
        // Update delta time
        const now = Date.now();
        this.deltaTime = (now - this.lastUpdateTime) / 1000;
        this.lastUpdateTime = now;
        
        // Update paddle positions
        this.paddle1.update(this.deltaTime);
        this.paddle2.update(this.deltaTime);
        
        // Update ball position
        this.ball.update(this.deltaTime, this.paddle1, this.paddle2);
        
        // Check game over
        if (this.ball.score1 >= this.maxScore || this.ball.score2 >= this.maxScore) {
            this.endGame();
        }
        
        // Update multiplayer state
        if (this.multiplayer && this.multiplayerManager) {
            this.multiplayerManager.update();
        }
    }

    // ... existing code ...
}

// Start the game
document.addEventListener('DOMContentLoaded', () => {
    const game = new Game();
    
    // Initialize multiplayer after a short delay to ensure the scene is ready
    setTimeout(() => {
        game.initMultiplayer();
    }, 1000);
});
