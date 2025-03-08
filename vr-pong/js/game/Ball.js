import * as THREE from 'three';

export class Ball {
    constructor(scene) {
        this.scene = scene;
        this.initialSpeed = 0.015;
        this.speedIncrease = 1.05;
        this.maxSpeed = 0.08;
        this.hits = 0;
        this.ballVelocity = new THREE.Vector3(0, 0, 0);
        this.speed = 1.5;
        // Track the highest speed reached during gameplay
        this.highestSpeedReached = this.initialSpeed;
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
        // Reset highest speed back to initial speed when game resets
        this.highestSpeedReached = this.initialSpeed;
    }

    start() {
        // Random initial direction
        const angle = (Math.random() * Math.PI / 2) - Math.PI / 4; // -45 to 45 degrees
        // Randomly choose a direction (toward player or AI)
        const direction = Math.random() > 0.5 ? 1 : -1;
        this.ballVelocity.x = Math.sin(angle) * this.initialSpeed;
        this.ballVelocity.z = Math.cos(angle) * this.initialSpeed * direction;
        
        // Debug logging for ball start
        // console.log(`Ball started - Initial angle: ${(angle * 180 / Math.PI).toFixed(2)} degrees, Direction: ${direction > 0 ? 'toward player' : 'toward AI'}`);
        // console.log(`Initial velocity: (${this.ballVelocity.x.toFixed(5)}, ${this.ballVelocity.y.toFixed(5)}, ${this.ballVelocity.z.toFixed(5)})`);
    }

    getBall() {
        return this.ball;
    }

    increaseSpeed() {
        const currentSpeed = this.ballVelocity.length();
        if (currentSpeed < this.maxSpeed) {
            this.ballVelocity.multiplyScalar(this.speedIncrease);
            
            // Check if we've reached a new highest speed
            const newSpeed = this.ballVelocity.length();
            if (newSpeed > this.highestSpeedReached) {
                console.log(`New highest speed reached: ${newSpeed.toFixed(5)} (previous: ${this.highestSpeedReached.toFixed(5)})`);
                this.highestSpeedReached = newSpeed;
            }
            
            // Cap at max speed if needed
            if (this.ballVelocity.length() > this.maxSpeed) {
                this.ballVelocity.normalize().multiplyScalar(this.maxSpeed);
                this.highestSpeedReached = this.maxSpeed;
            }
        }
    }

    calculateReflectionAngle(hitPosition, paddlePosition) {
        // Validate input parameters
        if (!paddlePosition || typeof paddlePosition.x === 'undefined') {
            console.warn('Invalid paddle position in calculateReflectionAngle:', paddlePosition);
            // Return a default vector in the opposite z direction
            const defaultSpeed = this.ballVelocity.length();
            const defaultVector = new THREE.Vector3(
                this.ballVelocity.x * -0.2, // Slightly reduce x component
                0,
                this.ballVelocity.z * -1 // Reverse z direction
            );
            // Normalize and apply the current speed (maintain speed)
            return defaultVector.normalize().multiplyScalar(Math.max(defaultSpeed, this.highestSpeedReached));
        }

        // Calculate horizontal offset from paddle center
        const horizontalOffset = hitPosition.x - paddlePosition.x;
        
        // Normalize the offset to range from -1 to 1
        // Assuming paddle width is 0.3
        const paddleHalfWidth = 0.15;
        const normalizedOffset = THREE.MathUtils.clamp(horizontalOffset / paddleHalfWidth, -1, 1);
        
        // Calculate reflection angle based on hit position
        // Center hits go straight, edge hits go at an angle
        const maxAngle = Math.PI / 3; // 60 degrees for maximum angle
        const reflectionAngle = normalizedOffset * maxAngle;
        
        // Calculate the reflected direction
        const speed = Math.max(this.ballVelocity.length(), this.highestSpeedReached); // Maintain at least current speed
        const direction = new THREE.Vector3(
            Math.sin(reflectionAngle), // X component based on angle
            0, // No vertical movement
            -Math.cos(reflectionAngle) * Math.sign(this.ballVelocity.z) // Z direction reversed
        );
        
        // Ensure the new vector has the same speed as before
        return direction.normalize().multiplyScalar(speed);
    }

