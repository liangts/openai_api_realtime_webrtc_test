const config = {
    // OpenAI API endpoints
    apiBaseUrl: 'https://api.openai.com/v1',
    realtimeUrl: 'https://api.openai.com/v1/realtime',
    
    // Server endpoint for generating ephemeral keys
    serverUrl: 'http://localhost:3000',
    
    // WebRTC configuration
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
    ],
    
    // Audio settings
    audioConstraints: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
    },
    
    // Default prompt for initial conversation
    defaultPrompt: "Hello, I'm testing the OpenAI real-time API. Can you respond with some audio?"
};
