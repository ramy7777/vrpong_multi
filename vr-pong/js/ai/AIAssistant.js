export class AIAssistant {
    constructor(game) {
        console.log("AI Assistant: Constructor called");
        this.game = game;
        this.messages = [];
        this.isInitialized = false;
        this.isListening = false;
        this.isSpeaking = false;
        this.apiKey = null;
        this.useServerSide = false;
        this.socket = null;
        this.speechRecognition = null;
        this.chatHistory = [];
        this.currentTranscript = '';
        this.pressStartTime = 0; // Add this to track when button was pressed
        this.minSpeechDuration = 500; // Minimum time in ms to consider a valid speech attempt
        this.lastSpeechTimestamp = null; // Add this to track when speech started
        this.micButtonPressed = false; // Add flag to track button state
        
        console.log("AI Assistant: Basic properties initialized, isSpeaking =", this.isSpeaking);
        
        // Initialize audio context for browsers that need it
        this.initAudioContext();
        
        // Check if we have a socket connection from multiplayer manager
        if (this.game.multiplayerManager && this.game.multiplayerManager.socket) {
            this.useServerSide = true;
            this.socket = this.game.multiplayerManager.socket;
            this.isInitialized = true; // Mark as initialized when using server-side
            console.log("AI Assistant: Using server-side AI processing via socket.io, marked as initialized");
            
            this.setupSocketListeners();
        }
        
        // Always create the setup UI for API key entry first
        console.log("AI Assistant: Creating setup UI for API key entry");
        this.createSetupUI();
        
        console.log("AI Assistant: Constructor completed successfully");
    }
    
    setupSocketListeners() {
        if (!this.socket) return;
        
        console.log("AI Assistant: Setting up socket listeners");
        
        this.socket.on('openai-response', (data) => {
            console.log("Received OpenAI response from server:", data);
            if (data.error) {
                console.error("Error from server OpenAI processing:", data.error);
                this.updateLastAssistantMessage("Sorry, there was an error processing your request. Please try again later.");
                return;
            }
            
            if (data.response) {
                this.updateLastAssistantMessage(data.response);
                this.speakText(data.response);
            }
        });
        
        // Handle OpenAI errors
        this.socket.on('openai-error', (data) => {
            console.error("OpenAI error from server:", data.error);
            this.updateLastAssistantMessage(`Sorry, there was an error: ${data.error}`);
        });
        
        // Handle API key status updates
        this.socket.on('openai-key-status', (data) => {
            if (data.success) {
                console.log("API key successfully set on server");
                this.showMessage("API key successfully set! Voice chat is now active.");
                this.apiKey = "server-managed"; // Mark that we're using a server-managed key
                this.isInitialized = true;
                
                // Important: Remove the setup UI first
                this.hideSetupUI();
                
                // Then create and show the chat UI
                if (!this.chatContainer) {
                    this.createChatUI();
                }
                this.showChatUI();
                
                // Add a welcome message
                this.addMessageToConversation('assistant', 'Hello! I\'m your AI assistant. How can I help you with your Pong game today?');
                this.speakText('Hello! I\'m your AI assistant. How can I help you with your Pong game today?');
            } else {
                console.error("API key error:", data.error);
                this.showMessage(`Error setting API key: ${data.error}`);
                
                // Show error in the setup UI if it exists
                if (this.setupContainer) {
                    const statusElements = this.setupContainer.querySelectorAll('p');
                    if (statusElements.length > 0) {
                        const statusMsg = statusElements[statusElements.length - 1];
                        statusMsg.textContent = data.error || 'Failed to connect. Please check your API key.';
                        statusMsg.style.color = '#ff5555';
                    }
                }
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
                        this.addMessageToConversation('assistant', 'Hello! I\'m your AI assistant. How can I help you with your Pong game today?');
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
            this.addMessageToConversation('assistant', 'Hello! I\'m your AI assistant. Voice features are limited without an API key, but I\'ll do my best to help.');
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
        console.log("AI Assistant: Creating chat UI");
        
        // Create chat container
        this.chatContainer = document.createElement('div');
        this.chatContainer.id = 'ai-chat-container';
        this.chatContainer.style.position = 'absolute';
        this.chatContainer.style.bottom = '20px';
        this.chatContainer.style.right = '20px';
        this.chatContainer.style.width = '300px';
        this.chatContainer.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
        this.chatContainer.style.borderRadius = '8px';
        this.chatContainer.style.overflow = 'hidden';
        this.chatContainer.style.display = 'flex';
        this.chatContainer.style.flexDirection = 'column';
        this.chatContainer.style.zIndex = '1000';
        this.chatContainer.style.border = '2px solid #4d69ff';
        document.body.appendChild(this.chatContainer);
        
        // Add header with title
        const header = document.createElement('div');
        header.style.padding = '10px';
        header.style.backgroundColor = '#4d69ff';
        header.style.color = 'white';
        header.style.fontWeight = 'bold';
        header.style.display = 'flex';
        header.style.justifyContent = 'space-between';
        header.style.alignItems = 'center';
        this.chatContainer.appendChild(header);
        
        const title = document.createElement('div');
        title.textContent = 'PongGPT Assistant';
        header.appendChild(title);
        
        // Add buttons container
        const buttonsContainer = document.createElement('div');
        buttonsContainer.style.display = 'flex';
        header.appendChild(buttonsContainer);
        
        // Add a manual speak button
        const speakButton = document.createElement('button');
        speakButton.textContent = 'Speak';
        speakButton.style.backgroundColor = '#2196F3'; // Blue
        speakButton.style.color = 'white';
        speakButton.style.border = 'none';
        speakButton.style.borderRadius = '4px';
        speakButton.style.padding = '4px 8px';
        speakButton.style.fontSize = '12px';
        speakButton.style.cursor = 'pointer';
        speakButton.style.marginRight = '5px';
        speakButton.title = 'Click to make the AI speak its last message';
        speakButton.addEventListener('click', () => {
            console.log("AI Assistant: Manual speak triggered");
            
            // Find the last assistant message
            const lastMessage = this.findLastAssistantMessage();
            
            if (lastMessage) {
                // Cancel any ongoing speech
                window.speechSynthesis.cancel();
                this.isSpeaking = false;
                
                // Start fresh speech
                this.speakText(lastMessage);
            } else {
                this.showMessage("No AI messages to speak");
            }
        });
        buttonsContainer.appendChild(speakButton);
        
        // Add reset button to fix stuck states
        const resetButton = document.createElement('button');
        resetButton.textContent = 'Reset';
        resetButton.style.backgroundColor = '#FF5722'; // Orange/Red
        resetButton.style.color = 'white';
        resetButton.style.border = 'none';
        resetButton.style.borderRadius = '4px';
        resetButton.style.padding = '4px 8px';
        resetButton.style.fontSize = '12px';
        resetButton.style.cursor = 'pointer';
        resetButton.title = 'Use this if the microphone or speech gets stuck';
        resetButton.addEventListener('click', () => {
            console.log("AI Assistant: Manual reset triggered");
            
            // Cancel any speech synthesis
            window.speechSynthesis.cancel();
            
            // Reset all flags
            this.isSpeaking = false;
            this.isListening = false;
            this.micButtonPressed = false;
            this.lastSpeechTimestamp = null;
            
            // Abort speech recognition if active
            if (this.recognition) {
                try {
                    this.recognition.abort();
                } catch (error) {
                    // Ignore errors during abort
                    console.log("AI Assistant: Error during recognition abort:", error);
                }
            }
            
            // Reset UI elements
            if (this.micButton) {
                this.micButton.style.backgroundColor = '#4CAF50'; // Green
                this.micButton.style.transform = '';
                this.micButton.style.boxShadow = '';
            }
            
            // Clear any speech timers
            if (this.speechCheckTimer) {
                clearTimeout(this.speechCheckTimer);
                this.speechCheckTimer = null;
            }
            
            // Update UI with confirmation
            this.showMessage("Speech system reset complete");
            
            // Reset recognition status
            this.showRecognitionStatus("Press and hold the mic button to speak");
        });
        buttonsContainer.appendChild(resetButton);
        
        // Add chat messages area
        this.aiChatBox = document.createElement('div');
        this.aiChatBox.style.padding = '10px';
        this.aiChatBox.style.maxHeight = '200px';
        this.aiChatBox.style.overflowY = 'auto';
        this.aiChatBox.style.color = 'white';
        this.aiChatBox.style.fontSize = '14px';
        this.chatContainer.appendChild(this.aiChatBox);
        
        // Add styling for different message types
        const style = document.createElement('style');
        style.textContent = `
            .ai-chat-message {
                margin-bottom: 8px;
                padding: 8px;
                border-radius: 8px;
                max-width: 80%;
                word-wrap: break-word;
            }
            .ai-chat-message.user {
                background-color: #2196F3;
                align-self: flex-end;
                margin-left: auto;
            }
            .ai-chat-message.assistant {
                background-color: #4CAF50;
                align-self: flex-start;
            }
        `;
        document.head.appendChild(style);
        
        // Add microphone button for voice input
        const controls = document.createElement('div');
        controls.style.display = 'flex';
        controls.style.padding = '10px';
        controls.style.borderTop = '1px solid rgba(255, 255, 255, 0.2)';
        this.chatContainer.appendChild(controls);
        
        this.micButton = document.createElement('button');
        this.micButton.innerHTML = '🎤'; // Microphone emoji
        this.micButton.style.backgroundColor = '#4CAF50';
        this.micButton.style.color = 'white';
        this.micButton.style.border = 'none';
        this.micButton.style.borderRadius = '50%';
        this.micButton.style.width = '50px';
        this.micButton.style.height = '50px';
        this.micButton.style.fontSize = '24px';
        this.micButton.style.cursor = 'pointer';
        this.micButton.style.margin = '0 auto';
        this.micButton.style.boxShadow = '0 4px 8px rgba(0,0,0,0.3)';
        this.micButton.style.transition = 'all 0.2s ease';
        this.micButton.title = 'Press and hold to speak, release when done';
        controls.appendChild(this.micButton);
        
        // Add push-to-talk instruction text below the button
        const instructionText = document.createElement('div');
        instructionText.textContent = 'Press & hold to speak';
        instructionText.style.color = 'white';
        instructionText.style.fontSize = '12px';
        instructionText.style.textAlign = 'center';
        instructionText.style.marginTop = '5px';
        instructionText.style.opacity = '0.8';
        controls.appendChild(instructionText);
        
        // Add pulse animation to make the mic button more noticeable
        const pulseStyle = document.createElement('style');
        pulseStyle.textContent = `
            @keyframes pulse {
                0% { transform: scale(1); box-shadow: 0 4px 8px rgba(0,0,0,0.3); }
                50% { transform: scale(1.05); box-shadow: 0 4px 12px rgba(0,0,0,0.5); }
                100% { transform: scale(1); box-shadow: 0 4px 8px rgba(0,0,0,0.3); }
            }
            #ai-chat-container button {
                animation: pulse 2s infinite;
            }
            #ai-chat-container button:active {
                transform: scale(0.95);
                box-shadow: 0 2px 4px rgba(0,0,0,0.3);
            }
        `;
        document.head.appendChild(pulseStyle);
        
        // Replace with mousedown/mouseup listeners for push-to-talk
        this.micButton.removeEventListener('click', () => {});
        this.micButton.addEventListener('mousedown', () => {
            console.log("AI Assistant: Microphone button pressed");
            this.pressStartTime = Date.now();
            this.micButtonPressed = true; // Add flag to track button state
            this.startListening();
            
            // Add a visual pulse effect to the button
            this.micButton.style.transform = 'scale(1.1)';
            this.micButton.style.boxShadow = '0 0 15px rgba(244, 67, 54, 0.7)';
        });

        this.micButton.addEventListener('mouseup', () => {
            console.log("AI Assistant: Microphone button released");
            const pressDuration = Date.now() - this.pressStartTime;
            console.log(`AI Assistant: Button held for ${pressDuration}ms`);
            
            // Reset button styling
            this.micButton.style.transform = '';
            this.micButton.style.boxShadow = '';
            
            this.micButtonPressed = false; // Clear the flag when button is released
            this.stopListening();
            
            // Process the speech after button release with minimum duration check
            if (this.currentTranscript && this.currentTranscript.trim() !== '') {
                console.log("AI Assistant: Processing transcript after button release:", this.currentTranscript);
                this.handleUserInput(this.currentTranscript);
                this.currentTranscript = '';
            } else if (pressDuration < this.minSpeechDuration) {
                console.log("AI Assistant: Button press too short, might be accidental");
                this.showMessage("Please hold the button longer while speaking");
            } else {
                console.log("AI Assistant: No speech detected");
                this.showMessage("No speech detected. Try again and speak clearly.");
            }
        });

        // Add touchstart/touchend support for mobile devices
        this.micButton.addEventListener('touchstart', (e) => {
            e.preventDefault(); // Prevent default touch behavior
            console.log("AI Assistant: Microphone button touched");
            this.pressStartTime = Date.now();
            this.startListening();
            
            // Add a visual pulse effect to the button
            this.micButton.style.transform = 'scale(1.1)';
            this.micButton.style.boxShadow = '0 0 15px rgba(244, 67, 54, 0.7)';
        });

        this.micButton.addEventListener('touchend', (e) => {
            e.preventDefault(); // Prevent default touch behavior
            console.log("AI Assistant: Microphone touch released");
            const pressDuration = Date.now() - this.pressStartTime;
            console.log(`AI Assistant: Button held for ${pressDuration}ms`);
            
            // Reset button styling
            this.micButton.style.transform = '';
            this.micButton.style.boxShadow = '';
            
            this.stopListening();
            
            // Process the speech after button release with minimum duration check
            if (this.currentTranscript && this.currentTranscript.trim() !== '') {
                console.log("AI Assistant: Processing transcript after touch release:", this.currentTranscript);
                this.handleUserInput(this.currentTranscript);
                this.currentTranscript = '';
            } else if (pressDuration < this.minSpeechDuration) {
                console.log("AI Assistant: Touch too short, might be accidental");
                this.showMessage("Please hold longer while speaking");
            } else {
                console.log("AI Assistant: No speech detected after touch");
                this.showMessage("No speech detected. Try again and speak clearly.");
            }
        });
        
        // Add a large initial instruction card that fades after a few seconds
        const instructionCard = document.createElement('div');
        instructionCard.style.position = 'absolute';
        instructionCard.style.top = '50%';
        instructionCard.style.left = '50%';
        instructionCard.style.transform = 'translate(-50%, -50%)';
        instructionCard.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
        instructionCard.style.color = 'white';
        instructionCard.style.padding = '20px';
        instructionCard.style.borderRadius = '10px';
        instructionCard.style.boxShadow = '0 0 20px rgba(77, 105, 255, 0.7)';
        instructionCard.style.zIndex = '2000';
        instructionCard.style.textAlign = 'center';
        instructionCard.style.maxWidth = '80%';
        instructionCard.style.transition = 'opacity 1s ease-in-out';
        
        const titleInstruction = document.createElement('h2');
        titleInstruction.textContent = 'Push-to-Talk Instructions';
        titleInstruction.style.color = '#4d69ff';
        titleInstruction.style.marginBottom = '15px';
        instructionCard.appendChild(titleInstruction);
        
        const instructions = document.createElement('p');
        instructions.innerHTML = '1. <strong>Press and hold</strong> the microphone button<br>' +
                               '2. <strong>Speak</strong> while holding the button<br>' +
                               '3. <strong>Release</strong> when you\'re done speaking<br><br>' +
                               'This will send your voice to the AI assistant.';
        instructions.style.lineHeight = '1.5';
        instructions.style.fontSize = '16px';
        instructionCard.appendChild(instructions);
        
        document.body.appendChild(instructionCard);
        
        // Fade out and remove after 8 seconds
        setTimeout(() => {
            instructionCard.style.opacity = '0';
            setTimeout(() => {
                if (document.body.contains(instructionCard)) {
                    document.body.removeChild(instructionCard);
                }
            }, 1000);
        }, 8000);
        
        // Add welcome message
        this.addMessageToConversation("assistant", "Hello! I'm your AI assistant. How can I help you with your Pong game today?");
        
        console.log("AI Assistant: Chat UI created");
        
        // Initialize speech recognition
        this.initSpeechRecognition();
        
        // Show push-to-talk instructions the first time
        this.showRecognitionStatus("Press and hold the mic button to speak");
    }
    
    initSpeechRecognition() {
        // Check if speech recognition is available
        if ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window) {
            console.log("AI Assistant: Speech recognition API is available, initializing...");
            const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
            this.recognition = new SpeechRecognition();
            
            // Configure for push-to-talk
            this.recognition.continuous = true; // Changed to true to keep recognition active during button press
            this.recognition.interimResults = true;
            this.recognition.maxAlternatives = 1;
            this.recognition.lang = 'en-US';
            
            this.recognition.onstart = () => {
                console.log("AI Assistant: Speech recognition started");
                this.isListening = true;
                this.micButton.style.backgroundColor = '#F44336';  // Red when listening
                this.showRecognitionStatus("Listening... Release when done speaking");
            };
            
            this.recognition.onresult = (event) => {
                let finalTranscript = '';
                let interimTranscript = '';
                
                // Process all results, distinguishing between final and interim
                for (let i = event.resultIndex; i < event.results.length; i++) {
                    if (event.results[i].isFinal) {
                        finalTranscript += event.results[i][0].transcript;
                        console.log('AI Assistant: Final transcript:', finalTranscript);
                    } else {
                        interimTranscript += event.results[i][0].transcript;
                        console.log('AI Assistant: Interim transcript:', interimTranscript);
                        
                        // Add visual feedback for interim results - use the new method for better visibility
                        this.showRecognitionStatus(`I heard: "${interimTranscript}"`);
                    }
                }
                
                // Store the transcript but don't process it yet
                if (finalTranscript !== '') {
                    this.currentTranscript = finalTranscript;
                    console.log('AI Assistant: Saved final transcript:', this.currentTranscript);
                    this.micButton.style.backgroundColor = '#9C27B0'; // Purple when speech is recognized
                } else if (interimTranscript !== '') {
                    this.currentTranscript = interimTranscript;
                    console.log('AI Assistant: Saved interim transcript:', this.currentTranscript);
                }
            };
            
            this.recognition.onerror = (event) => {
                console.error('AI Assistant: Speech recognition error:', event.error);
                if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
                    this.showMessage("Microphone permission denied. Please allow microphone access.");
                    // Try to request permission explicitly
                    this.requestMicrophonePermission();
                } else if (event.error === 'no-speech') {
                    // Don't show a message for no-speech when holding the button
                    console.log("AI Assistant: No speech detected, but continuing to listen");
                    // Restart recognition if it stopped due to no speech
                    if (this.isListening && this.micButtonPressed) {
                        this.startListeningInternal();
                    }
                } else {
                    this.showMessage("Speech recognition error: " + event.error);
                }
                
                // Only reset if we're not still holding the button
                if (!this.micButtonPressed) {
                    this.isListening = false;
                    this.micButton.style.backgroundColor = '#4CAF50';
                }
            };
            
            this.recognition.onend = () => {
                console.log("AI Assistant: Speech recognition ended");
                
                // If the button is still pressed, restart recognition immediately
                if (this.micButtonPressed) {
                    console.log("AI Assistant: Button still pressed, restarting recognition");
                    this.startListeningInternal();
                } else {
                    this.isListening = false;
                    this.micButton.style.backgroundColor = '#4CAF50';
                }
            };
            
            console.log('AI Assistant: Speech recognition initialized successfully');
            
            // Check for microphone permission
            this.requestMicrophonePermission();
        } else {
            console.error('AI Assistant: Speech recognition not supported in this browser');
            this.showMessage("Voice input not supported in your browser.");
        }
    }
    
    // Request microphone permission explicitly
    requestMicrophonePermission() {
        console.log("AI Assistant: Requesting microphone permission");
        navigator.mediaDevices.getUserMedia({ audio: true })
            .then(stream => {
                console.log("AI Assistant: Microphone permission granted");
                this.showMessage("Microphone access granted. Voice chat is ready.");
                // Stop the tracks to release the microphone
                stream.getTracks().forEach(track => track.stop());
            })
            .catch(err => {
                console.error("AI Assistant: Microphone permission denied:", err);
                this.showMessage("Please allow microphone access for voice chat to work.");
            });
    }
    
    startListening() {
        console.log("AI Assistant: Start listening called. isInitialized:", this.isInitialized, "useServerSide:", this.useServerSide, "isSpeaking:", this.isSpeaking);
        
        // If using client-side mode, require initialization
        if (!this.isInitialized && !this.useServerSide) {
            this.showMessage("AI assistant not initialized. Please set up your API key.");
            return;
        }
        
        // Debug and force reset isSpeaking if it's been stuck
        if (this.isSpeaking) {
            console.log("AI Assistant: isSpeaking is true, may be stuck. Last speech activity was over 10 seconds ago?");
            
            // Check if there was any recent speech activity (over 10 seconds ago)
            if (!this.lastSpeechTimestamp || (Date.now() - this.lastSpeechTimestamp > 10000)) {
                console.log("AI Assistant: Forcing reset of isSpeaking flag");
                this.isSpeaking = false;
            } else {
                this.showMessage("Please wait until I finish speaking.");
                return;
            }
        }
        
        // Initialize the current transcript
        this.currentTranscript = '';
        
        // Start listening
        this.startListeningInternal();
    }
    
    startListeningInternal() {
        if (!this.recognition) {
            console.log("AI Assistant: No recognition object, reinitializing");
            this.initSpeechRecognition();
            if (!this.recognition) {
                this.showMessage("Sorry, voice recognition couldn't be initialized.");
                return;
            }
        }
        
        try {
            // Abort any existing recognition session
            try {
                this.recognition.abort();
                console.log("AI Assistant: Aborted previous recognition session");
            } catch (e) {
                // Ignore errors here as it might not be active
            }

            // Start fresh
            console.log("AI Assistant: Starting speech recognition");
            this.recognition.start();
            console.log("AI Assistant: Recognition started successfully");
        } catch (error) {
            console.error('Error starting speech recognition:', error);
            this.showMessage("Error starting voice recognition. Please try again.");
            
            // Try to reinitialize
            setTimeout(() => {
                console.log("AI Assistant: Reinitializing speech recognition after error");
                this.initSpeechRecognition();
            }, 1000);
        }
    }
    
    stopListening() {
        console.log("AI Assistant: Stopping listening, current transcript:", this.currentTranscript);
        
        if (this.recognition && this.isListening) {
            // Add a tiny delay before stopping to ensure any in-progress recognition completes
            setTimeout(() => {
                try {
                    this.recognition.stop();
                    console.log("AI Assistant: Recognition stopped");
                } catch (error) {
                    console.error("Error stopping recognition:", error);
                }
            }, 200);  // Small delay to let any final results come through
        }
        
        this.isListening = false;
        if (this.micButton) {
            this.micButton.style.backgroundColor = '#4CAF50';
        }
    }
    
    // Handle user input (text or transcribed speech)
    async handleUserInput(text) {
        if (!text || text.trim() === "") {
            console.log("AI Assistant: Empty input received, ignoring");
            return;
        }
        
        const cleanedText = text.trim();
        console.log(`AI Assistant: Received user input: "${cleanedText}"`);
        
        // Show a temporary "typing" message
        this.showMessage("Processing your request...");
        
        // Add user message to conversation
        this.addMessageToConversation("user", cleanedText);
        
        if (this.useServerSide && this.socket) {
            // Send to server for processing
            console.log("AI Assistant: Sending message to server for processing via socket.io");
            
            // Show typing indicator
            this.addMessageToConversation("assistant", "...");
            
            try {
                this.socket.emit('openai-chat', { message: cleanedText });
                console.log("AI Assistant: Message sent to server successfully");
            } catch (error) {
                console.error("AI Assistant: Error sending message to server:", error);
                this.updateLastAssistantMessage("Sorry, I encountered an error communicating with the server. Please try again.");
            }
        } else if (this.isInitialized && this.apiKey) {
            // Process client-side with API key
            try {
                // Simulate response for now
                const response = "I'm sorry, but I'm currently operating in client-side mode without a direct connection to OpenAI. For full functionality, please restart the server with an API key.";
                
                this.addMessageToConversation("assistant", response);
                this.speakText(response);
            } catch (error) {
                console.error("AI Assistant: Error processing message:", error);
                this.addMessageToConversation("assistant", "I'm sorry, I encountered an error processing your request.");
            }
        } else {
            // Fallback for when not initialized
            const fallbackResponse = "I'm not fully initialized yet. Please provide an OpenAI API key or restart the server with an API key.";
            this.addMessageToConversation("assistant", fallbackResponse);
        }
    }
    
    // Update the last assistant message (used for typing indicators)
    updateLastAssistantMessage(content) {
        if (!this.chatHistory || this.chatHistory.length === 0) {
            this.addMessageToConversation("assistant", content);
            return;
        }
        
        // Find the last assistant message and update it
        for (let i = this.chatHistory.length - 1; i >= 0; i--) {
            if (this.chatHistory[i].role === 'assistant') {
                this.chatHistory[i].content = content;
                this.updateChatDisplay();
                return;
            }
        }
        
        // If no existing assistant message found, add a new one
        this.addMessageToConversation("assistant", content);
    }
    
    // Add a message to the conversation history
    addMessageToConversation(role, content) {
        if (!content) return;
        
        console.log(`AI Assistant: Adding message to conversation - Role: ${role}, Content: ${content}`);
        
        const message = {
            role: role,
            content: content
        };
        
        if (!this.chatHistory) {
            this.chatHistory = [];
        }
        
        this.chatHistory.push(message);
        this.updateChatDisplay();
        
        console.log(`AI Assistant: Chat history updated, now contains ${this.chatHistory.length} messages`);
    }
    
    // Text-to-speech for assistant responses
    speakText(text) {
        if ('speechSynthesis' in window) {
            try {
                // Force cancel any previous speech that might be stuck
                window.speechSynthesis.cancel();
                
                this.isSpeaking = true;
                this.lastSpeechTimestamp = Date.now();
                console.log("AI Assistant: Starting speech synthesis, isSpeaking =", this.isSpeaking);
                
                // If the text is empty or undefined, just return
                if (!text || text.trim() === '') {
                    console.warn("AI Assistant: Empty text provided for speech synthesis");
                    this.isSpeaking = false;
                    return;
                }
                
                const utterance = new SpeechSynthesisUtterance(text);
                
                // Configure voice parameters
                utterance.rate = 1.0;
                utterance.pitch = 1.0;
                utterance.volume = 1.0;
                
                // Get the voices and handle the case where they might not be loaded yet
                let voices = window.speechSynthesis.getVoices();
                
                // Log how many voices are available for debugging
                console.log("AI Assistant: Available voices:", voices.length);
                
                // In some browsers, voices might be loaded asynchronously
                if (voices.length === 0) {
                    console.log("AI Assistant: No voices available yet, will try again when voices load");
                    
                    // Set up a one-time event listener for when voices are loaded
                    window.speechSynthesis.onvoiceschanged = () => {
                        console.log("AI Assistant: Voices are now available");
                        voices = window.speechSynthesis.getVoices();
                        
                        // Check if we actually got voices this time
                        if (voices.length === 0) {
                            console.warn("AI Assistant: Still no voices available after voices changed event");
                            this.isSpeaking = false;
                            return;
                        }
                        
                        this.setVoiceAndSpeak(utterance, voices, text);
                    };
                    
                    // Add a fallback timeout in case the voices never load
                    setTimeout(() => {
                        if (this.isSpeaking && (!voices || voices.length === 0)) {
                            console.warn("AI Assistant: Voices never loaded, using default voice");
                            // Just try to speak with default voice
                            window.speechSynthesis.speak(utterance);
                        }
                    }, 3000);
                } else {
                    this.setVoiceAndSpeak(utterance, voices, text);
                }
                
                // Add a safety timeout in case onend doesn't fire
                setTimeout(() => {
                    if (this.isSpeaking) {
                        console.log("AI Assistant: Speech timeout safety triggered");
                        this.isSpeaking = false;
                        this.lastSpeechTimestamp = null;
                        
                        // Try to restart speech synthesis if it's stuck
                        window.speechSynthesis.cancel();
                    }
                }, 15000); // 15 seconds max speech time
            } catch (error) {
                console.error('Error with speech synthesis:', error);
                this.isSpeaking = false;
                this.lastSpeechTimestamp = null;
                
                // Show message to user
                this.showMessage("Voice output failed. Check if your device supports speech synthesis.");
            }
        } else {
            console.warn("AI Assistant: Speech synthesis not supported in this browser");
            this.showMessage("Voice output not supported in your browser.");
        }
    }
    
    // Helper method to set voice and start speaking
    setVoiceAndSpeak(utterance, voices, text) {
        // Log all available voices to help with debugging
        voices.forEach((voice, i) => {
            console.log(`Voice ${i}: ${voice.name} (${voice.lang})`);
        });
        
        // Try to find a good voice with a prioritized approach
        // First priority: Google UK English Female or similar high-quality voices
        let selectedVoice = voices.find(voice => 
            (voice.name.includes('UK English Female') || 
             voice.name.includes('Samantha') ||
             voice.name.includes('Zira'))
        );
        
        // Second priority: Any female English voice
        if (!selectedVoice) {
            selectedVoice = voices.find(voice => 
                (voice.name.includes('Female') || voice.name.includes('female')) &&
                (voice.lang.includes('en') || voice.lang.includes('EN'))
            );
        }
        
        // Third priority: Any English voice
        if (!selectedVoice) {
            selectedVoice = voices.find(voice => 
                voice.lang.includes('en') || voice.lang.includes('EN')
            );
        }
        
        // Last resort: first available voice
        if (!selectedVoice && voices.length > 0) {
            selectedVoice = voices[0];
        }
        
        if (selectedVoice) {
            console.log("AI Assistant: Selected voice:", selectedVoice.name);
            utterance.voice = selectedVoice;
        } else {
            console.warn("AI Assistant: No suitable voice found");
        }
        
        // Handle speak events
        utterance.onstart = () => {
            console.log("AI Assistant: Speech started");
            // Some browsers need to be reminded they're speaking
            this.lastSpeechTimestamp = Date.now();
        };
        
        utterance.onend = () => {
            console.log("AI Assistant: Speech synthesis completed");
            this.isSpeaking = false;
            this.lastSpeechTimestamp = null;
            
            // Clear any timers
            if (this.speechCheckTimer) {
                clearTimeout(this.speechCheckTimer);
                this.speechCheckTimer = null;
            }
        };
        
        utterance.onerror = (event) => {
            console.error("AI Assistant: Speech synthesis error:", event);
            this.isSpeaking = false;
            this.lastSpeechTimestamp = null;
            
            // Clear any timers
            if (this.speechCheckTimer) {
                clearTimeout(this.speechCheckTimer);
                this.speechCheckTimer = null;
            }
        };
        
        // Some browsers need a user interaction to enable audio
        // We'll try to resume the audio context if available
        if (window.audioContext) {
            if (window.audioContext.state === 'suspended') {
                window.audioContext.resume().then(() => {
                    console.log("AI Assistant: Audio context resumed");
                }).catch(err => {
                    console.error("AI Assistant: Failed to resume audio context:", err);
                });
            }
        }
        
        // Browser-specific handling
        const isChrome = navigator.userAgent.indexOf("Chrome") > -1;
        const isSafari = navigator.userAgent.indexOf("Safari") > -1 && navigator.userAgent.indexOf("Chrome") === -1;
        
        if (isChrome) {
            // Chrome has issues with long texts and sometimes needs a nudge
            this.ensureSpeechCompletes(text, utterance.text.length * 50); // Rough estimate: 50ms per character
        }
        
        // Start speaking
        try {
            window.speechSynthesis.speak(utterance);
        } catch (e) {
            console.error("AI Assistant: Error during speech synthesis:", e);
            this.isSpeaking = false;
            
            // Try one more time with a delay
            setTimeout(() => {
                try {
                    window.speechSynthesis.cancel(); // Clear any stuck utterances
                    window.speechSynthesis.speak(utterance);
                } catch (e2) {
                    console.error("AI Assistant: Second speech synthesis attempt failed:", e2);
                    this.isSpeaking = false;
                }
            }, 100);
        }
    }
    
    // Show or hide UI components
    hideSetupUI() {
        if (this.setupContainer) {
            document.body.removeChild(this.setupContainer);
            this.setupContainer = null;
        }
    }
    
    showChatUI() {
        if (this.chatContainer) {
            console.log("AI Assistant: Showing chat UI");
            this.chatContainer.style.display = 'flex';
        }
    }
    
    hideChatUI() {
        if (this.chatContainer) {
            this.chatContainer.style.display = 'none';
        }
    }
    
    // Method to display message using game's message system
    showMessage(message) {
        if (this.game && this.game.showMessage) {
            this.game.showMessage(message);
        } else {
            console.log("Game message:", message);
            // Fallback if game.showMessage is not available
            const messageElement = document.createElement('div');
            messageElement.style.position = 'absolute';
            messageElement.style.top = '20px';
            messageElement.style.left = '0';
            messageElement.style.width = '100%';
            messageElement.style.textAlign = 'center';
            messageElement.style.color = 'white';
            messageElement.style.background = 'rgba(0,0,0,0.7)';
            messageElement.style.padding = '10px';
            messageElement.style.zIndex = '1000';
            messageElement.textContent = message;
            document.body.appendChild(messageElement);
            
            // Auto-remove after a few seconds
            setTimeout(() => {
                if (document.body.contains(messageElement)) {
                    document.body.removeChild(messageElement);
                }
            }, 3000);
        }
        
        // Also show message in chat UI if it exists and isn't a transcript message
        if (this.aiChatBox && !message.includes("I heard:") && !message.includes("keep speaking")) {
            const statusMsg = document.createElement('div');
            statusMsg.className = 'ai-chat-status';
            statusMsg.textContent = message;
            statusMsg.style.backgroundColor = 'rgba(255, 152, 0, 0.6)'; // Orange
            statusMsg.style.color = 'white';
            statusMsg.style.padding = '5px 10px';
            statusMsg.style.margin = '5px 0';
            statusMsg.style.borderRadius = '5px';
            statusMsg.style.textAlign = 'center';
            statusMsg.style.fontSize = '12px';
            this.aiChatBox.appendChild(statusMsg);
            this.aiChatBox.scrollTop = this.aiChatBox.scrollHeight;
            
            // Auto-remove status messages after a few seconds to avoid cluttering
            setTimeout(() => {
                if (this.aiChatBox.contains(statusMsg)) {
                    this.aiChatBox.removeChild(statusMsg);
                }
            }, 5000);
        }
    }
    
    // Add a specific method for showing speech recognition status
    showRecognitionStatus(message) {
        // Always show these in the game
        if (this.game && this.game.showMessage) {
            this.game.showMessage(message);
        }
        
        // Show prominently in the chat UI
        if (this.aiChatBox) {
            // Remove any existing speech status messages
            const existingStatuses = this.aiChatBox.querySelectorAll('.speech-status');
            existingStatuses.forEach(el => el.remove());
            
            // Create new status message
            const statusMsg = document.createElement('div');
            statusMsg.className = 'speech-status';
            statusMsg.textContent = message;
            statusMsg.style.backgroundColor = '#F44336'; // Red
            statusMsg.style.color = 'white';
            statusMsg.style.padding = '8px 12px';
            statusMsg.style.margin = '5px 0';
            statusMsg.style.borderRadius = '5px';
            statusMsg.style.textAlign = 'center';
            statusMsg.style.fontWeight = 'bold';
            this.aiChatBox.appendChild(statusMsg);
            this.aiChatBox.scrollTop = this.aiChatBox.scrollHeight;
        }
    }
    
    // Update the chat display with recent messages
    updateChatDisplay() {
        if (!this.aiChatBox) return;
        
        // Clear existing messages
        this.aiChatBox.innerHTML = '';
        
        if (!this.chatHistory || this.chatHistory.length === 0) {
            return;
        }
        
        // Get the last few messages to display (limit to 5)
        const recentMessages = this.chatHistory.slice(-5);
        
        for (const message of recentMessages) {
            const messageElement = document.createElement('div');
            messageElement.className = `ai-chat-message ${message.role}`;
            messageElement.style.marginBottom = '10px';
            messageElement.style.padding = '8px 12px';
            messageElement.style.borderRadius = '8px';
            messageElement.style.maxWidth = '85%';
            
            if (message.role === 'assistant') {
                messageElement.style.backgroundColor = 'rgba(0, 128, 255, 0.7)';
                messageElement.style.alignSelf = 'flex-start';
                messageElement.style.marginRight = 'auto';
            } else {
                messageElement.style.backgroundColor = 'rgba(50, 205, 50, 0.7)';
                messageElement.style.alignSelf = 'flex-end';
                messageElement.style.marginLeft = 'auto';
            }
            
            messageElement.textContent = message.content;
            this.aiChatBox.appendChild(messageElement);
        }
        
        // Auto-scroll to the bottom of the chat
        this.aiChatBox.scrollTop = this.aiChatBox.scrollHeight;
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
    
    // Helper method to ensure speech synthesis completes on buggy browsers
    ensureSpeechCompletes(text, estimatedDuration) {
        // Some browsers (especially Chrome) have a bug where speech synthesis
        // stops after about 15 seconds or when the browser does other tasks
        // This method implements a workaround by breaking speech into chunks
        
        const minDuration = 5000; // Minimum duration for the workaround to activate
        
        if (estimatedDuration < minDuration) {
            // For short texts, we don't need the workaround
            return;
        }
        
        // Clear any existing timer
        if (this.speechCheckTimer) {
            clearTimeout(this.speechCheckTimer);
        }
        
        // Set a timer to check if speech is still in progress
        this.speechCheckTimer = setTimeout(() => {
            if (this.isSpeaking) {
                console.log("AI Assistant: Checking if speech synthesis is still active");
                
                // Chrome's speech synthesis can get stuck, so we need to nudge it
                if (window.speechSynthesis.speaking) {
                    console.log("AI Assistant: Speech synthesis is still active, nudging it to continue");
                    // This weird pause/resume pattern keeps Chrome's speech synthesis working
                    window.speechSynthesis.pause();
                    setTimeout(() => {
                        window.speechSynthesis.resume();
                    }, 10);
                } else if (this.isSpeaking) {
                    console.log("AI Assistant: Speech synthesis stopped prematurely, resetting state");
                    this.isSpeaking = false;
                }
            }
            
            // Set up another check if speech is still ongoing
            if (this.isSpeaking) {
                setTimeout(() => {
                    this.ensureSpeechCompletes(text, estimatedDuration);
                }, 5000); // Check every 5 seconds
            }
        }, 5000); // First check after 5 seconds
    }
    
    // Initialize audio context for browsers that need it before audio will work
    initAudioContext() {
        try {
            // Create audio context if it doesn't exist
            if (!window.audioContext) {
                const AudioContext = window.AudioContext || window.webkitAudioContext;
                if (AudioContext) {
                    window.audioContext = new AudioContext();
                    console.log("AI Assistant: Audio context initialized, state:", window.audioContext.state);
                    
                    // Some browsers require a user action to start audio
                    // We'll add listeners to resume the context on first user interaction
                    const resumeAudioContext = () => {
                        if (window.audioContext && window.audioContext.state === 'suspended') {
                            window.audioContext.resume().then(() => {
                                console.log("AI Assistant: Audio context resumed on user interaction");
                            });
                        }
                        
                        // Also try to trick the browser into enabling speech synthesis
                        // by creating and immediately canceling a silent utterance
                        if ('speechSynthesis' in window) {
                            const silentUtterance = new SpeechSynthesisUtterance('');
                            window.speechSynthesis.speak(silentUtterance);
                            window.speechSynthesis.cancel();
                            console.log("AI Assistant: Speech synthesis initialized on user interaction");
                        }
                        
                        // Remove the listeners after first interaction
                        document.removeEventListener('click', resumeAudioContext);
                        document.removeEventListener('touchstart', resumeAudioContext);
                        document.removeEventListener('keydown', resumeAudioContext);
                    };
                    
                    // Add listeners for user interaction events
                    document.addEventListener('click', resumeAudioContext);
                    document.addEventListener('touchstart', resumeAudioContext);
                    document.addEventListener('keydown', resumeAudioContext);
                }
            }
        } catch (error) {
            console.error("AI Assistant: Error initializing audio context:", error);
        }
    }
    
    // Helper method to find the last assistant message in chat history
    findLastAssistantMessage() {
        if (!this.chatHistory || this.chatHistory.length === 0) {
            return null;
        }
        
        // Start from the end and find the first assistant message
        for (let i = this.chatHistory.length - 1; i >= 0; i--) {
            if (this.chatHistory[i].role === 'assistant' && 
                this.chatHistory[i].content && 
                this.chatHistory[i].content !== '...') {
                return this.chatHistory[i].content;
            }
        }
        
        return null;
    }
} 