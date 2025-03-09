export class AIAssistant {
    constructor(game) {
        console.log("AI Assistant: Initializing AI assistant");
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
        
        // New properties for realtime audio
        this.isRealtimeMode = false; // Start with traditional mode for broader compatibility
        this.audioContext = null;
        this.mediaRecorder = null;
        this.recordedChunks = [];
        this.audioPlayer = new Audio();
        
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
        
        // Create setup UI for API key
        this.createSetupUI();
        
        // Initialize audio context
        this.initAudioContext();
        
        // Check browser compatibility for speech features
        this.checkSpeechCompatibility();
        
        console.log("AI Assistant: Basic properties initialized, isSpeaking =", this.isSpeaking);
    }
    
    setupSocketListeners() {
        if (!this.socket) {
            console.error("AI Assistant: No socket available for event listeners");
            return;
        }
        
        console.log("AI Assistant: Setting up socket listeners");
        
        this.socket.on('openai-response', (data) => {
            const { response } = data;
            console.log("AI Assistant: Received response from OpenAI:", response.substring(0, 50) + "...");
            
            // Update the conversation with the AI's response
            this.updateLastAssistantMessage(response);
            
            // Speak the response if not in realtime mode
            if (!this.isRealtimeMode) {
                this.speakText(response);
            }
        });
        
        // New event for realtime audio response
        this.socket.on('openai-realtime-response', (data) => {
            const { text, audio, transcription } = data;
            console.log("AI Assistant: Received realtime response from OpenAI:", text.substring(0, 50) + "...");
            
            // Update the conversation with the transcription if it's not already added
            if (transcription && this.chatHistory.length > 0 && 
                this.chatHistory[this.chatHistory.length - 1].content !== transcription) {
                this.addMessageToConversation('user', transcription);
            }
            
            // Update the conversation with the AI's response
            this.updateLastAssistantMessage(text);
            
            // Play the audio response
            if (audio) {
                this.playOpenAIAudio(audio);
            }
        });
        
        // New handler for true audio streaming responses
        this.socket.on('openai-audio-stream-response', (data) => {
            const { audioData, text } = data;
            console.log("AI Assistant: Received audio stream response from OpenAI");
            
            // Update the conversation with the text response if we have one
            if (text) {
                this.updateLastAssistantMessage(text);
            } else {
                // Use a generic message if we don't have text
                this.updateLastAssistantMessage("[Voice response from assistant]");
            }
            
            // Play the audio response
            if (audioData) {
                // Create the data URL with the proper MIME type
                const audioDataUrl = `data:audio/mp3;base64,${audioData}`;
                this.playOpenAIAudio(audioDataUrl);
            }
        });
        
        // New listeners for streaming responses
        this.socket.on('openai-transcription', (data) => {
            const { transcription } = data;
            console.log("AI Assistant: Received transcription from OpenAI:", transcription);
            
            // Update the conversation with the transcription
            this.addMessageToConversation('user', transcription);
            
            // Add a placeholder for the assistant response
            this.addMessageToConversation('assistant', '...');
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
            
            // If there was an ongoing recording/conversation, reset the state
            this.isListening = false;
            this.isSpeaking = false;
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
        console.log("AI Assistant: Creating chat UI");
        
        // Create container if it doesn't exist
        if (!this.chatContainer) {
            this.chatContainer = document.createElement('div');
            this.chatContainer.id = 'ai-chat-container';
            this.chatContainer.style.position = 'fixed';
            this.chatContainer.style.bottom = '20px';
            this.chatContainer.style.right = '20px';
            this.chatContainer.style.width = '350px';
            this.chatContainer.style.maxHeight = '500px';
            this.chatContainer.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
            this.chatContainer.style.color = 'white';
            this.chatContainer.style.padding = '15px';
            this.chatContainer.style.borderRadius = '10px';
            this.chatContainer.style.fontFamily = 'Arial, sans-serif';
            this.chatContainer.style.zIndex = '1000';
            this.chatContainer.style.display = 'flex';
            this.chatContainer.style.flexDirection = 'column';
            this.chatContainer.style.boxShadow = '0 4px 8px rgba(0, 0, 0, 0.3)';
            this.chatContainer.style.border = '1px solid rgba(76, 175, 80, 0.5)';
        }
        
        // Create header with title and buttons
        const headerDiv = document.createElement('div');
        headerDiv.style.display = 'flex';
        headerDiv.style.justifyContent = 'space-between';
        headerDiv.style.marginBottom = '10px';
        headerDiv.style.paddingBottom = '10px';
        headerDiv.style.borderBottom = '1px solid rgba(255, 255, 255, 0.2)';
        
        // Title
        const title = document.createElement('div');
        title.textContent = 'AI Assistant';
        title.style.fontWeight = 'bold';
        title.style.fontSize = '16px';
        
        // Buttons container
        const buttonsDiv = document.createElement('div');
        buttonsDiv.style.display = 'flex';
        buttonsDiv.style.gap = '5px';
        
        // Reset button
        const resetButton = document.createElement('button');
        resetButton.textContent = 'Reset';
        resetButton.style.backgroundColor = '#ff5555';
        resetButton.style.color = 'white';
        resetButton.style.border = 'none';
        resetButton.style.borderRadius = '4px';
        resetButton.style.padding = '2px 8px';
        resetButton.style.fontSize = '12px';
        resetButton.style.cursor = 'pointer';
        resetButton.onclick = () => {
            console.log("AI Assistant: Manual reset triggered");
            this.isSpeaking = false;
            this.isListening = false;
            
            // Cancel any ongoing speech synthesis
            if (window.speechSynthesis) {
                window.speechSynthesis.cancel();
            }
            
            // Stop any audio playback
            if (this.audioPlayer) {
                this.audioPlayer.pause();
                this.audioPlayer.currentTime = 0;
            }
            
            this.showMessage("Voice system reset");
        };
        
        // Speak button
        const speakButton = document.createElement('button');
        speakButton.textContent = 'Speak Last';
        speakButton.style.backgroundColor = '#4CAF50';
        speakButton.style.color = 'white';
        speakButton.style.border = 'none';
        speakButton.style.borderRadius = '4px';
        speakButton.style.padding = '2px 8px';
        speakButton.style.fontSize = '12px';
        speakButton.style.cursor = 'pointer';
        speakButton.onclick = () => {
            const lastMessage = this.findLastAssistantMessage();
            if (lastMessage) {
                if (this.isRealtimeMode) {
                    this.showMessage("Cannot manually speak in realtime mode");
                } else {
                    this.speakText(lastMessage);
                }
            } else {
                this.showMessage("No message to speak");
            }
        };
        
        // Add new Voice Mode toggle button
        const modeToggleButton = document.createElement('button');
        modeToggleButton.textContent = this.isRealtimeMode ? 'OpenAI Voice' : 'Browser Voice';
        modeToggleButton.style.backgroundColor = this.isRealtimeMode ? '#2196F3' : '#9e9e9e';
        modeToggleButton.style.color = 'white';
        modeToggleButton.style.border = 'none';
        modeToggleButton.style.borderRadius = '4px';
        modeToggleButton.style.padding = '2px 8px';
        modeToggleButton.style.fontSize = '12px';
        modeToggleButton.style.cursor = 'pointer';
        modeToggleButton.onclick = () => {
            const isRealtime = this.toggleRealtimeMode();
            modeToggleButton.textContent = isRealtime ? 'OpenAI Voice' : 'Browser Voice';
            modeToggleButton.style.backgroundColor = isRealtime ? '#2196F3' : '#9e9e9e';
        };
        
        // Add buttons to container
        buttonsDiv.appendChild(modeToggleButton);
        buttonsDiv.appendChild(speakButton);
        buttonsDiv.appendChild(resetButton);
        
        // Add title and buttons to header
        headerDiv.appendChild(title);
        headerDiv.appendChild(buttonsDiv);
        
        // Chat messages area
        this.aiChatBox = document.createElement('div');
        this.aiChatBox.style.flex = '1';
        this.aiChatBox.style.overflowY = 'auto';
        this.aiChatBox.style.maxHeight = '300px';
        this.aiChatBox.style.marginBottom = '10px';
        this.aiChatBox.style.paddingRight = '5px';
        
        // Custom scrollbar styling
        this.aiChatBox.style.scrollbarWidth = 'thin';
        this.aiChatBox.style.scrollbarColor = 'rgba(76, 175, 80, 0.5) rgba(0, 0, 0, 0.1)';
        
        // Add an instructions card explaining how to use the AI assistant
        const instructionsCard = document.createElement('div');
        instructionsCard.style.backgroundColor = 'rgba(33, 150, 243, 0.2)';
        instructionsCard.style.padding = '8px';
        instructionsCard.style.borderRadius = '5px';
        instructionsCard.style.marginBottom = '10px';
        instructionsCard.style.fontSize = '12px';
        instructionsCard.style.lineHeight = '1.4';
        
        const instructionsText = document.createElement('p');
        instructionsText.style.margin = '0';
        instructionsText.innerHTML = `
            <strong>Instructions:</strong><br>
            • Hold the microphone button to speak<br>
            • Release when finished<br>
            • The ${this.isRealtimeMode ? 'OpenAI' : 'browser'} voice will respond<br>
            • Toggle voice mode with the button above
        `;
        
        instructionsCard.appendChild(instructionsText);
        
        // Microphone button at the bottom
        const micButton = document.createElement('button');
        micButton.textContent = '🎤 Hold to Talk';
        micButton.style.backgroundColor = '#4CAF50';
        micButton.style.color = 'white';
        micButton.style.border = 'none';
        micButton.style.borderRadius = '5px';
        micButton.style.padding = '10px 15px';
        micButton.style.fontSize = '14px';
        micButton.style.cursor = 'pointer';
        micButton.style.width = '100%';
        micButton.style.transition = 'background-color 0.3s';
        micButton.style.display = 'flex';
        micButton.style.alignItems = 'center';
        micButton.style.justifyContent = 'center';
        
        // Status indicator next to the button
        const statusIndicator = document.createElement('div');
        statusIndicator.style.width = '10px';
        statusIndicator.style.height = '10px';
        statusIndicator.style.backgroundColor = '#888';
        statusIndicator.style.borderRadius = '50%';
        statusIndicator.style.marginLeft = '10px';
        statusIndicator.style.transition = 'background-color 0.3s';
        
        micButton.appendChild(statusIndicator);
        
        // Status text below the button
        const statusText = document.createElement('div');
        statusText.style.textAlign = 'center';
        statusText.style.fontSize = '12px';
        statusText.style.marginTop = '5px';
        statusText.style.height = '15px';
        statusText.style.color = 'rgba(255, 255, 255, 0.7)';
        statusText.textContent = '';
        
        let buttonPressStartTime = 0;
        let buttonPressTimer = null;
        
        // Handle press and hold
        micButton.addEventListener('mousedown', (e) => {
            e.preventDefault();
            if (this.isSpeaking) {
                statusText.textContent = "Please wait for the AI to finish speaking";
                return;
            }
            
            buttonPressStartTime = Date.now();
            micButton.style.backgroundColor = '#ff9800';
            statusIndicator.style.backgroundColor = '#ff9800';
            this.micButtonPressed = true;
            
            // Wait a short time before starting recording to avoid accidental clicks
            buttonPressTimer = setTimeout(() => {
                statusText.textContent = "Listening...";
                this.startListening();
            }, 300);
        });
        
        // Handle release
        micButton.addEventListener('mouseup', (e) => {
            e.preventDefault();
            const pressDuration = Date.now() - buttonPressStartTime;
            console.log(`AI Assistant: Button held for ${pressDuration}ms`);
            
            micButton.style.backgroundColor = '#4CAF50';
            statusIndicator.style.backgroundColor = '#888';
            this.micButtonPressed = false;
            
            if (buttonPressTimer) {
                clearTimeout(buttonPressTimer);
            }
            
            if (pressDuration < 300) {
                statusText.textContent = "Press and hold to speak";
                return;
            }
            
            statusText.textContent = "Processing...";
            console.log("AI Assistant: Microphone button released");
            
            // Get the current transcript for immediate feedback
            const currentText = this.currentTranscript;
            console.log("AI Assistant: Processing transcript after button release:", currentText);
            
            // Stop listening, which will trigger processing
            this.stopListening();
            
            if (currentText && currentText.trim() !== '') {
                // The transcript will be processed by the recognition end event
                statusText.textContent = "Thinking...";
            } else {
                statusText.textContent = "No speech detected";
                setTimeout(() => {
                    statusText.textContent = "";
                }, 2000);
            }
        });
        
        // Also handle touch events for mobile devices
        micButton.addEventListener('touchstart', (e) => {
            e.preventDefault();
            if (this.isSpeaking) {
                statusText.textContent = "Please wait for the AI to finish speaking";
                return;
            }
            
            buttonPressStartTime = Date.now();
            micButton.style.backgroundColor = '#ff9800';
            statusIndicator.style.backgroundColor = '#ff9800';
            this.micButtonPressed = true;
            
            buttonPressTimer = setTimeout(() => {
                statusText.textContent = "Listening...";
                this.startListening();
            }, 300);
        });
        
        micButton.addEventListener('touchend', (e) => {
            e.preventDefault();
            const pressDuration = Date.now() - buttonPressStartTime;
            console.log(`AI Assistant: Button held for ${pressDuration}ms`);
            
            micButton.style.backgroundColor = '#4CAF50';
            statusIndicator.style.backgroundColor = '#888';
            this.micButtonPressed = false;
            
            if (buttonPressTimer) {
                clearTimeout(buttonPressTimer);
            }
            
            if (pressDuration < 300) {
                statusText.textContent = "Press and hold to speak";
                return;
            }
            
            statusText.textContent = "Processing...";
            
            // Get the current transcript
            const currentText = this.currentTranscript;
            
            // Stop listening, which will trigger processing
            this.stopListening();
            
            if (currentText && currentText.trim() !== '') {
                statusText.textContent = "Thinking...";
            } else {
                statusText.textContent = "No speech detected";
                setTimeout(() => {
                    statusText.textContent = "";
                }, 2000);
            }
        });
        
        // Store references
        this.micButton = micButton;
        this.statusIndicator = statusIndicator;
        this.statusText = statusText;
        
        // Build the UI
        this.chatContainer.innerHTML = '';
        this.chatContainer.appendChild(headerDiv);
        this.chatContainer.appendChild(instructionsCard);
        this.chatContainer.appendChild(this.aiChatBox);
        this.chatContainer.appendChild(micButton);
        this.chatContainer.appendChild(statusText);
        
        // Add to document
        document.body.appendChild(this.chatContainer);
        
        // Initialize
        this.updateChatDisplay();
        
        // Add welcome message
        this.addMessageToConversation("assistant", "Hello! I'm your AI assistant. I can help with your Pong game or we can chat about anything you'd like to discuss.");
        
        console.log("AI Assistant: Chat UI created");
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
                        resolve();
                    })
                    .catch(error => {
                        console.error("AI Assistant: Microphone permission denied:", error);
                        reject(error);
                    });
            } else {
                console.error("AI Assistant: getUserMedia not supported in this browser");
                reject(new Error("getUserMedia not supported"));
            }
        });
    }
    
    startListening() {
        if (this.isListening || this.isSpeaking) {
            if (this.isSpeaking) {
                this.showMessage("Please wait till I finish speaking");
            }
            return;
        }
        
        console.log("AI Assistant: Starting listening, isListening =", this.isListening);
        
        // If there's no socket connection, try to connect
        if (!this.socket && this.isRealtimeMode) {
            const connected = this.connectToServer();
            if (!connected) {
                console.warn("AI Assistant: Cannot use realtime mode without server connection");
                this.isRealtimeMode = false;
                this.showMessage("Switched to traditional mode - server connection not available");
            }
        }
        
        if (!this.isInitialized) {
            console.warn("AI Assistant: Can't start listening, not initialized");
            this.showMessage("Please set up the OpenAI API key first");
            return;
        }
        
        // Request microphone permission first
        this.requestMicrophonePermission()
            .then(() => {
                // If we're in realtime mode, use the audio recording
                if (this.isRealtimeMode) {
                    try {
                        this.startAudioRecording();
                    } catch (error) {
                        console.error("AI Assistant: Error starting audio recording:", error);
                        this.showMessage("Error starting audio recording. Switching to traditional mode.");
                        this.isRealtimeMode = false;
                        
                        // Initialize speech recognition if needed
                        if (!this.recognition) {
                            this.initSpeechRecognition();
                        }
                        
                        // Try with traditional mode
                        this.startListeningInternal();
                    }
                } else {
                    // Initialize speech recognition if needed
                    if (!this.recognition) {
                        this.initSpeechRecognition();
                    }
                    
                    // Use traditional speech recognition
                    this.startListeningInternal();
                }
            })
            .catch(error => {
                console.error("AI Assistant: Microphone permission error:", error);
                this.showMessage("Microphone access denied. Please allow microphone access and try again.");
            });
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
        
        if (!this.isListening) {
            return;
        }
        
        if (this.isRealtimeMode) {
            this.stopAudioRecording();
        } else {
            // Original speech recognition stoppage
            if (this.recognition) {
                try {
                    this.recognition.stop();
                    console.log("AI Assistant: Recognition stopped");
                } catch (error) {
                    console.error("AI Assistant: Error stopping recognition:", error);
                }
            }
        }
    }
    
    // Handle user input (text or transcribed speech)
    async handleUserInput(text) {
        if (!text || text.trim() === '') {
            console.log("AI Assistant: Empty input received, ignoring");
            return;
        }
        
        console.log("AI Assistant: Received user input:", text);
        
        // Add the user message to the conversation
        this.addMessageToConversation('user', text);
        
        // If we're already in realtime mode, and the audio was just sent via sendAudioToServer,
        // we don't need to do anything else here, as the openai-realtime-response handler will
        // take care of updating the UI with the response
        
        // Only send text-based requests in traditional mode or if we're not using audio recording
        if (!this.isRealtimeMode) {
            // If there's no socket, try to connect
            if (!this.socket) {
                const connected = this.connectToServer();
                if (!connected) {
                    this.showMessage("Cannot connect to server. Using local fallback.");
                    
                    // Local fallback response
                    this.addMessageToConversation('assistant', "I'm sorry, I can't connect to the server right now. Please check your connection and try again.");
                    return;
                }
            }
            
            // Process server side if we have a socket connection
            if (this.socket) {
                console.log("AI Assistant: Sending message to server for processing via socket.io");
                
                // Add a placeholder message for the assistant response
                this.addMessageToConversation('assistant', '...');
                
                // Send the message to the server
                this.socket.emit('openai-chat', { message: text });
                console.log("AI Assistant: Message sent to server successfully");
            } else {
                console.error("AI Assistant: No socket connection available for sending message");
                this.showMessage("Error: Cannot connect to the server");
                
                // Add an error message for feedback
                this.updateLastAssistantMessage("Sorry, I'm having trouble connecting to the server. Please check your connection and try again.");
            }
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
        if (!text || text.trim() === '') {
            console.log("AI Assistant: Empty text provided to speakText, ignoring");
            return;
        }

        // Don't start a new speech if one is already in progress
        if (this.isSpeaking && this.lastSpeechTimestamp && (Date.now() - this.lastSpeechTimestamp < 1000)) {
            console.log("AI Assistant: Speech already in progress, ignoring new request");
            return;
        }

        console.log("AI Assistant: Starting speech synthesis, isSpeaking = true");
        this.isSpeaking = true;
        this.lastSpeechTimestamp = Date.now();

        // Cancel any previous speech
        window.speechSynthesis.cancel();

        try {
            // Get available voices
            const voices = window.speechSynthesis.getVoices();
            console.log(`AI Assistant: Available voices: ${voices.length}`);

            if (voices.length === 0) {
                // If voices are not available yet, wait for them to load
                console.log("AI Assistant: No voices available, waiting for voices to load");
                window.speechSynthesis.onvoiceschanged = () => {
                    const voices = window.speechSynthesis.getVoices();
                    console.log(`AI Assistant: Voices loaded, now available: ${voices.length}`);
                    
                    if (voices.length > 0) {
                        window.speechSynthesis.onvoiceschanged = null; // Remove the event handler
                        this.speakTextInChunks(text, voices);
                    }
                };

                // Add a fallback timeout in case the voices never load
                setTimeout(() => {
                    if (this.isSpeaking && (!voices || voices.length === 0)) {
                        console.warn("AI Assistant: Voices never loaded, using default voice");
                        // Just try to speak with default voice
                        this.speakTextInChunks(text, []);
                    }
                }, 3000);
            } else {
                this.speakTextInChunks(text, voices);
            }
        } catch (error) {
            console.error('Error with speech synthesis:', error);
            this.isSpeaking = false;
            this.lastSpeechTimestamp = null;
            
            // Show message to user
            this.showMessage("Speech synthesis failed. Please try again.");
        }
    }

    // New method to speak text in chunks
    speakTextInChunks(text, voices) {
        // Split text into sentences and then into manageable chunks
        const sentenceBreakers = ['.', '!', '?', ':', ';', '\n'];
        let sentences = [];
        let currentSentence = '';
        
        // Split by sentence to maintain natural pauses
        for (let i = 0; i < text.length; i++) {
            currentSentence += text[i];
            
            if (sentenceBreakers.includes(text[i]) && 
                (i + 1 === text.length || text[i+1] === ' ' || text[i+1] === '\n')) {
                sentences.push(currentSentence);
                currentSentence = '';
            }
        }
        
        // Add any remaining text
        if (currentSentence) {
            sentences.push(currentSentence);
        }
        
        // Group sentences into chunks (100-150 characters is a good size)
        const maxChunkLength = 150;
        let chunks = [];
        let currentChunk = '';
        
        for (let sentence of sentences) {
            // If adding this sentence would make the chunk too long, start a new chunk
            if (currentChunk.length + sentence.length > maxChunkLength && currentChunk.length > 0) {
                chunks.push(currentChunk);
                currentChunk = sentence;
            } else {
                currentChunk += sentence;
            }
        }
        
        // Add the final chunk
        if (currentChunk) {
            chunks.push(currentChunk);
        }
        
        console.log(`AI Assistant: Split text into ${chunks.length} chunks for speaking`);
        
        // Speak each chunk sequentially
        this.speakChunks(chunks, 0, voices);
    }

    // Helper method to speak chunks one after another
    speakChunks(chunks, index, voices) {
        if (index >= chunks.length) {
            console.log("AI Assistant: Finished speaking all chunks");
            this.isSpeaking = false;
            this.lastSpeechTimestamp = null;
            return;
        }
        
        const chunk = chunks[index];
        console.log(`AI Assistant: Speaking chunk ${index+1}/${chunks.length}: ${chunk.substring(0, 30)}...`);
        
        const utterance = new SpeechSynthesisUtterance(chunk);
        
        // Set voice
        if (voices && voices.length > 0) {
            this.setVoiceForUtterance(utterance, voices);
        }
        
        // Events
        utterance.onend = () => {
            console.log(`AI Assistant: Chunk ${index+1} finished speaking`);
            // Speak next chunk after a slight pause
            setTimeout(() => {
                this.speakChunks(chunks, index + 1, voices);
            }, 100);
        };
        
        utterance.onerror = (event) => {
            console.log(`AI Assistant: Error speaking chunk ${index+1}: ${event.error}`);
            // Try to continue with next chunk anyway
            setTimeout(() => {
                this.speakChunks(chunks, index + 1, voices);
            }, 100);
        };
        
        // Speak this chunk
        window.speechSynthesis.speak(utterance);
    }

    // Helper method to set voice for utterance
    setVoiceForUtterance(utterance, voices) {
        // Log all voices for debugging
        voices.forEach((voice, i) => {
            console.log(`Voice ${i}: ${voice.name} - ${voice.lang} (${voice.voiceURI})`);
        });
        
        // Try to find Google UK Female voice first (best quality)
        let selectedVoice = voices.find(voice => 
            voice.name === 'Google UK English Female'
        );
        
        // If not found, try other Google voices
        if (!selectedVoice) {
            selectedVoice = voices.find(voice => 
                voice.name === 'Google US English' || 
                voice.name === 'Google UK English Male'
            );
        }
        
        // If still not found, try any female English voice
        if (!selectedVoice) {
            selectedVoice = voices.find(voice => 
                voice.lang.includes('en') && 
                (voice.name.includes('Female') || voice.name.includes('Zira'))
            );
        }
        
        // If still not found, try any English voice
        if (!selectedVoice) {
            selectedVoice = voices.find(voice => voice.lang.includes('en'));
        }
        
        // If all else fails, use the first voice
        if (!selectedVoice && voices.length > 0) {
            selectedVoice = voices[0];
        }
        
        if (selectedVoice) {
            console.log(`AI Assistant: Selected voice: ${selectedVoice.name}`);
            utterance.voice = selectedVoice;
        } else {
            console.warn("AI Assistant: No suitable voice found");
        }
        
        // Set other properties for better quality
        utterance.rate = 1.0;  // Normal speed
        utterance.pitch = 1.0; // Normal pitch
        utterance.volume = 1.0; // Full volume
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
    
    // New method for recording audio for OpenAI's API
    startAudioRecording() {
        console.log("AI Assistant: Starting audio recording for realtime mode");
        this.isListening = true;
        this.showRecognitionStatus("Listening...");
        
        // Reset recorded chunks
        this.recordedChunks = [];
        
        // Get audio stream
        navigator.mediaDevices.getUserMedia({ audio: true })
            .then(stream => {
                this.audioStream = stream;
                
                try {
                    // Create media recorder with appropriate mime type
                    const options = { mimeType: 'audio/webm' };
                    this.mediaRecorder = new MediaRecorder(stream, options);
                    
                    // Listen for data available events
                    this.mediaRecorder.ondataavailable = (event) => {
                        if (event.data.size > 0) {
                            this.recordedChunks.push(event.data);
                        }
                    };
                    
                    // When recording stops, send the audio to the server
                    this.mediaRecorder.onstop = () => {
                        this.sendAudioToServer();
                    };
                    
                    // Start recording - collect data every 1 second
                    this.mediaRecorder.start(1000);
                    console.log("AI Assistant: Media recorder started successfully");
                } catch (error) {
                    console.error("AI Assistant: Error creating MediaRecorder:", error);
                    this.isListening = false;
                    this.showMessage("Error recording audio: " + error.message);
                    
                    // Clean up the stream
                    if (this.audioStream) {
                        this.audioStream.getTracks().forEach(track => track.stop());
                        this.audioStream = null;
                    }
                }
            })
            .catch(error => {
                console.error("AI Assistant: Error accessing microphone:", error);
                this.isListening = false;
                this.showMessage("Error accessing microphone: " + error.message);
            });
    }
    
    // New method to stop recording and send audio to server
    stopAudioRecording() {
        console.log("AI Assistant: Stopping audio recording");
        if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
            this.mediaRecorder.stop();
        }
        
        if (this.audioStream) {
            this.audioStream.getTracks().forEach(track => track.stop());
            this.audioStream = null;
        }
    }
    
    // New method to send recorded audio to the server
    sendAudioToServer() {
        if (this.recordedChunks.length === 0) {
            console.warn("AI Assistant: No audio recorded");
            this.isListening = false;
            this.showMessage("No audio recorded. Please try again.");
            return;
        }
        
        console.log("AI Assistant: Sending audio to server");
        this.showRecognitionStatus("Processing...");
        
        // If there's no socket, try to connect
        if (!this.socket) {
            const connected = this.connectToServer();
            if (!connected) {
                console.warn("AI Assistant: Cannot use realtime mode without server connection");
                this.isRealtimeMode = false;
                this.showMessage("Switched to traditional mode - server connection not available");
                
                // Clean up
                this.isListening = false;
                this.recordedChunks = [];
                return;
            }
        }
        
        try {
            // Convert recorded chunks to a blob
            let audioBlob;
            try {
                audioBlob = new Blob(this.recordedChunks, { type: 'audio/webm' });
            } catch (e) {
                console.error("AI Assistant: Error creating audio blob:", e);
                // Try a different MIME type as fallback
                audioBlob = new Blob(this.recordedChunks, { type: 'audio/ogg; codecs=opus' });
            }
            
            // Convert blob to base64
            const reader = new FileReader();
            reader.onloadend = () => {
                try {
                    const base64Audio = reader.result;
                    
                    // Add a placeholder message for the assistant's response
                    this.addMessageToConversation('user', '...');
                    
                    // Send to server via socket.io - use the audio streaming endpoint
                    if (this.socket) {
                        // Send just the base64 string, not an object
                        this.socket.emit('openai-audio-stream', base64Audio);
                        console.log("AI Assistant: Audio sent to server for realtime streaming");
                        
                        // Reset status
                        this.isListening = false;
                        this.recordedChunks = [];
                    } else {
                        console.error("AI Assistant: No socket available to send audio");
                        this.showMessage("Error: Cannot connect to server");
                        this.isListening = false;
                        this.recordedChunks = [];
                    }
                } catch (e) {
                    console.error("AI Assistant: Error sending audio to server:", e);
                    this.showMessage("Error sending audio. Please try again.");
                    this.isListening = false;
                    this.recordedChunks = [];
                }
            };
            
            reader.readAsDataURL(audioBlob);
        } catch (e) {
            console.error("AI Assistant: Error processing audio:", e);
            this.showMessage("Error processing audio. Please try again.");
            this.isListening = false;
            this.recordedChunks = [];
        }
    }
    
    // New method to play audio from OpenAI
    playOpenAIAudio(audioBase64) {
        console.log("AI Assistant: Playing OpenAI generated audio");
        this.isSpeaking = true;
        
        // Play the audio
        this.audioPlayer.src = audioBase64;
        
        // Set up event listeners
        this.audioPlayer.onplay = () => {
            console.log("AI Assistant: OpenAI audio playback started");
        };
        
        this.audioPlayer.onended = () => {
            console.log("AI Assistant: OpenAI audio playback ended");
            this.isSpeaking = false;
        };
        
        this.audioPlayer.onerror = (e) => {
            console.error("AI Assistant: Error playing OpenAI audio:", e);
            this.isSpeaking = false;
        };
        
        // Start playback
        this.audioPlayer.play().catch(error => {
            console.error("AI Assistant: Failed to play audio:", error);
            this.isSpeaking = false;
            
            // Try to autoplay by adding a user interaction event listener
            const resumeAudio = () => {
                this.audioPlayer.play();
                document.removeEventListener('click', resumeAudio);
            };
            document.addEventListener('click', resumeAudio);
        });
    }
    
    // Add a toggle method to switch between realtime and traditional modes
    toggleRealtimeMode() {
        // Make sure any ongoing processes are stopped
        if (this.isListening) {
            if (this.isRealtimeMode) {
                this.stopAudioRecording();
            } else if (this.recognition) {
                try {
                    this.recognition.stop();
                } catch (e) {
                    console.error("AI Assistant: Error stopping recognition:", e);
                }
            }
            this.isListening = false;
        }
        
        if (this.isSpeaking) {
            // Stop any ongoing speech
            if (window.speechSynthesis) {
                window.speechSynthesis.cancel();
            }
            
            if (this.audioPlayer) {
                this.audioPlayer.pause();
                this.audioPlayer.currentTime = 0;
            }
            this.isSpeaking = false;
        }
        
        // Toggle the mode
        this.isRealtimeMode = !this.isRealtimeMode;
        console.log(`AI Assistant: Switched to ${this.isRealtimeMode ? 'realtime' : 'traditional'} mode`);
        
        const modeMessage = this.isRealtimeMode 
            ? "Switched to OpenAI realtime voice mode" 
            : "Switched to traditional voice mode";
        this.showMessage(modeMessage);
        
        // If we're in traditional mode, make sure speech recognition is initialized
        if (!this.isRealtimeMode && !this.recognition) {
            this.initSpeechRecognition();
        }
        
        return this.isRealtimeMode;
    }
    
    // New method to check speech compatibility
    checkSpeechCompatibility() {
        // Check Web Speech API support
        const speechRecognitionSupported = 'webkitSpeechRecognition' in window || 'SpeechRecognition' in window;
        console.log(`AI Assistant: Speech recognition is ${speechRecognitionSupported ? 'supported' : 'not supported'}`);
        
        // Check MediaRecorder support (for realtime mode)
        let mediaRecorderSupported = false;
        try {
            mediaRecorderSupported = 'MediaRecorder' in window;
        } catch (e) {
            console.error("AI Assistant: Error checking MediaRecorder support:", e);
        }
        console.log(`AI Assistant: MediaRecorder is ${mediaRecorderSupported ? 'supported' : 'not supported'}`);
        
        // Initialize speech recognition if supported
        if (speechRecognitionSupported) {
            this.initSpeechRecognition();
        }
        
        // Set initial mode based on compatibility
        this.isRealtimeMode = mediaRecorderSupported && speechRecognitionSupported;
    }
    
    // Add a method to connect to the socket manually
    connectToServer() {
        // If we already have a socket, don't reconnect
        if (this.socket) {
            console.log("AI Assistant: Already connected to server");
            return;
        }
        
        console.log("AI Assistant: Attempting to connect to server manually");
        try {
            // Try to connect to the server
            const socketIo = window.io || io;
            if (socketIo) {
                this.socket = socketIo();
                console.log("AI Assistant: Connected to server manually");
                
                // Set up socket listeners
                this.setupSocketListeners();
                
                // Mark as initialized with server-side processing
                this.useServerSide = true;
                this.isInitialized = true;
                
                return true;
            }
        } catch (error) {
            console.error("AI Assistant: Failed to connect to server manually:", error);
        }
        
        console.error("AI Assistant: Could not connect to server, socket.io not available");
        return false;
    }
} 