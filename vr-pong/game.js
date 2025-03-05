import * as THREE from 'three';
import { VRButton } from 'webxr';
import { XRControllerModelFactory } from 'three/addons/webxr/XRControllerModelFactory.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

class VRPongGame {
    constructor() {
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.clock = new THREE.Clock();
        
        // Player movement and rotation settings
        this.moveSpeed = 0.05;
        this.rotateSpeed = 0.05;
        this.snapAngle = 25 * (Math.PI / 180); // 25 degrees in radians
        this.rotationCooldown = 0;
        this.rotationCooldownTime = 250; // milliseconds
        this.lastRotationTime = 0;
        
        this.playerGroup = new THREE.Group(); // Group to hold camera and controllers
        this.scene.add(this.playerGroup);
        this.playerGroup.add(this.camera);

        // Controller states
        this.controllerStates = {
            left: { touching: false, gripping: false, lastPosition: new THREE.Vector3() },
            right: { touching: false, gripping: false, lastPosition: new THREE.Vector3(), thumbstickPressed: false }
        };

        this.init();
        this.setupVR();
        this.createEnvironment();
        this.createTable();
        this.createPaddle();
        this.createBall();
        this.animate();
    }

    init() {
        // Setup renderer
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.renderer.xr.enabled = true;
        document.body.appendChild(this.renderer.domElement);

        // Create VR button with proper session configuration
        const button = VRButton.createButton(this.renderer);
        document.body.appendChild(button);

        // Setup scene
        this.scene.background = new THREE.Color(0x000033);
        this.camera.position.set(0, 1.6, -1.5);
        this.camera.lookAt(0, 0.8, 0);

        // Add lights
        const ambientLight = new THREE.AmbientLight(0x404040);
        const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
        directionalLight.position.set(10, 10, 10);
        this.scene.add(ambientLight, directionalLight);

        // Handle window resize
        window.addEventListener('resize', () => {
            this.camera.aspect = window.innerWidth / window.innerHeight;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(window.innerWidth, window.innerHeight);
        });

        // Add session event listeners
        this.renderer.xr.addEventListener('sessionstart', () => {
            console.log('VR Session started');
        });

        this.renderer.xr.addEventListener('sessionend', () => {
            console.log('VR Session ended');
            // Reset controller states
            this.controllerStates = {
                left: { touching: false, gripping: false },
                right: { touching: false, gripping: false }
            };
        });
    }

    setupVR() {
        // Set up VR button and default reference space
        this.renderer.xr.addEventListener('sessionstart', () => {
            console.log('Setting up VR session');
            
            // Set the initial reference space offset to be behind the paddle end
            const referenceSpace = this.renderer.xr.getReferenceSpace();
            const transform = new XRRigidTransform(
                { x: 0, y: 0, z: -0.4 }, // Spawn point 0.4m behind paddle end
                { x: 0, y: 0, z: 0, w: 1 }
            );
            this.renderer.xr.setReferenceSpace(
                referenceSpace.getOffsetReferenceSpace(transform)
            );

            // Set up input sources
            const session = this.renderer.xr.getSession();
            session.addEventListener('inputsourceschange', (event) => {
                console.log('Input sources changed:', event.added, event.removed);
            });
        });

        // Setup both controllers
        this.controllers = [];
        this.controllerGrips = [];

        // Left Controller (0)
        this.controllers[0] = this.renderer.xr.getController(0);
        this.playerGroup.add(this.controllers[0]);

        // Right Controller (1)
        this.controllers[1] = this.renderer.xr.getController(1);
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

        // Initialize controller states
        this.controllerStates = {
            left: { touching: false, gripping: false, lastPosition: new THREE.Vector3() },
            right: { touching: false, gripping: false, lastPosition: new THREE.Vector3(), thumbstickPressed: false }
        };

        // Store the active controller for paddle control
        this.activeController = this.controllers[1]; // Right controller by default
        this.activeSide = 'right';

        // Debug controller setup
        this.renderer.xr.addEventListener('sessionstart', () => {
            const session = this.renderer.xr.getSession();
            if (session) {
                console.log('Active XR Session:', session);
                console.log('Input Sources:', session.inputSources);
            }
        });
    }

