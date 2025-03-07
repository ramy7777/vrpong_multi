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
        
        // Track currently hovered button
        this.currentHoveredButton = null;
        
        // Preload Orbitron font to use in canvas
        this.fontLoaded = false;
        this.preloadOrbitronFont();
        
        // Add debounce mechanism to prevent multiple activations
        this.lastButtonPressTime = 0;
        this.buttonCooldown = 800; // Increased from 500ms to 800ms to prevent accidental double clicks
        
        // Add a buffer time when menu first appears to prevent accidental button presses
        this.showTime = 0;
        this.showDelay = 1000; // 1 second delay after showing before accepting input
        
        // Enhanced button properties with modern color scheme
        this.buttonColors = {
            singleplayer: {
                base: 0x4CAF50, // Green
                hover: 0x66BB6A,
                click: 0x388E3C
            },
            host: {
                base: 0x2196F3, // Blue
                hover: 0x42A5F5,
                click: 0x1976D2
            },
            join: {
                base: 0xFFA000, // Amber
                hover: 0xFFB300,
                click: 0xFF8F00
            },
            back: {
                base: 0xE53935, // Red
                hover: 0xEF5350,
                click: 0xC62828
            }
        };
        
        this.buttonMaterialParams = {
            metalness: 0.5,
            roughness: 0.3
        };
        
        this.createMenu();
        this.hide(); // Initially hidden
    }
    
    // Preload Orbitron font for canvas text
    preloadOrbitronFont() {
        // Create a font face observer for Orbitron
        const fontLink = document.createElement('link');
        fontLink.href = 'https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700;900&display=swap';
        fontLink.rel = 'stylesheet';
        document.head.appendChild(fontLink);
        
        // Create a test element to force font loading
        const testElement = document.createElement('div');
        testElement.style.fontFamily = 'Orbitron, Arial, sans-serif';
        testElement.style.position = 'absolute';
        testElement.style.visibility = 'hidden';
        testElement.textContent = 'Font Preload';
        document.body.appendChild(testElement);
        
        // Set a timeout to ensure font is loaded
        setTimeout(() => {
            this.fontLoaded = true;
            document.body.removeChild(testElement);
        }, 500);
    }
    
    createMenu() {
        // Create background panel with gradient effect
        const panelGeometry = new THREE.BoxGeometry(1.2, 1.0, 0.02);
        
        // Create a gradient texture for the panel
        const panelCanvas = document.createElement('canvas');
        const panelContext = panelCanvas.getContext('2d');
        panelCanvas.width = 512;
        panelCanvas.height = 512;
        
        const gradient = panelContext.createLinearGradient(0, 0, 0, panelCanvas.height);
        gradient.addColorStop(0, '#1a237e'); // Dark blue at top
        gradient.addColorStop(1, '#0d47a1'); // Slightly lighter blue at bottom
        
        panelContext.fillStyle = gradient;
        panelContext.fillRect(0, 0, panelCanvas.width, panelCanvas.height);
        
        // Add a subtle pattern overlay
        panelContext.fillStyle = 'rgba(255, 255, 255, 0.03)';
        for (let i = 0; i < 150; i++) {
            const x = Math.random() * panelCanvas.width;
            const y = Math.random() * panelCanvas.height;
            const size = Math.random() * 3 + 1;
            panelContext.fillRect(x, y, size, size);
        }
        
        // Add a light vignette effect
        const centerX = panelCanvas.width / 2;
        const centerY = panelCanvas.height / 2;
        const radius = Math.max(centerX, centerY);
        const gradient2 = panelContext.createRadialGradient(
            centerX, centerY, radius * 0.5,
            centerX, centerY, radius * 1.5
        );
        gradient2.addColorStop(0, 'rgba(0, 0, 0, 0)');
        gradient2.addColorStop(1, 'rgba(0, 0, 0, 0.3)');
        panelContext.fillStyle = gradient2;
        panelContext.fillRect(0, 0, panelCanvas.width, panelCanvas.height);
        
        const panelTexture = new THREE.CanvasTexture(panelCanvas);
        const panelMaterial = new THREE.MeshStandardMaterial({
            map: panelTexture,
            metalness: 0.2,
            roughness: 0.8,
            transparent: true,
            opacity: 0.9
        });
        
        const panel = new THREE.Mesh(panelGeometry, panelMaterial);
        
        // Add a subtle glow to the panel edges
        const glowGeometry = new THREE.BoxGeometry(1.24, 1.04, 0.01);
        const glowMaterial = new THREE.MeshBasicMaterial({
            color: 0x4d69ff,
            transparent: true,
            opacity: 0.15,
            side: THREE.BackSide
        });
        const glowMesh = new THREE.Mesh(glowGeometry, glowMaterial);
        panel.add(glowMesh);
        
        this.menuGroup.add(panel);
        
        // Create more visually appealing title
        const titleCanvas = document.createElement('canvas');
        const titleContext = titleCanvas.getContext('2d');
        titleCanvas.width = 512;
        titleCanvas.height = 128;
        
        // Fill with gradient
        const titleGradient = titleContext.createLinearGradient(0, 0, 0, titleCanvas.height);
        titleGradient.addColorStop(0, '#ffffff');
        titleGradient.addColorStop(1, '#b3e5fc');
        
        titleContext.fillStyle = titleGradient;
        titleContext.font = 'bold 64px Orbitron, Arial, sans-serif';
        titleContext.textAlign = 'center';
        titleContext.textBaseline = 'middle';
        
        // Add shadow to text
        titleContext.shadowColor = 'rgba(0, 0, 0, 0.5)';
        titleContext.shadowBlur = 8;
        titleContext.shadowOffsetX = 2;
        titleContext.shadowOffsetY = 2;
        
        titleContext.fillText('GAME MODE', titleCanvas.width / 2, titleCanvas.height / 2);
        
        // Add subtle underline
        titleContext.shadowBlur = 0;
        titleContext.shadowOffsetX = 0;
        titleContext.shadowOffsetY = 0;
        titleContext.strokeStyle = '#ffffff';
        titleContext.lineWidth = 2;
        titleContext.beginPath();
        titleContext.moveTo(128, 90);
        titleContext.lineTo(384, 90);
        titleContext.stroke();
        
        // Add glow effect
        titleContext.globalCompositeOperation = 'lighter';
        titleContext.shadowColor = '#4d69ff';
        titleContext.shadowBlur = 15;
        titleContext.fillStyle = 'rgba(77, 105, 255, 0.3)';
        titleContext.fillText('GAME MODE', titleCanvas.width / 2, titleCanvas.height / 2);
        titleContext.globalCompositeOperation = 'source-over';
        
        const titleTexture = new THREE.CanvasTexture(titleCanvas);
        const titleMaterial = new THREE.MeshBasicMaterial({
            map: titleTexture,
            transparent: true
        });
        
        const titleGeometry = new THREE.PlaneGeometry(0.8, 0.2);
        const titleMesh = new THREE.Mesh(titleGeometry, titleMaterial);
        titleMesh.position.set(0, 0.35, 0.02);
        this.menuGroup.add(titleMesh);
        
        // Create modernized buttons
        this.buttons.singleplayer = this.createButton('SINGLE PLAYER', 0, 0.15, 0.02, 'singleplayer');
        this.menuGroup.add(this.buttons.singleplayer);
        
        this.buttons.host = this.createButton('HOST GAME', 0, -0.05, 0.02, 'host');
        this.menuGroup.add(this.buttons.host);
        
        this.buttons.join = this.createButton('QUICK JOIN', 0, -0.25, 0.02, 'join');
        this.menuGroup.add(this.buttons.join);
        
        this.buttons.back = this.createButton('BACK', 0, -0.45, 0.02, 'back');
        this.menuGroup.add(this.buttons.back);
        
        // Position the menu in front of the player
        this.menuGroup.position.set(0, 1.6, -1.0);
        this.scene.add(this.menuGroup);
    }
    
    createButton(text, x, y, z, buttonType) {
        const group = new THREE.Group();
        
        // Create rounded button geometry - increase width for longer text
        const buttonWidth = text.length > 10 ? 0.7 : 0.6;
        const buttonGeometry = new THREE.BoxGeometry(buttonWidth, 0.15, 0.04);
        buttonGeometry.userData = { originalGeometry: buttonGeometry.clone() };
        
        // Get color from the button type
        const buttonColor = this.buttonColors[buttonType];
        
        const buttonMaterial = new THREE.MeshStandardMaterial({
            color: buttonColor.base,
            emissive: buttonColor.base,
            emissiveIntensity: 0.2,
            metalness: this.buttonMaterialParams.metalness,
            roughness: this.buttonMaterialParams.roughness
        });
        
        const buttonMesh = new THREE.Mesh(buttonGeometry, buttonMaterial);
        
        // Add subtle bevel to buttons - adjust bevel width to match button width
        const edgeGeometry = new THREE.BoxGeometry(buttonWidth + 0.02, 0.17, 0.03);
        const edgeMaterial = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            metalness: 0.7,
            roughness: 0.2,
            transparent: true,
            opacity: 0.1
        });
        const edgeMesh = new THREE.Mesh(edgeGeometry, edgeMaterial);
        edgeMesh.position.z = -0.005;
        buttonMesh.add(edgeMesh);
        
        group.add(buttonMesh);
        
        // Create improved text with shadow
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.width = 256;
        canvas.height = 64;
        
        // Clear the canvas
        context.clearRect(0, 0, canvas.width, canvas.height);
        
        // Add subtle gradient to text
        const textGradient = context.createLinearGradient(0, 0, 0, canvas.height);
        textGradient.addColorStop(0, '#ffffff');
        textGradient.addColorStop(1, '#f0f0f0');
        
        context.fillStyle = textGradient;
        
        // Adjust font size based on text length
        let fontSize = 32;
        if (text.length > 10) {
            fontSize = 28;
        }
        if (text.length > 12) {
            fontSize = 24;
        }
        
        context.font = `bold ${fontSize}px Orbitron, Arial, sans-serif`;
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        
        // Add shadow to text
        context.shadowColor = 'rgba(0, 0, 0, 0.3)';
        context.shadowBlur = 4;
        context.shadowOffsetX = 1;
        context.shadowOffsetY = 1;
        
        // Add letter spacing effect with dynamic adjustment
        const letters = text.split('');
        // Reduce letter spacing for longer text
        const letterSpacing = text.length > 10 ? 1 : 2;
        const totalTextWidth = letters.reduce((width, letter) => width + context.measureText(letter).width + letterSpacing, 0) - letterSpacing;
        
        // If text is still too wide, just render it without spacing
        if (totalTextWidth > canvas.width * 0.9) {
            // Standard text rendering without letter spacing
            context.fillText(text, canvas.width / 2, canvas.height / 2);
        } else {
            // Apply letter spacing
            let currentX = (canvas.width - totalTextWidth) / 2;
            letters.forEach(letter => {
                context.fillText(letter, currentX + context.measureText(letter).width / 2, canvas.height / 2);
                currentX += context.measureText(letter).width + letterSpacing;
            });
            
            // Add subtle glow
            context.globalCompositeOperation = 'lighter';
            context.shadowColor = 'rgba(255, 255, 255, 0.5)';
            context.shadowBlur = 3;
            context.fillStyle = 'rgba(255, 255, 255, 0.2)';
            
            currentX = (canvas.width - totalTextWidth) / 2;
            letters.forEach(letter => {
                context.fillText(letter, currentX + context.measureText(letter).width / 2, canvas.height / 2);
                currentX += context.measureText(letter).width + letterSpacing;
            });
            context.globalCompositeOperation = 'source-over';
        }
        
        const textTexture = new THREE.CanvasTexture(canvas);
        const textMaterial = new THREE.MeshBasicMaterial({
            map: textTexture,
            transparent: true
        });
        
        // Adjust text plane size to match button width
        const textWidth = text.length > 10 ? 0.65 : 0.55;
        const textGeometry = new THREE.PlaneGeometry(textWidth, 0.1);
        const textMesh = new THREE.Mesh(textGeometry, textMaterial);
        textMesh.position.z = 0.021;
        group.add(textMesh);
        
        // Set position
        group.position.set(x, y, z);
        
        // Add user data for interaction
        buttonMesh.userData = {
            isButton: true,
            buttonType: buttonType,
            originalColor: buttonColor.base,
            hoverColor: buttonColor.hover,
            clickColor: buttonColor.click,
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
        
        // Skip if button is already highlighted
        if (this.currentHoveredButton === buttonKey) return;
        
        const buttonMesh = this.buttons[buttonKey].children[0];
        buttonMesh.material.color.setHex(buttonMesh.userData.hoverColor);
        buttonMesh.material.emissive.setHex(buttonMesh.userData.hoverColor);
        buttonMesh.material.emissiveIntensity = 0.5;
        
        // Apply enhanced hover effect with smoother animation
        this.buttons[buttonKey].scale.set(1.1, 1.1, 1.1);
        
        // Add a subtle glow effect
        const edgeMesh = buttonMesh.children[0];
        if (edgeMesh) {
            edgeMesh.material.opacity = 0.3;
        }
        
        buttonMesh.userData.isHighlighted = true;
        this.currentHoveredButton = buttonKey;
    }
    
    unhighlightButton(buttonKey) {
        if (!this.buttons[buttonKey]) return;
        
        // Skip if button is not the currently highlighted one
        if (this.currentHoveredButton !== buttonKey) return;
        
        const buttonMesh = this.buttons[buttonKey].children[0];
        buttonMesh.material.color.setHex(buttonMesh.userData.originalColor);
        buttonMesh.material.emissive.setHex(buttonMesh.userData.originalColor);
        buttonMesh.material.emissiveIntensity = 0.2;
        
        // Reset scale
        this.buttons[buttonKey].scale.set(1.0, 1.0, 1.0);
        
        // Reset glow
        const edgeMesh = buttonMesh.children[0];
        if (edgeMesh) {
            edgeMesh.material.opacity = 0.1;
        }
        
        buttonMesh.userData.isHighlighted = false;
        this.currentHoveredButton = null;
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
        buttonMesh.material.emissiveIntensity = 0.3;
        
        // Apply enhanced click effect
        this.buttons[buttonKey].position.z += 0.01;
        this.buttons[buttonKey].scale.set(0.95, 0.95, 1.0);
        
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
                this.buttons[buttonKey].scale.set(1.0, 1.0, 1.0);
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
    
    // Method to check for mouse hover
    checkMouseIntersection(mouseX, mouseY, camera) {
        if (!this.isVisible) return null;
        
        // Skip intersection checks if we're still in the initial delay period
        const now = Date.now();
        if (now - this.showTime < this.showDelay) {
            return null;
        }
        
        // Create a raycaster for mouse picking
        const raycaster = new THREE.Raycaster();
        const mouse = new THREE.Vector2(mouseX, mouseY);
        raycaster.setFromCamera(mouse, camera);
        
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
}
