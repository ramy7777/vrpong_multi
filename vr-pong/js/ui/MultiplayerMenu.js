import * as THREE from 'three';

export class MultiplayerMenu {
    constructor(scene) {
        this.scene = scene;
        this.menuGroup = new THREE.Group();
        this.buttons = {
            singleplayer: null,
            host: null,
            join: null,
            back: null
        };
        this.isVisible = false;
        this.callbacks = {
            onSinglePlayer: null,
            onHost: null,
            onJoin: null,
            onBack: null
        };
        
        // Add debounce mechanism to prevent multiple activations
        this.lastButtonPressTime = 0;
        this.buttonCooldown = 800; // Increased from 500ms to 800ms to prevent accidental double clicks
        
        // Add a buffer time when menu first appears to prevent accidental button presses
        this.showTime = 0;
        this.showDelay = 1000; // 1 second delay after showing before accepting input
        
        // Button properties (following standardized styling)
        this.buttonColors = {
            base: 0x5a5a5a,
            hover: 0x7a7a7a,
            click: 0x3a3a3a
        };
        
        this.buttonMaterialParams = {
            metalness: 0.3,
            roughness: 0.4
        };
        
        this.createMenu();
        this.hide(); // Initially hidden
    }
    
    createMenu() {
        // Create background panel
        const panelGeometry = new THREE.BoxGeometry(1.2, 1.0, 0.02); // Increased height to accommodate the new button
        const panelMaterial = new THREE.MeshStandardMaterial({
            color: 0x000033,
            metalness: 0.8,
            roughness: 0.2,
            transparent: true,
            opacity: 0.7
        });
        
        const panel = new THREE.Mesh(panelGeometry, panelMaterial);
        this.menuGroup.add(panel);
        
        // Create title
        const titleCanvas = document.createElement('canvas');
        const titleContext = titleCanvas.getContext('2d');
        titleCanvas.width = 512;
        titleCanvas.height = 128;
        
        titleContext.fillStyle = '#ffffff';
        titleContext.font = 'bold 64px Arial';
        titleContext.textAlign = 'center';
        titleContext.textBaseline = 'middle';
        titleContext.fillText('GAME MODE', titleCanvas.width / 2, titleCanvas.height / 2);
        
        const titleTexture = new THREE.CanvasTexture(titleCanvas);
        const titleMaterial = new THREE.MeshBasicMaterial({
            map: titleTexture,
            transparent: true
        });
        
        const titleGeometry = new THREE.PlaneGeometry(0.8, 0.2);
        const titleMesh = new THREE.Mesh(titleGeometry, titleMaterial);
        titleMesh.position.set(0, 0.35, 0.02);
        this.menuGroup.add(titleMesh);
        
        // Create Single Player button
        this.buttons.singleplayer = this.createButton('SINGLE PLAYER', 0, 0.15, 0.02);
        this.menuGroup.add(this.buttons.singleplayer);
        
        // Create Host Game button
        this.buttons.host = this.createButton('HOST GAME', 0, -0.05, 0.02);
        this.menuGroup.add(this.buttons.host);
        
        // Create Quick Join button
        this.buttons.join = this.createButton('QUICK JOIN', 0, -0.25, 0.02);
        this.menuGroup.add(this.buttons.join);
        
        // Create Back button
        this.buttons.back = this.createButton('BACK', 0, -0.45, 0.02);
        this.menuGroup.add(this.buttons.back);
        
        // Position the menu in front of the player
        this.menuGroup.position.set(0, 1.3, -1.0);
        this.scene.add(this.menuGroup);
    }
    
    createButton(text, x, y, z) {
        const group = new THREE.Group();
        
        // Create button geometry
        const buttonGeometry = new THREE.BoxGeometry(0.6, 0.15, 0.04);
        const buttonMaterial = new THREE.MeshStandardMaterial({
            color: this.buttonColors.base,
            emissive: this.buttonColors.base,
            emissiveIntensity: 0.2,
            metalness: this.buttonMaterialParams.metalness,
            roughness: this.buttonMaterialParams.roughness
        });
        
        const buttonMesh = new THREE.Mesh(buttonGeometry, buttonMaterial);
        group.add(buttonMesh);
        
        // Create text
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.width = 256;
        canvas.height = 64;
        
        context.fillStyle = '#ffffff';
        context.font = 'bold 32px Arial';
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillText(text, canvas.width / 2, canvas.height / 2);
        
        const textTexture = new THREE.CanvasTexture(canvas);
        const textMaterial = new THREE.MeshBasicMaterial({
            map: textTexture,
            transparent: true
        });
        
        const textGeometry = new THREE.PlaneGeometry(0.55, 0.1);
        const textMesh = new THREE.Mesh(textGeometry, textMaterial);
        textMesh.position.z = 0.021;
        group.add(textMesh);
        
        // Set position
        group.position.set(x, y, z);
        
        // Add user data for interaction
        buttonMesh.userData = {
            isButton: true,
            buttonType: text.toLowerCase().replace(' ', ''),
            originalColor: this.buttonColors.base,
            hoverColor: this.buttonColors.hover,
            clickColor: this.buttonColors.click,
            isHighlighted: false
        };
        
        return group;
    }
    
