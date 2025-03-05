import * as THREE from 'three';

export class ScoreDisplay {
    constructor(scene, position, rotation, label = '') {
        this.score = 0;
        this.scene = scene;
        this.label = label;

        // Create canvas for the score texture
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

        // Create plane geometry for the score display
        this.geometry = new THREE.PlaneGeometry(1, 1);
        this.mesh = new THREE.Mesh(this.geometry, this.material);
        
        // Position and rotate the score display
        this.mesh.position.copy(position);
        this.mesh.rotation.copy(rotation);
        
        this.scene.add(this.mesh);
        
        // Initial render
        this.updateDisplay();
    }

    updateScore(newScore) {
        this.score = newScore;
        this.updateDisplay();
    }
    
    updateLabel(newLabel) {
        this.label = newLabel;
        this.updateDisplay();
    }

    updateDisplay() {
        // Clear the canvas
        this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Set text properties for the label
        if (this.label) {
            this.context.fillStyle = '#ffffff';
            this.context.font = 'bold 72px Arial';  
            this.context.textAlign = 'center';
            this.context.textBaseline = 'middle';
            this.context.shadowColor = '#4444ff';
            this.context.shadowBlur = 15;
            
            // Draw the label above the score
            this.context.fillText(this.label, 
                this.canvas.width / 2, 
                this.canvas.height / 5  
            );
        }
        
        // Set text properties for score
        this.context.fillStyle = '#ffffff';
        this.context.font = 'bold 200px Arial';
        this.context.textAlign = 'center';
        this.context.textBaseline = 'middle';
        this.context.shadowColor = '#4444ff';
        this.context.shadowBlur = 15;
        
        // Draw the score
        this.context.fillText(this.score.toString(), 
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
