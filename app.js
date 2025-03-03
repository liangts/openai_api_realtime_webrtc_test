document.addEventListener('DOMContentLoaded', () => {
    // DOM elements
    const startButton = document.getElementById('startButton');
    const stopButton = document.getElementById('stopButton');
    const muteButton = document.getElementById('muteButton');
    const apiKeyInput = document.getElementById('apiKey');
    const modelSelect = document.getElementById('modelSelect');
    const promptText = document.getElementById('promptText');
    const sendPromptButton = document.getElementById('sendPromptButton');
    const chatHistory = document.getElementById('chatHistory');
    const connectionStatusValue = document.querySelector('#connectionStatus .status-value');
    const audioStatusValue = document.querySelector('#audioStatus .status-value');

    // WebRTC variables
    let peerConnection = null;
    let dataChannel = null;
    let localStream = null;
    let remoteStream = new MediaStream();
    let audioElement = null;
    let isMuted = false;
    let ephemeralKey = '';
    let sessionDetails = null;
    let audioContext = null;
    let audioProcessor = null;
    let microphone = null;
    let isRecording = false;
    let lastItemId = null;
    
    // Transcription state tracking
    const transcriptionElements = new Map(); // To track transcription elements by item ID
    let currentTranscriptItemId = null;      // Current item being transcribed

    // Audio state tracking
    let isAudioPlaying = false;
    let audioActivityTimeout = null;

    // Initialize audio element
    function initAudio() {
        audioElement = document.createElement('audio');
        audioElement.autoplay = true;
        document.body.appendChild(audioElement);
        
        // Add event listeners to track audio playback state
        audioElement.onplaying = () => {
            console.log('Audio playback started');
            updateStatus(undefined, true);
            isAudioPlaying = true;
        };
        
        audioElement.onpause = audioElement.onended = () => {
            console.log('Audio playback stopped');
            updateStatus(undefined, false);
            isAudioPlaying = false;
        };
    }

    // Update UI status indicators
    function updateStatus(connected, audioActive) {
        if (connected !== undefined) {
            connectionStatusValue.textContent = connected ? 'Connected' : 'Not Connected';
            connectionStatusValue.className = `status-value ${connected ? 'connected' : ''}`;
            startButton.disabled = connected;
            stopButton.disabled = !connected;
            muteButton.disabled = !connected;
            sendPromptButton.disabled = !connected;
        }

        if (audioActive !== undefined) {
            audioStatusValue.textContent = audioActive ? 'Active' : 'Inactive';
            audioStatusValue.className = `status-value ${audioActive ? 'connected' : ''}`;
        }
    }

    // Add message to chat history with optional labeling
    function addMessageToChat(text, isUser = false, isTranscription = false, itemId = null) {
        // If this is a transcription update, try to update existing message
        if (isTranscription && itemId && transcriptionElements.has(itemId)) {
            const existingElement = transcriptionElements.get(itemId);
            existingElement.textContent = text;
            console.log(`Updated transcription for ${itemId}:`, text);
            chatHistory.scrollTop = chatHistory.scrollHeight;
            return;
        }
        
        const messageElement = document.createElement('div');
        messageElement.className = `message ${isUser ? 'user-message' : 'ai-message'}`;
        
        // If it's a transcription, add a label
        if (isTranscription) {
            const label = document.createElement('div');
            label.className = 'transcription-label';
            label.textContent = isUser ? '🎤 Your Speech' : '🔊 AI Speech';
            messageElement.appendChild(label);
            console.log(`Added new transcription for ${isUser ? 'user' : 'AI'}${itemId ? ' with ID: ' + itemId : ''}:`, text);
        }
        
        const textContent = document.createElement('div');
        textContent.className = isTranscription ? 'transcription-text' : 'message-text';
        textContent.textContent = text;
        messageElement.appendChild(textContent);
        
        chatHistory.appendChild(messageElement);
        chatHistory.scrollTop = chatHistory.scrollHeight;
        
        // Store reference for transcription updates
        if (isTranscription && itemId) {
            transcriptionElements.set(itemId, textContent);
            currentTranscriptItemId = itemId;
        }
    }

    // Get session with ephemeral token from server
    async function getSession() {
        try {
            const apiKey = apiKeyInput.value.trim();
            if (!apiKey) {
                alert('Please enter your OpenAI API key');
                return null;
            }

            const model = modelSelect.value;
            
            const response = await fetch(`${config.serverUrl}/session`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ 
                    api_key: apiKey,
                    model: model,
                    voice: 'verse'  // Default voice
                })
            });

            if (!response.ok) {
                throw new Error(`Server error: ${response.status}`);
            }

            const data = await response.json();
            console.log('Session data received:', data);
            
            if (!data.client_secret || !data.client_secret.value) {
                throw new Error('Invalid session data received');
            }
            
            return data;
        } catch (error) {
            console.error('Error getting session:', error);
            alert('Failed to get session: ' + error.message);
            return null;
        }
    }

    // Initialize audio processing for microphone input
    function initAudioProcessor() {
        try {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
            
            // Create a ScriptProcessorNode (though it's deprecated, it's simple for this example)
            // In a production app, consider using AudioWorklet instead
            const bufferSize = 4096;
            audioProcessor = audioContext.createScriptProcessor(bufferSize, 1, 1);
            
            // Connect microphone to the processor
            microphone = audioContext.createMediaStreamSource(localStream);
            microphone.connect(audioProcessor);
            audioProcessor.connect(audioContext.destination);
            
            // Process audio data
            audioProcessor.onaudioprocess = (e) => {
                if (!isRecording || !dataChannel || dataChannel.readyState !== 'open') return;
                
                // Get audio data from the input channel
                const inputData = e.inputBuffer.getChannelData(0);
                
                // Check if there's actual audio (not just silence)
                const isActualAudio = detectAudio(inputData);
                if (isActualAudio) {
                    // Show temporary audio activity indicator
                    showTemporaryAudioActivity();
                }
                
                // Convert to 16-bit PCM (what the API expects for pcm16 format)
                const pcmData = convertFloatToPCM16(inputData);
                
                // Send audio data to OpenAI
                sendAudioData(pcmData);
            };
            
            console.log('Audio processor initialized');
        } catch (error) {
            console.error('Error initializing audio processor:', error);
        }
    }
    
    // Detect if there's actual audio (not just silence)
    function detectAudio(audioData) {
        // Simple RMS (Root Mean Square) calculation to detect audio level
        let sum = 0;
        for (let i = 0; i < audioData.length; i++) {
            sum += audioData[i] * audioData[i];
        }
        const rms = Math.sqrt(sum / audioData.length);
        
        // Return true if the RMS is above a threshold (adjust as needed)
        return rms > 0.01; // Typical threshold for non-silence
    }
    
    // Show temporary audio activity indicator
    function showTemporaryAudioActivity() {
        // If we're not already showing activity, update the UI
        if (!isAudioPlaying) {
            updateStatus(undefined, true);
        }
        
        // Clear any existing timeout
        if (audioActivityTimeout) {
            clearTimeout(audioActivityTimeout);
        }
        
        // Set a new timeout to turn off the indicator after a delay
        audioActivityTimeout = setTimeout(() => {
            // Only turn off if we're not in an actual playback state
            if (!isAudioPlaying) {
                updateStatus(undefined, false);
            }
        }, 1000); // Keep indicator active for 1 second after last activity
    }
    
    // Convert Float32Array to Int16Array for PCM16 format
    function convertFloatToPCM16(float32Array) {
        const int16Array = new Int16Array(float32Array.length);
        for (let i = 0; i < float32Array.length; i++) {
            // Convert from [-1.0, 1.0] to [-32768, 32767]
            const s = Math.max(-1, Math.min(1, float32Array[i]));
            int16Array[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }
        return int16Array;
    }
    
    // Send audio data to OpenAI via WebRTC data channel
    function sendAudioData(audioData) {
        if (!dataChannel || dataChannel.readyState !== 'open') return;
        
        // Convert to base64
        const audioBlob = new Blob([audioData], { type: 'audio/pcm' });
        const reader = new FileReader();
        
        reader.onload = () => {
            const base64Audio = reader.result.split(',')[1]; // Get the base64 part
            
            // Send as input_audio_buffer.append event
            const audioEvent = {
                "event_id": `event_${Date.now()}`,
                "type": "input_audio_buffer.append",
                "audio": base64Audio
            };
            
            try {
                dataChannel.send(JSON.stringify(audioEvent));
            } catch (error) {
                console.error('Error sending audio data:', error);
            }
        };
        
        reader.readAsDataURL(audioBlob);
    }
    
    // Toggle recording state
    function toggleRecording(start) {
        isRecording = start;
        
        if (!start && dataChannel && dataChannel.readyState === 'open') {
            // When stopping recording, commit the audio buffer
            const commitEvent = {
                "event_id": `event_${Date.now()}`,
                "type": "input_audio_buffer.commit"
            };
            
            try {
                dataChannel.send(JSON.stringify(commitEvent));
                console.log('Committed audio buffer, awaiting transcription...');
            } catch (error) {
                console.error('Error committing audio buffer:', error);
            }
        }
    }

    // Set up WebRTC connection
    async function setupWebRTC() {
        try {
            // Get session first
            sessionDetails = await getSession();
            if (!sessionDetails) {
                return;
            }
            
            // Extract the ephemeral key
            ephemeralKey = sessionDetails.client_secret.value;
            
            // Get user media (microphone)
            localStream = await navigator.mediaDevices.getUserMedia({ 
                audio: config.audioConstraints,
                video: false
            });
            
            // Create RTCPeerConnection
            peerConnection = new RTCPeerConnection({
                iceServers: config.iceServers
            });
            
            // Add local stream tracks to peer connection
            localStream.getTracks().forEach(track => {
                peerConnection.addTrack(track, localStream);
            });
            
            // Initialize audio element for output
            initAudio();
            
            // Initialize audio processing for input
            initAudioProcessor();
            
            // Handle incoming tracks
            peerConnection.ontrack = (event) => {
                console.log('Received remote track');
                audioElement.srcObject = event.streams[0];
                updateStatus(undefined, true);
            };
            
            // Create data channel for events
            dataChannel = peerConnection.createDataChannel("oai-events");
            dataChannel.onopen = () => {
                console.log('Data channel opened');
                // Send initial session update to configure
                sendSessionUpdate();
            };
            dataChannel.onclose = () => console.log('Data channel closed');
            dataChannel.onmessage = handleDataChannelMessage;
            
            // Listen for ICE candidates
            peerConnection.onicecandidate = event => {
                if (event.candidate) {
                    console.log('ICE candidate:', event.candidate);
                }
            };
            
            // Listen for connection state changes
            peerConnection.onconnectionstatechange = () => {
                console.log('Connection state:', peerConnection.connectionState);
                if (peerConnection.connectionState === 'connected') {
                    updateStatus(true, false);
                } else if (peerConnection.connectionState === 'disconnected' || 
                          peerConnection.connectionState === 'failed') {
                    updateStatus(false, false);
                    toggleRecording(false);
                }
            };
            
            // Create and set local description
            const offer = await peerConnection.createOffer();
            await peerConnection.setLocalDescription(offer);
            
            // Initialize WebRTC connection with OpenAI
            await connectToOpenAI(offer);

        } catch (error) {
            console.error('Error setting up WebRTC:', error);
            updateStatus(false, false);
            alert('Error connecting: ' + error.message);
        }
    }

    // Send initial session update
    function sendSessionUpdate() {
        if (!dataChannel || dataChannel.readyState !== 'open') return;
        
        const sessionUpdate = {
            "event_id": `event_${Date.now()}`,
            "type": "session.update",
            "session": {
                "modalities": ["text", "audio"],
                "instructions": "You are a helpful assistant. Respond with text and audio.",
                "voice": "verse",
                "input_audio_format": "pcm16",
                "output_audio_format": "pcm16",
                "input_audio_transcription": {
                    "model": "whisper-1"  // Explicitly specify transcription model
                },
                "turn_detection": {
                    "type": "server_vad", 
                    "threshold": 0.5,
                    "silence_duration_ms": 500,
                    "create_response": true
                }
            }
        };
        
        try {
            dataChannel.send(JSON.stringify(sessionUpdate));
            console.log('Sent session update with transcription model specified');
        } catch (error) {
            console.error('Error sending session update:', error);
        }
    }

    // Connect to OpenAI API
    async function connectToOpenAI(offer) {
        try {
            const model = modelSelect.value;
            const url = `${config.realtimeUrl}?model=${model}`;
            
            console.log('Connecting to OpenAI Realtime API with model:', model);
            
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${ephemeralKey}`,
                    'Content-Type': 'application/sdp'
                },
                body: offer.sdp
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Failed to connect: ${response.status} - ${errorText}`);
            }

            const sdpAnswer = await response.text();
            const remoteDesc = new RTCSessionDescription({
                type: 'answer',
                sdp: sdpAnswer
            });

            await peerConnection.setRemoteDescription(remoteDesc);
            console.log('Connected to OpenAI Realtime server');

        } catch (error) {
            console.error('Error connecting to OpenAI:', error);
            updateStatus(false, false);
            alert('Error connecting to OpenAI: ' + error.message);
        }
    }

    // Handle data channel messages from OpenAI
    function handleDataChannelMessage(event) {
        try {
            const data = event.data;
            console.log('Received message:', data);
            
            try {
                const message = JSON.parse(data);
                
                // Handle different event types from server
                switch (message.type) {
                    case 'session.created':
                    case 'session.updated':
                        console.log(`Session ${message.type.split('.')[1]}:`, message.session);
                        break;
                        
                    case 'conversation.item.created':
                        if (message.item && message.item.id) {
                            lastItemId = message.item.id;
                            console.log('New conversation item:', message.item);
                            
                            // Check if this is a user message with audio content
                            if (message.item.role === 'user' && message.item.content && message.item.content.length > 0) {
                                const contentItem = message.item.content[0];
                                // Display user transcript if it's available in the message
                                if (contentItem.type === 'input_audio' && contentItem.transcript) {
                                    console.log('Found transcript in conversation item creation:', contentItem.transcript);
                                    addMessageToChat(contentItem.transcript, true, true, message.item.id);
                                } else if (contentItem.type === 'input_audio') {
                                    // If there's no transcript yet but it's an audio message, add a placeholder
                                    console.log('Audio message created, waiting for transcription...');
                                    addMessageToChat("Transcribing...", true, true, message.item.id);
                                }
                            }
                        }
                        break;
                        
                    case 'conversation.item.input_audio_transcription.completed':
                        // This is sent when the server completes transcription of user audio
                        console.log('Received transcription completed event:', message);
                        if (message.transcript && message.item_id) {
                            console.log('Got user transcription:', message.transcript);
                            addMessageToChat(message.transcript, true, true, message.item_id);
                        }
                        break;
                        
                    case 'input_audio_buffer.committed':
                        console.log('Audio buffer committed:', message);
                        if (message.item_id) {
                            console.log('Audio will create item with ID:', message.item_id);
                        }
                        break;
                        
                    case 'response.text.delta':
                        if (message.delta) {
                            // Regular text message (not transcription)
                            addMessageToChat(message.delta, false, false);
                        }
                        break;
                        
                    case 'response.audio_transcript.delta':
                        // Handle incremental transcription of AI speech
                        if (message.delta && message.item_id) {
                            if (!transcriptionElements.has(message.item_id)) {
                                console.log('New AI transcription started:', message.delta);
                                addMessageToChat(message.delta, false, true, message.item_id);
                            } else {
                                const element = transcriptionElements.get(message.item_id);
                                element.textContent += message.delta;
                                chatHistory.scrollTop = chatHistory.scrollHeight;
                            }
                        }
                        break;
                        
                    case 'response.audio_transcript.done':
                        // We could replace the incremental version with final if needed
                        if (message.transcript && message.item_id) {
                            console.log('Final AI transcription:', message.transcript);
                        }
                        break;
                        
                    case 'response.created':
                        console.log('Response created:', message.response);
                        break;
                        
                    case 'response.done':
                        console.log('Response completed:', message.response);
                        break;
                        
                    case 'input_audio_buffer.speech_started':
                        console.log('Speech detected in input audio');
                        // Add UI indicator that speech is being detected
                        document.body.classList.add('speech-active');
                        break;
                        
                    case 'input_audio_buffer.speech_stopped':
                        console.log('Speech ended in input audio');
                        document.body.classList.remove('speech-active');
                        break;
                       
                    case 'error':
                        console.error('Error from OpenAI:', message.error);
                        addMessageToChat(`Error: ${message.error?.message || 'Unknown error'}`, false);
                        break;
                        
                    case 'response.audio.delta':
                        // When we start receiving audio data, show the audio indicator
                        showTemporaryAudioActivity();
                        break;
                        
                    default:
                        // Log other events but don't handle specially
                        console.log(`Received ${message.type} event:`, message);
                }
                
            } catch (e) {
                console.error('Error parsing message:', e);
            }
        } catch (error) {
            console.error('Error handling data channel message:', error);
        }
    }

    // Send text message to OpenAI through data channel
    function sendMessage(message) {
        if (dataChannel && dataChannel.readyState === 'open') {
            // Create new conversation item with text message
            const conversationEvent = {
                "event_id": `event_${Date.now()}`,
                "type": "conversation.item.create",
                "previous_item_id": lastItemId,
                "item": {
                    "id": `msg_${Date.now()}`,
                    "type": "message",
                    "role": "user",
                    "content": [
                        {
                            "type": "input_text",
                            "text": message
                        }
                    ]
                }
            };
            
            try {
                dataChannel.send(JSON.stringify(conversationEvent));
                addMessageToChat(message, true);
                
                // Request a response after sending message
                setTimeout(() => {
                    const responseEvent = {
                        "event_id": `event_${Date.now() + 100}`,
                        "type": "response.create",
                        "response": {
                            "modalities": ["text", "audio"],
                            "voice": "verse"
                        }
                    };
                    dataChannel.send(JSON.stringify(responseEvent));
                }, 500);
                
            } catch (error) {
                console.error('Error sending message:', error);
                alert('Error sending message: ' + error.message);
            }
        } else {
            console.error('Data channel not open');
            alert('Connection not ready. Please try again.');
        }
    }

    // Start connection
    startButton.addEventListener('click', async () => {
        await setupWebRTC();
    });

    // Stop connection
    stopButton.addEventListener('click', () => {
        if (audioActivityTimeout) {
            clearTimeout(audioActivityTimeout);
            audioActivityTimeout = null;
        }
        
        if (audioProcessor) {
            audioProcessor.disconnect();
            audioProcessor = null;
        }
        
        if (microphone) {
            microphone.disconnect();
            microphone = null;
        }
        
        if (audioContext) {
            audioContext.close();
            audioContext = null;
        }
        
        if (peerConnection) {
            peerConnection.close();
        }
        
        if (localStream) {
            localStream.getTracks().forEach(track => track.stop());
        }
        
        peerConnection = null;
        dataChannel = null;
        localStream = null;
        isRecording = false;
        isAudioPlaying = false;
        updateStatus(false, false);
    });

    // Toggle mute
    muteButton.addEventListener('click', () => {
        if (localStream) {
            isMuted = !isMuted;
            
            if (isMuted) {
                toggleRecording(false);
                muteButton.textContent = 'Unmute Microphone';
            } else {
                toggleRecording(true);
                muteButton.textContent = 'Mute Microphone';
                console.log('Microphone enabled, recording started');
            }
            
            localStream.getAudioTracks().forEach(track => {
                track.enabled = !isMuted;
            });
        }
    });

    // Send prompt
    sendPromptButton.addEventListener('click', () => {
        const message = promptText.value.trim();
        if (message) {
            sendMessage(message);
            promptText.value = '';
        }
    });

    // Send prompt on Enter key (with shift+enter for new line)
    promptText.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendPromptButton.click();
        }
    });

    // Initialize UI
    updateStatus(false, false);
});
