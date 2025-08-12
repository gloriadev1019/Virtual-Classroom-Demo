# LiveKit Virtual Classroom Demo

This is a virtual classroom demo built with LiveKit, featuring a React client and PHP server for token generation.

## Configuration

The application is configured to use the external LiveKit sandbox server:
- **Token Server**: `https://virtual-classroom-demo-qhjbdh.sandbox.livekit.io/`
- **WebSocket Server**: `wss://virtual-classroom-demo-qhjbdh.sandbox.livekit.io/`

## Project Structure

- `application-client/` - React frontend application
- `application-server/` - PHP backend for token generation

## Getting Started

### Client Application

1. Navigate to the client directory:
   ```bash
   cd application-client
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the development server:
   ```bash
   npm start
   ```

4. Open your browser and navigate to `http://localhost:5080`

### Server Application (Optional)

The client is configured to use the external token server, but you can also run the local PHP server:

1. Navigate to the server directory:
   ```bash
   cd application-server
   ```

2. Install PHP dependencies:
   ```bash
   composer install
   ```

3. Start the PHP server:
   ```bash
   php -S localhost:6080
   ```

## Features

- Real-time video and audio communication
- Room-based chat system
- Participant management
- Modern React UI with TypeScript
- LiveKit WebRTC integration

## Technology Stack

- **Frontend**: React 18, TypeScript, Vite
- **WebRTC**: LiveKit Client SDK
- **Backend**: PHP with LiveKit Server SDK
- **Styling**: CSS with modern design

## Usage

1. Enter your participant name
2. Enter or create a room name
3. Click "Join!" to enter the virtual classroom
4. Allow camera and microphone permissions
5. Start communicating with other participants

## LiveKit Documentation

For more information about LiveKit authentication and deployment, visit the [LiveKit documentation](https://docs.livekit.io/).