    checkIntersection(controller) {
        if (!this.isVisible) return null;
        
        // Skip intersection checks if we're still in the initial delay period
        const now = Date.now();
        if (now - this.showTime < this.showDelay) {
            // Still in delay period, don't process interactions yet
            return null;
        }
        
        const tempMatrix = new THREE.Matrix4();
        tempMatrix.identity().extractRotation(controller.matrixWorld);
        
        const raycaster = new THREE.Raycaster();
        raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
        raycaster.ray.direction.set(0, 0, -1).applyMatrix4(tempMatrix);
        
        // Check intersection with each button
        for (const [key, button] of Object.entries(this.buttons)) {
            const buttonMesh = button.children[0];
            const intersects = raycaster.intersectObject(buttonMesh);
            
            if (intersects.length > 0) {
                return {
                    button: key,
                    mesh: buttonMesh
                };
            }
        }
        
        return null;
    }
    
    highlightButton(buttonKey) {
        if (!this.buttons[buttonKey]) return;
        
        const buttonMesh = this.buttons[buttonKey].children[0];
        buttonMesh.material.color.setHex(buttonMesh.userData.hoverColor);
        buttonMesh.material.emissive.setHex(buttonMesh.userData.hoverColor);
        buttonMesh.material.emissiveIntensity = 0.5;
        
        // Apply scale animation for hover effect (1.1x scale)
        this.buttons[buttonKey].scale.set(1.1, 1.1, 1.1);
        
        buttonMesh.userData.isHighlighted = true;
    }
    
    unhighlightButton(buttonKey) {
        if (!this.buttons[buttonKey]) return;
        
        const buttonMesh = this.buttons[buttonKey].children[0];
        buttonMesh.material.color.setHex(buttonMesh.userData.originalColor);
        buttonMesh.material.emissive.setHex(buttonMesh.userData.originalColor);
        buttonMesh.material.emissiveIntensity = 0.2;
        
        // Reset scale
        this.buttons[buttonKey].scale.set(1.0, 1.0, 1.0);
        
        buttonMesh.userData.isHighlighted = false;
    }
    
    pressButton(buttonKey) {
        if (!this.buttons[buttonKey]) return;
        
        // Implement debounce to prevent rapid repeated button presses
        const now = Date.now();
        
        // Skip button press if we're still in the initial delay period
        if (now - this.showTime < this.showDelay) {
            console.log(`MultiplayerMenu: Button ${buttonKey} press ignored (still in show delay): ${now - this.showTime}ms since menu shown. Menu shown at: ${this.showTime}, Current time: ${now}, Delay period: ${this.showDelay}ms`);
            return;
        }
        
        if (now - this.lastButtonPressTime < this.buttonCooldown) {
            console.log(`MultiplayerMenu: Button ${buttonKey} press ignored (cooldown active): ${now - this.lastButtonPressTime}ms since last press. Last press: ${this.lastButtonPressTime}, Current time: ${now}, Cooldown: ${this.buttonCooldown}ms`);
            return;
        }
        console.log(`MultiplayerMenu: Button ${buttonKey} pressed successfully at ${now}`);
        this.lastButtonPressTime = now;
        
        const buttonMesh = this.buttons[buttonKey].children[0];
        buttonMesh.material.color.setHex(buttonMesh.userData.clickColor);
        buttonMesh.material.emissive.setHex(buttonMesh.userData.clickColor);
        buttonMesh.material.emissiveIntensity = 0.2;
        
        // Apply position animation for depth effect
        this.buttons[buttonKey].position.z += 0.01;
        
        // Execute callback
        console.log(`MultiplayerMenu: Executing callback for button: ${buttonKey}`);
        if (buttonKey === 'singleplayer' && this.callbacks.onSinglePlayer) {
            this.callbacks.onSinglePlayer();
        } else if (buttonKey === 'host' && this.callbacks.onHost) {
            this.callbacks.onHost();
        } else if (buttonKey === 'join' && this.callbacks.onJoin) {
            this.callbacks.onJoin();
        } else if (buttonKey === 'back' && this.callbacks.onBack) {
            this.callbacks.onBack();
        }
        
        // Reset button state after 300ms (matching the transition duration)
        console.log(`MultiplayerMenu: Setting timeout to reset button ${buttonKey} in 300ms`);
        setTimeout(() => {
            if (this.buttons[buttonKey]) {
                this.buttons[buttonKey].position.z -= 0.01;
                this.unhighlightButton(buttonKey);
                console.log(`MultiplayerMenu: Button ${buttonKey} reset completed`);
            }
        }, 300);
    }
    
    setCallbacks(callbacks) {
        this.callbacks = { ...this.callbacks, ...callbacks };
    }
    
    show() {
        this.menuGroup.visible = true;
        this.isVisible = true;
        this.showTime = Date.now();
        console.log(`MultiplayerMenu: Shown at ${this.showTime}, input will be enabled after ${this.showDelay}ms`);
    }
    
    hide() {
        this.menuGroup.visible = false;
        this.isVisible = false;
    }
    
    dispose() {
        // Clean up resources
        for (const button of Object.values(this.buttons)) {
            button.children.forEach(child => {
                if (child.geometry) child.geometry.dispose();
                if (child.material) {
                    if (child.material.map) child.material.map.dispose();
                    child.material.dispose();
                }
            });
        }
        
        this.scene.remove(this.menuGroup);
    }
}
