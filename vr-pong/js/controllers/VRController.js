import * as THREE from 'three';
import { XRControllerModelFactory } from 'three/addons/webxr/XRControllerModelFactory.js';

export class VRController {
    constructor(renderer, playerGroup) {
        this.renderer = renderer;
        this.playerGroup = playerGroup;
        this.controllers = [];
        this.controllerGrips = [];
        this.controllerStates = {
            left: { touching: false, gripping: false, lastPosition: new THREE.Vector3() },
            right: { touching: false, gripping: false, lastPosition: new THREE.Vector3(), thumbstickPressed: false }
        };
        
        // Movement and rotation settings
        this.moveSpeed = 0.05;
        this.snapAngle = 25 * (Math.PI / 180); // 25 degrees in radians
        this.rotationCooldownTime = 250; // milliseconds
        this.lastRotationTime = 0;

        // Paddle constraints
        this.tableWidth = 1.5;
        this.tableLength = 2.0;
        this.paddleHeight = 0.9;
        this.tableCenter = new THREE.Vector3(0, this.paddleHeight, -1.0);

        this.setupControllers();
    }

    setupControllers() {
        // Left Controller (0)
        this.controllers[0] = this.renderer.xr.getController(0);
        this.controllers[0].userData.isSelecting = false;
        this.controllers[0].userData.selectStartTime = 0;
        this.controllers[0].userData.isNewPress = false;
        this.controllers[0].userData.lastSelectEndTime = 0; // Track when the button was last released
        
        this.controllers[0].addEventListener('selectstart', () => {
            const now = Date.now();
            this.controllers[0].userData.selectStartTime = now;
            this.controllers[0].userData.isSelecting = true;
            this.controllers[0].userData.isNewPress = true;
            
            console.log(`Left controller: selectstart at ${now}`);
            
            // Reset isNewPress flag after a short delay to prevent multiple rapid triggers
            setTimeout(() => {
                this.controllers[0].userData.isNewPress = false;
            }, 100);
        });
        
        this.controllers[0].addEventListener('selectend', () => {
            const now = Date.now();
            this.controllers[0].userData.isSelecting = false;
            this.controllers[0].userData.isNewPress = false;
            this.controllers[0].userData.lastSelectEndTime = now;
            
            console.log(`Left controller: selectend at ${now}`);
        });
        
        this.playerGroup.add(this.controllers[0]);

        // Right Controller (1)
        this.controllers[1] = this.renderer.xr.getController(1);
        this.controllers[1].userData.isSelecting = false;
        this.controllers[1].userData.selectStartTime = 0;
        this.controllers[1].userData.isNewPress = false;
        this.controllers[1].userData.lastSelectEndTime = 0; // Track when the button was last released
        
        this.controllers[1].addEventListener('selectstart', () => {
            const now = Date.now();
            this.controllers[1].userData.selectStartTime = now;
            this.controllers[1].userData.isSelecting = true;
            this.controllers[1].userData.isNewPress = true;
            
            console.log(`Right controller: selectstart at ${now}`);
            
            // Reset isNewPress flag after a short delay to prevent multiple rapid triggers
            setTimeout(() => {
                this.controllers[1].userData.isNewPress = false;
            }, 100);
        });
        
        this.controllers[1].addEventListener('selectend', () => {
            const now = Date.now();
            this.controllers[1].userData.isSelecting = false;
            this.controllers[1].userData.isNewPress = false;
            this.controllers[1].userData.lastSelectEndTime = now;
            
            console.log(`Right controller: selectend at ${now}`);
        });
        
        this.playerGroup.add(this.controllers[1]);

        // Add controller models
        const controllerModelFactory = new XRControllerModelFactory();

        // Left Controller Grip
        this.controllerGrips[0] = this.renderer.xr.getControllerGrip(0);
        this.controllerGrips[0].add(controllerModelFactory.createControllerModel(this.controllerGrips[0]));
        this.playerGroup.add(this.controllerGrips[0]);

        // Right Controller Grip
        this.controllerGrips[1] = this.renderer.xr.getControllerGrip(1);
        this.controllerGrips[1].add(controllerModelFactory.createControllerModel(this.controllerGrips[1]));
        this.playerGroup.add(this.controllerGrips[1]);

        // Store the active controller for paddle control
        this.activeController = this.controllers[1]; // Right controller by default
        this.activeSide = 'right';
    }

    // Checks if the controller has been released since a specific time
    hasBeenReleasedSince(controller, timestamp) {
        return controller.userData.lastSelectEndTime > timestamp;
    }

    updatePaddlePosition(paddle, controllerPosition) {
        // Constrain paddle movement to table bounds
        const tableHalfWidth = 0.75;
        const clampedX = THREE.MathUtils.clamp(
            controllerPosition.x,
            -tableHalfWidth + 0.15,
            tableHalfWidth - 0.15
        );

        // Update paddle position, keeping Y and Z constant
        paddle.position.x = clampedX;
        paddle.position.y = 0.9;
        paddle.position.z = -0.1;
    }

