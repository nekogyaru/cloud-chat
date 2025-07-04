# CloudChat

A modern, real-time chat application built with React, PartyKit, and Cloudflare Durable Objects. Features a clean, intuitive UI with public channels, private messaging, and anonymous chat support.

## Features

- **Public Channels**: Join #General, #Random, and #Support channels for group discussions
- **Private Messaging**: Send direct messages to other users with real-time updates
- **Anonymous Chat**: Join anonymously with limited functionality
- **Real-time Updates**: Live message delivery, user online status, and unread message counters
- **Mobile Responsive**: Optimized for both desktop and mobile devices
- **Session Management**: Persistent user sessions with unique usernames
- **Modern UI**: Clean, intuitive interface with responsive design
- **Push Notifications**: Receive notifications for private messages even when offline
- **Progressive Web App**: Installable on mobile devices with app-like experience

## Tech Stack

- **Frontend**: React with TypeScript
- **Backend**: PartyKit with Cloudflare Durable Objects
- **Database**: SQLite (via Durable Object Storage)
- **Real-time**: WebSocket connections
- **Styling**: Custom CSS with responsive design

## Getting Started

1. Install dependencies:
   ```bash
   npm install
   ```

2. Run locally for development:
   ```bash
   npm run dev
   ```

3. Deploy to Cloudflare:
   ```bash
   npx wrangler deploy
   ```

## How It Works

The app uses Cloudflare Durable Objects to maintain chat state and handle real-time WebSocket connections. Each chat room is managed by a single Durable Object instance that:

- Stores messages in SQLite database
- Manages user sessions and online status
- Handles private messaging between users
- Broadcasts real-time updates to all connected clients
- Maintains unread message counters

## Development

- **Local Development**: `npm run dev` starts the development server on `http://localhost:8787`
- **Build**: The client is automatically built using esbuild when running in development mode
- **Deployment**: Use `npx wrangler deploy` to deploy to Cloudflare Workers

## Push Notifications Setup

To enable push notifications:

1. **Generate VAPID Keys**:
   ```bash
   node scripts/generate-vapid-keys.js
   ```

2. **Update Environment Variables**:
   Add the generated keys to your Cloudflare Workers environment variables:
   - `VAPID_PUBLIC_KEY`
   - `VAPID_PRIVATE_KEY`

3. **Update Client Code**:
   Replace `YOUR_VAPID_PUBLIC_KEY` in `src/client/index.tsx` with your actual public key.

4. **Deploy**:
   ```bash
   npx wrangler deploy
   ```

**Note**: Push notifications require HTTPS (provided by Cloudflare Workers) and are supported in Chrome, Firefox, and Safari on mobile devices.