    checkControllerState(controller, side) {
        const session = this.renderer.xr.getSession();
        if (!session) return;

        // Get input source from XRInputSourceArray
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
        
        // Handle thumbstick input
        if (gamepad.axes.length >= 4) {
            // Get thumbstick values
            const thumbstickX = gamepad.axes[2]; // X-axis of the thumbstick
            const thumbstickY = gamepad.axes[3]; // Y-axis of the thumbstick

            // Apply movement or rotation based on controller side
            if (side === 'left') {
                // Left thumbstick controls movement
                if (Math.abs(thumbstickX) > 0.1 || Math.abs(thumbstickY) > 0.1) {
                    // Calculate movement direction relative to player's facing direction
                    const moveX = thumbstickX * this.moveSpeed;
                    const moveZ = -thumbstickY * this.moveSpeed;

                    // Get the player's forward direction
                    const forward = new THREE.Vector3(0, 0, -1);
                    forward.applyQuaternion(this.playerGroup.quaternion);

                    // Calculate right vector
                    const right = new THREE.Vector3(1, 0, 0);
                    right.applyQuaternion(this.playerGroup.quaternion);

                    // Move the player group
                    this.playerGroup.position.add(right.multiplyScalar(moveX));
                    this.playerGroup.position.add(forward.multiplyScalar(moveZ));

                    // Provide haptic feedback for movement
                    if (gamepad.hapticActuators && gamepad.hapticActuators.length > 0) {
                        const intensity = Math.min(Math.sqrt(moveX * moveX + moveZ * moveZ), 0.5);
                        gamepad.hapticActuators[0].pulse(intensity, 16);
                    }
                }
            } else if (side === 'right') {
                // Right thumbstick controls snap rotation
                const wasPressed = this.controllerStates[side].thumbstickPressed;
                const isPressed = Math.abs(thumbstickX) > 0.7; // Higher threshold for snap rotation

                // Check if thumbstick just crossed the threshold
                if (isPressed && !wasPressed && currentTime - this.lastRotationTime > this.rotationCooldownTime) {
                    // Determine rotation direction
                    const rotationDirection = Math.sign(thumbstickX);
                    
                    // Apply snap rotation
                    this.playerGroup.rotateY(-this.snapAngle * rotationDirection);
                    
                    // Provide haptic feedback for rotation
                    if (gamepad.hapticActuators && gamepad.hapticActuators.length > 0) {
                        gamepad.hapticActuators[0].pulse(0.5, 50); // Stronger, longer pulse for snap rotation
                    }

                    // Update last rotation time
                    this.lastRotationTime = currentTime;
                }

                // Update thumbstick state
                this.controllerStates[side].thumbstickPressed = isPressed;
            }
        }

        // Check if controller is touching paddle
        const controllerPosition = new THREE.Vector3();
        controller.getWorldPosition(controllerPosition);
        
        // Calculate distance to paddle
        const paddlePosition = new THREE.Vector3();
        this.paddle.getWorldPosition(paddlePosition);
        const distance = controllerPosition.distanceTo(paddlePosition);

        // Update touching state
        const wasTouching = this.controllerStates[side].touching;
        this.controllerStates[side].touching = distance < 0.1; // 10cm threshold

        // Check grip button (Button 1 in mapping)
        const isGripping = gamepad.buttons[1] && gamepad.buttons[1].pressed;
        
        // Debug output for button states
        if (this.controllerStates[side].touching) {
            console.log(`${side} controller:`, {
                touching: this.controllerStates[side].touching,
                gripping: isGripping,
                distance: distance,
                thumbstick: side === 'left' ? 
                    { x: gamepad.axes[2], y: gamepad.axes[3] } : 
                    { x: gamepad.axes[2], y: gamepad.axes[3] }
            });
        }

        const wasGripping = this.controllerStates[side].gripping;
        this.controllerStates[side].gripping = isGripping;

        // Handle paddle control
        if (this.controllerStates[side].touching) {
            if (isGripping && !wasGripping) {
                // Just started gripping while touching
                this.activeSide = side;
                this.activeController = controller;
                
                // Strong haptic feedback for initial grab
                if (gamepad.hapticActuators && gamepad.hapticActuators.length > 0) {
                    gamepad.hapticActuators[0].pulse(1.0, 100);
                }
            }
        }

        // Update paddle control and provide continuous haptic feedback
        if (side === this.activeSide && this.controllerStates[side].gripping && this.controllerStates[side].touching) {
            // Calculate movement since last frame
            const movement = controllerPosition.distanceTo(this.controllerStates[side].lastPosition);
            
            // Update paddle position
            this.updatePaddlePosition(controllerPosition);

            // Provide haptic feedback based on movement
            if (movement > 0.001 && gamepad.hapticActuators && gamepad.hapticActuators.length > 0) {
                const intensity = THREE.MathUtils.clamp(movement * 10, 0.1, 0.5);
                gamepad.hapticActuators[0].pulse(intensity, 16);
            }
        }

        // Store current position for next frame
        this.controllerStates[side].lastPosition.copy(controllerPosition);
    }

