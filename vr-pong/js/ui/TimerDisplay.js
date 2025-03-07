import * as THREE from 'three';

export class TimerDisplay {
    constructor(scene, position, rotation) {
        this.scene = scene;
        this.timeLeft = 0;
        
        // Create canvas for the timer texture
        this.canvas = document.createElement('canvas');
        this.canvas.width = 512;
        this.canvas.height = 256; // Half height since we only need to display time
        this.context = this.canvas.getContext('2d');

        // Create texture from canvas
        this.texture = new THREE.CanvasTexture(this.canvas);
        
        // Create material with the texture
        this.material = new THREE.MeshBasicMaterial({
            map: this.texture,
            transparent: true,
            side: THREE.DoubleSide
        });

        // Create plane geometry for the timer display
        this.geometry = new THREE.PlaneGeometry(0.8, 0.4); // Smaller than score display
        this.mesh = new THREE.Mesh(this.geometry, this.material);
        
        // Position and rotate the timer display
        this.mesh.position.copy(position);
        this.mesh.rotation.copy(rotation);
        
        this.scene.add(this.mesh);
        
        // Initial render
        this.updateDisplay();
    }

    updateTime(timeLeft) {
        this.timeLeft = timeLeft;
        this.updateDisplay();
    }

    updateDisplay() {
        // Clear the canvas
        this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Set text properties
        this.context.shadowColor = '#4444ff';
        this.context.shadowBlur = 10;
        this.context.fillStyle = '#ffffff';
        this.context.font = 'bold 72px Arial';
        this.context.textAlign = 'center';
        this.context.textBaseline = 'middle';
        
        // Format time as MM:SS
        const minutes = Math.floor(this.timeLeft / 60);
        const seconds = Math.ceil(this.timeLeft % 60);
        const displayText = `${minutes}:${seconds.toString().padStart(2, '0')}`;
        
        // Draw the timer label
        this.context.font = 'bold 32px Arial';
        this.context.fillText('TIME', this.canvas.width / 2, 50);
        
        // Draw the timer value
        this.context.font = 'bold 72px Arial';
        this.context.fillText(displayText, this.canvas.width / 2, this.canvas.height / 2 + 30);
        
        // Update the texture
        this.texture.needsUpdate = true;
    }

    dispose() {
        this.geometry.dispose();
        this.material.dispose();
        this.texture.dispose();
        this.scene.remove(this.mesh);
    }
} 