    handlePaddleControl(side, controller, gamepad, paddle) {
        const controllerPosition = new THREE.Vector3();
        controller.getWorldPosition(controllerPosition);
        
        const paddlePosition = new THREE.Vector3();
        paddle.getWorldPosition(paddlePosition);
        const distance = controllerPosition.distanceTo(paddlePosition);

        const wasTouching = this.controllerStates[side].touching;
        this.controllerStates[side].touching = distance < 0.2; // Increased from 0.1 to 0.2 for larger grab area

        const isGripping = gamepad.buttons[1]?.pressed;
        const wasGripping = this.controllerStates[side].gripping;
        this.controllerStates[side].gripping = isGripping;

        if (this.controllerStates[side].touching) {
            if (isGripping && !wasGripping) {
                this.activeSide = side;
                this.activeController = controller;
                
                if (gamepad.hapticActuators?.[0]) {
                    gamepad.hapticActuators[0].pulse(0.5, 50); // Lighter haptic feedback when grabbing
                }
            }
        }

        if (side === this.activeSide && this.controllerStates[side].gripping && this.controllerStates[side].touching) {
            const movement = controllerPosition.distanceTo(this.controllerStates[side].lastPosition);
            this.updatePaddlePosition(paddle, controllerPosition);

            if (movement > 0.001 && gamepad.hapticActuators?.[0]) {
                const intensity = THREE.MathUtils.clamp(movement * 10, 0.1, 0.5);
                gamepad.hapticActuators[0].pulse(intensity, 16);
            }
        }

        this.controllerStates[side].lastPosition.copy(controllerPosition);
    }

    handleThumbstickInput(side, gamepad, currentTime) {
        if (gamepad.axes.length >= 4) {
            const thumbstickX = gamepad.axes[2];
            const thumbstickY = gamepad.axes[3];

            // Use a smaller deadzone for more responsive movement
            const deadzone = 0.05;
            const isThumbstickActive = Math.abs(thumbstickX) > deadzone || Math.abs(thumbstickY) > deadzone;

            if (side === 'left') {
                if (isThumbstickActive) {
                    this.handleMovement(thumbstickX, thumbstickY, gamepad);
                    
                    // Add debug logging for movement
                    console.log(`VR Locomotion: Moving with left thumbstick (${thumbstickX.toFixed(2)}, ${thumbstickY.toFixed(2)})`);
                }
            } else if (side === 'right') {
                this.handleRotation(thumbstickX, gamepad, currentTime);
            }
        }
    }

    handleMovement(thumbstickX, thumbstickY, gamepad) {
        // Only process movement if thumbstick is moved beyond deadzone
        if (Math.abs(thumbstickX) > 0.05 || Math.abs(thumbstickY) > 0.05) {
            // Apply exponential control for finer movement at lower thumbstick values
            const moveX = Math.sign(thumbstickX) * Math.pow(Math.abs(thumbstickX), 1.5) * this.moveSpeed;
            const moveZ = -Math.sign(thumbstickY) * Math.pow(Math.abs(thumbstickY), 1.5) * this.moveSpeed;

            // Get the player's forward direction but constrain it to the XZ plane
            const forward = new THREE.Vector3(0, 0, -1);
            forward.applyQuaternion(this.playerGroup.quaternion);
            // Force Y component to zero to ensure horizontal movement only
            forward.y = 0;
            forward.normalize(); // Re-normalize after changing Y

            // Calculate right vector (perpendicular to forward)
            const right = new THREE.Vector3(1, 0, 0);
            right.applyQuaternion(this.playerGroup.quaternion);
            // Force Y component to zero to ensure horizontal movement only
            right.y = 0;
            right.normalize(); // Re-normalize after changing Y

            // Calculate the movement vector in world space (constrained to XZ plane)
            const movement = new THREE.Vector3();
            movement.addScaledVector(right, moveX);
            movement.addScaledVector(forward, moveZ);

            // Ensure no vertical movement by explicitly setting Y to 0
            // This guarantees we move only along the floor plane
            movement.y = 0;

            // Apply movement to player group (camera and controllers)
            this.playerGroup.position.add(movement);

            // Provide haptic feedback based on movement intensity
            if (gamepad.hapticActuators?.[0]) {
                const intensity = Math.min(Math.sqrt(moveX * moveX + moveZ * moveZ) * 3, 0.5);
                gamepad.hapticActuators[0].pulse(intensity, 16);
            }
        }
    }

    handleRotation(thumbstickX, gamepad, currentTime) {
        const wasPressed = this.controllerStates.right.thumbstickPressed;
        const isPressed = Math.abs(thumbstickX) > 0.7;

        if (isPressed && !wasPressed && currentTime - this.lastRotationTime > this.rotationCooldownTime) {
            // Store current Y position to preserve height after rotation
            const currentY = this.playerGroup.position.y;
            
            // Apply rotation around the Y axis only
            const rotationDirection = Math.sign(thumbstickX);
            this.playerGroup.rotateY(-this.snapAngle * rotationDirection);
            
            // Restore original Y position to prevent any height changes during rotation
            this.playerGroup.position.y = currentY;
            
            if (gamepad.hapticActuators?.[0]) {
                gamepad.hapticActuators[0].pulse(0.5, 50);
            }

            this.lastRotationTime = currentTime;
        }

        this.controllerStates.right.thumbstickPressed = isPressed;
    }

    checkControllerState(controller, side, paddle) {
        const session = this.renderer.xr.getSession();
        if (!session) return;

        let inputSource = null;
        for (let i = 0; i < session.inputSources.length; i++) {
            if (session.inputSources[i].handedness === (side === 'left' ? 'left' : 'right')) {
                inputSource = session.inputSources[i];
                break;
            }
        }
        
        if (!inputSource || !inputSource.gamepad) return;

        const gamepad = inputSource.gamepad;
        const currentTime = Date.now();
        
        // Always process thumbstick input first for responsive movement
        this.handleThumbstickInput(side, gamepad, currentTime);
        
        // Process paddle interaction if a paddle is provided
        if (paddle) {
            this.handlePaddleControl(side, controller, gamepad, paddle);
        }
    }
}
