import * as THREE from 'three';

export class Paddle {
    constructor(scene, isAI = false, paddleIndex = 0) {
        this.scene = scene;
        this.isAI = isAI;
        this.width = 0.3;      // Keep width the same for reasonable hit area
        this.height = 0.1;     // Keep height the same for visibility
        this.depth = 0.02;     // Make it much thinner (was 0.1)
        this.targetPosition = new THREE.Vector3();
        this.smoothSpeed = 0.35; // Increased from 0.25 for even faster AI movement
        this.lastPredictedX = 0;
        this.lastUpdateTime = 0;
        this.updateInterval = 30; // Update even more frequently (was 40)
        this.initialSpeed = 0.015;
        this.currentSpeed = this.initialSpeed;
        this.speedIncrement = 0.001; // Small increment for AI speed
        this.maxSpeed = 0.04; // Increased maximum speed to 0.04
        
        // Add ownership tracking
        this.paddleIndex = paddleIndex; // 0 for first paddle, 1 for second paddle
        this.ownerId = null; // Stores the player's ID who owns this paddle
        this.ownerIsHost = false; // Whether the owner is the host or not
        
        this.createPaddle();
    }

    createPaddle() {
        const paddleGeometry = new THREE.BoxGeometry(0.3, 0.2, this.depth);
        
        // Default neutral color when no one owns the paddle
        const neutralColor = 0x888888;
        
        this.paddleMaterial = new THREE.MeshStandardMaterial({
            color: neutralColor,
            emissive: neutralColor,
            emissiveIntensity: 0.5,
            metalness: 0.9,
            roughness: 0.2,
            transparent: true,
            opacity: 0.8
        });
        
        this.paddle = new THREE.Mesh(paddleGeometry, this.paddleMaterial);
        
        // Use fixed Z positions to ensure paddles are always on opposite sides
        // paddleIndex 0 (near end), paddleIndex 1 (far end)
        const zPosition = this.paddleIndex === 1 ? -1.9 : -0.1;
        this.paddle.position.set(0, 0.9, zPosition);

        // Add glow effect
        const glowGeometry = new THREE.BoxGeometry(0.31, 0.21, this.depth + 0.01);
        this.glowMaterial = new THREE.MeshBasicMaterial({
            color: neutralColor,
            transparent: true,
            opacity: 0.3
        });
        
        this.glow = new THREE.Mesh(glowGeometry, this.glowMaterial);
        this.paddle.add(this.glow);

        // Add energy field effect
        const fieldGeometry = new THREE.BoxGeometry(0.32, 0.22, 0.001);
        this.fieldMaterial = new THREE.MeshBasicMaterial({
            color: neutralColor,
            transparent: true,
            opacity: 0.2,
            side: THREE.DoubleSide
        });
        
        // Add energy field to front and back
        this.frontField = new THREE.Mesh(fieldGeometry, this.fieldMaterial);
        this.frontField.position.z = this.depth / 2 + 0.001;
        this.paddle.add(this.frontField);

        this.backField = new THREE.Mesh(fieldGeometry, this.fieldMaterial);
        this.backField.position.z = -(this.depth / 2 + 0.001);
        this.paddle.add(this.backField);

        this.scene.add(this.paddle);
    }

    // Claim ownership of this paddle
    claimOwnership(playerId, isHost) {
        this.ownerId = playerId;
        this.ownerIsHost = isHost;
        
        // Change color based on ownership
        const ownerColor = isHost ? 0x0088ff : 0xff8800; // Blue for host, Orange for guest
        
        // Update all materials
        this.paddleMaterial.color.setHex(ownerColor);
        this.paddleMaterial.emissive.setHex(ownerColor);
        this.glowMaterial.color.setHex(ownerColor);
        this.fieldMaterial.color.setHex(ownerColor);
        
        console.log(`Paddle ${this.paddleIndex} claimed by ${isHost ? 'Host' : 'Guest'} player ${playerId}`);
        
        return true;
    }
    
    // Release ownership
    releaseOwnership() {
        if (this.ownerId) {
            console.log(`Paddle ${this.paddleIndex} released by ${this.ownerIsHost ? 'Host' : 'Guest'}`);
            this.ownerId = null;
            
            // Reset to neutral color
            const neutralColor = 0x888888;
            this.paddleMaterial.color.setHex(neutralColor);
            this.paddleMaterial.emissive.setHex(neutralColor);
            this.glowMaterial.color.setHex(neutralColor);
            this.fieldMaterial.color.setHex(neutralColor);
        }
    }
    
    // Check if paddle is owned
    isOwned() {
        return this.ownerId !== null;
    }
    
    // Check if this player owns the paddle
    isOwnedBy(playerId) {
        return this.ownerId === playerId;
    }

    getPaddle() {
        return this.paddle;
    }

    getPosition() {
        return this.paddle.position;
    }

    setPosition(position) {
        // Preserve Z position when updating paddle position
        const currentZ = this.paddle.position.z;
        this.paddle.position.set(position.x, position.y, currentZ);
    }

    lerp(start, end, t) {
        return start * (1 - t) + end * t;
    }

    updateAI(ball, difficulty = 0.15) { // Increased base difficulty
        if (!this.isAI) return;

        const currentTime = performance.now();
        const targetX = ball.position.x;

        // Update prediction less frequently
        if (currentTime - this.lastUpdateTime > this.updateInterval) {
            // Calculate base target position
            let newTargetX = targetX;

            // Add very small random offset for natural movement
            const randomOffset = (Math.random() - 0.5) * 0.01; // Reduced randomness
            newTargetX += randomOffset;

            // Smooth transition to new target
            this.lastPredictedX = this.lerp(
                this.lastPredictedX,
                newTargetX,
                0.5 // Faster target updating
            );

            this.lastUpdateTime = currentTime;
        }

        // Calculate smooth movement
        const currentX = this.paddle.position.x;
        const diff = this.lastPredictedX - currentX;
        
        // Use quadratic easing for smoother acceleration/deceleration
        const direction = Math.sign(diff);
        const distance = Math.abs(diff);
        let speed = Math.min(distance * distance * 4, difficulty); // Increased acceleration

        // Move towards target
        if (Math.abs(diff) > 0.001) {
            const movement = direction * speed;
            const newX = this.lerp(
                currentX,
                currentX + movement,
                this.smoothSpeed
            );

            // Apply position with constraints
            this.paddle.position.x = THREE.MathUtils.clamp(
                newX,
                -0.6,
                0.6
            );
        }
    }
}
