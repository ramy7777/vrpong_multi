import * as THREE from 'three';

export class MobileController {
    constructor(game) {
        this.game = game;
        this.camera = game.camera;
        this.scene = game.scene;
        
        // Touch controls state
        this.touchControls = {
            isActive: false,
            touchStartX: 0,
            touchStartY: 0,
            currentTouchX: 0,
            currentTouchY: 0,
            paddlePosition: 0,
            lookRotation: new THREE.Euler(0, 0, 0, 'YXZ')
        };
        
        // Device orientation controls
        this.deviceOrientationEnabled = false;
        this.initialOrientation = null;
        this.deviceOrientation = {
            alpha: 0,
            beta: 0,
            gamma: 0
        };
        
        // Detect if we're on a mobile device
        this.isMobile = this.detectMobile();
        
        if (this.isMobile) {
            this.setupMobileControls();
        }
    }
    
    detectMobile() {
        return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    }
    
    setupMobileControls() {
        console.log("Setting up mobile controls");
        
        // Add touch event listeners
        window.addEventListener('touchstart', this.handleTouchStart.bind(this));
        window.addEventListener('touchmove', this.handleTouchMove.bind(this));
        window.addEventListener('touchend', this.handleTouchEnd.bind(this));
        
        // Add device orientation event listener
        if (window.DeviceOrientationEvent) {
            // Create a button to request permission for device orientation on iOS 13+
            const orientationButton = document.createElement('button');
            orientationButton.id = 'enableOrientation';
            orientationButton.textContent = 'Enable Look Controls';
            orientationButton.style.position = 'absolute';
            orientationButton.style.bottom = '20px';
            orientationButton.style.left = '50%';
            orientationButton.style.transform = 'translateX(-50%)';
            orientationButton.style.padding = '12px 24px';
            orientationButton.style.background = '#2196F3';
            orientationButton.style.color = 'white';
            orientationButton.style.border = 'none';
            orientationButton.style.borderRadius = '4px';
            orientationButton.style.zIndex = '1000';
            orientationButton.style.display = 'none';
            document.body.appendChild(orientationButton);
            
            // Show the button when the game starts
            this.game.addEventListener('gameStarted', () => {
                orientationButton.style.display = 'block';
            });
            
            // Handle orientation permission request
            orientationButton.addEventListener('click', () => {
                if (typeof DeviceOrientationEvent.requestPermission === 'function') {
                    // iOS 13+ requires permission
                    DeviceOrientationEvent.requestPermission()
                        .then(permissionState => {
                            if (permissionState === 'granted') {
                                window.addEventListener('deviceorientation', this.handleDeviceOrientation.bind(this));
                                this.deviceOrientationEnabled = true;
                                orientationButton.style.display = 'none';
                            }
                        })
                        .catch(console.error);
                } else {
                    // Non-iOS devices
                    window.addEventListener('deviceorientation', this.handleDeviceOrientation.bind(this));
                    this.deviceOrientationEnabled = true;
                    orientationButton.style.display = 'none';
                }
            });
        }
        
        // Add fullscreen toggle for better mobile experience
        const fullscreenButton = document.createElement('button');
        fullscreenButton.id = 'toggleFullscreen';
        fullscreenButton.textContent = 'Fullscreen';
        fullscreenButton.style.position = 'absolute';
        fullscreenButton.style.top = '20px';
        fullscreenButton.style.right = '20px';
        fullscreenButton.style.padding = '8px 16px';
        fullscreenButton.style.background = '#333';
        fullscreenButton.style.color = 'white';
        fullscreenButton.style.border = 'none';
        fullscreenButton.style.borderRadius = '4px';
        fullscreenButton.style.zIndex = '1000';
        document.body.appendChild(fullscreenButton);
        
        fullscreenButton.addEventListener('click', () => {
            this.toggleFullscreen();
        });
        
        // Add mobile control instructions
        const instructions = document.createElement('div');
        instructions.id = 'mobileInstructions';
        instructions.innerHTML = 'Swipe left/right to move paddle<br>Tilt device to look around';
        instructions.style.position = 'absolute';
        instructions.style.top = '70px';
        instructions.style.left = '0';
        instructions.style.right = '0';
        instructions.style.textAlign = 'center';
        instructions.style.color = 'white';
        instructions.style.fontFamily = 'Arial, sans-serif';
        instructions.style.fontSize = '16px';
        instructions.style.padding = '10px';
        instructions.style.background = 'rgba(0,0,0,0.5)';
        instructions.style.zIndex = '1000';
        document.body.appendChild(instructions);
        
        // Hide instructions after 5 seconds
        setTimeout(() => {
            instructions.style.opacity = '0';
            instructions.style.transition = 'opacity 1s';
        }, 5000);
    }
    
