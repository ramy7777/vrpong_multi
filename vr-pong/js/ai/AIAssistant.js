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
        
        console.log("AI Assistant: Basic properties initialized");
        
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
        this.micButton.title = 'Click to speak';
        controls.appendChild(this.micButton);
        
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
        
        // Add event listener for the microphone button
        this.micButton.addEventListener('click', () => {
            console.log("AI Assistant: Microphone button clicked");
            this.startListening();
        });
        
        // Add welcome message
        this.addMessageToConversation("assistant", "Hello! I'm your AI assistant. How can I help you with your Pong game today?");
        
        console.log("AI Assistant: Chat UI created");
        
        // Initialize speech recognition
        this.initSpeechRecognition();
    }
    
    initSpeechRecognition() {
        // Check if speech recognition is available
        if ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window) {
            console.log("AI Assistant: Speech recognition API is available, initializing...");
            const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
            this.recognition = new SpeechRecognition();
            
            // Make sure we have enough time to speak
            this.recognition.continuous = false;
            this.recognition.interimResults = true;
            this.recognition.maxAlternatives = 1;
            this.recognition.lang = 'en-US';
            
            this.recognition.onstart = () => {
                console.log("AI Assistant: Speech recognition started");
                this.isListening = true;
                this.micButton.style.backgroundColor = '#F44336';  // Red when listening
                this.showMessage("I'm listening...");
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
                    }
                }
                
                // If we have a final transcript, process it
                if (finalTranscript !== '') {
                    console.log('AI Assistant: Recognized speech:', finalTranscript);
                    this.isListening = false;
                    this.micButton.style.backgroundColor = '#4CAF50';
                    this.handleUserInput(finalTranscript);
                }
            };
            
            this.recognition.onerror = (event) => {
                console.error('AI Assistant: Speech recognition error:', event.error);
                if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
                    this.showMessage("Microphone permission denied. Please allow microphone access.");
                    // Try to request permission explicitly
                    this.requestMicrophonePermission();
                } else if (event.error === 'no-speech') {
                    this.showMessage("No speech detected. Please try again.");
                } else {
                    this.showMessage("Speech recognition error: " + event.error);
                }
                this.isListening = false;
                this.micButton.style.backgroundColor = '#4CAF50';
            };
            
            this.recognition.onend = () => {
                console.log("AI Assistant: Speech recognition ended");
                this.isListening = false;
                this.micButton.style.backgroundColor = '#4CAF50';
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
        console.log("AI Assistant: Start listening called. isInitialized:", this.isInitialized, "useServerSide:", this.useServerSide);
        
        // If using client-side mode, require initialization
        if (!this.isInitialized && !this.useServerSide) {
            this.showMessage("AI assistant not initialized. Please set up your API key.");
            return;
        }
        
        // If already listening, stop first
        if (this.isListening) {
            console.log("AI Assistant: Already listening, stopping first");
            this.stopListening();
            // Short delay to ensure clean restart
            setTimeout(() => this.startListeningInternal(), 200);
            return;
        }
        
        if (this.isSpeaking) {
            this.showMessage("Please wait until I finish speaking.");
            return;
        }
        
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
            console.log("AI Assistant: Starting speech recognition");
            this.recognition.start();
            
            // Set a timeout to prevent the recognition from ending too quickly
            this.listenTimeout = setTimeout(() => {
                console.log("AI Assistant: Listen timeout, checking if still listening");
                if (!this.isListening) {
                    console.log("AI Assistant: Not listening anymore, restarting");
                    this.startListeningInternal();
                }
            }, 5000); // Check every 5 seconds
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
        console.log("AI Assistant: Stopping listening");
        if (this.listenTimeout) {
            clearTimeout(this.listenTimeout);
            this.listenTimeout = null;
        }
        
        if (this.recognition && this.isListening) {
            try {
                this.recognition.stop();
                console.log("AI Assistant: Recognition stopped");
            } catch (error) {
                console.error("Error stopping recognition:", error);
            }
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
                this.isSpeaking = true;
                const utterance = new SpeechSynthesisUtterance(text);
                
                // Configure voice
                utterance.rate = 1.0;
                utterance.pitch = 1.0;
                utterance.volume = 1.0;
                
                // Use a female voice if available
                const voices = window.speechSynthesis.getVoices();
                const femaleVoice = voices.find(voice => 
                    voice.name.includes('Female') || 
                    voice.name.includes('female') || 
                    voice.name.includes('Samantha')
                );
                
                if (femaleVoice) {
                    utterance.voice = femaleVoice;
                }
                
                // Handle speak end
                utterance.onend = () => {
                    this.isSpeaking = false;
                };
                
                window.speechSynthesis.speak(utterance);
            } catch (error) {
                console.error('Error with speech synthesis:', error);
                this.isSpeaking = false;
            }
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
            
            // Remove after 3 seconds
            setTimeout(() => {
                if (document.body.contains(messageElement)) {
                    document.body.removeChild(messageElement);
                }
            }, 3000);
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
} 