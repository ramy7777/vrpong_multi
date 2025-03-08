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
            paddlePosition: 0
        };
        
        // Look around state
        this.lookButtonPressed = false;
        this.lastLookX = 0;
        this.lastLookY = 0;
        this.lookButton = null;
        
        // Haptic feedback settings
        this.hapticEnabled = 'vibrate' in navigator;
        this.lastHapticTime = 0;
        this.hapticCooldown = 100; // ms between haptic pulses
        
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
        
        // Add touch event listeners for paddle control
        window.addEventListener('touchstart', this.handleTouchStart.bind(this));
        window.addEventListener('touchmove', this.handleTouchMove.bind(this));
        window.addEventListener('touchend', this.handleTouchEnd.bind(this));
        
        // Create controls container (positioned at bottom right of screen)
        const controlContainer = document.createElement('div');
        controlContainer.id = 'mobileControlContainer';
        controlContainer.style.position = 'absolute';
        controlContainer.style.bottom = '20px';
        controlContainer.style.right = '20px';
        controlContainer.style.display = 'flex';
        controlContainer.style.gap = '15px';
        controlContainer.style.zIndex = '1000';
        controlContainer.style.flexDirection = 'column';
        document.body.appendChild(controlContainer);
        
        // Add look around button
        const lookAroundButton = document.createElement('div');
        lookAroundButton.id = 'lookAroundButton';
        lookAroundButton.textContent = '👁';
        this.styleTouchButton(lookAroundButton);
        controlContainer.appendChild(lookAroundButton);
        this.lookButton = lookAroundButton;
        
        // Add fullscreen button
        const fullscreenButton = document.createElement('div');
        fullscreenButton.id = 'toggleFullscreen';
        fullscreenButton.textContent = '⛶';
        this.styleTouchButton(fullscreenButton);
        controlContainer.appendChild(fullscreenButton);
        
        // Add event listeners for the look-around button with touch-hold behavior
        lookAroundButton.addEventListener('touchstart', (e) => {
            e.preventDefault(); // Prevent default touch actions
            this.lookButtonPressed = true;
            this.lastLookX = e.touches[0].clientX;
            this.lastLookY = e.touches[0].clientY;
            lookAroundButton.style.backgroundColor = 'rgba(255, 64, 129, 0.9)'; // Highlight when active
            this.triggerHapticFeedback('weak');
        });
        
        lookAroundButton.addEventListener('touchmove', (e) => {
            if (this.lookButtonPressed) {
                e.preventDefault(); // Prevent default touch actions
                const touch = e.touches[0];
                const deltaX = touch.clientX - this.lastLookX;
                const deltaY = touch.clientY - this.lastLookY;
                
                // Apply rotation based on touch movement
                this.rotateCamera(deltaX, deltaY);
                
                // Update last position
                this.lastLookX = touch.clientX;
                this.lastLookY = touch.clientY;
            }
        });
        
        lookAroundButton.addEventListener('touchend', (e) => {
            e.preventDefault(); // Prevent default touch actions
            this.lookButtonPressed = false;
            lookAroundButton.style.backgroundColor = 'rgba(33, 150, 243, 0.8)'; // Return to normal color
        });
        
        lookAroundButton.addEventListener('touchcancel', (e) => {
            e.preventDefault(); // Prevent default touch actions
            this.lookButtonPressed = false;
            lookAroundButton.style.backgroundColor = 'rgba(33, 150, 243, 0.8)'; // Return to normal color
        });
        
        // Add fullscreen button event listener
        fullscreenButton.addEventListener('click', () => {
            this.toggleFullscreen();
            this.triggerHapticFeedback('medium');
        });
        
        // Add mobile control instructions
        const instructions = document.createElement('div');
        instructions.id = 'mobileInstructions';
        instructions.innerHTML = 'Swipe to move paddle<br>Touch & hold 👁 to look around';
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
        
        // Set up haptic feedback for game events
        this.setupHapticFeedback();
    }
    
    setupHapticFeedback() {
        // Listen for game events to provide haptic feedback
        this.game.addEventListener('paddleHit', (data) => {
            console.log("Paddle hit event received:", data);
            this.triggerHapticFeedback('medium');
            console.log("Paddle hit haptic triggered");
        });
        
        this.game.addEventListener('wallHit', (data) => {
            console.log("Wall hit event received:", data);
            this.triggerHapticFeedback('weak');
            console.log("Wall hit haptic triggered");
        });
        
        this.game.addEventListener('score', (data) => {
            console.log("Score event received:", data);
            this.triggerHapticFeedback('strong');
            console.log("Score haptic triggered");
        });
        
        console.log("Haptic feedback events registered");
    }
    
    styleTouchButton(button) {
        button.style.width = '60px';
        button.style.height = '60px';
        button.style.borderRadius = '50%';
        button.style.backgroundColor = 'rgba(33, 150, 243, 0.8)';
        button.style.color = 'white';
        button.style.fontSize = '28px';
        button.style.textAlign = 'center';
        button.style.lineHeight = '60px';
        button.style.border = 'none';
        button.style.userSelect = 'none';
        button.style.webkitUserSelect = 'none';
        button.style.cursor = 'pointer';
        button.style.boxShadow = '0 4px 8px rgba(0,0,0,0.3)';
        button.style.touchAction = 'none'; // Disable browser's touch actions
    }
    
    handleTouchStart(event) {
        // Don't handle as paddle control if the look button is being used
        if (this.lookButtonPressed) return;
        
        // Only handle paddle movement if game is started
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
        // Skip paddle control if the look button is pressed
        if (this.lookButtonPressed) return;
        
        // Normal paddle control handling
        if (!this.touchControls.isActive || !this.game.isGameStarted) return;
        
        // Prevent default to avoid browser gestures
        event.preventDefault();
        
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
        if (!this.lookButtonPressed) {
            this.touchControls.isActive = false;
        }
    }
    
    rotateCamera(deltaX, deltaY) {
        // Convert to radians for THREE.js (scale down for more precise control)
        const yawRadians = THREE.MathUtils.degToRad(-deltaX * 0.25); // Negative to match expected direction
        const pitchRadians = THREE.MathUtils.degToRad(-deltaY * 0.25); // Negative to match expected direction
        
        // Get current camera rotation
        const currentRotation = new THREE.Euler().setFromQuaternion(this.camera.quaternion, 'YXZ');
        
        // Apply rotation changes
        currentRotation.y += yawRadians;  // Horizontal rotation (left/right)
        currentRotation.x += pitchRadians; // Vertical rotation (up/down)
        
        // Limit vertical rotation to avoid flipping (-85 to 85 degrees)
        currentRotation.x = THREE.MathUtils.clamp(currentRotation.x, -1.48, 1.48);
        
        // Apply new rotation
        this.camera.quaternion.setFromEuler(currentRotation);
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
    
    triggerHapticFeedback(intensity = 'medium') {
        if (!this.hapticEnabled || !this.isMobile) return;
        
        // Check cooldown to prevent too many vibrations
        const now = Date.now();
        if (now - this.lastHapticTime < this.hapticCooldown) return;
        this.lastHapticTime = now;
        
        try {
            switch (intensity) {
                case 'weak':
                    navigator.vibrate(20);
                    break;
                case 'medium':
                    navigator.vibrate(50);
                    break;
                case 'strong':
                    navigator.vibrate([50, 30, 100]);
                    break;
                default:
                    navigator.vibrate(50);
            }
        } catch (e) {
            console.error('Vibration error:', e);
        }
    }
    
    update() {
        // Any continuous updates can be handled here
    }
} 