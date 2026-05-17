#!/usr/bin/env node
/**
 * Simple WebSocket Test Script for Realtime Module
 *
 * Usage:
 *   node test-websocket.mjs [recordId] [token]
 *
 * Or set environment variables:
 *   RECORD_ID=your-record-id TOKEN=your-token node test-websocket.mjs
 */

import WebSocket from 'ws';

const RECORD_ID = process.env.RECORD_ID || process.argv[2] || 'test-record-123';
const TOKEN = process.env.TOKEN || process.argv[3] || 'test-token';
const USE_HEADER = process.env.USE_HEADER === 'true';

// Use secure header authentication (recommended for Node.js clients)
// For browser clients, use subprotocol: new WebSocket(url, ['auth.' + token])
const WS_URL = `ws://localhost:3001/realtime/records/${RECORD_ID}`;

console.log('🔌 Connecting to realtime server...');
console.log(`   URL: ${WS_URL}`);
console.log(`   Record ID: ${RECORD_ID}`);
console.log(`   Auth method: ${USE_HEADER ? 'Authorization header (secure)' : 'Subprotocol (secure)'}`);
console.log('');

// Use Authorization header for Node.js clients (most secure)
const ws = USE_HEADER
  ? new WebSocket(WS_URL, {
      headers: {
        Authorization: `Bearer ${TOKEN}`,
      },
    })
  : new WebSocket(WS_URL, [`auth.${TOKEN}`]); // Subprotocol method (browser-compatible)

ws.on('open', () => {
  console.log('✅ Connected to realtime server');
  console.log('');

  // Send ping after 1 second
  setTimeout(() => {
    console.log('📤 Sending ping...');
    ws.send(JSON.stringify({ type: 'ping' }));
  }, 1000);

  // Send a test sync message after 2 seconds
  setTimeout(() => {
    console.log('📤 Sending test sync message...');
    // Note: This is a placeholder - actual yjs updates need proper encoding
    ws.send(
      JSON.stringify({
        type: 'sync',
        update: Buffer.from('test').toString('base64'),
      })
    );
  }, 2000);
});

ws.on('message', (data) => {
  try {
    const message = JSON.parse(data.toString());
    console.log('📥 Received message:', JSON.stringify(message, null, 2));
    console.log('');

    if (message.type === 'control' && message.event === 'room_state') {
      console.log('🏠 Room State:');
      console.log(`   Room ID: ${message.room?.id}`);
      console.log(`   Version: ${message.room?.version}`);
      console.log(`   Participants: ${message.room?.participants?.length || 0}`);
      if (message.room?.participants?.length > 0) {
        message.room.participants.forEach((p, i) => {
          console.log(`     ${i + 1}. ${p.name} (${p.id})`);
        });
      }
      console.log('');
    }

    if (message.type === 'pong') {
      console.log('🏓 Received pong response');
      console.log('');
    }

    if (message.type === 'presence') {
      console.log(`👤 Presence: ${message.event} - ${message.user?.name}`);
      console.log('');
    }
  } catch (error) {
    console.error('❌ Failed to parse message:', error);
    console.log('Raw data:', data.toString());
  }
});

ws.on('error', (error) => {
  console.error('❌ WebSocket error:', error.message);
  if (error.message.includes('ECONNREFUSED')) {
    console.error('');
    console.error('💡 Make sure:');
    console.error('   1. API server is running (pnpm run dev:api)');
    console.error('   2. Realtime module is enabled in config');
    console.error('   3. Realtime server is running on port 3001');
  }
  process.exit(1);
});

ws.on('close', (code, reason) => {
  console.log('');
  console.log(`🔌 Connection closed (code: ${code}, reason: ${reason || 'none'})`);
  process.exit(0);
});

// Keep process alive
process.on('SIGINT', () => {
  console.log('');
  console.log('👋 Closing connection...');
  ws.close();
  process.exit(0);
});

// Timeout after 10 seconds if no connection
setTimeout(() => {
  if (ws.readyState !== WebSocket.OPEN) {
    console.error('❌ Connection timeout');
    console.error('💡 Check that the realtime server is running');
    process.exit(1);
  }
}, 10000);