    checkPaddleCollision(paddle) {
        // Early validation check
        if (!paddle) {
            console.warn('Paddle is undefined in checkPaddleCollision');
            return false;
        }
        
        // Enhanced debugging
        // console.log(`Checking paddle collision with ball position: (${this.ball.position.x.toFixed(3)}, ${this.ball.position.y.toFixed(3)}, ${this.ball.position.z.toFixed(3)})`);
        
        // Check if paddle is a Paddle instance or already a mesh
        let paddleMesh;
        let paddleScale = { width: 0.3, height: 0.2, depth: 0.05 }; // Default paddle dimensions
        
        try {
            if (paddle.getPaddle && typeof paddle.getPaddle === 'function') {
                // It's a Paddle instance, get the mesh
                paddleMesh = paddle.getPaddle();
                // Use the actual paddle scale
                paddleScale.width = paddle.width || 0.3;
                paddleScale.height = paddle.height || 0.2;
                paddleScale.depth = paddle.depth || 0.05;
                // console.log(`Using Paddle instance with dimensions: ${paddleScale.width} x ${paddleScale.height} x ${paddleScale.depth}`);
            } else {
                // It's already a mesh
                paddleMesh = paddle;
                // Try to extract scale from geometry if available
                if (paddleMesh.geometry && paddleMesh.geometry.parameters) {
                    paddleScale.width = paddleMesh.geometry.parameters.width || 0.3;
                    paddleScale.height = paddleMesh.geometry.parameters.height || 0.2;
                    paddleScale.depth = paddleMesh.geometry.parameters.depth || 0.05;
                }
                // console.log(`Using paddle mesh directly with dimensions: ${paddleScale.width} x ${paddleScale.height} x ${paddleScale.depth}`);
            }
        } catch (error) {
            console.error(`Error getting paddle mesh: ${error.message}`);
            return false;
        }
        
        if (!paddleMesh) {
            console.warn('Paddle mesh is undefined after retrieval attempt');
            return false;
        }
        
        // Force update paddle matrix for accurate bounds calculation
        paddleMesh.updateMatrixWorld(true);
        
        // Create bounding boxes using updated world matrices
        const paddleBox = new THREE.Box3().setFromObject(paddleMesh);
        this.ball.updateMatrixWorld(true);
        const ballBox = new THREE.Box3().setFromObject(this.ball);
        
        // Log bounding boxes for debugging
        // console.log(`Paddle box min: (${paddleBox.min.x.toFixed(3)}, ${paddleBox.min.y.toFixed(3)}, ${paddleBox.min.z.toFixed(3)})`);
        // console.log(`Paddle box max: (${paddleBox.max.x.toFixed(3)}, ${paddleBox.max.y.toFixed(3)}, ${paddleBox.max.z.toFixed(3)})`);
        // console.log(`Ball box min: (${ballBox.min.x.toFixed(3)}, ${ballBox.min.y.toFixed(3)}, ${ballBox.min.z.toFixed(3)})`);
        // console.log(`Ball box max: (${ballBox.max.x.toFixed(3)}, ${ballBox.max.y.toFixed(3)}, ${ballBox.max.z.toFixed(3)})`);
        
        // Create a slightly larger box for edge detection
        const edgeBox = paddleBox.clone();
        edgeBox.expandByScalar(0.03);  // Buffer zone for edge detection
        
        const intersects = ballBox.intersectsBox(edgeBox);
        // console.log(`Intersection detected: ${intersects}`);
        
        if (intersects) {
            // Calculate where on the paddle the ball hit
            const hitPoint = this.ball.position.clone();
            const paddleCenter = paddleMesh.position.clone();
            
            // console.log(`Hit point: (${hitPoint.x.toFixed(3)}, ${hitPoint.y.toFixed(3)}, ${hitPoint.z.toFixed(3)})`);
            // console.log(`Paddle center: (${paddleCenter.x.toFixed(3)}, ${paddleCenter.y.toFixed(3)}, ${paddleCenter.z.toFixed(3)})`);
            
            // Calculate the hit position relative to the paddle center
            const relativeX = hitPoint.x - paddleCenter.x;
            const relativeZ = hitPoint.z - paddleCenter.z;
            
            // console.log(`Relative hit position: X=${relativeX.toFixed(3)}, Z=${relativeZ.toFixed(3)}`);
            
            // Increased edge detection zone and added overlap check
            const paddleWidth = paddleScale.width;
            const edgeZone = paddleWidth * 0.45; // Edge zone is 45% of paddle width
            const isEdgeHit = Math.abs(relativeX) > edgeZone;
            
            // console.log(`Edge detection - Paddle width: ${paddleWidth}, Edge zone: ${edgeZone}, Is edge hit: ${isEdgeHit}`);
            
            // Additional check for edge overlap
            const edgeOverlap = Math.abs(relativeX) - edgeZone;
            if (isEdgeHit && edgeOverlap < 0.05) { // Only count edge hits within a reasonable range
                // Edge hit - reflect with a steeper angle but maintain speed
                const normalizedHitPoint = (relativeX / (paddleWidth * 0.5));
                const clampedHitPoint = Math.min(Math.max(normalizedHitPoint, -0.9), 0.9); // Prevent extreme angles
                const deflectionAngle = clampedHitPoint * (Math.PI / 3); // Up to 60 degrees
                
                // Calculate current speed
                const currentSpeed = this.ballVelocity.length();
                // Use at least the highest speed reached to avoid slowdowns
                const speed = Math.max(currentSpeed, this.highestSpeedReached);
                const zDirection = this.ballVelocity.z > 0 ? -1 : 1;
                
                // Create new velocity vector with maintained/increased speed
                this.ballVelocity.x = Math.sin(deflectionAngle) * speed;
                this.ballVelocity.z = Math.cos(deflectionAngle) * speed * zDirection;
                
                // Update highest speed if we've increased it
                if (speed > this.highestSpeedReached) {
                    console.log(`New highest speed reached during edge hit: ${speed.toFixed(5)}`);
                    this.highestSpeedReached = speed;
                }
                
                return 'edge';
            }
            
            // console.log(`Center hit detected`);
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

    // Update method to maintain current speed level
    ensureMinimumSpeed() {
        const currentSpeed = this.ballVelocity.length();
        // Only check if ball is actually moving
        if (currentSpeed > 0 && currentSpeed < this.highestSpeedReached) {
            // Ball is moving but below its highest reached speed, so increase it
            console.log(`Ball speed (${currentSpeed.toFixed(5)}) below highest speed (${this.highestSpeedReached.toFixed(5)}), restoring to highest speed`);
            // Maintain direction but restore speed
            this.ballVelocity.normalize().multiplyScalar(this.highestSpeedReached);
        }
    }

    update(delta, playerPaddle, aiPaddle) {
        const prevX = this.ball.position.x;
        const prevZ = this.ball.position.z;
        
        // Debug information about current ball state
        // console.log(`Ball update - Position before: (${this.ball.position.x.toFixed(3)}, ${this.ball.position.y.toFixed(3)}, ${this.ball.position.z.toFixed(3)}) | Velocity: (${this.ballVelocity.x.toFixed(5)}, ${this.ballVelocity.y.toFixed(5)}, ${this.ballVelocity.z.toFixed(5)})`);
        
        // Ensure minimum speed before updating position
        this.ensureMinimumSpeed();
        
        this.ball.position.add(this.ballVelocity);
        
        // Debug information after position update
        // console.log(`Ball update - Position after: (${this.ball.position.x.toFixed(3)}, ${this.ball.position.y.toFixed(3)}, ${this.ball.position.z.toFixed(3)})`);
        
        // Update light position to follow ball
        this.ballLight.position.copy(this.ball.position);
        this.ballLight.position.y -= 0.1;

        // Side wall collision
        if (this.ball.position.x > 0.7 || this.ball.position.x < -0.7) {
            this.ball.position.x = Math.sign(this.ball.position.x) * 0.7;
            this.ballVelocity.x *= -1;
            // Ensure minimum speed after wall collision
            this.ensureMinimumSpeed();
            
            // Return wall collision for haptic feedback
            return 'wall';
        }

        // Check paddle collision flags
        let playerCollisionChecked = false;
        let aiCollisionChecked = false;

        // Player paddle collision check
        if (playerPaddle && playerPaddle.getPaddle && this.ball.position.z > -0.2 && this.ball.position.z < 0) {
            // console.log("Checking player paddle collision");
            
            // Ensure paddle has valid position before checking collision
            const paddleMesh = playerPaddle.getPaddle();
            if (paddleMesh && paddleMesh.position) {
                const collisionType = this.checkPaddleCollision(playerPaddle);
                playerCollisionChecked = true;
                
                if (collisionType) {
                    // console.log(`Player paddle collision detected: ${collisionType}`);
                    
                    if (collisionType === 'center') {
                        // Force update the paddle's matrix world before calculating reflection
                        paddleMesh.updateMatrixWorld(true);
                        
                        // console.log(`Calculating reflection angle for player paddle at position: (${paddleMesh.position.x.toFixed(3)}, ${paddleMesh.position.y.toFixed(3)}, ${paddleMesh.position.z.toFixed(3)})`);
                        
                        const reflectionVector = this.calculateReflectionAngle(
                            this.ball.position,
                            paddleMesh.position
                        );
                        
                        // Apply the reflection
                        this.ballVelocity.copy(reflectionVector);
                        // console.log(`New velocity after reflection: (${this.ballVelocity.x.toFixed(5)}, ${this.ballVelocity.y.toFixed(5)}, ${this.ballVelocity.z.toFixed(5)})`);
                    }
                    // Edge hits are handled in checkPaddleCollision
                    
                    this.hits++;
                    // Increase speed on every hit (changed from every 2 hits)
                    this.increaseSpeed();
                    // Always ensure minimum speed
                    this.ensureMinimumSpeed();
                    
                    return 'player';
                }
            } else {
                // console.warn("Player paddle or its position is undefined");
            }
        }

        // AI paddle collision check
        if (aiPaddle && aiPaddle.getPaddle && this.ball.position.z > -2.0 && this.ball.position.z < -1.8) {
            // console.log("Checking AI paddle collision");
            
            // Ensure paddle has valid position before checking collision
            const paddleMesh = aiPaddle.getPaddle();
            if (paddleMesh && paddleMesh.position) {
                const collisionType = this.checkPaddleCollision(aiPaddle);
                aiCollisionChecked = true;
                
                if (collisionType) {
                    // console.log(`AI paddle collision detected: ${collisionType}`);
                    
                    if (collisionType === 'center') {
                        // Force update the paddle's matrix world before calculating reflection
                        paddleMesh.updateMatrixWorld(true);
                        
                        // console.log(`Calculating reflection angle for AI paddle at position: (${paddleMesh.position.x.toFixed(3)}, ${paddleMesh.position.y.toFixed(3)}, ${paddleMesh.position.z.toFixed(3)})`);
                        
                        const reflectionVector = this.calculateReflectionAngle(
                            this.ball.position,
                            paddleMesh.position
                        );
                        
                        // Apply the reflection
                        this.ballVelocity.copy(reflectionVector);
                        // console.log(`New velocity after reflection: (${this.ballVelocity.x.toFixed(5)}, ${this.ballVelocity.y.toFixed(5)}, ${this.ballVelocity.z.toFixed(5)})`);
                    }
                    // Edge hits are handled in checkPaddleCollision
                    
                    this.hits++;
                    // Increase speed on every hit (changed from every 2 hits)
                    this.increaseSpeed();
                    // Always ensure minimum speed
                    this.ensureMinimumSpeed();
                    
                    return 'ai';
                }
            } else {
                // console.warn("AI paddle or its position is undefined");
            }
        }

        // Log if paddles weren't properly checked
        if (this.ball.position.z > -0.2 && this.ball.position.z < 0 && !playerCollisionChecked) {
            // console.warn("Ball is in player paddle zone but collision check was skipped");
        }
        
        if (this.ball.position.z > -2.0 && this.ball.position.z < -1.8 && !aiCollisionChecked) {
            // console.warn("Ball is in AI paddle zone but collision check was skipped");
        }

        // Check if out of bounds
        const outOfBounds = this.checkOutOfBounds();
        if (outOfBounds) {
            // console.log(`Ball out of bounds: ${outOfBounds}`);
            this.reset();
            return outOfBounds;
        }

        // Final check to ensure minimum speed is maintained
        this.ensureMinimumSpeed();

        return false;
    }
}
