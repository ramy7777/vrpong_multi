import * as THREE from 'three';

export class HeadModel {
    constructor(scene) {
        this.scene = scene;
        this.createHead();
    }
    
    createHead() {
        // Create a group to hold the head model
        this.headGroup = new THREE.Group();
        
        // Create a simple head model
        const headGeometry = new THREE.SphereGeometry(0.1, 16, 16); // Sphere for the head
        const headMaterial = new THREE.MeshStandardMaterial({
            color: 0x3366ff, 
            metalness: 0.2, 
            roughness: 0.8
        });
        this.headMesh = new THREE.Mesh(headGeometry, headMaterial);
        
        // Slightly flatten the head sphere to make it more head-shaped
        this.headMesh.scale.y = 1.2;
        this.headMesh.scale.z = 1.1;
        
        // Create simple eyes
        const eyeGeometry = new THREE.SphereGeometry(0.02, 8, 8);
        const eyeMaterial = new THREE.MeshStandardMaterial({ 
            color: 0xffffff,
            emissive: 0xaaaaaa
        });
        
        this.leftEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
        this.rightEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
        
        // Position the eyes on the head
        this.leftEye.position.set(-0.04, 0.02, 0.08);
        this.rightEye.position.set(0.04, 0.02, 0.08);
        
        // Create pupils
        const pupilGeometry = new THREE.SphereGeometry(0.008, 8, 8);
        const pupilMaterial = new THREE.MeshBasicMaterial({ color: 0x000000 });
        
        const leftPupil = new THREE.Mesh(pupilGeometry, pupilMaterial);
        const rightPupil = new THREE.Mesh(pupilGeometry, pupilMaterial);
        
        // Position pupils slightly in front of eyes
        leftPupil.position.z = 0.015;
        rightPupil.position.z = 0.015;
        
        // Add pupils to eyes
        this.leftEye.add(leftPupil);
        this.rightEye.add(rightPupil);
        
        // Add eyes to head
        this.headMesh.add(this.leftEye);
        this.headMesh.add(this.rightEye);
        
        // Add head to group
        this.headGroup.add(this.headMesh);
        
        // Initially not visible
        this.headGroup.visible = false;
        
        // Add head group to scene
        this.scene.add(this.headGroup);
        
        console.log("Head model created");
    }
    
    // Update the head model position and rotation
    updatePosition(position, rotation) {
        if (!this.headGroup) return;
        
        // Update position
        if (position) {
            this.headGroup.position.set(position.x, position.y, position.z);
        }
        
        // Update rotation with fixes for inversion issues
        if (rotation) {
            // Set the quaternion directly
            this.headGroup.quaternion.set(rotation.x, rotation.y, rotation.z, rotation.w);
            
            // Extract Euler angles from the quaternion
            const euler = new THREE.Euler().setFromQuaternion(this.headGroup.quaternion, 'XYZ');
            
            // Fix the Y rotation only (fixes 180 degree backward facing)
            // We keep the X rotation as is - we don't want to invert up/down
            euler.y += Math.PI;
            
            // Apply the corrected rotation
            this.headGroup.quaternion.setFromEuler(euler);
        }
    }
    
    // Show the head model
    show() {
        if (this.headGroup) {
            this.headGroup.visible = true;
        }
    }
    
    // Hide the head model
    hide() {
        if (this.headGroup) {
            this.headGroup.visible = false;
        }
    }
    
    // Get the head group
    getHeadGroup() {
        return this.headGroup;
    }
    
    // Dispose of the head model resources
    dispose() {
        if (this.headMesh) {
            this.headMesh.geometry.dispose();
            this.headMesh.material.dispose();
        }
        
        if (this.leftEye) {
            this.leftEye.geometry.dispose();
            this.leftEye.material.dispose();
        }
        
        if (this.rightEye) {
            this.rightEye.geometry.dispose();
            this.rightEye.material.dispose();
        }
        
        if (this.headGroup) {
            this.scene.remove(this.headGroup);
        }
    }
} 