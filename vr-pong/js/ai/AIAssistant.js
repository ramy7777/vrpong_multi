export class AIAssistant {
    constructor(game) {
        console.log("AI Assistant: Initializing AI assistant");
        this.game = game;
        
        // Configuration
        this.useServerSide = false; // Whether to use server-side API or client-side
        
        // State variables
        this.isInitialized = false;
        this.isListening = false;
        this.isSpeaking = false;
        this.isRecording = false;
        this.realtimeMode = false; // WebRTC mode
        
        // WebRTC related properties
        this.webrtcSessionId = null;
        this.webrtcToken = null;
        this.webrtcIceServers = null;
        this.peerConnection = null;
        this.webrtcAudioElement = null;
        this.microphoneStream = null;
        this.audioProcessor = null;
        this.audioSource = null;
        this.audioContext = null;
        
        // UI elements
        this.container = null;
        this.chatDisplay = null;
        this.textInput = null;
        this.microphoneButton = null;
        this.statusDisplay = null;
        this.setupContainer = null;
        this.apiKeyField = null;
        
        // Audio variables
        this.recognition = null;
        this.audioRecorder = null;
        this.recordedChunks = [];
        this.audioPlayer = new Audio();
        
        // Data
        this.apiKey = null;
        this.chatHistory = [];
        this.socket = null;
        
        // For direct OpenAI integration
        this.openai = null;
        
        // Check if we have a socket connection from multiplayer manager
        if (game && game.multiplayerManager && game.multiplayerManager.socket) {
            this.socket = game.multiplayerManager.socket;
            this.useServerSide = true;
            this.isInitialized = true; // Mark as initialized when using server-side
            console.log("AI Assistant: Using server-side AI processing via socket.io, marked as initialized");
            
            this.setupSocketListeners();
        } else {
            console.warn("AI Assistant: No socket provided, AI assistant will be limited");
        }
        
        // Create UI
        this.createUI();
        
        // Initialize audio context
        this.initAudioContext();
        
        // Check browser compatibility for speech features
        this.checkSpeechCompatibility();
        
        console.log("AI Assistant: Basic properties initialized");
    }
    
    setupSocketListeners() {
        if (!this.socket) {
            console.error("AI Assistant: Cannot set up listeners without socket connection");
            return;
        }
        
        // Listen for responses from the OpenAI integration
        this.socket.on('openai-response', (data) => {
            if (data && data.text) {
                const text = data.text;
                console.log("AI Assistant: Received response from OpenAI:", text.substring(0, 50) + "...");
                
                // Update the message in the chat history
                this.updateLastAssistantMessage(text);
                
                // Speak the response if not in realtime mode
                if (!this.isRealtimeMode) {
                    this.speakText(text);
                }
            }
        });
        
        // New event for realtime chunks from WebSocket API
        this.socket.on('openai-realtime-chunk', (data) => {
            if (data && data.text) {
                const isComplete = data.complete === true;
                const text = data.text;
                const modelName = data.model || "AI Assistant";
                
                console.log(`AI Assistant: Received ${isComplete ? 'complete' : 'partial'} realtime chunk from ${modelName}:`, 
                    isComplete ? text.substring(0, 50) + "..." : text);
                
                if (isComplete) {
                    // This is the complete message, replace any partial message
                    this.updateLastAssistantMessage(text);
                } else {
                    // This is an incremental update
                    // Find the last assistant message and append text if it exists
                    let lastMessage = this.findLastAssistantMessage();
                    if (lastMessage) {
                        // If the message is just a placeholder, replace it
                        if (lastMessage.content === '...') {
                            lastMessage.content = text;
                        } else {
                            // Otherwise, append the new text
                            lastMessage.content += text;
                        }
                    } else {
                        // If no message exists, create a new one
                        this.addMessageToConversation('assistant', text);
                    }
                    
                    // Update the display
                    this.updateChatDisplay();
                }
            }
        });
        
        // Listen for realtime audio responses
        this.socket.on('openai-realtime-response', (data) => {
            if (data && data.text) {
                const text = data.text;
                console.log("AI Assistant: Received realtime response from OpenAI:", text.substring(0, 50) + "...");
                
                // Update the message in the chat history
                this.updateLastAssistantMessage(text);
            }
        });
        
        // Listen for audio responses from the server
        this.socket.on('openai-audio-stream-response', (data) => {
            if (data && data.audioData) {
                console.log("[AI Assistant] Received audio response from server");
                
                // Update the message in the chat history if text is provided
                if (data.text) {
                    this.updateLastAssistantMessage(data.text);
                }
                
                // Play the audio
                this.playOpenAIAudio(data.audioData);
            }
        });
        
        // Listen for transcriptions
        this.socket.on('openai-transcription', (transcription) => {
            if (typeof transcription === 'string') {
                console.log("AI Assistant: Received transcription:", transcription);
                
                // Find the latest user message (which might be a placeholder)
                if (this.chatHistory.length > 0) {
                    const lastMsg = this.chatHistory[this.chatHistory.length - 1];
                    if (lastMsg.role === 'user' && lastMsg.content === '...') {
                        // Replace the placeholder with the actual transcription
                        lastMsg.content = transcription;
                    } else {
                        // Add as a new message
                        this.addMessageToConversation('user', transcription);
                    }
                    
                    // Add a placeholder for the assistant's reply
                    this.addMessageToConversation('assistant', '...');
                    
                    // Update the display
                    this.updateChatDisplay();
                    
                    // Hide the recognition status since we now have the full transcription
                    this.showRecognitionStatus("");
                }
            }
        });
        
        this.socket.on('openai-stream-chunk', (data) => {
            const { text } = data;
            
            // Update the last assistant message with the new chunk
            const lastMessageContent = this.findLastAssistantMessage() || '';
            const updatedContent = lastMessageContent === '...' ? text : lastMessageContent + text;
            this.updateLastAssistantMessage(updatedContent);
        });
        
        this.socket.on('openai-speech-response', (data) => {
            const { audio } = data;
            console.log("AI Assistant: Received speech audio from OpenAI");
            
            // Play the audio response
            if (audio) {
                this.playOpenAIAudio(audio);
            }
        });
        
        // Listen for OpenAI setup status
        this.socket.on('openai-key-status', (data) => {
            if (data.success) {
                console.log("AI Assistant: OpenAI API key set successfully");
                
                // Hide the setup UI after a short delay
                setTimeout(() => {
                    this.hideSetupUI();
                    
                    // Set API key to a placeholder since the server is managing it
                    this.apiKey = "server-managed";
                    this.isInitialized = true;
                    
                    // Create and show the chat UI
                    this.createChatUI();
                    this.showChatUI();
                    
                    // Add a welcome message
                    this.addMessageToConversation('assistant', 'Hello! I\'m your AI assistant. I can help with your Pong game or we can chat about anything you\'d like to discuss.');
                    
                    // If in realtime mode, we don't speak the welcome message here
                    // as we'll wait for the user to interact first
                    if (!this.isRealtimeMode) {
                        this.speakText('Hello! I\'m your AI assistant. I can help with your Pong game or we can chat about anything you\'d like to discuss.');
                    }
                }, 1000);
            } else {
                console.error("API key error:", data.error);
                
                // Update the setup UI with the error
                if (this.setupContainer) {
                    const messageElement = this.setupContainer.querySelector('.message');
                    if (messageElement) {
                        messageElement.textContent = data.error || "Failed to set API key";
                        messageElement.style.color = "#ff3333";
                    }
                    
                    // Re-enable the form
                    const form = this.setupContainer.querySelector('form');
                    const input = this.setupContainer.querySelector('input');
                    const button = this.setupContainer.querySelector('button');
                    
                    if (form && input && button) {
                        form.style.pointerEvents = "auto";
                        input.disabled = false;
                        button.disabled = false;
                    }
                }
            }
        });
        
        // Listen for OpenAI errors
        this.socket.on('openai-error', (error) => {
            // Error can be either a string or an object with an error property
            const errorMessage = typeof error === 'string' ? error : 
                                 (error && error.error ? error.error : "Unknown error communicating with OpenAI");
            
            console.error("OpenAI error from server:", errorMessage);
            this.showMessage(errorMessage);
            
            // If we were in WebRTC mode, we already tried the fallback on the server
            if (errorMessage.includes("WebRTC") && this.realtimeMode) {
                console.log("[AI Assistant] WebRTC failed but fallback should be handled on server");
            }
            
            // If there was an ongoing recording/conversation, reset the state
            if (this.isListening) {
                this.stopListening();
            }
            
            // Clear any loading indicators
            this.updateChatDisplay();
        });
        
        // Add WebRTC token handler
        this.socket.on('openai-webrtc-token', (data) => {
            console.log("[AI Assistant] Received WebRTC token from server");
            
            // Clear any pending timeout
            if (this.webrtcInitTimeout) {
                clearTimeout(this.webrtcInitTimeout);
                this.webrtcInitTimeout = null;
            }
            
            this.setupWebRTCConnection(data);
        });
        
        // Handle WebRTC-specific errors
        this.socket.on('openai-webrtc-error', (data) => {
            console.error("[AI Assistant] WebRTC error from server:", data.error);
            
            // Clear any pending timeout
            if (this.webrtcInitTimeout) {
                clearTimeout(this.webrtcInitTimeout);
                this.webrtcInitTimeout = null;
            }
            
            // Show the error message
            this.showMessage("WebRTC error: " + data.error);
            
            // Fallback to traditional mode if WebRTC fails
            if (this.realtimeMode) {
                console.log("[AI Assistant] Reverting to traditional mode due to WebRTC error");
                this.realtimeMode = false;
                
                // Update UI to reflect traditional mode
                if (this.microphoneButton) {
                    const modeIcon = this.microphoneButton.querySelector('.mode-icon');
                    if (modeIcon) {
                        modeIcon.textContent = '🎙️';
                    }
                    this.microphoneButton.style.backgroundColor = '#2196F3';
                    this.microphoneButton.title = 'Traditional voice mode - Click to switch to real-time mode (WebRTC)';
                }
            }
        });
        
        // Handle WebRTC answer from server
        this.socket.on('webrtc-answer', (data) => {
            if (this.peerConnection) {
                const answer = new RTCSessionDescription(data.answer);
                this.peerConnection.setRemoteDescription(answer).then(() => {
                    console.log("[AI Assistant] Remote description set");
                }).catch(err => {
                    console.error("[AI Assistant] Error setting remote description:", err);
                });
            }
        });
        
        // Handle ICE candidates from server
        this.socket.on('webrtc-ice-candidate', (data) => {
            if (this.peerConnection) {
                const candidate = new RTCIceCandidate(data.candidate);
                this.peerConnection.addIceCandidate(candidate).catch(err => {
                    console.error("[AI Assistant] Error adding ICE candidate:", err);
                });
            }
        });
        
        // Handle WebRTC errors
        this.socket.on('openai-webrtc-error', (error) => {
            const errorMessage = typeof error === 'string' ? error : 
                               (error && error.error ? error.error : "Unknown error with WebRTC");
            
            console.error("[AI Assistant] WebRTC error from server:", errorMessage);
            
            // Track failures but don't auto-switch as user wants to debug
            this.webrtcFailCount = (this.webrtcFailCount || 0) + 1;
            
            // If the error mentions API not available or 404 or beta
            if (errorMessage.includes("not available") || 
                errorMessage.includes("404") || 
                errorMessage.includes("limited beta")) {
                
                // Show user-friendly message about beta access
                this.showMessage("Realtime voice mode not available. This feature requires beta access.");
                
                // Show more detailed information in the chat history
                const betaMessage = 
                    "The OpenAI Realtime API (two-way voice streaming) requires:\n\n" +
                    "1. A paid OpenAI API account with GPT-4 access\n" +
                    "2. Access to the Realtime API beta program\n" +
                    "3. The latest OpenAI SDK version\n\n" +
                    "We're currently using OpenAI SDK version 4.86.2.\n\n" +
                    "Your current API key doesn't have access to this beta feature.\n" +
                    "You can still use voice with the traditional approach, but it won't be real-time streaming.";
                
                this.addMessageToConversation('assistant', betaMessage);
                this.updateChatDisplay();
                
                console.log(`[AI Assistant] WebRTC not available (beta feature). Switching to traditional mode.`);
                
                // Switch to traditional mode automatically
                this.realtimeMode = false;
                
                // Update UI
                if (this.microphoneButton) {
                    const modeIcon = this.microphoneButton.querySelector('.mode-icon');
                    if (modeIcon) {
                        modeIcon.textContent = '🎙️';
                    }
                    
                    // Update button style
                    this.microphoneButton.style.backgroundColor = '#2196F3';
                    this.microphoneButton.title = 'Traditional voice mode - Click to switch to real-time mode (requires beta access)';
                }
                
                return;
            }
            
            // For other errors, show the raw message for debugging
            this.showMessage(`WebRTC Error (${this.webrtcFailCount}): ${errorMessage}`);
            console.log(`[AI Assistant] WebRTC failure #${this.webrtcFailCount}. Remaining in WebRTC mode for debugging.`);
            
            // Reset any ongoing operations
            if (this.isListening) {
                this.stopListening();
            }
        });
    }
    
    async initialize(apiKey) {
        if (this.useServerSide) {
            console.log("AI Assistant: Using server-side API, skipping client initialization");
            this.isInitialized = true;
            return;
        }
        
        if (this.isInitialized) {
            console.log("AI Assistant: Already initialized");
            return;
        }
        
        try {
            // Store the API key
            this.apiKey = apiKey;
            console.log("AI Assistant: Initialized with API key");
            
            // Initialize speech recognition
            this.initSpeechRecognition();
            
            this.isInitialized = true;
        } catch (error) {
            console.error("AI Assistant: Initialization failed:", error);
            throw error;
        }
    }
    
    createUI() {
        if (this.useServerSide) {
            // If using server-side, only create the chat UI
            this.createChatUI();
            this.showChatUI(); // Ensure it's visible
            return;
        }
        
        // Otherwise create the setup UI first
        this.createSetupUI();
    }
    
    createSetupUI() {
        // Create a container for the setup UI
        this.setupContainer = document.createElement('div');
        this.setupContainer.className = 'ai-assistant-setup';
        this.setupContainer.style.position = 'absolute';
        this.setupContainer.style.bottom = '20px';
        this.setupContainer.style.right = '20px';
        this.setupContainer.style.backgroundColor = 'rgba(0, 0, 0, 0.85)';
        this.setupContainer.style.padding = '20px';
        this.setupContainer.style.borderRadius = '10px';
        this.setupContainer.style.color = 'white';
        this.setupContainer.style.fontFamily = 'Arial, sans-serif';
        this.setupContainer.style.zIndex = '10000';
        this.setupContainer.style.width = '350px';
        this.setupContainer.style.boxShadow = '0 0 20px rgba(0, 200, 255, 0.7)';
        this.setupContainer.style.border = '2px solid #4CAF50';
        
        // Add title
        const title = document.createElement('h3');
        title.textContent = 'AI Assistant Setup';
        title.style.margin = '0 0 15px 0';
        title.style.textAlign = 'center';
        title.style.color = '#4CAF50';
        title.style.fontSize = '24px';
        
        // Add description
        const description = document.createElement('p');
        description.textContent = 'Enter your OpenAI API key to enable voice chat with the AI Assistant. Your key will be stored only in your browser session.';
        description.style.fontSize = '14px';
        description.style.marginBottom = '15px';
        description.style.lineHeight = '1.5';
        
        // Add input field for API key
        const inputWrapper = document.createElement('div');
        inputWrapper.style.display = 'flex';
        inputWrapper.style.marginBottom = '15px';
        
        const input = document.createElement('input');
        input.type = 'password';
        input.placeholder = 'sk-...';
        input.style.flex = '1';
        input.style.padding = '12px 15px';
        input.style.border = '1px solid #555';
        input.style.borderRadius = '4px';
        input.style.backgroundColor = '#222';
        input.style.color = 'white';
        input.style.fontSize = '16px';
        
        const toggleBtn = document.createElement('button');
        toggleBtn.textContent = '👁️';
        toggleBtn.style.marginLeft = '5px';
        toggleBtn.style.padding = '0 15px';
        toggleBtn.style.backgroundColor = '#444';
        toggleBtn.style.border = 'none';
        toggleBtn.style.borderRadius = '4px';
        toggleBtn.style.cursor = 'pointer';
        toggleBtn.style.color = 'white';
        toggleBtn.style.fontSize = '16px';
        toggleBtn.onclick = () => {
            if (input.type === 'password') {
                input.type = 'text';
                toggleBtn.textContent = '🔒';
            } else {
                input.type = 'password';
                toggleBtn.textContent = '👁️';
            }
        };
        
        inputWrapper.appendChild(input);
        inputWrapper.appendChild(toggleBtn);
        
        // Add submit button
        const submitBtn = document.createElement('button');
        submitBtn.textContent = 'Connect to OpenAI';
        submitBtn.style.width = '100%';
        submitBtn.style.padding = '12px';
        submitBtn.style.backgroundColor = '#4CAF50';
        submitBtn.style.border = 'none';
        submitBtn.style.borderRadius = '4px';
        submitBtn.style.color = 'white';
        submitBtn.style.fontWeight = 'bold';
        submitBtn.style.cursor = 'pointer';
        submitBtn.style.fontSize = '16px';
        submitBtn.style.marginBottom = '15px';
        
        // Add client-side option
        const clientSideOption = document.createElement('div');
        clientSideOption.style.marginTop = '10px';
        clientSideOption.style.textAlign = 'center';
        
        const skipButton = document.createElement('button');
        skipButton.textContent = 'Continue without API key';
        skipButton.style.padding = '8px 15px';
        skipButton.style.backgroundColor = '#333';
        skipButton.style.border = '1px solid #555';
        skipButton.style.borderRadius = '4px';
        skipButton.style.color = '#ccc';
        skipButton.style.cursor = 'pointer';
        
        clientSideOption.appendChild(skipButton);
        
        // Add status message
        const statusMsg = document.createElement('p');
        statusMsg.style.margin = '15px 0 0 0';
        statusMsg.style.fontSize = '14px';
        statusMsg.style.textAlign = 'center';
        statusMsg.style.color = '#aaa';
        statusMsg.style.minHeight = '20px';
        
        // Add event listener for submit button
        submitBtn.addEventListener('click', () => {
            const apiKey = input.value.trim();
            if (apiKey === '') {
                statusMsg.textContent = 'Please enter a valid API key';
                statusMsg.style.color = '#ff5555';
                return;
            }
            
            // Update status
            statusMsg.textContent = 'Connecting to OpenAI...';
            statusMsg.style.color = '#aaa';
            
            console.log("Sending API key to server...");
            
            // Send key to server
            if (this.socket) {
                this.socket.emit('set-openai-key', { key: apiKey });
                // The rest will be handled by the socket.on('openai-key-status') event
            } else {
                // Direct client-side API initialization
                this.initialize(apiKey).then(() => {
                    statusMsg.textContent = 'Connected successfully!';
                    statusMsg.style.color = '#4CAF50';
                    
                    // Hide setup UI and show chat UI after a brief delay
                    setTimeout(() => {
                        this.hideSetupUI();
                        this.createChatUI();
                        this.showChatUI();
                        this.addMessageToConversation('assistant', 'Hello! I\'m your AI assistant. I can help with your Pong game or we can chat about anything you\'d like to discuss.');
                    }, 1000);
                }).catch(error => {
                    statusMsg.textContent = 'Failed to connect: ' + error.message;
                    statusMsg.style.color = '#ff5555';
                });
            }
            
            // Prevent the default action (form submission, page reload)
            return false;
        });
        
        // Add event listener for skip button
        skipButton.addEventListener('click', () => {
            this.hideSetupUI();
            this.createChatUI();
            this.showChatUI();
            this.addMessageToConversation('assistant', 'Hello! I\'m your AI assistant. Voice features are limited without an API key, but I\'ll do my best to help with any questions you have.');
        });
        
        // Add elements to container
        this.setupContainer.appendChild(title);
        this.setupContainer.appendChild(description);
        this.setupContainer.appendChild(inputWrapper);
        this.setupContainer.appendChild(submitBtn);
        this.setupContainer.appendChild(clientSideOption);
        this.setupContainer.appendChild(statusMsg);
        
        // Add container to document
        document.body.appendChild(this.setupContainer);
        
        console.log("AI Assistant: Setup UI created and added to document");
    }
    
    createChatUI() {
        // Create the main chat container
        this.container = document.createElement('div');
        this.container.id = 'ai-assistant-container';
        this.container.className = 'ai-assistant-container';
        document.body.appendChild(this.container);
        
        // Create the header with title
        const header = document.createElement('div');
        header.className = 'ai-assistant-header';
        
        const title = document.createElement('h2');
        title.textContent = 'AI Assistant';
        header.appendChild(title);
        
        // Add mode switch for WebRTC
        const modeSwitch = document.createElement('div');
        modeSwitch.className = 'ai-assistant-mode-switch';
        
        const modeLabel = document.createElement('span');
        modeLabel.textContent = 'WebRTC: ';
        modeSwitch.appendChild(modeLabel);
        
        const toggleBtn = document.createElement('button');
        toggleBtn.className = 'ai-assistant-toggle';
        toggleBtn.textContent = 'OFF';
        toggleBtn.onclick = () => {
            this.toggleRealtimeMode();
            toggleBtn.textContent = this.realtimeMode ? 'ON' : 'OFF';
            toggleBtn.className = 'ai-assistant-toggle ' + (this.realtimeMode ? 'on' : 'off');
        };
        modeSwitch.appendChild(toggleBtn);
        
        header.appendChild(modeSwitch);
        this.container.appendChild(header);
        
        // Create the chat display area
        this.chatDisplay = document.createElement('div');
        this.chatDisplay.className = 'ai-assistant-chat';
        this.container.appendChild(this.chatDisplay);
        
        // Create status area for recognition feedback
        this.statusDisplay = document.createElement('div');
        this.statusDisplay.className = 'ai-assistant-status';
        this.container.appendChild(this.statusDisplay);
        
        // Create the input area with both text and voice input
        const inputArea = document.createElement('div');
        inputArea.className = 'ai-assistant-input';
        
        // Text input field
        this.textInput = document.createElement('input');
        this.textInput.type = 'text';
        this.textInput.placeholder = 'Type your message...';
        this.textInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.sendTextMessage(this.textInput.value);
                this.textInput.value = '';
            }
        });
        inputArea.appendChild(this.textInput);
        
        // Send button
        const sendButton = document.createElement('button');
        sendButton.textContent = '↑';
        sendButton.className = 'ai-assistant-send';
        sendButton.addEventListener('click', () => {
            this.sendTextMessage(this.textInput.value);
            this.textInput.value = '';
        });
        inputArea.appendChild(sendButton);
        
        // Microphone button for voice input
        this.microphoneButton = document.createElement('button');
        const modeIcon = document.createElement('span');
        modeIcon.className = 'mode-icon';
        modeIcon.textContent = '🎙️';
        this.microphoneButton.appendChild(modeIcon);
        this.microphoneButton.className = 'ai-assistant-microphone';
        this.microphoneButton.addEventListener('click', () => this.toggleListening());
        inputArea.appendChild(this.microphoneButton);
        
        this.container.appendChild(inputArea);
        
        // Add API key input if using server-side
        if (this.useServerSide) {
            // API key input
            const apiKeyInput = document.createElement('div');
            apiKeyInput.className = 'ai-assistant-api-key';
            
            const apiKeyLabel = document.createElement('label');
            apiKeyLabel.textContent = 'OpenAI API Key: ';
            apiKeyInput.appendChild(apiKeyLabel);
            
            this.apiKeyField = document.createElement('input');
            this.apiKeyField.type = 'password';
            this.apiKeyField.placeholder = 'Enter your OpenAI API key';
            this.apiKeyField.addEventListener('blur', () => {
                this.setApiKey(this.apiKeyField.value);
            });
            apiKeyInput.appendChild(this.apiKeyField);
            
            this.container.appendChild(apiKeyInput);
        }
        
        // Style the container
        this.applyStyles();
    }
    
    initSpeechRecognition() {
        if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
            console.error("AI Assistant: Speech recognition not supported in this browser");
            this.showMessage("Speech recognition is not supported in your browser. Please try Chrome or Edge.");
            return;
        }
        
        // Create speech recognition object
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        this.recognition = new SpeechRecognition();
        
        // Configure the recognition
        this.recognition.continuous = false;
        this.recognition.lang = 'en-US';
        this.recognition.interimResults = true;
        this.recognition.maxAlternatives = 1;
        
        // Set up event handlers
        this.recognition.onstart = () => {
            console.log("AI Assistant: Recognition started");
            this.isListening = true;
            this.currentTranscript = '';
        };
        
        this.recognition.onresult = (event) => {
            const result = event.results[0];
            const transcript = result[0].transcript;
            
            // Update the current transcript
            this.currentTranscript = transcript;
            
            if (result.isFinal) {
                console.log("AI Assistant: Final transcript:", transcript);
                this.showRecognitionStatus("Recognized: " + transcript);
                this.currentTranscript = transcript;
                this.lastFinalTranscript = transcript;
            } else {
                console.log("AI Assistant: Interim transcript:", transcript);
                this.showRecognitionStatus("Listening: " + transcript);
            }
        };
        
        this.recognition.onerror = (event) => {
            console.error("AI Assistant: Recognition error:", event.error);
            this.isListening = false;
            
            if (event.error === 'not-allowed') {
                this.showMessage("Microphone access was denied. Please allow microphone access in your browser settings.");
            } else if (event.error === 'network') {
                this.showMessage("Network error occurred. Please check your connection.");
            } else {
                this.showMessage(`Speech recognition error: ${event.error}`);
            }
        };
        
        this.recognition.onend = () => {
            console.log("AI Assistant: Speech recognition ended");
            this.isListening = false;
            
            // Process the final transcript if it's not empty
            if (this.lastFinalTranscript && this.lastFinalTranscript.trim() !== '') {
                if (!this.isRealtimeMode) {
                    // Use text-based chat in traditional mode
                    this.handleUserInput(this.lastFinalTranscript);
                }
                this.lastFinalTranscript = ''; // Clear after processing
            } else if (this.currentTranscript && this.currentTranscript.trim() !== '') {
                // Use the current transcript as fallback if no final was captured
                if (!this.isRealtimeMode) {
                    // Use text-based chat in traditional mode
                    this.handleUserInput(this.currentTranscript);
                }
            }
            
            this.currentTranscript = ''; // Clear after processing
        };
        
        console.log("AI Assistant: Speech recognition initialized");
    }
    
    // Fix the requestMicrophonePermission method to return a Promise
    requestMicrophonePermission() {
        console.log("AI Assistant: Requesting microphone permission");
        
        return new Promise((resolve, reject) => {
            // Check if we already have permission
            if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
                navigator.mediaDevices.getUserMedia({ audio: true })
                    .then(stream => {
                        // Stop the stream immediately, we just wanted to check permission
                        stream.getTracks().forEach(track => track.stop());
                        console.log("AI Assistant: Microphone permission granted");
                        resolve(true); // Return true to indicate success
                    })
                    .catch(error => {
                        console.error("AI Assistant: Microphone permission denied:", error);
                        resolve(false); // Return false instead of rejecting
                    });
            } else {
                console.error("AI Assistant: getUserMedia not supported in this browser");
                resolve(false); // Return false instead of rejecting
            }
        });
    }
    
    startListening() {
        if (this.isListening) {
            console.log("[AI Assistant] Already listening");
            return;
        }
        
        console.log("[AI Assistant] Starting to listen");
        this.isListening = true;
        
        // Update microphone button style
        if (this.microphoneButton) {
            this.microphoneButton.style.backgroundColor = '#ff3333';
        }
        
        // Show status
        this.showRecognitionStatus("Listening...");
        
        // Start appropriate audio recording method based on mode
        if (this.realtimeMode) {
            this.startAudioRecording();
        } else {
            // Use traditional speech recognition
            if (this.recognition) {
                try {
                    this.recognition.start();
                } catch (e) {
                    console.error("[AI Assistant] Error starting recognition:", e);
                    this.isListening = false;
                    this.showRecognitionStatus("Error starting voice recognition");
                }
            } else {
                this.initSpeechRecognition();
                if (this.recognition) {
                    try {
                        this.recognition.start();
                    } catch (e) {
                        console.error("[AI Assistant] Error starting recognition:", e);
                        this.isListening = false;
                        this.showRecognitionStatus("Error starting voice recognition");
                    }
                } else {
                    this.showRecognitionStatus("Voice recognition not available");
                    this.isListening = false;
                }
            }
        }
    }
    
    stopListening() {
        if (!this.isListening) {
            return;
        }
        
        console.log("[AI Assistant] Stopping listening");
        this.isListening = false;
        
        // Update microphone button style
        if (this.microphoneButton) {
            this.microphoneButton.style.backgroundColor = '#444';
        }
        
        // Hide status
        this.showRecognitionStatus("");
        
        // Stop audio recording if in realtime mode
        if (this.realtimeMode) {
            this.stopAudioRecording();
        } else if (this.recognition) {
            try {
                this.recognition.stop();
            } catch (e) {
                console.error("[AI Assistant] Error stopping recognition:", e);
            }
        }
    }
    
    // Show recognition status message
    showRecognitionStatus(message) {
        if (this.statusDisplay) {
            this.statusDisplay.textContent = message;
        }
    }
    
    // Show message to user
    showMessage(message) {
        console.log("[AI Assistant] " + message);
        
        // Add system message to chat
        this.addMessageToConversation('system', message);
        this.updateChatDisplay();
        
        // Also show in status
        this.showRecognitionStatus(message);
    }
    
    // Add message to conversation history
    addMessageToConversation(role, content) {
        if (!this.chatHistory) {
            this.chatHistory = [];
        }
        
        this.chatHistory.push({
            role: role,
            content: content,
            timestamp: new Date().getTime()
        });
        
        // Update display
        this.updateChatDisplay();
    }
    
    // Update chat display with current history
    updateChatDisplay() {
        if (!this.chatDisplay) {
            return;
        }
        
        // Clear current display
        this.chatDisplay.innerHTML = '';
        
        // Add each message
        for (const message of this.chatHistory) {
            const messageElem = document.createElement('div');
            messageElem.className = `ai-message ${message.role}`;
            messageElem.style.padding = '8px';
            messageElem.style.marginBottom = '8px';
            messageElem.style.borderRadius = '8px';
            
            // Style based on role
            if (message.role === 'user') {
                messageElem.style.backgroundColor = '#1976D2';
                messageElem.style.marginLeft = '20%';
                messageElem.style.textAlign = 'right';
            } else if (message.role === 'assistant') {
                messageElem.style.backgroundColor = '#43A047';
                messageElem.style.marginRight = '20%';
            } else {
                messageElem.style.backgroundColor = '#666';
                messageElem.style.fontSize = '12px';
                messageElem.style.opacity = '0.8';
                messageElem.style.textAlign = 'center';
            }
            
            // Add content
            messageElem.textContent = message.content;
            this.chatDisplay.appendChild(messageElem);
        }
        
        // Scroll to bottom
        this.chatDisplay.scrollTop = this.chatDisplay.scrollHeight;
    }
    
    // Clean up resources when game ends
    cleanup() {
        console.log("AI Assistant: Cleaning up");
        
        // Stop listening if active
        if (this.isListening) {
            this.stopListening();
        }
        
        // Remove setup UI if present
        this.hideSetupUI();
        
        // Remove chat UI if present
        this.hideChatUI();
        
        // Clean up socket listeners if using server-side mode
        if (this.useServerSide && this.socket) {
            this.socket.off('openai-response');
            this.socket.off('openai-error');
            this.socket.off('openai-key-status');
        }
        
        // Clear references
        this.game = null;
        this.socket = null;
        this.chatHistory = [];
        
        console.log("AI Assistant: Cleanup complete");
    }
    
    // Initialize audio context for browsers that need it before audio will work
    initAudioContext() {
        try {
            // Initialize the audio context if it doesn't exist
            if (!this.audioContext) {
                this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
                console.log("AI Assistant: Audio context initialized");
            }
        } catch (error) {
            console.error("AI Assistant: Failed to initialize audio context:", error);
        }
    }
    
    // Update the last assistant message in the chat history
    updateLastAssistantMessage(content) {
        if (!content) return;
        
        if (!this.chatHistory) {
            this.chatHistory = [];
        }
        
        // Find the last assistant message in the history
        let found = false;
        for (let i = this.chatHistory.length - 1; i >= 0; i--) {
            if (this.chatHistory[i].role === 'assistant') {
                this.chatHistory[i].content = content;
                found = true;
                break;
            }
        }
        
        // If no assistant message was found, add a new one
        if (!found) {
            this.addMessageToConversation('assistant', content);
            return;
        }
        
        // Update the display
        this.updateChatDisplay();
    }
    
    // Find the last assistant message in the history
    findLastAssistantMessage() {
        if (!this.chatHistory || this.chatHistory.length === 0) {
            return null;
        }
        
        for (let i = this.chatHistory.length - 1; i >= 0; i--) {
            if (this.chatHistory[i].role === 'assistant') {
                return this.chatHistory[i].content;
            }
        }
        
        return null;
    }
    
    // Start recording audio
    startAudioRecording() {
        if (this.isRecording) {
            console.log("[AI Assistant] Already recording audio");
            return;
        }
        
        console.log("[AI Assistant] Starting audio recording");
        
        try {
            // Request access to the microphone
            navigator.mediaDevices.getUserMedia({ audio: true })
                .then(stream => {
                    this.isRecording = true;
                    
                    // Create MediaRecorder
                    this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
                    this.mediaRecorder = new MediaRecorder(stream);
                    this.mediaRecorder.ondataavailable = event => {
                        if (event.data.size > 0) {
                            this.recordedChunks.push(event.data);
                        }
                        
                        // Stop and send after a reasonable amount of data
                        if (this.recordedChunks.length > 0 && this.recordedChunks.length % 5 === 0) {
                            const blob = new Blob(this.recordedChunks, { type: 'audio/webm' });
                            this.sendAudioToServer(blob);
                        }
                    };
                    
                    // Set recording to stop automatically after a reasonable amount of time
                    this.mediaRecorder.start(1000);  // Collect data every 1 second
                    
                    // Store the stream for later stoppage
                    this.audioStream = stream;
                    
                    // Show status
                    this.showRecognitionStatus("Recording audio... Speak now");
                })
                .catch(error => {
                    console.error("[AI Assistant] Error accessing microphone:", error);
                    this.showMessage("Error accessing microphone. Please check permissions.");
                    this.isListening = false;
                    this.isRecording = false;
                });
        } catch (error) {
            console.error("[AI Assistant] Error starting audio recording:", error);
            this.showMessage("Error starting audio recording. Your browser may not support this feature.");
            this.isListening = false;
            this.isRecording = false;
        }
    }
    
    // Stop recording audio
    stopAudioRecording() {
        if (!this.isRecording) {
            return;
        }
        
        console.log("[AI Assistant] Stopping audio recording");
        
        this.isRecording = false;
        
        // Stop media recorder if it exists and is recording
        if (this.mediaRecorder && (this.mediaRecorder.state === 'recording')) {
            this.mediaRecorder.stop();
        }
        
        // Stop all tracks in the audio stream
        if (this.audioStream) {
            this.audioStream.getTracks().forEach(track => track.stop());
            this.audioStream = null;
        }
        
        // Send any remaining audio chunks
        if (this.recordedChunks.length > 0) {
            const blob = new Blob(this.recordedChunks, { type: 'audio/webm' });
            this.sendAudioToServer(blob);
            this.recordedChunks = [];
        }
        
        // Update status
        this.showRecognitionStatus("Processing audio...");
    }
    
    // Sending audio to server - uses different endpoints based on mode
    sendAudioToServer(blob) {
        if (!this.socket || !this.socket.connected) {
            console.error("[AI Assistant] Can't send audio: not connected to server");
            this.showMessage("Not connected to server. Please try again.");
            return;
        }
        
        console.log(`[AI Assistant] Sending audio to server (${Math.round(blob.size / 1024)} KB)`);
        
        // Create a placeholder for the user's message
        if (!this.chatHistory.some(msg => msg.role === 'user' && msg.content === '...')) {
            this.addMessageToConversation('user', '...');
        }
        
        // Add a placeholder for the assistant's response
        if (!this.chatHistory.some(msg => msg.role === 'assistant' && msg.content === '...')) {
            this.addMessageToConversation('assistant', '...');
        }
        
        // Convert blob to base64
        const reader = new FileReader();
        reader.onloadend = () => {
            const base64Audio = reader.result.split(',')[1];
            
            // Send to appropriate server endpoint based on mode
            if (this.realtimeMode) {
                // Use the WebRTC endpoint (no fallback)
                this.socket.emit('openai-audio-stream', base64Audio);
            } else {
                // Use the traditional processing endpoint
                this.socket.emit('openai-audio-traditional', base64Audio);
            }
        };
        
        reader.readAsDataURL(blob);
    }
    
    // Method to play audio from OpenAI
    playOpenAIAudio(audioBase64) {
        if (!audioBase64) {
            console.error("[AI Assistant] No audio data to play");
            return;
        }
        
        try {
            console.log("[AI Assistant] Playing audio response");
            
            // Create audio element if it doesn't exist
            if (!this.audioPlayer) {
                this.audioPlayer = new Audio();
                
                // Handle audio ended event
                this.audioPlayer.addEventListener('ended', () => {
                    console.log("[AI Assistant] Audio playback complete");
                    this.isSpeaking = false;
                });
                
                // Handle audio errors
                this.audioPlayer.addEventListener('error', (e) => {
                    console.error("[AI Assistant] Audio playback error:", e);
                    this.isSpeaking = false;
                });
            }
            
            // Set speaking state
            this.isSpeaking = true;
            
            // Convert base64 to URL for audio element
            const audioUrl = `data:audio/mp3;base64,${audioBase64}`;
            this.audioPlayer.src = audioUrl;
            
            // Ensure audio context is running
            if (this.audioContext && this.audioContext.state === 'suspended') {
                const resumeAudio = () => {
                    this.audioContext.resume().then(() => {
                        console.log("[AI Assistant] Audio context resumed");
                    });
                    
                    // Remove event listeners after first interaction
                    document.removeEventListener('click', resumeAudio);
                    document.removeEventListener('touchstart', resumeAudio);
                    document.removeEventListener('keydown', resumeAudio);
                };
                
                document.addEventListener('click', resumeAudio, { once: true });
                document.addEventListener('touchstart', resumeAudio, { once: true });
                document.addEventListener('keydown', resumeAudio, { once: true });
            }
            
            // Play the audio
            this.audioPlayer.play().catch(error => {
                console.error("[AI Assistant] Error playing audio:", error);
                this.isSpeaking = false;
            });
            
        } catch (error) {
            console.error("[AI Assistant] Error playing audio:", error);
            this.isSpeaking = false;
        }
    }
    
    // Add a toggle method to switch between realtime and traditional modes
    toggleRealtimeMode() {
        if (this.isListening) {
            this.stopListening();
        }
        
        if (this.isRecording) {
            this.stopAudioRecording();
        }
        
        // Toggle the mode
        this.realtimeMode = !this.realtimeMode;
        console.log(`[AI Assistant] ${this.realtimeMode ? 'Enabling' : 'Disabling'} realtime audio mode`);
        
        if (this.realtimeMode) {
            // Make sure we have microphone permission
            this.requestMicrophonePermission().then(hasPermission => {
                if (hasPermission) {
                    // Show a message to the user
                    this.showMessage("WebRTC mode enabled. Initializing connection...");
                    
                    // Update the display
                    this.updateChatDisplay();
                    
                    // Keep track of WebRTC failures - if we get 2 consecutive errors, auto-switch
                    this.webrtcFailCount = 0;
                    
                    // Important: Initialize WebRTC connection after permission is granted
                    if (this.socket && this.socket.connected) {
                        console.log("[AI Assistant] Requesting WebRTC token from server");
                        this.socket.emit('create-realtime-session', {});
                        
                        // Set up a timeout to handle if we don't get a response
                        this.webrtcInitTimeout = setTimeout(() => {
                            console.error("[AI Assistant] WebRTC initialization timed out");
                            this.showMessage("WebRTC initialization failed. Try again or use traditional mode.");
                            this.realtimeMode = false;
                            
                            // Update UI to reflect traditional mode
                            if (this.microphoneButton) {
                                const modeIcon = this.microphoneButton.querySelector('.mode-icon');
                                if (modeIcon) {
                                    modeIcon.textContent = '🎙️';
                                }
                                this.microphoneButton.style.backgroundColor = '#2196F3';
                                this.microphoneButton.title = 'Traditional voice mode - Click to switch to real-time mode (WebRTC)';
                            }
                        }, 10000); // 10 second timeout
                    } else {
                        console.error("[AI Assistant] Socket not connected, can't initialize WebRTC");
                        this.showMessage("Error: Not connected to server. Please reload the page.");
                        this.realtimeMode = false;
                    }
                } else {
                    console.error("[AI Assistant] Microphone permission denied");
                    this.showMessage("Microphone permission required for realtime mode");
                    this.realtimeMode = false;
                    
                    // Update the UI to show that we've reverted
                    if (this.microphoneButton) {
                        const modeIcon = this.microphoneButton.querySelector('.mode-icon');
                        if (modeIcon) {
                            modeIcon.textContent = '🎙️';
                        }
                    }
                }
            });
        } else {
            // When switching to traditional mode
            this.showMessage("Switched to traditional voice mode");
            this.closeWebRTCConnection();
            
            // Clear any pending timeouts
            if (this.webrtcInitTimeout) {
                clearTimeout(this.webrtcInitTimeout);
                this.webrtcInitTimeout = null;
            }
        }

        // Update UI to show current mode
        if (this.microphoneButton) {
            const modeIcon = this.microphoneButton.querySelector('.mode-icon');
            if (modeIcon) {
                modeIcon.textContent = this.realtimeMode ? '🎙️ Live' : '🎙️';
            }
            
            // Update button style to show active mode
            if (this.realtimeMode) {
                this.microphoneButton.style.backgroundColor = '#4CAF50';
                this.microphoneButton.title = 'Real-time voice mode (WebRTC) - Click to switch to traditional mode';
            } else {
                this.microphoneButton.style.backgroundColor = '#2196F3';
                this.microphoneButton.title = 'Traditional voice mode - Click to switch to real-time mode (WebRTC)';
            }
        }
        
        return this.realtimeMode;
    }
    
    // Setup WebRTC for direct audio conversations with OpenAI
    setupWebRTCConnection(data) {
        console.log("[AI Assistant] Setting up WebRTC connection with token data", {
            hasSessionId: !!data.sessionId,
            hasToken: !!data.token,
            hasIceServers: !!data.iceServers,
            iceServerCount: data.iceServers ? data.iceServers.length : 0,
            model: data.model
        });
        
        // Validation with better error handling
        if (!data.sessionId) {
            console.error("[AI Assistant] Missing sessionId in WebRTC token data");
            this.showMessage("Error: Missing session information for WebRTC");
            return;
        }
        
        if (!data.token) {
            console.error("[AI Assistant] Missing token in WebRTC token data");
            this.showMessage("Error: Missing authentication token for WebRTC");
            return;
        }
        
        // Store the session ID and token
        this.webrtcSessionId = data.sessionId;
        this.webrtcToken = data.token;
        
        // Use provided ICE servers or default to Google STUN servers
        this.webrtcIceServers = data.iceServers || [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' }
        ];
        
        console.log("[AI Assistant] Using ICE servers:", this.webrtcIceServers);
        
        // Initialize WebRTC with the token and ICE servers
        this.initWebRTCConnection();
    }
    
    // Initialize WebRTC peer connection
    async initWebRTCConnection() {
        try {
            if (!this.webrtcToken || !this.webrtcSessionId) {
                throw new Error("Missing WebRTC token or session ID");
            }
            
            console.log("[AI Assistant] Initializing WebRTC for Realtime API");
            
            // Create a new peer connection with the ICE servers
            const peerConnection = new RTCPeerConnection({
                iceServers: this.webrtcIceServers
            });
            this.webrtcPeerConnection = peerConnection;
            
            // Log connection state changes for debugging
            peerConnection.onconnectionstatechange = () => {
                console.log("[AI Assistant] WebRTC connection state:", peerConnection.connectionState);
                
                if (peerConnection.connectionState === 'connected') {
                    this.webrtcConnected = true;
                    this.showMessage("WebRTC connected successfully!");
                } else if (peerConnection.connectionState === 'failed' || 
                          peerConnection.connectionState === 'disconnected' || 
                          peerConnection.connectionState === 'closed') {
                    this.webrtcConnected = false;
                    this.showMessage("WebRTC failed. Connection issue.");
                }
            };
            
            // Add ICE connection state monitoring
            peerConnection.oniceconnectionstatechange = () => {
                console.log(`[AI Assistant] ICE connection state: ${peerConnection.iceConnectionState}`);
            };
            
            // Add ICE candidate monitoring
            peerConnection.onicecandidate = (event) => {
                if (event.candidate) {
                    console.log("[AI Assistant] New ICE candidate", event.candidate);
                    
                    // Send ICE candidate to the signaling WebSocket (if we're using one)
                    if (this.webrtcSignaling && this.webrtcSignaling.readyState === WebSocket.OPEN) {
                        this.webrtcSignaling.send(JSON.stringify({
                            type: 'candidate',
                            candidate: event.candidate
                        }));
                    }
                } else {
                    console.log("[AI Assistant] ICE candidate gathering complete");
                }
            };
            
            // Add audio track from microphone to the peer connection
            if (this.audioStream && this.audioStream.getAudioTracks().length > 0) {
                this.audioStream.getAudioTracks().forEach(track => {
                    console.log("[AI Assistant] Adding audio track to WebRTC connection");
                    peerConnection.addTrack(track, this.audioStream);
                });
            } else {
                console.warn("[AI Assistant] No audio tracks available in stream");
                
                // Try to get microphone access if we don't have it yet
                try {
                    const stream = await navigator.mediaDevices.getUserMedia({ 
                        audio: { 
                            echoCancellation: true, 
                            noiseSuppression: true,
                            autoGainControl: true
                        } 
                    });
                    
                    this.audioStream = stream;
                    
                    // Now add the tracks
                    stream.getAudioTracks().forEach(track => {
                        console.log("[AI Assistant] Adding new audio track to WebRTC connection");
                        peerConnection.addTrack(track, stream);
                    });
                } catch (micError) {
                    console.error("[AI Assistant] Error accessing microphone:", micError);
                    this.showMessage("Microphone access required for WebRTC");
                    return;
                }
            }
            
            // Handle incoming audio track
            peerConnection.ontrack = (event) => {
                console.log("[AI Assistant] Received audio track from Realtime API");
                
                const audioStream = new MediaStream();
                audioStream.addTrack(event.track);
                
                // Create an audio element to play the AI's voice
                const audioElement = new Audio();
                audioElement.srcObject = audioStream;
                
                // Play the audio with error handling
                audioElement.play().catch(error => {
                    console.error("[AI Assistant] Error playing audio:", error);
                    
                    // Try again with user interaction
                    this.showMessage("Click anywhere to enable AI voice");
                    document.addEventListener('click', () => {
                        audioElement.play().catch(e => console.error("[AI Assistant] Still failed to play audio:", e));
                    }, { once: true });
                });
                
                this.webrtcAudioElement = audioElement;
            };
            
            // Set up a data channel for events (transcripts, etc.)
            const dataChannel = peerConnection.createDataChannel('oai-events');
            this.webrtcDataChannel = dataChannel;
            
            // Data channel event handlers
            dataChannel.onopen = () => {
                console.log("[AI Assistant] Data channel opened");
            };
            
            dataChannel.onclose = () => {
                console.log("[AI Assistant] Data channel closed");
            };
            
            dataChannel.onerror = (error) => {
                console.error("[AI Assistant] Data channel error:", error);
            };
            
            // Handle incoming messages on the data channel (transcripts, etc.)
            dataChannel.onmessage = (event) => {
                try {
                    const message = JSON.parse(event.data);
                    console.log("[AI Assistant] Data channel message:", message);
                    
                    // Handle different message types
                    if (message.type === 'conversation.item.input_audio_transcription.completed') {
                        // User's speech was transcribed
                        console.log("[AI Assistant] User said:", message.transcript);
                        
                        // Update the user message in the chat
                        if (this.chatHistory.some(msg => msg.role === 'user' && msg.content === '...')) {
                            this.updateLastUserMessage(message.transcript);
                        } else {
                            this.addMessageToConversation('user', message.transcript);
                        }
                        
                    } else if (message.type === 'response.audio_transcript.done') {
                        // AI's response transcript
                        console.log("[AI Assistant] AI responded:", message.transcript);
                        
                        // Update the assistant message in the chat
                        if (this.chatHistory.some(msg => msg.role === 'assistant' && msg.content === '...')) {
                            this.updateLastAssistantMessage(message.transcript);
                        } else {
                            this.addMessageToConversation('assistant', message.transcript);
                        }
                        
                    } else if (message.type === 'error') {
                        console.error("[AI Assistant] Realtime API error:", message);
                        this.showMessage(`AI voice error: ${message.error || 'Unknown error'}`);
                        
                        if (message.code === 'session_expired') {
                            // Handle expired session by creating a new one
                            console.log("[AI Assistant] Session expired, requesting new session");
                            this.createRealtimeSession();
                        }
                    }
                    
                    // Update the chat display with any new messages
                    this.updateChatDisplay();
                    
                } catch (error) {
                    console.error("[AI Assistant] Error parsing data channel message:", error);
                }
            };
            
            // Connect to signaling WebSocket (new in the current Realtime API)
            try {
                console.log("[AI Assistant] Connecting to Realtime API WebSocket");
                
                // Make sure we have the client secret token from the server (it's sent as "token")
                this.ephemeralKey = this.webrtcToken;
                
                if (!this.ephemeralKey) {
                    throw new Error("Missing ephemeral key/client secret for WebSocket connection");
                }
                
                // Initialize WebSocket connection to OpenAI using the correct format
                // The WebSocket URL should not include any query parameters
                const wsUrl = 'wss://api.openai.com/v1/realtime/ws';
                
                // Create connection with proper protocol string
                const signaling = new WebSocket(wsUrl, 'json.reliable.webpubsub.azure.v1');
                
                // When the connection opens, authenticate with the token
                signaling.onopen = () => {
                    console.log("[AI Assistant] Realtime API WebSocket opened, sending authentication");
                    
                    // Send authentication message as the first message
                    signaling.send(JSON.stringify({
                        type: 'auth',
                        session_id: this.webrtcSessionId,
                        client_secret: this.ephemeralKey
                    }));
                };
                
                this.webrtcSignaling = signaling;
                
                // Handle WebSocket events
                signaling.onmessage = async (event) => {
                    try {
                        const message = JSON.parse(event.data);
                        console.log("[AI Assistant] Received signaling message:", message.type);
                        
                        if (message.type === 'auth_result') {
                            if (message.success) {
                                console.log("[AI Assistant] WebSocket authentication successful");
                                // Create an SDP offer now that we're authenticated
                                this.createAndSendOffer();
                            } else {
                                console.error("[AI Assistant] WebSocket authentication failed:", message.error || "Unknown error");
                                this.showMessage("WebRTC authentication failed: " + (message.error || "Unknown error"));
                                // Fall back to direct SDP exchange
                                await this.createAndSendSdpOffer();
                            }
                        } else if (message.type === 'offer') {
                            console.log("[AI Assistant] Received SDP offer from server");
                            
                            // Set remote description
                            await peerConnection.setRemoteDescription(new RTCSessionDescription(message));
                            
                            // Create answer
                            const answer = await peerConnection.createAnswer();
                            await peerConnection.setLocalDescription(answer);
                            
                            // Send answer back to signaling server
                            signaling.send(JSON.stringify({
                                type: 'answer',
                                sdp: peerConnection.localDescription.sdp
                            }));
                            
                            console.log("[AI Assistant] Sent SDP answer to server");
                            
                        } else if (message.type === 'candidate') {
                            console.log("[AI Assistant] Received ICE candidate from server");
                            
                            // Add remote ICE candidate
                            await peerConnection.addIceCandidate(new RTCIceCandidate(message.candidate));
                            
                        } else if (message.type === 'muted' || message.type === 'unmuted') {
                            // Track mute state from the AI
                            console.log(`[AI Assistant] Remote audio ${message.type}`);
                            const statusText = message.type === 'muted' ? 'AI is thinking...' : 'AI is speaking...';
                            this.showRecognitionStatus(statusText);
                        }
                    } catch (error) {
                        console.error("[AI Assistant] Error handling signaling message:", error);
                    }
                };
                
                signaling.onerror = (error) => {
                    console.error("[AI Assistant] WebSocket signaling error:", error);
                    this.showMessage("WebRTC signaling error");
                    
                    // Attempt to close the WebSocket to prevent any hanging connections
                    try {
                        if (signaling.readyState !== WebSocket.CLOSED) {
                            signaling.close();
                        }
                    } catch (closeError) {
                        console.error("[AI Assistant] Error closing WebSocket:", closeError);
                    }
                };
                
                signaling.onclose = (event) => {
                    console.log("[AI Assistant] WebSocket signaling closed", event.code, event.reason);
                    
                    // If not closed by us intentionally, it might be an error
                    if (this.realtimeMode && event.code !== 1000) {
                        this.showMessage(`WebRTC connection closed: ${event.code} ${event.reason || "Unknown reason"}`);
                        
                        // Try the fallback method if we haven't succeeded in connecting yet
                        if (!this.webrtcConnected) {
                            console.log("[AI Assistant] Trying fallback SDP exchange method");
                            this.createAndSendSdpOffer().catch(err => {
                                console.error("[AI Assistant] Fallback SDP exchange failed:", err);
                                this.showMessage("WebRTC connection failed. Please try again.");
                            });
                        }
                    }
                };
                
            } catch (wsError) {
                console.error("[AI Assistant] Error setting up WebSocket signaling:", wsError);
                
                // Fall back to direct SDP exchange without WebSocket (old approach)
                await this.createAndSendSdpOffer();
            }
            
            // Show a placeholder message in the chat
            this.addMessageToConversation('user', '...');
            
        } catch (error) {
            console.error("[AI Assistant] Error setting up WebRTC for Realtime API:", error);
            this.showMessage("Failed to connect to AI voice: " + error.message);
            this.closeWebRTCConnection();
        }
    }
    
    // Create and send SDP offer via WebSocket
    async createAndSendOffer() {
        try {
            if (!this.webrtcPeerConnection || !this.webrtcSignaling) {
                throw new Error("WebRTC peer connection or signaling not initialized");
            }
            
            console.log("[AI Assistant] Creating SDP offer for WebSocket signaling");
            
            // Create offer
            const offer = await this.webrtcPeerConnection.createOffer();
            await this.webrtcPeerConnection.setLocalDescription(offer);
            
            // Wait for ICE gathering to complete or timeout after 2 seconds
            await new Promise((resolve) => {
                const checkState = () => {
                    if (this.webrtcPeerConnection.iceGatheringState === 'complete') {
                        resolve();
                    }
                };
                
                this.webrtcPeerConnection.onicegatheringstatechange = checkState;
                checkState();
                
                // Fallback timeout
                setTimeout(resolve, 2000);
            });
            
            // Send the offer to the signaling server
            this.webrtcSignaling.send(JSON.stringify({
                type: 'offer',
                sdp: this.webrtcPeerConnection.localDescription.sdp
            }));
            
            console.log("[AI Assistant] Sent SDP offer via WebSocket");
            
        } catch (error) {
            console.error("[AI Assistant] Error creating or sending SDP offer:", error);
            throw error;
        }
    }
    
    // Create and send SDP offer via direct API call (fallback)
    async createAndSendSdpOffer() {
        try {
            if (!this.webrtcPeerConnection) {
                throw new Error("WebRTC peer connection not initialized");
            }
            
            console.log("[AI Assistant] Creating SDP offer for direct API call");
            
            // Create offer
            const offer = await this.webrtcPeerConnection.createOffer();
            await this.webrtcPeerConnection.setLocalDescription(offer);
            
            // Wait for ICE gathering to complete or timeout after 2 seconds
            await new Promise((resolve) => {
                const checkState = () => {
                    if (this.webrtcPeerConnection.iceGatheringState === 'complete') {
                        resolve();
                    }
                };
                
                this.webrtcPeerConnection.onicegatheringstatechange = checkState;
                checkState();
                
                // Fallback timeout
                setTimeout(resolve, 2000);
            });
            
            console.log("[AI Assistant] Sending SDP offer to Realtime API via HTTP");
            
            // Send the SDP offer to OpenAI's Realtime API using the correct URL format
            const sdpResponse = await fetch(
                `https://api.openai.com/v1/realtime?model=${encodeURIComponent(this.realtimeModel)}`,
                {
                    method: "POST",
                    headers: {
                        "Authorization": `Bearer ${this.ephemeralKey}`,
                        "Content-Type": "application/sdp"
                    },
                    body: this.webrtcPeerConnection.localDescription.sdp
                }
            );
            
            if (!sdpResponse.ok) {
                const errorText = await sdpResponse.text();
                throw new Error(`Failed to exchange SDP: ${sdpResponse.status} - ${errorText}`);
            }
            
            // Get the SDP answer and set it as remote description
            const answerSDP = await sdpResponse.text();
            console.log("[AI Assistant] Received SDP answer from Realtime API");
            
            await this.webrtcPeerConnection.setRemoteDescription({ type: "answer", sdp: answerSDP });
            console.log("[AI Assistant] Remote description set, WebRTC connection established");
            
        } catch (error) {
            console.error("[AI Assistant] Error creating or sending SDP offer:", error);
            throw error;
        }
    }
    
    // Update the last user message in the chat history
    updateLastUserMessage(content) {
        if (!content) return;
        
        // Initialize chat history if it doesn't exist
        if (!this.chatHistory) {
            this.chatHistory = [];
        }
        
        // Find the last user message
        for (let i = this.chatHistory.length - 1; i >= 0; i--) {
            if (this.chatHistory[i].role === 'user') {
                this.chatHistory[i].content = content;
                return;
            }
        }
        
        // If no user message found, add a new one
        this.chatHistory.push({ role: 'user', content: content });
    }
    
    // Close WebRTC connection
    closeWebRTCConnection() {
        console.log("[AI Assistant] Closing WebRTC connection");
        
        // Close WebSocket signaling channel
        if (this.webrtcSignaling) {
            try {
                this.webrtcSignaling.close();
                console.log("[AI Assistant] WebRTC signaling channel closed");
            } catch (error) {
                console.error("[AI Assistant] Error closing WebRTC signaling:", error);
            }
            this.webrtcSignaling = null;
        }
        
        // Close peer connection
        if (this.webrtcPeerConnection) {
            try {
                // Close all transceivers
                const transceivers = this.webrtcPeerConnection.getTransceivers();
                transceivers.forEach(transceiver => {
                    if (transceiver.stop) {
                        transceiver.stop();
                    }
                });
                
                // Close all tracks
                const senders = this.webrtcPeerConnection.getSenders();
                senders.forEach(sender => {
                    if (sender.track) {
                        sender.track.stop();
                    }
                });
                
                // Close connection
                this.webrtcPeerConnection.close();
                console.log("[AI Assistant] WebRTC peer connection closed");
            } catch (error) {
                console.error("[AI Assistant] Error closing WebRTC peer connection:", error);
            }
            this.webrtcPeerConnection = null;
        }
        
        // Stop audio element if there is one
        if (this.webrtcAudioElement) {
            try {
                this.webrtcAudioElement.pause();
                this.webrtcAudioElement.srcObject = null;
                console.log("[AI Assistant] WebRTC audio element stopped");
            } catch (error) {
                console.error("[AI Assistant] Error stopping WebRTC audio element:", error);
            }
            this.webrtcAudioElement = null;
        }
        
        // Stop any ongoing audio recording
        if (this.isRecording) {
            this.stopAudioRecording();
        }
    }
    
    // Apply styles to UI elements
    applyStyles() {
        // Add CSS styles to the container
        if (this.container) {
            // Main container
            this.container.style.position = 'absolute';
            this.container.style.bottom = '20px';
            this.container.style.right = '20px';
            this.container.style.backgroundColor = 'rgba(0, 0, 0, 0.85)';
            this.container.style.padding = '15px';
            this.container.style.borderRadius = '10px';
            this.container.style.color = 'white';
            this.container.style.fontFamily = 'Arial, sans-serif';
            this.container.style.zIndex = '10000';
            this.container.style.width = '350px';
            this.container.style.maxHeight = '500px';
            this.container.style.display = 'flex';
            this.container.style.flexDirection = 'column';
            this.container.style.boxShadow = '0 0 20px rgba(0, 200, 255, 0.7)';
            this.container.style.border = '2px solid #4CAF50';
            
            // Header
            const header = this.container.querySelector('.ai-assistant-header');
            if (header) {
                header.style.display = 'flex';
                header.style.justifyContent = 'space-between';
                header.style.alignItems = 'center';
                header.style.marginBottom = '10px';
                header.style.borderBottom = '1px solid #444';
                header.style.paddingBottom = '10px';
                
                const title = header.querySelector('h2');
                if (title) {
                    title.style.margin = '0';
                    title.style.fontSize = '20px';
                    title.style.color = '#4CAF50';
                }
                
                // WebRTC mode switch
                const modeSwitch = header.querySelector('.ai-assistant-mode-switch');
                if (modeSwitch) {
                    modeSwitch.style.display = 'flex';
                    modeSwitch.style.alignItems = 'center';
                    modeSwitch.style.fontSize = '14px';
                    
                    const toggleBtn = modeSwitch.querySelector('.ai-assistant-toggle');
                    if (toggleBtn) {
                        toggleBtn.style.marginLeft = '5px';
                        toggleBtn.style.padding = '3px 8px';
                        toggleBtn.style.borderRadius = '10px';
                        toggleBtn.style.border = 'none';
                        toggleBtn.style.cursor = 'pointer';
                        toggleBtn.style.fontSize = '12px';
                        toggleBtn.style.fontWeight = 'bold';
                        
                        // Default OFF state
                        toggleBtn.style.backgroundColor = '#444';
                        toggleBtn.style.color = '#aaa';
                        
                        // Add class-based styling
                        if (toggleBtn.classList.contains('on')) {
                            toggleBtn.style.backgroundColor = '#4CAF50';
                            toggleBtn.style.color = 'white';
                        }
                    }
                }
            }
            
            // Chat display
            const chatDisplay = this.container.querySelector('.ai-assistant-chat');
            if (chatDisplay) {
                chatDisplay.style.overflowY = 'auto';
                chatDisplay.style.flexGrow = '1';
                chatDisplay.style.marginBottom = '10px';
                chatDisplay.style.paddingRight = '5px';
                chatDisplay.style.maxHeight = '300px';
            }
            
            // Status display
            const statusDisplay = this.container.querySelector('.ai-assistant-status');
            if (statusDisplay) {
                statusDisplay.style.fontSize = '12px';
                statusDisplay.style.color = '#aaa';
                statusDisplay.style.marginBottom = '10px';
                statusDisplay.style.minHeight = '16px';
                statusDisplay.style.textAlign = 'center';
            }
            
            // Input area
            const inputArea = this.container.querySelector('.ai-assistant-input');
            if (inputArea) {
                inputArea.style.display = 'flex';
                inputArea.style.marginBottom = '10px';
                
                const textInput = inputArea.querySelector('input');
                if (textInput) {
                    textInput.style.flexGrow = '1';
                    textInput.style.padding = '8px';
                    textInput.style.border = 'none';
                    textInput.style.borderRadius = '4px';
                    textInput.style.backgroundColor = '#333';
                    textInput.style.color = 'white';
                }
                
                const sendButton = inputArea.querySelector('.ai-assistant-send');
                if (sendButton) {
                    sendButton.style.marginLeft = '5px';
                    sendButton.style.padding = '0 15px';
                    sendButton.style.backgroundColor = '#4CAF50';
                    sendButton.style.border = 'none';
                    sendButton.style.borderRadius = '4px';
                    sendButton.style.cursor = 'pointer';
                    sendButton.style.color = 'white';
                    sendButton.style.fontSize = '16px';
                }
                
                const micButton = inputArea.querySelector('.ai-assistant-microphone');
                if (micButton) {
                    micButton.style.marginLeft = '5px';
                    micButton.style.padding = '0 10px';
                    micButton.style.backgroundColor = '#444';
                    micButton.style.border = 'none';
                    micButton.style.borderRadius = '4px';
                    micButton.style.cursor = 'pointer';
                    micButton.style.color = 'white';
                    micButton.style.fontSize = '16px';
                    
                    // Apply active state for recording
                    if (this.isListening) {
                        micButton.style.backgroundColor = '#ff3333';
                    }
                }
            }
            
            // API key input
            const apiKeyInput = this.container.querySelector('.ai-assistant-api-key');
            if (apiKeyInput) {
                apiKeyInput.style.display = 'flex';
                apiKeyInput.style.alignItems = 'center';
                apiKeyInput.style.justifyContent = 'space-between';
                apiKeyInput.style.fontSize = '12px';
                
                const input = apiKeyInput.querySelector('input');
                if (input) {
                    input.style.marginLeft = '5px';
                    input.style.padding = '4px 8px';
                    input.style.border = 'none';
                    input.style.borderRadius = '4px';
                    input.style.backgroundColor = '#333';
                    input.style.color = 'white';
                    input.style.fontSize = '12px';
                    input.style.width = '200px';
                }
            }
        }
    }
    
    // Check speech compatibility
    checkSpeechCompatibility() {
        // Check for WebRTC support
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            console.warn("AI Assistant: WebRTC not supported. Direct audio streaming will not be available.");
        }
        
        // Check for SpeechRecognition support
        if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
            console.warn("AI Assistant: Speech recognition not supported. Voice input will not be available.");
        }
        
        // Check for SpeechSynthesis support
        if (!('speechSynthesis' in window)) {
            console.warn("AI Assistant: Speech synthesis not supported. Voice output will use audio playback only.");
        }
    }
    
    // Method to show the chat UI
    showChatUI() {
        if (this.container) {
            this.container.style.display = 'flex';
            console.log("[AI Assistant] Chat UI shown");
        } else {
            console.warn("[AI Assistant] No container to show");
        }
    }
    
    // Method to hide the chat UI
    hideChatUI() {
        if (this.container) {
            this.container.style.display = 'none';
            console.log("[AI Assistant] Chat UI hidden");
        }
    }
    
    // Method to hide the setup UI
    hideSetupUI() {
        if (this.setupContainer) {
            this.setupContainer.style.display = 'none';
            console.log("[AI Assistant] Setup UI hidden");
        }
    }
    
    // Set API key and send it to the server
    setApiKey(apiKey) {
        if (!apiKey || apiKey.trim() === '') {
            console.warn("[AI Assistant] Empty API key provided");
            this.showMessage("Please enter a valid API key");
            return;
        }
        
        console.log("[AI Assistant] Setting API key");
        this.apiKey = apiKey.trim();
        
        if (this.socket && this.socket.connected) {
            console.log("[AI Assistant] Sending API key to server");
            this.socket.emit('set-openai-key', { key: this.apiKey });
            this.showMessage("API key sent to server, initializing...");
        } else {
            console.error("[AI Assistant] Socket not connected, can't send API key");
            this.showMessage("Error: Not connected to server. Please reload the page.");
        }
    }
    
    // Method to connect to the socket manually
    connectToServer() {
        return new Promise((resolve, reject) => {
            if (this.socket && this.socket.connected) {
                console.log("AI Assistant: Already connected to server");
                resolve();
                return;
            }
            
            if (!this.socket) {
                console.error("AI Assistant: No socket available");
                reject(new Error("Not connected to server"));
                return;
            }
            
            // Check if socket is disconnected but exists
            if (this.socket && !this.socket.connected) {
                this.socket.connect();
                
                // Wait for connection
                this.socket.once('connect', () => {
                    console.log("AI Assistant: Connected to server");
                    resolve();
                });
                
                // Handle connection error
                this.socket.once('connect_error', (error) => {
                    console.error("AI Assistant: Connection error:", error);
                    reject(error);
                });
            } else {
                resolve();
            }
        });
    }
    
    // Handle text input from the user
    sendTextMessage(text) {
        if (!text || text.trim() === '') {
            return;
        }
        
        console.log("[AI Assistant] Sending text message:", text);
        
        // Add to chat history
        this.addMessageToConversation('user', text);
        
        // Add placeholder for assistant response
        this.addMessageToConversation('assistant', '...');
        
        // Update the display
        this.updateChatDisplay();
        
        // Send message to server if connected
        if (this.socket && this.socket.connected) {
            console.log("[AI Assistant] Socket connected, sending to server");
            this.socket.emit('openai-chat', { message: text });
        } else {
            console.log("[AI Assistant] Socket not connected, using local handling");
            this.handleUserInput(text);
        }
        
        // Clear input field
        if (this.textInput) {
            this.textInput.value = '';
        }
    }
    
    // Toggle listening state for voice input
    toggleListening() {
        if (this.isListening) {
            console.log("[AI Assistant] Stopping listening");
            this.stopListening();
        } else {
            console.log("[AI Assistant] Starting listening");
            this.startListening();
        }
    }
    
    // Text-to-speech for assistant responses
    speakText(text) {
        if (!text || text.trim() === '') {
            console.log("[AI Assistant] Empty text provided to speakText, ignoring");
            return;
        }

        // Don't start a new speech if one is already in progress
        if (this.isSpeaking) {
            console.log("[AI Assistant] Speech already in progress, ignoring new request");
            return;
        }

        console.log("[AI Assistant] Starting speech synthesis");
        this.isSpeaking = true;

        // Cancel any previous speech
        if (window.speechSynthesis) {
            window.speechSynthesis.cancel();
        }

        try {
            // Get available voices
            const voices = window.speechSynthesis ? window.speechSynthesis.getVoices() : [];
            console.log(`[AI Assistant] Available voices: ${voices.length}`);

            if (window.speechSynthesis && voices.length === 0) {
                // If voices are not available yet, wait for them to load
                console.log("[AI Assistant] No voices available, waiting for voices to load");
                window.speechSynthesis.onvoiceschanged = () => {
                    const loadedVoices = window.speechSynthesis.getVoices();
                    console.log(`[AI Assistant] Voices loaded, now available: ${loadedVoices.length}`);
                    
                    if (loadedVoices.length > 0) {
                        window.speechSynthesis.onvoiceschanged = null; // Remove the event handler
                        this.speakTextWithVoices(text, loadedVoices);
                    }
                };

                // Add a fallback timeout in case the voices never load
                setTimeout(() => {
                    if (this.isSpeaking && (!voices || voices.length === 0)) {
                        console.warn("[AI Assistant] Voices never loaded, using default voice");
                        // Just try to speak with default voice
                        this.speakTextWithVoices(text, []);
                    }
                }, 3000);
            } else {
                this.speakTextWithVoices(text, voices);
            }
        } catch (error) {
            console.error('[AI Assistant] Error with speech synthesis:', error);
            this.isSpeaking = false;
            
            // Show message to user
            this.showMessage("Speech synthesis failed. Please try again.");
        }
    }
    
    // Handle user input (text or speech)
    handleUserInput(input) {
        if (!input || input.trim() === '') {
            console.log("[AI Assistant] Empty input provided, ignoring");
            return;
        }
        
        console.log("[AI Assistant] Handling user input:", input);
        
        // Add user message to conversation
        this.addMessageToConversation('user', input);
        
        // Add placeholder for assistant response
        this.addMessageToConversation('assistant', '...');
        
        // Update the chat display
        this.updateChatDisplay();
        
        if (this.socket && this.socket.connected) {
            // Send to server for processing
            console.log("[AI Assistant] Sending input to server for processing");
            this.socket.emit('openai-chat', { message: input });
        } else {
            // Fall back to basic client-side response
            console.warn("[AI Assistant] Not connected to server, using basic client-side response");
            
            // Generate a simple response
            const responses = [
                "I'm sorry, I can't connect to the server right now.",
                "Network connection issue. Please try again later.",
                "I need to connect to the server to help you properly.",
                "Please check your internet connection and try again."
            ];
            
            const response = responses[Math.floor(Math.random() * responses.length)];
            
            // Update the placeholder with the response
            this.updateLastAssistantMessage(response);
            this.updateChatDisplay();
            
            // Also speak the response
            if (typeof this.speakText === 'function') {
                this.speakText(response);
            }
        }
    }
    
    // Helper to speak text with the provided voices
    speakTextWithVoices(text, voices) {
        if (!text) return;
        
        try {
            // Create utterance
            const utterance = new SpeechSynthesisUtterance(text);
            
            // Set voice if available
            if (voices && voices.length > 0) {
                // Try to find a good voice
                let selectedVoice = voices.find(voice => 
                    voice.name.includes('Google') && voice.lang.includes('en')
                );
                
                // Fallback to any English voice
                if (!selectedVoice) {
                    selectedVoice = voices.find(voice => voice.lang.includes('en'));
                }
                
                // Use any voice as last resort
                if (!selectedVoice && voices.length > 0) {
                    selectedVoice = voices[0];
                }
                
                if (selectedVoice) {
                    console.log(`[AI Assistant] Using voice: ${selectedVoice.name}`);
                    utterance.voice = selectedVoice;
                }
            }
            
            // Set other properties
            utterance.rate = 1.0;  // Normal speed
            utterance.pitch = 1.0; // Normal pitch
            utterance.volume = 1.0; // Full volume
            
            // Handle events
            utterance.onend = () => {
                console.log("[AI Assistant] Speech synthesis completed");
                this.isSpeaking = false;
            };
            
            utterance.onerror = (event) => {
                console.error("[AI Assistant] Speech synthesis error:", event);
                this.isSpeaking = false;
            };
            
            // Speak the text
            if (window.speechSynthesis) {
                window.speechSynthesis.speak(utterance);
            }
        } catch (error) {
            console.error("[AI Assistant] Error in speech synthesis:", error);
            this.isSpeaking = false;
        }
    }
} 