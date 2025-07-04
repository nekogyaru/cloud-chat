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
