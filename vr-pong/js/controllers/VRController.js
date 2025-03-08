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
        this.snapAngle = 15 * (Math.PI / 180); // 15 degrees in radians (changed from 25)
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
            }, 300);
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
            }, 300);
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
        // We no longer set Z position here, as it's determined by the paddle itself
    }

    // New method to check which paddle is closer to the controller
    findClosestPaddle(controller, paddles) {
        const controllerPosition = new THREE.Vector3();
        controller.getWorldPosition(controllerPosition);
        
        let closestPaddle = null;
        let closestDistance = Infinity;
        
        // Check if paddles is an array
        if (Array.isArray(paddles)) {
            // Check distance to each paddle
            for (let i = 0; i < paddles.length; i++) {
                const paddle = paddles[i];
                if (!paddle) continue;
                
                const paddlePosition = new THREE.Vector3();
                paddle.getPaddle().getWorldPosition(paddlePosition);
                const distance = controllerPosition.distanceTo(paddlePosition);
                
                if (distance < closestDistance) {
                    closestDistance = distance;
                    closestPaddle = paddle;
                }
            }
        } else if (paddles && typeof paddles.getPaddle === 'function') {
            // Single paddle object passed directly
            closestPaddle = paddles;
            const paddlePosition = new THREE.Vector3();
            paddles.getPaddle().getWorldPosition(paddlePosition);
            closestDistance = controllerPosition.distanceTo(paddlePosition);
        } else if (paddles && typeof paddles.getWorldPosition === 'function') {
            // Handle case where it's just the paddle mesh
            closestPaddle = { getPaddle: () => paddles };
            const paddlePosition = new THREE.Vector3();
            paddles.getWorldPosition(paddlePosition);
            closestDistance = controllerPosition.distanceTo(paddlePosition);
        }
        
        // Return closest paddle and distance
        return { paddle: closestPaddle, distance: closestDistance };
    }
    
    // Updated method to handle multiple paddles
    handlePaddleControl(side, controller, gamepad, paddles, playerId, isHost) {
        // Some backward compatibility checks
        playerId = playerId || 'default-player';
        isHost = (isHost !== undefined) ? isHost : true;
        
        if (!paddles) return;
        
        const controllerPosition = new THREE.Vector3();
        controller.getWorldPosition(controllerPosition);
        
        // Find closest paddle for this controller
        const { paddle: closestPaddle, distance } = this.findClosestPaddle(controller, paddles);
        if (!closestPaddle) return;
        
        const wasTouching = this.controllerStates[side].touching;
        this.controllerStates[side].touching = distance < 0.3; // Increased for better grabbing
        
        const isGripping = gamepad.buttons[1]?.pressed;
        const wasGripping = this.controllerStates[side].gripping;
        this.controllerStates[side].gripping = isGripping;
        
        // Handle grabbing logic
        if (this.controllerStates[side].touching) {
            // First-time grip - attempt to claim the paddle
            if (isGripping && !wasGripping) {
                const paddleObj = closestPaddle;
                
                // If paddle doesn't have ownership methods, treat it as always claimable
                const canClaim = typeof paddleObj.isOwned !== 'function' || 
                                !paddleObj.isOwned() || 
                                (typeof paddleObj.isOwnedBy === 'function' && paddleObj.isOwnedBy(playerId));
                
                if (canClaim) {
                    // Claim ownership if has the capability and not already owned
                    if (typeof paddleObj.isOwned === 'function' && 
                        !paddleObj.isOwned() && 
                        typeof paddleObj.claimOwnership === 'function') {
                        paddleObj.claimOwnership(playerId, isHost);
                    }
                    
                    this.activeSide = side;
                    this.activeController = controller;
                    this.activePaddle = paddleObj;
                    
                    if (gamepad.hapticActuators?.[0]) {
                        gamepad.hapticActuators[0].pulse(0.7, 100); // Stronger feedback when claiming
                    }
                } else if (typeof paddleObj.isOwned === 'function' && paddleObj.isOwned()) {
                    // Paddle is owned by someone else
                    if (gamepad.hapticActuators?.[0]) {
                        // Short, weak pulse to indicate cannot grab
                        gamepad.hapticActuators[0].pulse(0.2, 50);
                    }
                }
            }
        }
        
        // Move owned paddle if gripping
        if (side === this.activeSide && 
            this.activePaddle) {
            
            // Check ownership if the paddle has that capability
            const hasOwnership = typeof this.activePaddle.isOwnedBy !== 'function' || 
                               this.activePaddle.isOwnedBy(playerId);
            
            if (this.controllerStates[side].gripping && hasOwnership) {
                const movement = controllerPosition.distanceTo(this.controllerStates[side].lastPosition);
                
                // Get the actual mesh from the paddle
                const paddleMesh = typeof this.activePaddle.getPaddle === 'function' ? 
                                 this.activePaddle.getPaddle() : 
                                 this.activePaddle;
                
                this.updatePaddlePosition(paddleMesh, controllerPosition);
                
                if (movement > 0.001 && gamepad.hapticActuators?.[0]) {
                    const intensity = THREE.MathUtils.clamp(movement * 10, 0.1, 0.5);
                    gamepad.hapticActuators[0].pulse(intensity, 16);
                }
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
            // Keep moveX as is for left/right, but invert the sign of moveZ for forward/backward
            const moveX = Math.sign(thumbstickX) * Math.pow(Math.abs(thumbstickX), 1.5) * this.moveSpeed;
            const moveZ = Math.sign(thumbstickY) * Math.pow(Math.abs(thumbstickY), 1.5) * this.moveSpeed; // Removed negative sign

            // Get the camera's forward direction (not the player group's)
            const camera = this.playerGroup.children.find(child => child.isCamera);
            
            // Create a world forward vector that points in negative Z
            const worldForward = new THREE.Vector3();
            // Create a world right vector that points in positive X
            const worldRight = new THREE.Vector3();
            
            if (camera) {
                // Critical change: Use getWorldDirection to get the ACTUAL world direction
                // This accounts for both camera rotation AND player group rotation
                camera.getWorldDirection(worldForward);
                worldForward.negate(); // Camera looks at -Z, so negate for forward direction
                
                // Compute world right by crossing world up with world forward
                const worldUp = new THREE.Vector3(0, 1, 0);
                worldRight.crossVectors(worldUp, worldForward).normalize();
            } else {
                // Fallback to player group orientation if camera not found
                worldForward.set(0, 0, -1).applyQuaternion(this.playerGroup.quaternion);
                worldRight.set(1, 0, 0).applyQuaternion(this.playerGroup.quaternion);
            }
            
            // Force Y component to zero to ensure horizontal movement only
            worldForward.y = 0;
            worldForward.normalize(); // Re-normalize after changing Y
            
            // Force Y component to zero for right vector as well
            worldRight.y = 0;
            worldRight.normalize(); // Re-normalize after changing Y

            // Calculate the movement vector in world space (constrained to XZ plane)
            const movement = new THREE.Vector3();
            movement.addScaledVector(worldRight, moveX);
            movement.addScaledVector(worldForward, moveZ);

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
            
            // Get camera reference
            const camera = this.playerGroup.children.find(child => child.isCamera);
            
            if (camera) {
                // Apply rotation around the Y axis only
                const rotationDirection = Math.sign(thumbstickX);
                
                // Rotate the player group (which includes the camera)
                this.playerGroup.rotateY(-this.snapAngle * rotationDirection);
                
                console.log('Snap rotation applied: ' + 
                            (rotationDirection > 0 ? 'right ' : 'left ') + 
                            (this.snapAngle * 180 / Math.PI).toFixed(0) + ' degrees');
            } else {
                // Standard rotation if camera not found (fallback)
                const rotationDirection = Math.sign(thumbstickX);
                this.playerGroup.rotateY(-this.snapAngle * rotationDirection);
            }
            
            // Restore original Y position to prevent any height changes during rotation
            this.playerGroup.position.y = currentY;
            
            if (gamepad.hapticActuators?.[0]) {
                gamepad.hapticActuators[0].pulse(0.5, 50);
            }

            this.lastRotationTime = currentTime;
        }

        this.controllerStates.right.thumbstickPressed = isPressed;
    }

    // Updated to handle multiple paddles
    checkControllerState(controller, side, paddles, playerId, isHost) {
        if (!controller || !controller.visible) return;
        
        const session = this.renderer.xr.getSession();
        if (!session) return;
        
        // Get the appropriate gamepad based on controller side
        let gamepad = null;
        for (let i = 0; i < session.inputSources.length; i++) {
            const inputSource = session.inputSources[i];
            if (inputSource.handedness === side && inputSource.gamepad) {
                gamepad = inputSource.gamepad;
                break;
            }
        }
        
        if (gamepad) {
            // Handle paddle grabbing and movement
            this.handlePaddleControl(side, controller, gamepad, paddles, playerId, isHost);
            
            // Also handle thumbstick input for movement
            const currentTime = Date.now();
            this.handleThumbstickInput(side, gamepad, currentTime);
        }
    }
}
