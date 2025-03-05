import * as THREE from 'three';

export class GameEnvironment {
    constructor(scene) {
        this.scene = scene;
        this.leftRail = null;
        this.rightRail = null;
        this.originalRailMaterial = null;
        this.redRailMaterial = null;
        this.createLighting();
        this.createWalls();
        this.createTable();
        this.createGridFloor();
        this.createAmbientEffects();
    }

    createLighting() {
        // Add ambient light with sci-fi blue tint
        const ambientLight = new THREE.AmbientLight(0x4444ff, 0.3);
        this.scene.add(ambientLight);

        // Add directional light with slight blue tint
        const directionalLight = new THREE.DirectionalLight(0x9999ff, 0.8);
        directionalLight.position.set(0, 5, 0);
        directionalLight.castShadow = true;
        this.scene.add(directionalLight);

        // Add point lights for sci-fi effect
        const pointLight1 = new THREE.PointLight(0x00ffff, 0.5, 10);
        pointLight1.position.set(-2, 2, -2);
        this.scene.add(pointLight1);

        const pointLight2 = new THREE.PointLight(0x0088ff, 0.5, 10);
        pointLight2.position.set(2, 2, -2);
        this.scene.add(pointLight2);
    }

    createWalls() {
        // Create emissive material for walls
        const wallMaterial = new THREE.MeshStandardMaterial({
            color: 0x0a0a2a,
            roughness: 0.3,
            metalness: 0.8,
            emissive: 0x000033,
            emissiveIntensity: 0.2
        });

        // Left wall
        const leftWall = new THREE.Mesh(
            new THREE.BoxGeometry(0.1, 3, 4),
            wallMaterial
        );
        leftWall.position.set(-2, 1.5, -1);
        this.scene.add(leftWall);

        // Right wall
        const rightWall = new THREE.Mesh(
            new THREE.BoxGeometry(0.1, 3, 4),
            wallMaterial
        );
        rightWall.position.set(2, 1.5, -1);
        this.scene.add(rightWall);
    }

    createTable() {
        // Create holographic-looking table
        const tableGeometry = new THREE.BoxGeometry(1.5, 0.02, 2);
        const tableMaterial = new THREE.MeshStandardMaterial({
            color: 0x00ffff,
            metalness: 0.9,
            roughness: 0.1,
            transparent: true,
            opacity: 0.4,
            emissive: 0x003333,
            emissiveIntensity: 0.2
        });
        this.table = new THREE.Mesh(tableGeometry, tableMaterial);
        this.table.position.y = 0.8;
        this.table.position.z = -1.0;
        this.scene.add(this.table);

        // Create side rails
        this.originalRailMaterial = new THREE.MeshStandardMaterial({
            color: 0x0088ff,
            metalness: 0.9,
            roughness: 0.1,
            emissive: 0x0088ff,
            emissiveIntensity: 0.5,
            transparent: true,
            opacity: 0.8
        });

        this.redRailMaterial = new THREE.MeshStandardMaterial({
            color: 0xff0000,
            metalness: 0.9,
            roughness: 0.1,
            emissive: 0xff0000,
            emissiveIntensity: 0.5,
            transparent: true,
            opacity: 0.8
        });

        // Left rail
        this.leftRail = new THREE.Mesh(
            new THREE.BoxGeometry(0.05, 0.15, 2),
            this.originalRailMaterial
        );
        this.leftRail.position.set(-0.775, 0.825, -1.0);
        this.scene.add(this.leftRail);

        // Right rail
        this.rightRail = new THREE.Mesh(
            new THREE.BoxGeometry(0.05, 0.15, 2),
            this.originalRailMaterial
        );
        this.rightRail.position.set(0.775, 0.825, -1.0);
        this.scene.add(this.rightRail);

        // Add glow effect to rails
        const glowMaterial = new THREE.MeshBasicMaterial({
            color: 0x0088ff,
            transparent: true,
            opacity: 0.3
        });

        // Left rail glow
        const leftGlow = new THREE.Mesh(
            new THREE.BoxGeometry(0.07, 0.07, 2.02),
            glowMaterial
        );
        leftGlow.position.copy(this.leftRail.position);
        this.scene.add(leftGlow);

        // Right rail glow
        const rightGlow = new THREE.Mesh(
            new THREE.BoxGeometry(0.07, 0.07, 2.02),
            glowMaterial
        );
        rightGlow.position.copy(this.rightRail.position);
        this.scene.add(rightGlow);

        // Add energy field between rails
        const fieldGeometry = new THREE.BoxGeometry(1.5, 0.05, 2);
        const fieldMaterial = new THREE.MeshBasicMaterial({
            color: 0x0088ff,
            transparent: true,
            opacity: 0.1,
            side: THREE.DoubleSide
        });
        const energyField = new THREE.Mesh(fieldGeometry, fieldMaterial);
        energyField.position.set(0, 0.825, -1.0);
        this.scene.add(energyField);
    }

    createGridFloor() {
        const gridHelper = new THREE.GridHelper(20, 20, 0x00ffff, 0x0000ff);
        gridHelper.position.y = 0;
        this.scene.add(gridHelper);

        // Add floor with slight transparency
        const floorGeometry = new THREE.PlaneGeometry(20, 20);
        const floorMaterial = new THREE.MeshStandardMaterial({
            color: 0x000066,
            transparent: true,
            opacity: 0.5,
            metalness: 0.8,
            roughness: 0.2
        });
        const floor = new THREE.Mesh(floorGeometry, floorMaterial);
        floor.rotation.x = -Math.PI / 2;
        floor.position.y = 0.01;
        this.scene.add(floor);
    }

    createAmbientEffects() {
        // Create a subtle fog
        this.scene.fog = new THREE.Fog(0x000033, 5, 15);

        // Set background color
        this.scene.background = new THREE.Color(0x000033);
    }

    flashRail(side) {
        // Flash both rails red
        this.leftRail.material = this.redRailMaterial;
        this.rightRail.material = this.redRailMaterial;
        
        // Reset both rails after 1 second
        setTimeout(() => {
            this.leftRail.material = this.originalRailMaterial;
            this.rightRail.material = this.originalRailMaterial;
        }, 1000);
    }

    getTable() {
        return this.table;
    }
}
