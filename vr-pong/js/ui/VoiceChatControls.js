import * as THREE from 'three';

export class VoiceChatControls {
    constructor(scene, multiplayerManager) {
        this.scene = scene;
        this.multiplayerManager = multiplayerManager;
        this.controlsGroup = new THREE.Group();
        this.scene.add(this.controlsGroup);
        
        // Position the controls group
        this.controlsGroup.position.set(0, 1.9, -1.0); // Above the playing area
        
        // Create mute button
        this.muteButton = null;
        this.isMuted = false;
        
        // Create UI elements
        this.createMuteButton();
        
        // Make invisible by default
        this.hide();
    }
    
    createMuteButton() {
        // Create a background panel for the button
        const panelGeometry = new THREE.PlaneGeometry(0.15, 0.15);
        const panelMaterial = new THREE.MeshBasicMaterial({ 
            color: 0x111111,
            transparent: true,
            opacity: 0.7
        });
        const panel = new THREE.Mesh(panelGeometry, panelMaterial);
        
        // Create the mute icon
        const iconSize = 0.12;
        const iconGeometry = new THREE.PlaneGeometry(iconSize, iconSize);
        
        // Create canvas for the icon
        const canvas = document.createElement('canvas');
        canvas.width = 128;
        canvas.height = 128;
        const ctx = canvas.getContext('2d');
        
        // Draw microphone icon (unmuted initially)
        this.drawMicrophoneIcon(ctx, false);
        
        // Create texture from canvas
        const texture = new THREE.CanvasTexture(canvas);
        const iconMaterial = new THREE.MeshBasicMaterial({
            map: texture,
            transparent: true
        });
        
        const icon = new THREE.Mesh(iconGeometry, iconMaterial);
        icon.position.z = 0.001; // Slightly in front of the panel
        
        // Create the button group
        this.muteButton = new THREE.Group();
        this.muteButton.add(panel);
        this.muteButton.add(icon);
        
        // Store references for interaction
        this.muteButton.userData = {
            type: 'muteButton',
            panel,
            icon,
            canvas,
            context: ctx,
            texture
        };
        
        this.controlsGroup.add(this.muteButton);
    }
    
    drawMicrophoneIcon(ctx, isMuted) {
        const width = ctx.canvas.width;
        const height = ctx.canvas.height;
        
        // Clear the canvas
        ctx.clearRect(0, 0, width, height);
        
        // Set drawing styles
        ctx.fillStyle = isMuted ? '#ff3333' : '#33ff33';
        ctx.strokeStyle = isMuted ? '#ff3333' : '#33ff33';
        ctx.lineWidth = 6;
        
        // Draw microphone body
        ctx.beginPath();
        ctx.roundRect(width * 0.35, height * 0.2, width * 0.3, height * 0.4, 8);
        ctx.fill();
        
        // Draw microphone stand
        ctx.beginPath();
        ctx.moveTo(width * 0.5, height * 0.6);
        ctx.lineTo(width * 0.5, height * 0.75);
        ctx.stroke();
        
        // Draw microphone base
        ctx.beginPath();
        ctx.moveTo(width * 0.35, height * 0.75);
        ctx.lineTo(width * 0.65, height * 0.75);
        ctx.stroke();
        
        // If muted, draw a slash through the microphone
        if (isMuted) {
            ctx.beginPath();
            ctx.moveTo(width * 0.25, height * 0.25);
            ctx.lineTo(width * 0.75, height * 0.75);
            ctx.stroke();
        }
    }
    
    updateMuteButton() {
        const isMuted = this.multiplayerManager.isMicrophoneMuted();
        if (isMuted !== this.isMuted) {
            this.isMuted = isMuted;
            
            // Update the icon
            const { context, texture } = this.muteButton.userData;
            this.drawMicrophoneIcon(context, this.isMuted);
            texture.needsUpdate = true;
        }
    }
    
    // Handle interaction with the mute button
    handleMuteButtonPress() {
        const newMuteState = this.multiplayerManager.toggleMute();
        this.isMuted = newMuteState;
        
        // Update the icon
        const { context, texture } = this.muteButton.userData;
        this.drawMicrophoneIcon(context, this.isMuted);
        texture.needsUpdate = true;
    }
    
    // Check if controller is intersecting with the mute button
    checkIntersection(controller) {
        if (!this.controlsGroup.visible || !controller || !controller.raycaster) {
            return false;
        }
        
        const intersects = controller.raycaster.intersectObject(this.muteButton, true);
        
        if (intersects.length > 0) {
            // Highlight button
            const panel = this.muteButton.userData.panel;
            panel.material.color.set(0x333333);
            
            // Check if trigger or grip button is pressed
            if (controller.userData.isSelecting || controller.userData.isSqueezing) {
                this.handleMuteButtonPress();
                panel.material.color.set(0x555555);
                controller.userData.hapticActuators?.forEach(actuator => {
                    actuator.pulse(0.5, 100);
                });
                return true;
            }
            
            return true;
        } else {
            // Reset button color
            const panel = this.muteButton.userData.panel;
            panel.material.color.set(0x111111);
            return false;
        }
    }
    
    // Show the voice chat controls
    show() {
        this.controlsGroup.visible = true;
    }
    
    // Hide the voice chat controls
    hide() {
        this.controlsGroup.visible = false;
    }
    
    // Update method called every frame
    update(controllers) {
        if (!this.controlsGroup.visible) {
            return;
        }
        
        // Update mute button appearance based on current state
        this.updateMuteButton();
        
        // Check controllers for interaction with the mute button
        if (controllers) {
            controllers.forEach(controller => {
                if (controller) {
                    this.checkIntersection(controller);
                }
            });
        }
    }
    
    // Clean up resources
    dispose() {
        if (this.muteButton) {
            this.muteButton.userData.panel.material.dispose();
            this.muteButton.userData.icon.material.dispose();
            this.muteButton.userData.texture.dispose();
        }
        
        this.scene.remove(this.controlsGroup);
    }
} 