    handleTouchStart(event) {
        if (!this.game.isGameStarted) return;
        
        const touch = event.touches[0];
        this.touchControls.isActive = true;
        this.touchControls.touchStartX = touch.clientX;
        this.touchControls.touchStartY = touch.clientY;
        this.touchControls.currentTouchX = touch.clientX;
        this.touchControls.currentTouchY = touch.clientY;
        
        // Get current paddle position
        const ownedPaddle = this.game.paddles ? this.game.paddles.find(p => p.isOwnedBy(this.game.playerId)) : null;
        const paddle = ownedPaddle ? ownedPaddle.getPaddle() : this.game.playerPaddle?.getPaddle();
        
        if (paddle) {
            this.touchControls.paddlePosition = paddle.position.x;
        }
    }
    
    handleTouchMove(event) {
        if (!this.touchControls.isActive || !this.game.isGameStarted) return;
        
        const touch = event.touches[0];
        this.touchControls.currentTouchX = touch.clientX;
        this.touchControls.currentTouchY = touch.clientY;
        
        // Calculate horizontal swipe distance
        const deltaX = this.touchControls.currentTouchX - this.touchControls.touchStartX;
        
        // Convert to paddle movement (scaled by screen width)
        const screenWidthFactor = 1 / window.innerWidth * 2;
        const paddleMovement = deltaX * screenWidthFactor;
        
        // Update paddle position
        const ownedPaddle = this.game.paddles ? this.game.paddles.find(p => p.isOwnedBy(this.game.playerId)) : null;
        const paddle = ownedPaddle ? ownedPaddle.getPaddle() : this.game.playerPaddle?.getPaddle();
        
        if (paddle) {
            const newPosition = this.touchControls.paddlePosition + paddleMovement;
            paddle.position.x = THREE.MathUtils.clamp(newPosition, -0.6, 0.6);
        }
    }
    
    handleTouchEnd(event) {
        this.touchControls.isActive = false;
    }
    
    handleDeviceOrientation(event) {
        if (!this.game.isGameStarted) return;
        
        // Store device orientation data
        this.deviceOrientation.alpha = event.alpha || 0; // Z-axis rotation [0, 360)
        this.deviceOrientation.beta = event.beta || 0;   // X-axis rotation [-180, 180)
        this.deviceOrientation.gamma = event.gamma || 0; // Y-axis rotation [-90, 90)
        
        // Initialize reference orientation if not set
        if (!this.initialOrientation) {
            this.initialOrientation = {
                alpha: this.deviceOrientation.alpha,
                beta: this.deviceOrientation.beta,
                gamma: this.deviceOrientation.gamma
            };
        }
        
        // Calculate relative orientation changes
        const deltaAlpha = THREE.MathUtils.degToRad(this.deviceOrientation.alpha - this.initialOrientation.alpha);
        const deltaBeta = THREE.MathUtils.degToRad(this.deviceOrientation.beta - this.initialOrientation.beta);
        const deltaGamma = THREE.MathUtils.degToRad(this.deviceOrientation.gamma - this.initialOrientation.gamma);
        
        // Apply rotation to camera (only if not in VR)
        if (!this.game.isInVR && this.camera) {
            // Limit the rotation range for better control
            const maxVerticalRotation = THREE.MathUtils.degToRad(45);
            const clampedBeta = THREE.MathUtils.clamp(deltaBeta, -maxVerticalRotation, maxVerticalRotation);
            
            // Update camera rotation
            this.touchControls.lookRotation.set(
                -clampedBeta * 0.5, // Pitch (look up/down)
                -deltaAlpha * 0.5,  // Yaw (look left/right)
                0                   // Roll (keep level)
            );
            
            // Apply rotation to camera
            this.camera.quaternion.setFromEuler(this.touchControls.lookRotation);
        }
    }
    
    toggleFullscreen() {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch(err => {
                console.error(`Error attempting to enable fullscreen: ${err.message}`);
            });
        } else {
            if (document.exitFullscreen) {
                document.exitFullscreen();
            }
        }
    }
    
    update() {
        // This method will be called from the game's animation loop
        // Any continuous updates to controls can be done here
    }
} 