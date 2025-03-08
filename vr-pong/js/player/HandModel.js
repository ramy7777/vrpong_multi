import * as THREE from 'three';

export class HandModel {
    constructor(scene, isLeft = false) {
        this.scene = scene;
        this.isLeft = isLeft; // Whether this is a left or right hand
        this.createHand();
    }
    
    createHand() {
        // Create a group to hold the hand model
        this.handGroup = new THREE.Group();
        
        // Hand color based on whether it's left or right
        const handColor = this.isLeft ? 0x0088ff : 0xff8800;
        
        // Create the palm of the hand
        const palmGeometry = new THREE.BoxGeometry(0.08, 0.02, 0.1);
        const palmMaterial = new THREE.MeshStandardMaterial({
            color: handColor,
            metalness: 0.2,
            roughness: 0.7
        });
        this.palm = new THREE.Mesh(palmGeometry, palmMaterial);
        
        // Create fingers
        this.fingers = [];
        
        // Create 5 fingers
        for (let i = 0; i < 5; i++) {
            const fingerGroup = new THREE.Group();
            
            // Finger dimensions
            const fingerWidth = 0.015;
            const fingerHeight = 0.015;
            const fingerSegmentLengths = [0.04, 0.025, 0.02]; // Three segments per finger
            
            // Position offset for each finger
            let offsetX = -0.03 + i * 0.015;
            
            // Make thumb special with different offset and angle
            if (i === 0) {
                offsetX = -0.04;
                if (this.isLeft) {
                    fingerGroup.rotation.z = -Math.PI / 4;
                    fingerGroup.position.set(offsetX, -0.01, 0.02);
                } else {
                    fingerGroup.rotation.z = Math.PI / 4;
                    fingerGroup.position.set(offsetX, -0.01, 0.02);
                }
            } else {
                // Regular fingers are lined up on the edge of the palm
                const offsetZ = 0.05; // Position at the end of the palm
                fingerGroup.position.set(offsetX, 0, offsetZ);
            }
            
            // Create finger segments
            const segments = [];
            let currentZ = 0;
            
            for (let j = 0; j < fingerSegmentLengths.length; j++) {
                const length = fingerSegmentLengths[j];
                const segmentGeometry = new THREE.BoxGeometry(fingerWidth, fingerHeight, length);
                const segmentMaterial = new THREE.MeshStandardMaterial({
                    color: handColor,
                    metalness: 0.2,
                    roughness: 0.7
                });
                
                const segment = new THREE.Mesh(segmentGeometry, segmentMaterial);
                
                // Position segment
                segment.position.z = currentZ + length / 2;
                currentZ += length;
                
                // Add segment to finger group
                segments.push(segment);
                fingerGroup.add(segment);
            }
            
            this.fingers.push({
                group: fingerGroup,
                segments
            });
            
            // Add finger to hand
            this.handGroup.add(fingerGroup);
        }
        
        // Add palm to hand
        this.handGroup.add(this.palm);
        
        // Orient hand correctly
        if (this.isLeft) {
            // Left hand orientation
            this.handGroup.rotation.x = Math.PI / 2; // Face palm down by default
        } else {
            // Right hand orientation
            this.handGroup.rotation.x = Math.PI / 2; // Face palm down by default
        }
        
        // Initially not visible
        this.handGroup.visible = false;
        
        // Add hand group to scene
        this.scene.add(this.handGroup);
        
        console.log(`${this.isLeft ? 'Left' : 'Right'} hand model created`);
    }
    
    // Update the hand model position and rotation
    updatePosition(position, rotation) {
        if (!this.handGroup) return;
        
        // Update position
        if (position) {
            this.handGroup.position.set(position.x, position.y, position.z);
        }
        
        // Update rotation with fix for 180-degree rotation
        if (rotation) {
            // Set the quaternion directly
            this.handGroup.quaternion.set(rotation.x, rotation.y, rotation.z, rotation.w);
            
            // Extract Euler angles from the quaternion
            const euler = new THREE.Euler().setFromQuaternion(this.handGroup.quaternion, 'XYZ');
            
            // Add PI to Y rotation (fixes 180 degree backward facing)
            euler.y += Math.PI;
            
            // Apply the corrected rotation
            this.handGroup.quaternion.setFromEuler(euler);
        }
    }
    
    // Show the hand model
    show() {
        if (this.handGroup) {
            this.handGroup.visible = true;
        }
    }
    
    // Hide the hand model
    hide() {
        if (this.handGroup) {
            this.handGroup.visible = false;
        }
    }
    
    // Get the hand group
    getHandGroup() {
        return this.handGroup;
    }
    
    // Dispose of the hand model resources
    dispose() {
        if (this.palm) {
            this.palm.geometry.dispose();
            this.palm.material.dispose();
        }
        
        // Dispose of finger resources
        this.fingers.forEach(finger => {
            finger.segments.forEach(segment => {
                segment.geometry.dispose();
                segment.material.dispose();
            });
        });
        
        if (this.handGroup) {
            this.scene.remove(this.handGroup);
        }
    }
} 