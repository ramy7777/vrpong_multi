import * as THREE from 'three';

export class Timer {
    constructor(scene, duration = 120) {
        this.scene = scene;
        this.duration = duration;
        this.timeLeft = duration;
        this.isRunning = false;

        // Create canvas for the timer texture
        this.canvas = document.createElement('canvas');
        this.canvas.width = 512;
        this.canvas.height = 512;
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
        this.geometry = new THREE.PlaneGeometry(1, 1);  // Same size as score display
        this.mesh = new THREE.Mesh(this.geometry, this.material);
        
        // Position the timer above the table
        this.mesh.position.set(0, 2.5, -1.5);
        this.mesh.rotation.set(0, 0, 0);
        
        this.scene.add(this.mesh);
        
        // Initial render
        this.updateDisplay();
    }

    start() {
        this.isRunning = true;
        this.timeLeft = this.duration;
        this.lastUpdate = performance.now();
    }

    stop() {
        this.isRunning = false;
    }

    reset() {
        this.timeLeft = this.duration;
        this.isRunning = false;
        this.updateDisplay();
    }

    update() {
        if (!this.isRunning) return false;

        const now = performance.now();
        const deltaTime = (now - this.lastUpdate) / 1000; // Convert to seconds
        this.lastUpdate = now;

        this.timeLeft -= deltaTime;
        
        if (this.timeLeft <= 0) {
            this.timeLeft = 0;
            this.isRunning = false;
            this.updateDisplay();
            return true; // Timer finished
        }

        this.updateDisplay();
        return false; // Timer still running
    }

    updateDisplay() {
        // Clear the canvas
        this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Set text properties
        this.context.shadowColor = '#4444ff';
        this.context.shadowBlur = 15;  // Subtle glow
        this.context.fillStyle = '#ffffff';
        this.context.font = 'bold 200px Arial';  // Same font size as score display
        this.context.textAlign = 'center';
        this.context.textBaseline = 'middle';
        
        // Format time as MM:SS
        const minutes = Math.floor(this.timeLeft / 60);
        const seconds = Math.ceil(this.timeLeft % 60);
        const displayText = `${minutes}:${seconds.toString().padStart(2, '0')}`;
        
        // Draw the timer
        this.context.fillText(displayText, 
            this.canvas.width / 2, 
            this.canvas.height / 2
        );
        
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
