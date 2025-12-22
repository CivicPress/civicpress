#!/usr/bin/env node
/**
 * Standalone Realtime Server
 *
 * Runs the realtime WebSocket server without the REST API.
 * Only requires CivicPress core to be initialized.
 *
 * Usage:
 *   node standalone-realtime.mjs [dataDir]
 *
 * Environment variables:
 *   CIVIC_DATA_DIR - Path to data directory (default: ./data)
 */

// Use relative path to core dist for standalone execution
// This works when running directly with node, without requiring workspace resolution
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const workspaceRoot = join(__dirname, '../..');

// Change to workspace root BEFORE importing core
// This ensures core's fallback mechanism can find the realtime module
// Core's fallback uses process.cwd() to resolve 'modules/realtime/dist/realtime-services.js'
process.chdir(workspaceRoot);

// Use relative path to core dist (works when run directly with node)
// When run via pnpm, workspace resolution should work, but relative path is more reliable
const corePath = join(__dirname, '../../core/dist/index.js');
const { CivicPress } = await import(corePath);

const dataDir = process.env.CIVIC_DATA_DIR || process.argv[2] || './data';

// Ensure data directory exists
import fs from 'fs';
import { execSync } from 'child_process';

if (!fs.existsSync(dataDir)) {
  console.log(`📁 Creating data directory: ${dataDir}`);
  fs.mkdirSync(dataDir, { recursive: true });
}

// Ensure it's a git repository
const gitDir = `${dataDir}/.git`;
if (!fs.existsSync(gitDir)) {
  console.log(`🔧 Initializing git repository in: ${dataDir}`);
  try {
    execSync('git init', { cwd: dataDir, stdio: 'ignore' });
  } catch (error) {
    console.warn('⚠️  Warning: Failed to initialize git repository:', error.message);
  }
}

console.log('🚀 Starting standalone realtime server...');
console.log(`   Data directory: ${dataDir}`);
console.log('');

const civicPress = new CivicPress({
  dataDir,
  logger: {
    verbose: true,
  },
});

// Ensure realtime is enabled (override any env var that might disable it)
process.env.CIVIC_REALTIME_ENABLED = 'true';

// Initialize CivicPress (this will also initialize realtime server)
let isShuttingDown = false;
let isInitialized = false;

civicPress
  .initialize()
  .then(() => {
    isInitialized = true;
    console.log('');
    console.log('✅ CivicPress initialized');
    console.log('✅ Realtime WebSocket server should be running on port 3001');
    console.log('');
    console.log('📡 Connect to: ws://localhost:3001/realtime/records/:recordId');
    console.log('   Secure methods (recommended):');
    console.log('   - Subprotocol: new WebSocket(url, [`auth.${token}`])');
    console.log('   - Header: new WebSocket(url, { headers: { Authorization: `Bearer ${token}` } })');
    console.log('   Deprecated: ?token=... (query string - kept for backward compatibility)');
    console.log('');
    console.log('Press Ctrl+C to stop...');
    console.log('');
    
    // Verify server is actually running (wait longer for initialization)
    setTimeout(async () => {
      try {
        const net = await import('net');
        const client = net.createConnection({ port: 3001, host: 'localhost' }, () => {
          console.log('✅ Verified: WebSocket server is listening on port 3001');
          client.destroy();
        });
        client.on('error', (err) => {
          console.error('❌ Warning: Cannot connect to port 3001:', err.message);
          console.error('   The server may not be running properly');
          console.error('   Check logs above for initialization errors');
        });
        // Set timeout for connection attempt
        client.setTimeout(2000);
        client.on('timeout', () => {
          console.error('❌ Warning: Connection timeout - server may not be listening');
          client.destroy();
        });
      } catch (error) {
        console.warn('⚠️  Could not verify server connection:', error.message);
      }
    }, 2000); // Wait 2 seconds for server to fully initialize
    
    // Keep process alive - prevent premature exit
    // The WebSocket server should keep the process alive, but we add this as a safeguard
    setInterval(() => {
      // Just keep the event loop alive
      if (isShuttingDown) {
        clearInterval();
      }
    }, 10000); // Check every 10 seconds
  })
  .catch((error) => {
    console.error('❌ Failed to initialize CivicPress:', error);
    console.error('Stack:', error.stack);
    if (!isShuttingDown) {
      // Wait a bit before exiting to see the error
      setTimeout(() => {
        process.exit(1);
      }, 1000);
    }
  });

// Graceful shutdown
const shutdown = async (signal) => {
  if (isShuttingDown) {
    return;
  }
  isShuttingDown = true;
  
  console.log('');
  console.log(`👋 Received ${signal}, shutting down...`);
  try {
    await civicPress.shutdown();
    console.log('✅ Shutdown complete');
  } catch (error) {
    console.error('❌ Error during shutdown:', error);
  }
  process.exit(0);
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// Keep process alive - prevent premature exit
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught exception:', error);
  if (!isShuttingDown) {
    shutdown('uncaughtException');
  }
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled rejection at:', promise, 'reason:', reason);
  // Don't exit on unhandled rejection - let the process continue
  // This prevents nodemon from restarting unnecessarily
});

