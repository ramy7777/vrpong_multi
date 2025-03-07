import * as THREE from 'three';

export class RestartButton {
    constructor(scene) {
        this.scene = scene;
        this.isPressed = false;
        // Add debounce mechanism to prevent multiple activations
        this.lastPressTime = 0;
        this.buttonCooldown = 800; // 800ms cooldown to prevent accidental double clicks
        this.visible = false;
        this.createButton();
    }

    createButton() {
        // Create button geometry
        const buttonGeometry = new THREE.BoxGeometry(0.3, 0.1, 0.05);
        const buttonMaterial = new THREE.MeshStandardMaterial({
            color: 0x2196F3, // Blue color
            emissive: 0x2196F3,
            emissiveIntensity: 0.5,
            metalness: 0.8,
            roughness: 0.2
        });
        this.button = new THREE.Mesh(buttonGeometry, buttonMaterial);
        this.button.position.set(0, 1.3, -1.0); // Position above the table

        // Add glow effect
        const glowGeometry = new THREE.BoxGeometry(0.32, 0.12, 0.06);
        const glowMaterial = new THREE.MeshBasicMaterial({
            color: 0x2196F3, // Blue color
            transparent: true,
            opacity: 0.3
        });
        this.glow = new THREE.Mesh(glowGeometry, glowMaterial);
        this.button.add(this.glow);

        // Create text
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.width = 256;
        canvas.height = 128;
        
        // Clear canvas to be transparent
        context.clearRect(0, 0, canvas.width, canvas.height);
        
        // Add text with smaller font
        context.font = 'bold 36px Arial'; // Slightly smaller for longer text
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillStyle = '#ffffff';
        context.strokeStyle = '#000000';
        context.lineWidth = 3; // Reduced stroke width for smaller text
        
        // Add stroke for better visibility
        context.strokeText('RESTART', canvas.width / 2, canvas.height / 2);
        context.fillText('RESTART', canvas.width / 2, canvas.height / 2);

        const textTexture = new THREE.CanvasTexture(canvas);
        const textMaterial = new THREE.MeshBasicMaterial({
            map: textTexture,
            transparent: true,
            opacity: 1.0,
            side: THREE.DoubleSide
        });
        
        const textGeometry = new THREE.PlaneGeometry(0.24, 0.12);
        this.textMesh = new THREE.Mesh(textGeometry, textMaterial);
        this.textMesh.position.z = 0.04; // Adjusted z position
        this.button.add(this.textMesh);

        // Initially hide the button
        this.button.visible = false;
        this.scene.add(this.button);
    }

    checkIntersection(controller) {
        const tempMatrix = new THREE.Matrix4();
        tempMatrix.identity().extractRotation(controller.matrixWorld);

        const raycaster = new THREE.Raycaster();
        raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
        raycaster.ray.direction.set(0, 0, -1).applyMatrix4(tempMatrix);

        const intersects = raycaster.intersectObject(this.button);
        return intersects.length > 0;
    }

    highlight() {
        if (!this.isPressed) {
            this.button.material.color.setHex(0x64B5F6); // Lighter blue
            this.button.material.emissive.setHex(0x64B5F6);
            this.button.material.emissiveIntensity = 1.0;
            this.glow.material.color.setHex(0x64B5F6);
            this.glow.material.opacity = 0.5;
        }
    }

    unhighlight() {
        this.button.material.color.setHex(0x2196F3); // Back to blue
        this.button.material.emissive.setHex(0x2196F3);
        this.button.material.emissiveIntensity = 0.5;
        this.glow.material.color.setHex(0x2196F3);
        this.glow.material.opacity = 0.3;
        
        // Reset position if was pressed
        if (this.isPressed) {
            this.button.position.z -= 0.02; // Return to original position
            this.isPressed = false;
        }
    }

    press() {
        // Implement debounce to prevent rapid repeated button presses
        const now = Date.now();
        if (now - this.lastPressTime < this.buttonCooldown) {
            return false;
        }
        
        this.lastPressTime = now;
        this.isPressed = true;
        
        this.button.position.z += 0.02;
        this.button.material.color.setHex(0x64B5F6);
        this.button.material.emissive.setHex(0x64B5F6);
        this.button.material.emissiveIntensity = 1.0;
        this.glow.material.color.setHex(0x64B5F6);
        this.glow.material.opacity = 0.7;
        
        // Reset button state after a short delay
        setTimeout(() => {
            this.unhighlight();
            // Force isPressed to false to ensure proper reset
            this.isPressed = false;
        }, 300);
        
        return true;
    }

    reset() {
        this.isPressed = false;
        this.button.position.z = -1.0;
        this.unhighlight();
    }

    hide() {
        this.button.visible = false;
        this.visible = false;
    }

    show() {
        this.button.visible = true;
        this.visible = true;
        this.reset();
    }
    
    isVisible() {
        return this.visible;
    }
    
    getMesh() {
        return this.button;
    }
} 