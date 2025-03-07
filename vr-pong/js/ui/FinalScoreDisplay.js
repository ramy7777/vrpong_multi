import * as THREE from 'three';

export class FinalScoreDisplay {
    constructor(scene) {
        this.scene = scene;
        this.visible = false;
        this.playerScore = 0;
        this.aiScore = 0;
        
        // Create canvas for the final score display
        this.canvas = document.createElement('canvas');
        this.canvas.width = 1024;
        this.canvas.height = 512;
        this.context = this.canvas.getContext('2d');
        
        // Create texture from canvas
        this.texture = new THREE.CanvasTexture(this.canvas);
        
        // Create material with the texture
        this.material = new THREE.MeshBasicMaterial({
            map: this.texture,
            transparent: true,
            side: THREE.DoubleSide,
            opacity: 0.9
        });
        
        // Create plane geometry for the score display
        this.geometry = new THREE.PlaneGeometry(2, 1);
        this.mesh = new THREE.Mesh(this.geometry, this.material);
        
        // Position the display above the table
        this.mesh.position.set(0, 1.7, -1.0);
        this.mesh.rotation.set(0, 0, 0);
        
        // Initially hide the display
        this.mesh.visible = false;
        this.scene.add(this.mesh);
    }
    
    show(playerScore, aiScore) {
        this.playerScore = playerScore;
        this.aiScore = aiScore;
        this.updateDisplay();
        this.mesh.visible = true;
        this.visible = true;
    }
    
    hide() {
        this.mesh.visible = false;
        this.visible = false;
    }
    
    isVisible() {
        return this.visible;
    }
    
    updateDisplay() {
        // Clear the canvas
        this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Add background with rounded corners
        this.context.fillStyle = 'rgba(0, 0, 0, 0.7)';
        this.roundRect(this.context, 10, 10, this.canvas.width - 20, this.canvas.height - 20, 20);
        this.context.fill();
        
        // Set text properties for the title
        this.context.fillStyle = '#FF5252'; // Red color for Game Over
        this.context.font = 'bold 100px Arial';
        this.context.textAlign = 'center';
        this.context.textBaseline = 'top';
        this.context.shadowColor = '#FF0000';
        this.context.shadowBlur = 15;
        
        // Draw the Game Over text
        this.context.fillText('GAME OVER', this.canvas.width / 2, 50);
        
        // Set text properties for the final score
        this.context.fillStyle = '#FFFFFF';
        this.context.font = 'bold 72px Arial';
        this.context.shadowColor = '#4444FF';
        this.context.shadowBlur = 10;
        
        // Draw the final score title
        this.context.fillText('FINAL SCORE', this.canvas.width / 2, 170);
        
        // Draw scores
        this.context.font = 'bold 130px Arial';
        
        // Determine winner and set colors
        let playerColor = '#FFFFFF';
        let aiColor = '#FFFFFF';
        let resultText = 'DRAW';
        
        if (this.playerScore > this.aiScore) {
            playerColor = '#4CAF50'; // Green for winner
            resultText = 'YOU WIN!';
        } else if (this.aiScore > this.playerScore) {
            aiColor = '#4CAF50'; // Green for winner
            resultText = 'AI WINS!';
        }
        
        // Player score
        this.context.fillStyle = playerColor;
        this.context.fillText(this.playerScore.toString(), this.canvas.width / 2 - 150, 250);
        
        // Score separator
        this.context.fillStyle = '#FFFFFF';
        this.context.fillText('-', this.canvas.width / 2, 250);
        
        // AI score
        this.context.fillStyle = aiColor;
        this.context.fillText(this.aiScore.toString(), this.canvas.width / 2 + 150, 250);
        
        // Draw result text
        this.context.fillStyle = '#FFD54F'; // Gold color
        this.context.font = 'bold 80px Arial';
        this.context.shadowColor = '#FFC107';
        this.context.shadowBlur = 15;
        this.context.fillText(resultText, this.canvas.width / 2, 380);
        
        // Update the texture
        this.texture.needsUpdate = true;
    }
    
    // Helper function to draw rounded rectangles
    roundRect(ctx, x, y, width, height, radius) {
        if (width < 2 * radius) radius = width / 2;
        if (height < 2 * radius) radius = height / 2;
        ctx.beginPath();
        ctx.moveTo(x + radius, y);
        ctx.arcTo(x + width, y, x + width, y + height, radius);
        ctx.arcTo(x + width, y + height, x, y + height, radius);
        ctx.arcTo(x, y + height, x, y, radius);
        ctx.arcTo(x, y, x + width, y, radius);
        ctx.closePath();
        return ctx;
    }
    
    dispose() {
        this.geometry.dispose();
        this.material.dispose();
        this.texture.dispose();
        this.scene.remove(this.mesh);
    }
} 