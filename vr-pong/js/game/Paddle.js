import * as THREE from 'three';

export class Paddle {
    constructor(scene, isAI = false) {
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
        this.createPaddle();
    }

    createPaddle() {
        const paddleGeometry = new THREE.BoxGeometry(0.3, 0.2, this.depth);
        const paddleMaterial = new THREE.MeshStandardMaterial({
            color: 0x0088ff,
            emissive: 0x0088ff,
            emissiveIntensity: 0.5,
            metalness: 0.9,
            roughness: 0.2,
            transparent: true,
            opacity: 0.8
        });
        this.paddle = new THREE.Mesh(paddleGeometry, paddleMaterial);
        this.paddle.position.set(0, 0.9, this.isAI ? -1.9 : -0.1);

        // Add glow effect
        const glowGeometry = new THREE.BoxGeometry(0.31, 0.21, this.depth + 0.01);
        const glowMaterial = new THREE.MeshBasicMaterial({
            color: 0x0088ff,
            transparent: true,
            opacity: 0.3
        });
        const glow = new THREE.Mesh(glowGeometry, glowMaterial);
        this.paddle.add(glow);

        // Add energy field effect
        const fieldGeometry = new THREE.BoxGeometry(0.32, 0.22, 0.001);
        const fieldMaterial = new THREE.MeshBasicMaterial({
            color: 0x0088ff,
            transparent: true,
            opacity: 0.2,
            side: THREE.DoubleSide
        });
        
        // Add energy field to front and back
        const frontField = new THREE.Mesh(fieldGeometry, fieldMaterial);
        frontField.position.z = this.depth / 2 + 0.001;
        this.paddle.add(frontField);

        const backField = new THREE.Mesh(fieldGeometry, fieldMaterial);
        backField.position.z = -(this.depth / 2 + 0.001);
        this.paddle.add(backField);

        this.scene.add(this.paddle);
    }

    getPaddle() {
        return this.paddle;
    }

    getPosition() {
        return this.paddle.position;
    }

    setPosition(position) {
        this.paddle.position.copy(position);
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
