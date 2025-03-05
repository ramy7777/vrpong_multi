import * as THREE from 'three';

export class StartButton {
    constructor(scene) {
        this.scene = scene;
        this.isPressed = false;
        // Add debounce mechanism to prevent multiple activations
        this.lastPressTime = 0;
        this.buttonCooldown = 800; // 800ms cooldown to prevent accidental double clicks
        this.createButton();
    }

    createButton() {
        // Create button geometry
        const buttonGeometry = new THREE.BoxGeometry(0.3, 0.1, 0.05);
        const buttonMaterial = new THREE.MeshStandardMaterial({
            color: 0xff0000, // Red color
            emissive: 0xff0000,
            emissiveIntensity: 0.5,
            metalness: 0.8,
            roughness: 0.2
        });
        this.button = new THREE.Mesh(buttonGeometry, buttonMaterial);
        this.button.position.set(0, 1.3, -1.0); // Position above the table

        // Add glow effect
        const glowGeometry = new THREE.BoxGeometry(0.32, 0.12, 0.06);
        const glowMaterial = new THREE.MeshBasicMaterial({
            color: 0xff0000, // Red color
            transparent: true,
            opacity: 0.3
        });
        this.glow = new THREE.Mesh(glowGeometry, glowMaterial);
        this.button.add(this.glow);

        // Create text
        const loader = new THREE.TextureLoader();
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.width = 256;
        canvas.height = 128;
        
        // Clear canvas to be transparent
        context.clearRect(0, 0, canvas.width, canvas.height);
        
        // Add text with smaller font
        context.font = 'bold 43px Arial'; // Reduced from 72px
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillStyle = '#ffffff';
        context.strokeStyle = '#000000';
        context.lineWidth = 3; // Reduced stroke width for smaller text
        
        // Add stroke for better visibility
        context.strokeText('START', canvas.width / 2, canvas.height / 2);
        context.fillText('START', canvas.width / 2, canvas.height / 2);

        const textTexture = new THREE.CanvasTexture(canvas);
        const textMaterial = new THREE.MeshBasicMaterial({
            map: textTexture,
            transparent: true,
            opacity: 1.0,
            side: THREE.DoubleSide
        });
        
        const textGeometry = new THREE.PlaneGeometry(0.24, 0.12); // Reduced from 0.4, 0.2
        this.textMesh = new THREE.Mesh(textGeometry, textMaterial);
        this.textMesh.position.z = 0.04; // Adjusted z position
        this.button.add(this.textMesh);

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
        console.log(`Button highlighted, isPressed=${this.isPressed}`);
        if (!this.isPressed) {
            this.button.material.color.setHex(0x00ff00); // Green color
            this.button.material.emissive.setHex(0x00ff00);
            this.button.material.emissiveIntensity = 1.0;
            this.glow.material.color.setHex(0x00ff00);
            this.glow.material.opacity = 0.5;
        }
    }

    unhighlight() {
        console.log(`Button unhighlighted, isPressed=${this.isPressed}`);
        this.button.material.color.setHex(0xff0000); // Back to red
        this.button.material.emissive.setHex(0xff0000);
        this.button.material.emissiveIntensity = 0.5;
        this.glow.material.color.setHex(0xff0000);
        this.glow.material.opacity = 0.3;
        
        // Reset position if was pressed
        if (this.isPressed) {
            console.log(`Resetting button position and isPressed state`);
            this.button.position.z -= 0.02; // Return to original position
            this.isPressed = false;
        }
    }

    press() {
        // Implement debounce to prevent rapid repeated button presses
        const now = Date.now();
        if (now - this.lastPressTime < this.buttonCooldown) {
            console.log(`Start button press ignored (cooldown active): ${now - this.lastPressTime}ms since last press. Last press: ${this.lastPressTime}, Current time: ${now}, Cooldown: ${this.buttonCooldown}ms`);
            return false;
        }
        
        console.log(`Button pressed! isPressed=${this.isPressed}, setting to true`);
        this.lastPressTime = now;
        this.isPressed = true;
        
        this.button.position.z += 0.02;
        this.button.material.color.setHex(0x00ff00);
        this.button.material.emissive.setHex(0x00ff00);
        this.button.material.emissiveIntensity = 1.0;
        this.glow.material.color.setHex(0x00ff00);
        this.glow.material.opacity = 0.7;
        
        // Reset button state after a short delay
        console.log(`Setting timeout to reset button in 300ms`);
        setTimeout(() => {
            console.log(`Reset timeout triggered, calling unhighlight()`);
            this.unhighlight();
            // Force isPressed to false to ensure proper reset
            this.isPressed = false;
        }, 300);
        
        return true;
    }

    // Force reset all button state and appearance
    forceReset() {
        console.log(`Force resetting button state`);
        this.isPressed = false;
        this.button.position.z = -1.0; // Reset to original Z position
        this.unhighlight();
    }

    reset() {
        console.log(`Button reset called, isPressed=${this.isPressed}`);
        this.isPressed = false;
        this.button.position.z = -1.0;
        this.unhighlight();
    }

    hide() {
        this.button.visible = false;
        // Ensure button is fully reset when hidden
        this.forceReset();
    }

    show() {
        this.button.visible = true;
        this.reset();
    }
    
    // Update button text with new text content
    updateButtonText(text) {
        // Create a new canvas for the updated text
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.width = 256;
        canvas.height = 128;
        
        // Clear canvas to be transparent
        context.clearRect(0, 0, canvas.width, canvas.height);
        
        // Add text with smaller font
        context.font = 'bold 43px Arial';
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillStyle = '#ffffff';
        context.strokeStyle = '#000000';
        context.lineWidth = 3;
        
        // Add stroke for better visibility
        context.strokeText(text, canvas.width / 2, canvas.height / 2);
        context.fillText(text, canvas.width / 2, canvas.height / 2);

        // Update the texture on the existing textMesh
        if (this.textMesh && this.textMesh.material && this.textMesh.material.map) {
            // Dispose of old texture to prevent memory leaks
            this.textMesh.material.map.dispose();
            
            // Create and assign new texture
            const textTexture = new THREE.CanvasTexture(canvas);
            this.textMesh.material.map = textTexture;
            this.textMesh.material.needsUpdate = true;
        }
    }
    
    getMesh() {
        return this.button;
    }
}
