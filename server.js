const express = require('express');
const cors = require('cors');
const axios = require('axios');
const app = express();
const port = 3000;

// Enable CORS and JSON parsing
app.use(cors());
app.use(express.json());

// Endpoint to generate ephemeral tokens
app.post('/session', async (req, res) => {
    try {
        const apiKey = req.body.api_key;
        const model = req.body.model || 'gpt-4o-realtime-preview-2024-12-17';
        const voice = req.body.voice || 'verse';
        
        if (!apiKey) {
            return res.status(400).json({ error: 'API key is required' });
        }
        
        // Call OpenAI API to get a session with an ephemeral token
        const response = await axios.post(
            'https://api.openai.com/v1/realtime/sessions',
            {
                model: model,
                voice: voice
            },
            {
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json'
                }
            }
        );
        
        // Return the session data to the client
        return res.json(response.data);
        
    } catch (error) {
        console.error('Error generating session:', error.response?.data || error.message);
        
        return res.status(error.response?.status || 500).json({ 
            error: error.response?.data?.error?.message || 'Failed to generate session token' 
        });
    }
});

// Serve static files from the current directory
app.use(express.static('./'));

// Start the server
app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
    console.log(`Open http://localhost:${port}/index.html in your browser to test the WebRTC connection`);
});
