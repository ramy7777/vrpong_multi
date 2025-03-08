import * as THREE from 'three';

export class VoiceChat {
    constructor(multiplayerManager) {
        this.multiplayerManager = multiplayerManager;
        this.socket = multiplayerManager.socket;
        this.game = multiplayerManager.game;
        
        // Validate that we have a valid opponent ID
        if (!multiplayerManager.opponentId) {
            console.error('VoiceChat initialized without valid opponent ID');
            this.game.showMessage('Voice chat unavailable - no opponent found');
            return;
        }
        
        this.opponentId = multiplayerManager.opponentId;
        console.log('VoiceChat initialized with opponent ID:', this.opponentId);
        
        this.audioContext = null;
        this.stream = null;
        this.peer = null;
        this.isConnected = false;
        this.isMuted = false;
        
        // Analyser nodes for visualizing audio
        this.localAnalyser = null;
        this.remoteAnalyser = null;
        this.localAnalyserData = null;
        this.remoteAnalyserData = null;
        
        // UI elements for voice visualization
        this.localVoiceIndicator = null;
        this.remoteVoiceIndicator = null;
        
        // Connection state tracking
        this.connectionAttempts = 0;
        this.maxReconnectAttempts = 3;
        this.reconnectTimeout = null;
        this.lastConnectionTime = 0;
        
        this.setupSocketListeners();
    }
    
    // Set up socket event listeners for WebRTC signaling
    setupSocketListeners() {
        this.socket.on('voice-request', async (data) => {
            console.log('Received voice chat request from:', data.from);
            
            // Only proceed if we have an opponent and the request is from our opponent
            if (!this.multiplayerManager.opponentId || data.from !== this.multiplayerManager.opponentId) {
                console.log('Ignoring voice request from unknown peer:', data.from);
                return;
            }
            
            // We're the responder (non-initiator) in this case
            const isHost = this.multiplayerManager.isHost;
            const shouldBeInitiator = false; // We're responding, so we're not the initiator
            
            // Acquire microphone permission
            const success = await this.initializeStream();
            if (success) {
                console.log('Stream initialized, creating peer connection as responder');
                this.initiatePeerConnection(data.from, shouldBeInitiator);
            } else {
                console.error('Failed to initialize stream for incoming voice request');
            }
        });
        
        this.socket.on('voice-signal', async (data) => {
            console.log('Received voice signal from:', data.from);
            
            // Only proceed if we have an opponent and the signal is from our opponent
            if (!this.multiplayerManager.opponentId || data.from !== this.multiplayerManager.opponentId) {
                console.log('Ignoring voice signal from unknown peer:', data.from);
                return;
            }
            
            // Make sure we have a stream before processing signals
            if (!this.stream) {
                const success = await this.initializeStream();
                if (!success) {
                    console.error('Failed to initialize stream for voice signal');
                    return;
                }
            }
            
            // Initialize peer if not already done
            if (!this.peer) {
                // Determine correct role - if we're receiving a signal first, we should be the opposite role
                const isHost = this.multiplayerManager.isHost;
                this.initiatePeerConnection(data.from, isHost);
            }
            
            // Process the signal if peer is ready
            if (this.peer) {
                try {
                    console.log('Processing incoming signal');
                    this.peer.signal(data.signal);
                } catch (err) {
                    console.error('Error processing signal:', err);
                    // If there's an error processing the signal, we should 
                    // wait before trying to reset to avoid rapid reconnection loops
                    setTimeout(() => {
                        this.resetConnection();
                    }, 1000);
                }
            }
        });
    }
    
    // Ensure all audio tracks are enabled
    enableAllAudioTracks() {
        // Enable all local audio tracks
        if (this.stream) {
            const audioTracks = this.stream.getAudioTracks();
            console.log(`Ensuring ${audioTracks.length} local audio tracks are enabled`);
            
            audioTracks.forEach((track, index) => {
                if (!track.enabled) {
                    console.log(`Enabling local audio track ${index}`);
                    track.enabled = true;
                } else {
                    console.log(`Local audio track ${index} already enabled`);
                }
                
                // Log track details for debugging
                console.log(`Local audio track ${index} settings:`, JSON.stringify(track.getSettings()));
                console.log(`Local audio track ${index} constraints:`, JSON.stringify(track.getConstraints()));
            });
        }
    }
    
