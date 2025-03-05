import * as THREE from 'three';

export class MessageDisplay {
    constructor(scene) {
        this.scene = scene;
        this.message = '';
        this.isVisible = false;
        this.timeout = null;
        this.duration = 3000; // Default duration: 3 seconds
        
        this.createMessageDisplay();
        this.hide(); // Initially hidden
    }
    
    createMessageDisplay() {
        // Create container group
        this.messageGroup = new THREE.Group();
        
        // Create background panel
        const panelGeometry = new THREE.BoxGeometry(1.5, 0.3, 0.01);
        const panelMaterial = new THREE.MeshStandardMaterial({
            color: 0x000033,
            metalness: 0.8,
            roughness: 0.2,
            transparent: true,
            opacity: 0.7
        });
        
        this.panel = new THREE.Mesh(panelGeometry, panelMaterial);
        this.messageGroup.add(this.panel);
        
        // Create canvas for the message text
        this.canvas = document.createElement('canvas');
        this.canvas.width = 512;
        this.canvas.height = 128;
        this.context = this.canvas.getContext('2d');
        
        // Create texture from canvas
        this.texture = new THREE.CanvasTexture(this.canvas);
        
        // Create material with the texture
        this.material = new THREE.MeshBasicMaterial({
            map: this.texture,
            transparent: true
        });
        
        // Create plane geometry for the message display
        this.geometry = new THREE.PlaneGeometry(1.4, 0.25);
        this.mesh = new THREE.Mesh(this.geometry, this.material);
        this.mesh.position.z = 0.011;
        
        this.messageGroup.add(this.mesh);
        
        // Position the message display at the top center of the player's view
        this.messageGroup.position.set(0, 1.8, -1.5);
        
        this.scene.add(this.messageGroup);
    }
    
    showMessage(message, duration = this.duration) {
        this.message = message;
        this.updateDisplay();
        this.show();
        
        // Clear any existing timeout
        if (this.timeout) {
            clearTimeout(this.timeout);
        }
        
        // Set timeout to hide the message after duration
        this.timeout = setTimeout(() => {
            this.hide();
        }, duration);
    }
    
    updateDisplay() {
        // Clear the canvas
        this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Set text properties
        this.context.fillStyle = '#ffffff';
        this.context.font = 'bold 36px Arial';
        this.context.textAlign = 'center';
        this.context.textBaseline = 'middle';
        this.context.shadowColor = '#4444ff';
        this.context.shadowBlur = 15;
        
        // Draw the message
        this.context.fillText(
            this.message,
            this.canvas.width / 2,
            this.canvas.height / 2
        );
        
        // Update the texture
        this.texture.needsUpdate = true;
    }
    
    show() {
        this.messageGroup.visible = true;
        this.isVisible = true;
    }
    
    hide() {
        this.messageGroup.visible = false;
        this.isVisible = false;
    }
    
    dispose() {
        if (this.timeout) {
            clearTimeout(this.timeout);
        }
        
        this.geometry.dispose();
        this.material.dispose();
        this.texture.dispose();
        
        this.scene.remove(this.messageGroup);
    }
}
