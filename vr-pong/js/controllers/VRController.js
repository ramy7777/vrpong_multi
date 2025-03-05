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
        this.controllers[0].addEventListener('selectstart', () => {
            this.controllers[0].userData.isSelecting = true;
        });
        this.controllers[0].addEventListener('selectend', () => {
            this.controllers[0].userData.isSelecting = false;
        });
        this.playerGroup.add(this.controllers[0]);

        // Right Controller (1)
        this.controllers[1] = this.renderer.xr.getController(1);
        this.controllers[1].addEventListener('selectstart', () => {
            this.controllers[1].userData.isSelecting = true;
        });
        this.controllers[1].addEventListener('selectend', () => {
            this.controllers[1].userData.isSelecting = false;
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

            if (side === 'left') {
                this.handleMovement(thumbstickX, thumbstickY, gamepad);
            } else if (side === 'right') {
                this.handleRotation(thumbstickX, gamepad, currentTime);
            }
        }
    }

    handleMovement(thumbstickX, thumbstickY, gamepad) {
        if (Math.abs(thumbstickX) > 0.1 || Math.abs(thumbstickY) > 0.1) {
            const moveX = thumbstickX * this.moveSpeed;
            const moveZ = -thumbstickY * this.moveSpeed;

            const forward = new THREE.Vector3(0, 0, -1);
            forward.applyQuaternion(this.playerGroup.quaternion);

            const right = new THREE.Vector3(1, 0, 0);
            right.applyQuaternion(this.playerGroup.quaternion);

            this.playerGroup.position.add(right.multiplyScalar(moveX));
            this.playerGroup.position.add(forward.multiplyScalar(moveZ));

            if (gamepad.hapticActuators?.[0]) {
                const intensity = Math.min(Math.sqrt(moveX * moveX + moveZ * moveZ), 0.5);
                gamepad.hapticActuators[0].pulse(intensity, 16);
            }
        }
    }

    handleRotation(thumbstickX, gamepad, currentTime) {
        const wasPressed = this.controllerStates.right.thumbstickPressed;
        const isPressed = Math.abs(thumbstickX) > 0.7;

        if (isPressed && !wasPressed && currentTime - this.lastRotationTime > this.rotationCooldownTime) {
            const rotationDirection = Math.sign(thumbstickX);
            this.playerGroup.rotateY(-this.snapAngle * rotationDirection);
            
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
        
        this.handleThumbstickInput(side, gamepad, currentTime);
        this.handlePaddleControl(side, controller, gamepad, paddle);
    }
}