    updatePaddlePosition(controllerPosition) {
        // Constrain paddle movement to table bounds
        const tableHalfWidth = 0.75;
        const clampedX = THREE.MathUtils.clamp(
            controllerPosition.x,
            -tableHalfWidth + 0.15,
            tableHalfWidth - 0.15
        );

        // Update paddle position
        this.paddle.position.x = clampedX;
    }

    createEnvironment() {
        // Create futuristic environment
        const gridHelper = new THREE.GridHelper(20, 20, 0x00ff00, 0x003300);
        this.scene.add(gridHelper);

        // Create walls with glowing effect
        const wallGeometry = new THREE.BoxGeometry(20, 10, 0.1);
        const wallMaterial = new THREE.MeshStandardMaterial({
            color: 0x001133,
            emissive: 0x001133,
            metalness: 0.8,
            roughness: 0.2
        });

        // Back wall
        const backWall = new THREE.Mesh(wallGeometry, wallMaterial);
        backWall.position.z = -10;
        this.scene.add(backWall);

        // Side walls
        const leftWall = new THREE.Mesh(wallGeometry, wallMaterial);
        leftWall.rotation.y = Math.PI / 2;
        leftWall.position.x = -10;
        this.scene.add(leftWall);

        const rightWall = new THREE.Mesh(wallGeometry, wallMaterial);
        rightWall.rotation.y = Math.PI / 2;
        rightWall.position.x = 10;
        this.scene.add(rightWall);
    }

    createTable() {
        // Create table (standard dining table is about 1.5m x 0.9m)
        const tableGeometry = new THREE.BoxGeometry(1.5, 0.1, 2);
        const tableMaterial = new THREE.MeshStandardMaterial({
            color: 0x0044ff,
            metalness: 0.7,
            roughness: 0.2,
            emissive: 0x001133
        });
        this.table = new THREE.Mesh(tableGeometry, tableMaterial);
        this.table.position.y = 0.8; // Standard table height
        this.table.position.z = -1.0; // Table 1m in front of spawn point
        this.scene.add(this.table);
    }

    createPaddle() {
        // Create paddle (scaled down to match table size)
        const paddleGeometry = new THREE.BoxGeometry(0.3, 0.1, 0.1);
        const paddleMaterial = new THREE.MeshStandardMaterial({
            color: 0x00ff00,
            emissive: 0x00ff00,
            emissiveIntensity: 0.5
        });
        this.paddle = new THREE.Mesh(paddleGeometry, paddleMaterial);
        this.paddle.position.set(0, 0.9, -0.1); // Position paddle at near end of table
        this.scene.add(this.paddle);
    }

    createBall() {
        // Create ball (scaled down to match table size)
        const ballGeometry = new THREE.SphereGeometry(0.02);
        const ballMaterial = new THREE.MeshStandardMaterial({
            color: 0xffff00,
            emissive: 0xffff00,
            emissiveIntensity: 0.5
        });
        this.ball = new THREE.Mesh(ballGeometry, ballMaterial);
        this.ball.position.set(0, 0.9, -1.0); // Start ball at center of table
        this.scene.add(this.ball);

        // Ball physics - reduced speed by half
        this.ballVelocity = new THREE.Vector3(0.01, 0, 0.01);
    }

    updateBall() {
        // Update ball position
        this.ball.position.add(this.ballVelocity);

        // Ball-table collision (adjusted for new table size)
        if (this.ball.position.x > 0.7 || this.ball.position.x < -0.7) {
            this.ballVelocity.x *= -1;
        }

        // Ball-paddle collision (adjusted for new table size)
        if (this.ball.position.z > -0.2 && this.ball.position.z < 0) {
            if (Math.abs(this.ball.position.x - this.paddle.position.x) < 0.2) {
                this.ballVelocity.z *= -1;
                // Add some random x velocity for variety (reduced by half)
                this.ballVelocity.x += (Math.random() - 0.5) * 0.005;
            }
        }

        // Reset ball if it goes past paddle
        if (this.ball.position.z > 0) {
            this.ball.position.set(0, 0.9, -1.0);
            this.ballVelocity.set(0.01, 0, 0.01); // Reset with slower speed
        }

        // Ball-back wall collision
        if (this.ball.position.z < -2.0) {
            this.ballVelocity.z *= -1;
        }
    }

    animate() {
        this.renderer.setAnimationLoop(() => {
            const session = this.renderer.xr.getSession();
            
            // Check both controllers if we have an active session
            if (session) {
                if (this.controllers[0]) this.checkControllerState(this.controllers[0], 'left');
                if (this.controllers[1]) this.checkControllerState(this.controllers[1], 'right');
            }

            this.updateBall();
            this.renderer.render(this.scene, this.camera);
        });
    }
}

// Start the game
new VRPongGame();