    // Initialize the audio stream from the microphone
    async initializeStream() {
        if (this.stream) return true;
        
        try {
            console.log('Requesting microphone access...');
            // Request access to microphone
            this.stream = await navigator.mediaDevices.getUserMedia({ 
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                },
                video: false 
            });
            
            console.log('Microphone access granted');
            const audioTrack = this.stream.getAudioTracks()[0];
            console.log('Audio track label:', audioTrack.label);
            console.log('Audio track settings:', JSON.stringify(audioTrack.getSettings()));
            
            // Ensure audio tracks are enabled
            this.enableAllAudioTracks();
            
            // Set up audio context and analyzer
            this.setupAudioContext();
            
            return true;
        } catch (err) {
            console.error('Error accessing microphone:', err);
            this.game.showMessage('Could not access microphone. Voice chat disabled.');
            return false;
        }
    }
    
    // Set up Web Audio API context and analyzers
    setupAudioContext() {
        if (!this.stream) return;
        
        // Create audio context
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        console.log('Audio context created: sampleRate:', this.audioContext.sampleRate, 'state:', this.audioContext.state);
        
        // Create analyzer for local audio (microphone)
        this.localAnalyser = this.audioContext.createAnalyser();
        this.localAnalyser.fftSize = 32;
        this.localAnalyserData = new Uint8Array(this.localAnalyser.frequencyBinCount);
        console.log('Local analyzer created with frequency bins:', this.localAnalyser.frequencyBinCount);
        
        // Create a source from the microphone stream
        const micSource = this.audioContext.createMediaStreamSource(this.stream);
        micSource.connect(this.localAnalyser);
        
        // Setup remote analyzer (will connect when peer established)
        this.remoteAnalyser = this.audioContext.createAnalyser();
        this.remoteAnalyser.fftSize = 32;
        this.remoteAnalyserData = new Uint8Array(this.remoteAnalyser.frequencyBinCount);
        console.log('Remote analyzer created with frequency bins:', this.remoteAnalyser.frequencyBinCount);
        
        // Create an audio destination node (needed for some browsers)
        const destination = this.audioContext.createMediaStreamDestination();
        console.log('Audio destination: maxChannelCount:', destination.maxChannelCount, 
            'numberOfInputs:', destination.numberOfInputs, 
            'numberOfOutputs:', destination.numberOfOutputs);
        
        // Create voice indicators
        this.createVoiceIndicators();
        
        // Create the microphone test button for debugging
        this.createMicTestButton();
        
        // Ensure audio context is running
        this.ensureAudioContextRunning();
    }
    
    // Create voice visualization indicators in the UI
    createVoiceIndicators() {
        // Size and position of the indicators
        const indicatorWidth = 0.05;
        const indicatorHeight = 0.3;
        const indicatorDepth = 0.01;
        const indicatorColor = 0x00ff00;
        
        // Local voice indicator (your microphone)
        const localGeometry = new THREE.BoxGeometry(indicatorWidth, indicatorHeight, indicatorDepth);
        const localMaterial = new THREE.MeshBasicMaterial({ color: indicatorColor });
        this.localVoiceIndicator = new THREE.Mesh(localGeometry, localMaterial);
        this.localVoiceIndicator.position.set(-0.15, 1.6, -1.0); // Position near your paddle
        this.localVoiceIndicator.scale.y = 0.1; // Start with minimal height
        this.game.scene.add(this.localVoiceIndicator);
        
        // Remote voice indicator (opponent's microphone)
        const remoteGeometry = new THREE.BoxGeometry(indicatorWidth, indicatorHeight, indicatorDepth);
        const remoteMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000 });
        this.remoteVoiceIndicator = new THREE.Mesh(remoteGeometry, remoteMaterial);
        this.remoteVoiceIndicator.position.set(0.15, 1.6, -1.0); // Position near opponent's paddle
        this.remoteVoiceIndicator.scale.y = 0.1; // Start with minimal height
        this.game.scene.add(this.remoteVoiceIndicator);
    }
    
    // Update voice indicators based on audio levels
    updateVoiceIndicators() {
        if (!this.localAnalyser || !this.remoteAnalyser) return;
        
        // Update local voice indicator
        this.localAnalyser.getByteFrequencyData(this.localAnalyserData);
        let localSum = 0;
        for (let i = 0; i < this.localAnalyserData.length; i++) {
            localSum += this.localAnalyserData[i];
        }
        const localAvg = localSum / this.localAnalyserData.length;
        const localScale = Math.max(0.1, Math.min(1.0, localAvg / 128));
        if (this.localVoiceIndicator) {
            this.localVoiceIndicator.scale.y = localScale;
        }
        
        // Update remote voice indicator
        this.remoteAnalyser.getByteFrequencyData(this.remoteAnalyserData);
        let remoteSum = 0;
        for (let i = 0; i < this.remoteAnalyserData.length; i++) {
            remoteSum += this.remoteAnalyserData[i];
        }
        const remoteAvg = remoteSum / this.remoteAnalyserData.length;
        const remoteScale = Math.max(0.1, Math.min(1.0, remoteAvg / 128));
        if (this.remoteVoiceIndicator) {
            this.remoteVoiceIndicator.scale.y = remoteScale;
        }
    }
    
    // Initiate a WebRTC peer connection
    initiatePeerConnection(peerId, isInitiator) {
        if (!this.stream) {
            console.error('No microphone stream available');
            return;
        }
        
        // If we already have an active peer connection, don't create a new one
        if (this.peer && this.isConnected) {
            console.log('Peer connection already exists and is connected');
            return;
        }
        
        console.log(`Attempting to create peer connection as ${isInitiator ? 'initiator' : 'responder'} with peer: ${peerId}`);
        
        try {
            // Access the global SimplePeer constructor
            if (typeof SimplePeer === 'undefined') {
                throw new Error('SimplePeer is not loaded');
            }
            
            // Make sure all audio tracks are enabled
            this.enableAllAudioTracks();
            
            // Create a new peer connection with config optimized for voice chat
            console.log(`Creating new peer connection as ${isInitiator ? 'initiator (caller)' : 'responder (answerer)'}`);
            this.peer = new SimplePeer({
                initiator: isInitiator,
                stream: this.stream,
                trickle: false,
                config: {
                    iceServers: [
                        { urls: 'stun:stun.l.google.com:19302' },
                        { urls: 'stun:stun1.l.google.com:19302' },
                        { urls: 'stun:global.stun.twilio.com:3478' }
                    ]
                },
                offerOptions: {
                    offerToReceiveAudio: true,
                    offerToReceiveVideo: false
                },
                sdpTransform: (sdp) => {
                    // Modify SDP to prioritize audio quality
                    console.log('Transforming SDP to optimize audio quality');
                    
                    // Set audio bitrate high but not too high (128 kbps is good for voice)
                    sdp = sdp.replace('a=mid:0', 'a=mid:0\r\nb=AS:128');
                    
                    // Prefer the Opus codec for better voice quality
                    sdp = sdp.replace(/m=audio .+/, (line) => {
                        const parts = line.split(' ');
                        // Find the Opus codec ID
                        const sdpLines = sdp.split('\r\n');
                        let opusId = null;
                        for (const line of sdpLines) {
                            if (line.includes('opus/48000/2')) {
                                opusId = line.split(':', 2)[1].split(' ', 1)[0];
                                break;
                            }
                        }
                        if (opusId) {
                            // Move Opus to the front of codec list
                            const codecs = parts.slice(3);
                            codecs.splice(codecs.indexOf(opusId), 1);
                            codecs.unshift(opusId);
                            return `${parts[0]} ${parts[1]} ${parts[2]} ${codecs.join(' ')}`;
                        }
                        return line;
                    });
                    
                    return sdp;
                }
            });
            
            // Handle signaling events
            this.peer.on('signal', (data) => {
                console.log(`Sending signal to peer: ${peerId}, signal type: ${data.type}`);
                this.socket.emit('voice-signal', {
                    to: peerId,
                    signal: data
                });
            });
            
            // Handle successful connection
            this.peer.on('connect', () => {
                console.log('Voice chat peer connection established');
                this.isConnected = true;
                this.connectionAttempts = 0; // Reset connection attempts on successful connection
                this.game.showMessage('Voice chat connected');
                
                // Send a test message to verify the data channel is working
                if (this.peer && this.peer._channel && this.peer._channel.readyState === 'open') {
                    try {
                        this.peer.send('voice-chat-connected');
                    } catch (err) {
                        console.warn('Could not send test message:', err);
                    }
                }
            });
            
            // Handle incoming stream
            this.peer.on('stream', (remoteStream) => {
                console.log('Received remote stream');
                
                // Create an audio element to play the remote stream
                try {
                    const audio = document.createElement('audio');
                    audio.id = 'voice-chat-audio';
                    
                    // Configure the audio element with all possible options to ensure playback
                    audio.srcObject = remoteStream;
                    audio.autoplay = true;
                    audio.muted = false;  // IMPORTANT: Must be false to hear remote audio
                    audio.volume = 1.0;
                    
                    // Some browsers require specific attributes
                    audio.setAttribute('playsinline', '');
                    audio.setAttribute('controls', '');
                    audio.style.display = 'none'; // Hide the element but keep it in the DOM
                    
                    // Remove any existing audio elements
                    const existingAudio = document.getElementById('voice-chat-audio');
                    if (existingAudio) {
                        existingAudio.remove();
                    }
                    
                    // Ensure audio is playing in both browser tabs/windows
                    document.body.appendChild(audio);
                    
                    // Force user interaction to enable audio - some browsers require this
                    let userInteractionRequired = true;
                    const forceAudioPlayback = () => {
                        if (userInteractionRequired) {
                            userInteractionRequired = false;
                            console.log('User interaction detected, forcing audio playback');
                            
                            // Try to play the audio
                            audio.play().then(() => {
                                console.log('Remote audio playback started successfully');
                            }).catch(err => {
                                console.error('Error playing remote audio stream:', err);
                                // If autoplay fails, show a message to the user
                                this.game.showMessage('Click or tap screen to enable voice chat');
                                userInteractionRequired = true;
                            });
                        }
                    };
                    
                    // Add event listeners to force audio playback on user interaction
                    ['click', 'touchstart', 'keydown'].forEach(event => {
                        document.addEventListener(event, forceAudioPlayback, { once: false });
                    });
                    
                    // Try to play immediately (this may fail due to browser policies)
                    audio.play().then(() => {
                        console.log('Remote audio playback started successfully');
                    }).catch(err => {
                        console.error('Error auto-playing remote audio:', err);
                        userInteractionRequired = true;
                        // Show a message to the user
                        this.game.showMessage('Click or tap screen to enable voice chat');
                    });
                    
                    // Connect remote stream to analyzer for visualization
                    if (this.audioContext && this.remoteAnalyser) {
                        const remoteSource = this.audioContext.createMediaStreamSource(remoteStream);
                        remoteSource.connect(this.remoteAnalyser);
                    }
                } catch (err) {
                    console.error('Error setting up remote audio stream:', err);
                }
            });
            
            // Handle incoming data (for verification)
            this.peer.on('data', (data) => {
                try {
                    const message = data.toString();
                    console.log('Received data from peer:', message);
                } catch (err) {
                    console.warn('Error processing peer data:', err);
                }
            });
            
            // Handle errors
            this.peer.on('error', (err) => {
                console.error(`Peer connection error (role: ${isInitiator ? 'initiator' : 'responder'}):`, err);
                
                // Only reset connection if it's a fatal error
                // Some errors are normal during connection establishment
                if (err.code === 'ERR_DATA_CHANNEL' || 
                    err.code === 'ERR_CONNECTION_FAILURE' ||
                    err.toString().includes('Failed to set remote description')) {
                    this.resetConnection();
                }
            });
            
            // Handle peer disconnection
            this.peer.on('close', () => {
                console.log('Voice chat peer connection closed');
                this.resetConnection();
            });
            
            // Log when peer connection is successfully created
            if (isInitiator) {
                console.log('Peer connection created successfully as initiator');
            } else {
                console.log('Peer connection created successfully as responder');
            }
            
        } catch (err) {
            console.error('Error creating WebRTC peer connection:', err);
            this.game.showMessage('Voice chat unavailable');
        }
    }
    
    // Request a voice chat connection with the opponent
    async requestVoiceChat() {
        // Use the stored opponent ID which was validated during initialization
        const opponentId = this.opponentId;
        
        if (!opponentId) {
            console.error('No opponent connected');
            return;
        }

        try {
            // Only request new connection if we don't already have one active
            if (this.peer && this.isConnected) {
                console.log('Voice chat already connected, skipping request');
                return;
            }
            
            // Reset any existing connection before starting a new one
            if (this.peer) {
                console.log('Cleaning up existing peer connection before creating a new one');
                this.peer.destroy();
                this.peer = null;
            }
            
            // Initialize the stream
            console.log('Requesting voice chat with opponent:', opponentId);
            const success = await this.initializeStream();
            
            if (!success) {
                console.error('Failed to initialize stream for voice chat request');
                return;
            }
            
            // Play a test tone to ensure audio is working properly
            this.playTestTone();
            
            // Determine who should be the initiator based on socket IDs
            // This ensures both peers don't try to be initiators at the same time
            const isHost = this.multiplayerManager.isHost;
            const shouldBeInitiator = isHost; // Host is always initiator
            
            console.log(`Stream initialized, socket ID: ${this.socket.id}, isHost: ${isHost}, will be initiator: ${shouldBeInitiator}`);
            
            if (shouldBeInitiator) {
                // Send the request to the opponent and initialize our peer connection
                console.log('Sending voice request to opponent');
                this.socket.emit('voice-request', {
                    to: opponentId
                });
            }
            
            // Record connection attempt time
            this.lastConnectionTime = Date.now();
            
            // Wait a moment before initializing peer to avoid race conditions
            setTimeout(() => {
                console.log(`Initializing WebRTC peer as ${shouldBeInitiator ? 'initiator' : 'responder'}`);
                this.initiatePeerConnection(opponentId, shouldBeInitiator);
            }, 500);
            
        } catch (err) {
            console.error('Error initializing voice chat:', err);
            this.game.showMessage('Voice chat initialization failed');
        }
    }
    
    // Play a test tone to ensure audio system is initialized
    playTestTone() {
        try {
            console.log('Testing audio output...');
            if (!this.audioContext) {
                this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            }
            
            // Check if the audio context is suspended and resume it if needed
            if (this.audioContext.state === 'suspended') {
                this.audioContext.resume();
            }
            
            // Configure the oscillator
            const oscillator = this.audioContext.createOscillator();
            oscillator.type = 'sine';
            oscillator.frequency.setValueAtTime(440, this.audioContext.currentTime); // A4 note
            
            // Configure the gain (volume)
            const gainNode = this.audioContext.createGain();
            gainNode.gain.setValueAtTime(0.1, this.audioContext.currentTime); // Very quiet
            gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.2); // Fade out
            
            // Connect and start
            oscillator.connect(gainNode);
            gainNode.connect(this.audioContext.destination);
            
            oscillator.start();
            oscillator.stop(this.audioContext.currentTime + 0.2); // Short tone
            
            console.log('Audio test tone played');
        } catch (err) {
            console.error('Error playing test tone:', err);
        }
    }
    
    // Toggle mute status
    toggleMute() {
        if (!this.stream) return;
        
        this.isMuted = !this.isMuted;
        this.stream.getAudioTracks().forEach(track => {
            track.enabled = !this.isMuted;
        });
        
        return this.isMuted;
    }
    
    // Reset the connection
    resetConnection() {
        console.log('Resetting voice chat connection');
        
        if (this.peer) {
            console.log('Peer connection destroyed');
            this.peer.destroy();
            this.peer = null;
        }
        
        this.isConnected = false;
        
        // Clear any existing reconnect timeout
        if (this.reconnectTimeout) {
            clearTimeout(this.reconnectTimeout);
            this.reconnectTimeout = null;
        }
        
        // After connection reset, attempt to reconnect if we still have an opponent
        // and we haven't exceeded the maximum number of reconnection attempts
        const now = Date.now();
        const timeSinceLastConnection = now - this.lastConnectionTime;
        
        // Only attempt to reconnect if:
        // 1. We have an opponent
        // 2. We haven't exceeded the maximum number of reconnection attempts
        // 3. It's been at least 5 seconds since we last tried to connect (to prevent rapid reconnection attempts)
        if (this.multiplayerManager && 
            this.multiplayerManager.opponentId && 
            this.connectionAttempts < this.maxReconnectAttempts &&
            timeSinceLastConnection > 5000) {
            
            console.log(`Attempting to reconnect voice chat (attempt ${this.connectionAttempts + 1}/${this.maxReconnectAttempts})`);
            this.connectionAttempts++;
            this.lastConnectionTime = now;
            
            // Wait 2 seconds before attempting to reconnect
            this.reconnectTimeout = setTimeout(() => {
                if (this.multiplayerManager.opponentId) {
                    this.requestVoiceChat();
                }
            }, 2000);
        } else if (this.connectionAttempts >= this.maxReconnectAttempts) {
            console.log(`Maximum reconnection attempts (${this.maxReconnectAttempts}) reached. Voice chat disabled.`);
            this.game.showMessage('Voice chat disconnected. Please restart the game to try again.');
            // Reset counter after waiting some time to allow for manual reconnection
            setTimeout(() => {
                this.connectionAttempts = 0;
            }, 30000); // Reset connection counter after 30 seconds
        }
    }
    
    // Clean up resources when voice chat is no longer needed
    cleanup() {
        this.resetConnection();
        
        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
            this.stream = null;
        }
        
        if (this.localVoiceIndicator) {
            this.game.scene.remove(this.localVoiceIndicator);
            this.localVoiceIndicator = null;
        }
        
        if (this.remoteVoiceIndicator) {
            this.game.scene.remove(this.remoteVoiceIndicator);
            this.remoteVoiceIndicator = null;
        }
    }
    
    // Update method called every frame
    update() {
        this.updateVoiceIndicators();
    }
    
    // Create a microphone test button for debugging
    createMicTestButton() {
        // Create a simple button to test the microphone
        const buttonSize = 0.1;
        const buttonGeometry = new THREE.BoxGeometry(buttonSize, buttonSize, buttonSize);
        const buttonMaterial = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
        const button = new THREE.Mesh(buttonGeometry, buttonMaterial);
        
        // Position the button in a visible location
        button.position.set(0, 1.3, -0.7);
        
        // Add click handler
        button.userData = {
            type: 'micTestButton',
            onClick: () => {
                this.playTestTone();
            }
        };
        
        this.game.scene.add(button);
        console.log('Microphone test button created');
    }
    
    // Ensure audio context is running and set up handlers for user interaction
    ensureAudioContextRunning() {
        if (!this.audioContext) return;
        
        // Check if audio context is suspended and try to resume it
        if (this.audioContext.state === 'suspended') {
            console.log('Audio context suspended, attempting to resume');
            this.audioContext.resume().then(() => {
                console.log('Audio context resumed successfully');
            }).catch(err => {
                console.error('Failed to resume audio context:', err);
            });
        } else {
            console.log('Audio context already running:', this.audioContext.state);
        }
        
        // Add event listeners to resume audio context on user interaction
        // This is needed due to browser autoplay policies
        const resumeAudioContext = () => {
            if (this.audioContext && this.audioContext.state !== 'running') {
                console.log('Resuming audio context after user interaction');
                this.audioContext.resume().then(() => {
                    console.log('Audio context resumed after user interaction');
                });
            }
        };
        
        const events = ['click', 'touchstart', 'keydown'];
        events.forEach(event => {
            document.addEventListener(event, resumeAudioContext, { once: true });
        });
        
        console.log('Added audio context resume handlers for user interaction');
    }
} 