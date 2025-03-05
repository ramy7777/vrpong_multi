import * as THREE from 'three';

export class Ball {
    constructor(scene) {
        this.scene = scene;
        this.initialSpeed = 0.015;
        this.speedIncrease = 1.1;
        this.maxSpeed = 0.05;
        this.hits = 0;
        this.ballVelocity = new THREE.Vector3(0, 0, 0);
        this.speed = 1.5;
        this.createBall();
        this.reset();
    }

    createBall() {
        // Create the main ball
        const ballGeometry = new THREE.SphereGeometry(0.02, 32, 32);
        const ballMaterial = new THREE.MeshStandardMaterial({
            color: 0x00ffff,
            emissive: 0x00ffff,
            emissiveIntensity: 0.8,
            metalness: 1.0,
            roughness: 0.2,
            transparent: true,
            opacity: 0.8
        });
        this.ball = new THREE.Mesh(ballGeometry, ballMaterial);
        this.scene.add(this.ball);

        // Create point light for ball reflection
        this.ballLight = new THREE.PointLight(0x00ffff, 2.0, 0.5);
        this.ballLight.position.copy(this.ball.position);
        this.ballLight.position.y -= 0.1; // Position light slightly below ball
        this.scene.add(this.ballLight);
    }

    reset() {
        this.ball.position.set(0, 0.9, -1.0);
        this.ballVelocity.set(0, 0, 0);
        this.hits = 0;
    }

    start() {
        // Random initial direction
        const angle = (Math.random() * Math.PI / 2) - Math.PI / 4; // -45 to 45 degrees
        this.ballVelocity.x = Math.sin(angle) * this.initialSpeed;
        this.ballVelocity.z = Math.cos(angle) * this.initialSpeed;
    }

    getBall() {
        return this.ball;
    }

    increaseSpeed() {
        const currentSpeed = this.ballVelocity.length();
        if (currentSpeed < this.maxSpeed) {
            this.ballVelocity.multiplyScalar(this.speedIncrease);
            if (this.ballVelocity.length() > this.maxSpeed) {
                this.ballVelocity.normalize().multiplyScalar(this.maxSpeed);
            }
        }
    }

    calculateReflectionAngle(hitPosition, paddlePosition) {
        const hitOffset = this.ball.position.x - paddlePosition.x;
        const normalizedOffset = hitOffset / 0.15;
        const maxAngle = Math.PI / 4;
        const angle = normalizedOffset * maxAngle;
        const speed = this.ballVelocity.length();
        const zDirection = this.ballVelocity.z > 0 ? -1 : 1;
        const xComponent = Math.sin(angle) * speed;
        const zComponent = Math.cos(angle) * speed * zDirection;
        return new THREE.Vector3(xComponent, 0, zComponent);
    }

    checkPaddleCollision(paddle) {
        // Check if paddle is a Paddle instance or already a mesh
        let paddleMesh;
        let paddleScale = { x: 0.3 }; // Default paddle width
        
        if (paddle.getPaddle && typeof paddle.getPaddle === 'function') {
            // It's a Paddle instance, get the mesh
            paddleMesh = paddle.getPaddle();
            // Use the actual paddle scale
            paddleScale = paddle;
        } else {
            // It's already a mesh
            paddleMesh = paddle;
        }
        
        if (!paddleMesh) {
            console.warn('Paddle mesh is undefined');
            return false;
        }
        
        const paddleBox = new THREE.Box3().setFromObject(paddleMesh);
        const ballBox = new THREE.Box3().setFromObject(this.ball);
        
        // Create a slightly larger box for edge detection
        const edgeBox = paddleBox.clone();
        edgeBox.expandByScalar(0.03);  // Increased buffer zone from 0.02 to 0.03
        
        if (ballBox.intersectsBox(edgeBox)) {
            // Calculate where on the paddle the ball hit
            const hitPoint = this.ball.position.clone();
            const paddleCenter = paddleMesh.position.clone();
            
            // Calculate the hit position relative to the paddle center
            const relativeX = hitPoint.x - paddleCenter.x;
            const relativeZ = hitPoint.z - paddleCenter.z;
            
            // Increased edge detection zone and added overlap check
            // Use paddleScale if available, otherwise use default
            const paddleWidth = paddleScale.width || 0.3;
            const edgeZone = paddleWidth * 0.45; // Increased from 0.4 to 0.45
            const isEdgeHit = Math.abs(relativeX) > edgeZone;
            
            // Additional check for edge overlap
            const edgeOverlap = Math.abs(relativeX) - edgeZone;
            if (isEdgeHit && edgeOverlap < 0.05) { // Only count edge hits within a reasonable range
                // Edge hit - reflect with a steeper angle and slight speed reduction
                const normalizedHitPoint = (relativeX / (paddleWidth * 0.5));
                const clampedHitPoint = Math.min(Math.max(normalizedHitPoint, -0.9), 0.9); // Prevent extreme angles
                const deflectionAngle = clampedHitPoint * (Math.PI / 3); // Up to 60 degrees
                
                // Maintain some of the original velocity but add strong sideways component
                const speed = this.ballVelocity.length() * 0.9; // Slight speed reduction
                const zDirection = this.ballVelocity.z > 0 ? -1 : 1;
                
                this.ballVelocity.x = Math.sin(deflectionAngle) * speed;
                this.ballVelocity.z = Math.cos(deflectionAngle) * speed * zDirection;
                
                return 'edge';
            }
            
            return 'center';
        }
        
        return false;
    }

    checkOutOfBounds() {
        if (this.ball.position.z > 0) {
            return 'player_score';
        } else if (this.ball.position.z < -2.0) {
            return 'ai_score';
        }
        return false;
    }

    update(delta, playerPaddle, aiPaddle) {
        const prevX = this.ball.position.x;
        const prevZ = this.ball.position.z;
        
        this.ball.position.add(this.ballVelocity);
        
        // Update light position to follow ball
        this.ballLight.position.copy(this.ball.position);
        this.ballLight.position.y -= 0.1;

        // Side wall collision
        if (this.ball.position.x > 0.7 || this.ball.position.x < -0.7) {
            this.ball.position.x = Math.sign(this.ball.position.x) * 0.7;
            this.ballVelocity.x *= -1;
        }

        // Player paddle collision
        if (this.ball.position.z > -0.2 && this.ball.position.z < 0) {
            const collisionType = this.checkPaddleCollision(playerPaddle);
            if (collisionType) {
                if (collisionType === 'center') {
                    this.ballVelocity.copy(this.calculateReflectionAngle(
                        this.ball.position,
                        playerPaddle.position
                    ));
                }
                // Edge hits are handled in checkPaddleCollision
                
                this.hits++;
                if (this.hits % 2 === 0) {
                    this.increaseSpeed();
                }
                return 'player';
            }
        }

        // AI paddle collision
        if (this.ball.position.z < -1.8 && this.ball.position.z > -2.0) {
            const collisionType = this.checkPaddleCollision(aiPaddle);
            if (collisionType) {
                if (collisionType === 'center') {
                    this.ballVelocity.z *= -1;
                    this.ballVelocity.x += (Math.random() - 0.5) * 0.005;
                }
                // Edge hits are handled in checkPaddleCollision
                
                this.hits++;
                if (this.hits % 2 === 0) {
                    this.increaseSpeed();
                }
                return 'ai';
            }
        }

        // Check if ball is out of bounds and return score type
        if (this.ball.position.z > 0 || this.ball.position.z < -2.0) {
            const scoreType = this.ball.position.z > 0 ? 'player_score' : 'ai_score';
            this.reset();
            return scoreType;
        }

        return false;
    }
}
