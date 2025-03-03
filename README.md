# OpenAI Real-time WebRTC Test

A simple web application to test the OpenAI Real-time WebRTC API using ephemeral tokens.

## Setup

1. Install dependencies:
   ```
   npm install
   ```

2. Start the server:
   ```
   npm start
   ```
   or
   ```
   node server.js
   ```

3. Open http://localhost:3000/index.html in your browser.

4. Enter your OpenAI API key (needs access to the Realtime API).

5. Select the model you want to use.

6. Click "Start Connection" to establish a WebRTC connection.

## How It Works

This application:

1. Creates a session with your OpenAI API key using the `/v1/realtime/sessions` endpoint
2. Uses the ephemeral token from the session to establish a WebRTC connection
3. Streams your microphone audio to the API in real-time
4. Receives AI-generated responses in real-time
5. Provides a simple chat interface to interact with the AI

## Security

- Your API key is only sent to OpenAI's servers (via your local server) to generate a temporary ephemeral token
- The ephemeral token is short-lived and has limited permissions
- This approach follows OpenAI's security recommendations for client-side applications

## Files

- `index.html`: The main web interface
- `styles.css`: Styling for the interface
- `config.js`: Configuration settings
- `app.js`: Frontend WebRTC and application logic
- `server.js`: Simple Express server to handle ephemeral token generation

## Notes

- Make sure your browser has permission to access your microphone.
- Your OpenAI API key must have access to the Realtime API.
- This is a test application and may not handle all edge cases.
