#!/usr/bin/env node
/**
 * Check Realtime Server Status
 * 
 * This script checks if the realtime server is running and listening on port 3001
 */

import net from 'net';
import { execSync } from 'child_process';

console.log('🔍 Checking Realtime Server Status...\n');

// Check if port 3001 is listening
function checkPort(port) {
  return new Promise((resolve) => {
    const client = net.createConnection({ port, host: 'localhost' }, () => {
      client.end();
      resolve(true);
    });

    client.on('error', () => {
      resolve(false);
    });

    client.setTimeout(1000, () => {
      client.destroy();
      resolve(false);
    });
  });
}

// Check process on port 3001
try {
  const result = execSync('lsof -i :3001 2>/dev/null || echo "none"', { encoding: 'utf-8' });
  if (result.trim() !== 'none' && result.trim() !== '') {
    console.log('✅ Port 3001 is in use:');
    console.log(result);
  } else {
    console.log('❌ No process found on port 3001');
  }
} catch (error) {
  console.log('❌ Could not check port 3001:', error.message);
}

// Try to connect to WebSocket port
const isListening = await checkPort(3001);
if (isListening) {
  console.log('\n✅ Realtime server appears to be listening on port 3001');
} else {
  console.log('\n❌ Realtime server is NOT listening on port 3001');
  console.log('\n💡 Troubleshooting:');
  console.log('   1. Check API server logs for "Realtime server initialized" message');
  console.log('   2. Look for errors like "Realtime server initialization failed"');
  console.log('   3. Verify realtime module is built: ls -la modules/realtime/dist/');
  console.log('   4. Restart API server: cd modules/api && pnpm run dev');
}

// Check if API server is running
try {
  const apiResult = execSync('lsof -i :3000 2>/dev/null || echo "none"', { encoding: 'utf-8' });
  if (apiResult.trim() !== 'none' && apiResult.trim() !== '') {
    console.log('\n✅ API server is running on port 3000');
  } else {
    console.log('\n⚠️  API server is NOT running on port 3000');
  }
} catch (error) {
  // Ignore
}

console.log('\n📝 To see full initialization logs, restart API server with:');
console.log('   cd modules/api && pnpm run dev 2>&1 | tee api-init.log');

