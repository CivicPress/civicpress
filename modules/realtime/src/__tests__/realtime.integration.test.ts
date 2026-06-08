/**
 * Realtime Module Integration Tests
 *
 * Tests multi-client scenarios, yjs synchronization, and reconnection handling
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { WebSocket } from 'ws';
import * as fs from 'fs/promises';
import * as fsExtra from 'fs-extra';
import * as path from 'path';
import * as os from 'os';
import { execSync } from 'child_process';
import * as yaml from 'yaml';
import type { CivicPressConfig } from '@civicpress/core';
import {
  CivicPress,
  Logger,
  HookSystem,
  AuthService,
  RecordManager,
  DatabaseService,
} from '@civicpress/core';
import { RealtimeConfigManager } from '../realtime-config-manager.js';
import { RealtimeServer } from '../realtime-server.js';
import { RoomManager } from '../rooms/room-manager.js';
import { RecordRoomHandler } from '../rooms/record-room-handler.js';
import { YjsRoom } from '../rooms/yjs-room.js';
import * as Y from 'yjs';
import * as syncProtocol from 'y-protocols/sync';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';
import { MessageType, PresenceEvent, ControlEvent } from '../types/messages.js';

const YJS_MSG_SYNC = 0;
const YJS_MSG_AWARENESS = 1;

interface YjsMessage {
  yjsType: number; // YJS_MSG_SYNC or YJS_MSG_AWARENESS
  data: Uint8Array; // raw binary message
}

interface TestClient {
  ws: WebSocket;
  clientId: string;
  userId: number;
  messages: (YjsMessage | any)[];
  connected: boolean;
}

describe('Realtime Module Integration', () => {
  // Set test timeout to 30 seconds per test
  const TEST_TIMEOUT = 30000;
  let testDir: string;
  let config: CivicPressConfig;
  let logger: Logger;
  let hookSystem: HookSystem;
  let authService: AuthService;
  let recordManager: RecordManager;
  let databaseService: DatabaseService;
  let configManager: RealtimeConfigManager;
  let realtimeServer: RealtimeServer;
  let roomManager: RoomManager;
  let civic: CivicPress;
  let serverPort: number;
  let testRecordId: string;

  beforeEach(async () => {
    // Create test directory
    testDir = await fs.mkdtemp(
      path.join(os.tmpdir(), 'civicpress-realtime-integration-')
    );
    await fs.mkdir(path.join(testDir, '.system-data'), { recursive: true });
    await fs.mkdir(path.join(testDir, '.civic'), { recursive: true });
    await fs.mkdir(path.join(testDir, 'records'), { recursive: true });

    // Copy default roles.yml FIRST, before initializing CivicPress
    // This ensures the RoleManager loads the correct config
    const defaultRolesPath = path.join(
      __dirname,
      '../../../../core/src/defaults/roles.yml'
    );
    const testRolesPath = path.join(testDir, '.civic', 'roles.yml');
    if (await fsExtra.pathExists(defaultRolesPath)) {
      await fsExtra.copy(defaultRolesPath, testRolesPath);
      // Verify the file was copied
      const copiedContent = await fs.readFile(testRolesPath, 'utf-8');
      if (!copiedContent.includes('admin:') || !copiedContent.includes("'*'")) {
        throw new Error('Failed to copy roles.yml correctly');
      }
    } else {
      throw new Error(`Default roles.yml not found at: ${defaultRolesPath}`);
    }

    // Initialize Git repository
    execSync('git init', { cwd: testDir, stdio: 'ignore' });
    execSync('git config user.name "Test User"', {
      cwd: testDir,
      stdio: 'ignore',
    });
    execSync('git config user.email "test@example.com"', {
      cwd: testDir,
      stdio: 'ignore',
    });

    // Use a random port for testing
    serverPort = 30000 + Math.floor(Math.random() * 1000);

    // Create realtime config file with test port
    const realtimeConfigPath = path.join(
      testDir,
      '.system-data',
      'realtime.yml'
    );
    const realtimeConfig = {
      realtime: {
        enabled: true,
        port: serverPort,
        host: '127.0.0.1',
        path: '/realtime',
        rooms: {
          max_rooms: 100,
          cleanup_timeout: 3600,
        },
        snapshots: {
          enabled: true,
          interval: 300,
          max_updates: 100,
          storage: 'database',
        },
        rate_limiting: {
          messages_per_second: 100, // Higher for tests
          connections_per_ip: 100,
          connections_per_user: 10,
        },
      },
    };
    await fs.writeFile(
      realtimeConfigPath,
      yaml.stringify(realtimeConfig),
      'utf8'
    );

    // Create config
    config = {
      dataDir: testDir,
      database: {
        type: 'sqlite',
        sqlite: {
          file: path.join(testDir, '.system-data', 'test.db'),
        },
      },
      logger: {
        quiet: true,
      },
    };

    // Initialize CivicPress (RoleManager will load roles.yml from testDir/.civic/roles.yml)
    civic = new CivicPress(config);
    await civic.initialize();

    // Get services
    logger = new Logger({ quiet: true });
    hookSystem = civic.getHookSystem();
    authService = civic.getAuthService();
    recordManager = civic.getRecordManager();
    databaseService = civic.getDatabaseService();

    // Force role manager to load config immediately
    const roleManager = authService.getRoleManager();
    roleManager.clearCache();
    // Trigger config load by calling a method that requires it
    await roleManager.getAvailableRoles();

    // Create test users with password hashes.
    // The password is never validated in these tests (auth uses createSession
    // directly), so a fixed bcrypt-format hash avoids a bcrypt dependency that
    // this module does not (and should not) declare. The bcrypt import here was
    // a leftover from the broadcast-box device-auth code excised in W1.
    const passwordHash =
      '$2b$12$abcdefghijklmnopqrstuuWz6Q1Z9x0y8w7v6u5t4s3r2q1p0o9n8';
    const user1 = await authService.createUserWithPassword({
      username: 'user1',
      email: 'user1@test.com',
      passwordHash,
      name: 'User 1',
      role: 'admin',
    });
    const user2 = await authService.createUserWithPassword({
      username: 'user2',
      email: 'user2@test.com',
      passwordHash,
      name: 'User 2',
      role: 'admin',
    });
    const user3 = await authService.createUserWithPassword({
      username: 'user3',
      email: 'user3@test.com',
      passwordHash,
      name: 'User 3',
      role: 'admin',
    });

    // Store user IDs for token creation
    (global as any).__testUserIds = {
      1: user1.id,
      2: user2.id,
      3: user3.id,
    };

    // Create realtime config manager
    configManager = new RealtimeConfigManager(
      path.join(testDir, '.system-data')
    );

    // Create realtime server
    realtimeServer = new RealtimeServer(
      logger,
      hookSystem,
      authService,
      configManager,
      config
    );

    realtimeServer.setRecordManager(recordManager);
    realtimeServer.setDatabaseService(databaseService);

    // Create room manager
    roomManager = new RoomManager(logger, realtimeServer);
    realtimeServer.setRoomManager(roomManager);

    // W1 made connection routing handler-only: a records:* connection is closed
    // with 4004 unless a handler is registered for the room type. Register the
    // records handler so multi-client sync/awareness/reconnection paths run.
    realtimeServer.registerRoomTypeHandler(new RecordRoomHandler());

    // Initialize realtime server
    await realtimeServer.initialize();

    // Wait for server to actually be listening
    await new Promise<void>((resolve, reject) => {
      const checkInterval = setInterval(() => {
        const health = realtimeServer.getHealthStatus();
        if (health.server.listening) {
          clearInterval(checkInterval);
          resolve();
        }
      }, 50);

      // Timeout after 5 seconds
      setTimeout(() => {
        clearInterval(checkInterval);
        reject(new Error('Server failed to start within 5 seconds'));
      }, 5000);
    });

    // Create a test record using the actual user object
    // Use createRecordWithId to specify the exact ID we want
    testRecordId = 'test-record-1';
    const testRecord = {
      title: 'Test Record',
      type: 'bylaw',
      content: '# Initial Content\n\nThis is the initial content.',
      status: 'published',
      metadata: {},
    };
    // Use createRecordWithId to ensure we get the exact ID we want
    const createdRecord = await recordManager.createRecordWithId(
      testRecordId,
      testRecord,
      user1
    );

    // Verify the record was created and can be retrieved
    let recordCheck = await recordManager.getRecord(testRecordId);
    let retries = 0;
    while (!recordCheck && retries < 10) {
      await new Promise((resolve) => setTimeout(resolve, 200));
      recordCheck = await recordManager.getRecord(testRecordId);
      retries++;
    }

    if (!recordCheck) {
      throw new Error(
        `Test record ${testRecordId} was not found after creation. This will cause all WebSocket connections to fail.`
      );
    }

    // Wait for record indexing and permission setup
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Clear role manager cache and reload config to ensure fresh permission checks
    const roleManagerForReload = authService.getRoleManager();
    if (roleManagerForReload) {
      roleManagerForReload.clearCache();
      await roleManagerForReload.reloadConfig();
    }
  });

  afterEach(async () => {
    // Close all connections and shutdown
    if (realtimeServer) {
      try {
        await realtimeServer.shutdown();
      } catch (error) {
        // Ignore shutdown errors
      }
    }
    if (civic) {
      try {
        await civic.shutdown();
      } catch (error) {
        // Ignore shutdown errors
      }
    }
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  /**
   * Create a test WebSocket client
   */
  async function createTestClient(
    userId: number,
    username: string,
    recordId: string = testRecordId
  ): Promise<TestClient> {
    // Get actual user ID from test users
    const testUserIds = (global as any).__testUserIds || {};
    const actualUserId = testUserIds[userId] || userId;

    // Create a real session token
    const { token } = await authService.createSession(actualUserId, 24);

    return new Promise((resolve, reject) => {
      let resolved = false;
      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          ws.close();
          reject(
            new Error(
              `Connection timeout after 3 seconds (userId: ${userId}, port: ${serverPort})`
            )
          );
        }
      }, 3000);

      const ws = new WebSocket(
        `ws://127.0.0.1:${serverPort}/realtime/records/${recordId}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      const client: TestClient = {
        ws,
        clientId: '',
        userId,
        messages: [],
        connected: false,
      };

      ws.on('open', () => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          client.connected = true;
          resolve(client);
        }
      });

      ws.on('message', (data: Buffer) => {
        try {
          const msg = new Uint8Array(data);
          const decoder = decoding.createDecoder(msg);
          const msgType = decoding.readVarUint(decoder);
          client.messages.push({ yjsType: msgType, data: msg } as YjsMessage);
        } catch (error) {
          // Try JSON fallback for error messages
          try {
            const message = JSON.parse(data.toString());
            client.messages.push(message);
          } catch {
            // Ignore parse errors
          }
        }
      });

      ws.on('error', (error) => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          reject(new Error(`WebSocket error: ${error.message || error}`));
        }
      });

      ws.on('close', (code, reason) => {
        if (!resolved && !client.connected) {
          resolved = true;
          clearTimeout(timeout);
          reject(
            new Error(
              `Connection closed before open: code=${code}, reason=${reason.toString()}`
            )
          );
        }
      });
    });
  }

  /**
   * Wait for the initial Yjs sync handshake (first binary sync message)
   */
  function waitForYjsSync(
    client: TestClient,
    timeout: number = 5000
  ): Promise<YjsMessage> {
    return new Promise((resolve, reject) => {
      // Check if already received
      const existing = client.messages.find(
        (m) => 'yjsType' in m && m.yjsType === YJS_MSG_SYNC
      );
      if (existing) {
        resolve(existing as YjsMessage);
        return;
      }

      const startTime = Date.now();
      const checkInterval = setInterval(() => {
        const message = client.messages.find(
          (m) => 'yjsType' in m && m.yjsType === YJS_MSG_SYNC
        );
        if (message) {
          clearInterval(checkInterval);
          resolve(message as YjsMessage);
          return;
        }
        if (Date.now() - startTime > timeout) {
          clearInterval(checkInterval);
          reject(
            new Error(
              `Timeout waiting for Yjs sync after ${timeout}ms. Received ${client.messages.length} messages.`
            )
          );
        }
      }, 50);
    });
  }

  /**
   * Wait for a sync update message (not the initial step1/step2 handshake)
   * Waits until we see more sync messages beyond the initial handshake count.
   */
  function waitForSyncUpdate(
    client: TestClient,
    initialSyncCount: number,
    timeout: number = 5000
  ): Promise<YjsMessage> {
    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      const checkInterval = setInterval(() => {
        const syncMessages = client.messages.filter(
          (m) => 'yjsType' in m && m.yjsType === YJS_MSG_SYNC
        );
        if (syncMessages.length > initialSyncCount) {
          clearInterval(checkInterval);
          resolve(syncMessages[syncMessages.length - 1] as YjsMessage);
          return;
        }
        if (Date.now() - startTime > timeout) {
          clearInterval(checkInterval);
          reject(
            new Error(
              `Timeout waiting for sync update after ${timeout}ms. Have ${syncMessages.length} sync messages, expected more than ${initialSyncCount}.`
            )
          );
        }
      }, 50);
    });
  }

  /**
   * Count the current number of sync messages for a client
   */
  function getSyncMessageCount(client: TestClient): number {
    return client.messages.filter(
      (m) => 'yjsType' in m && m.yjsType === YJS_MSG_SYNC
    ).length;
  }

  /**
   * Send a sync message (binary yjs update)
   */
  function sendSyncMessage(client: TestClient, update: Uint8Array): void {
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, YJS_MSG_SYNC);
    syncProtocol.writeUpdate(encoder, update);
    client.ws.send(encoding.toUint8Array(encoder));
  }

  /**
   * Send a binary awareness message
   */
  function sendAwarenessMessage(
    client: TestClient,
    awarenessPayload: Uint8Array
  ): void {
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, YJS_MSG_AWARENESS);
    encoding.writeVarUint8Array(encoder, awarenessPayload);
    client.ws.send(encoding.toUint8Array(encoder));
  }

  /**
   * Close a client connection
   */
  function closeClient(client: TestClient): Promise<void> {
    return new Promise((resolve) => {
      if (
        client.ws.readyState === WebSocket.OPEN ||
        client.ws.readyState === WebSocket.CONNECTING
      ) {
        const timeout = setTimeout(() => resolve(), 1000); // Max 1 second to close
        client.ws.once('close', () => {
          clearTimeout(timeout);
          resolve();
        });
        try {
          client.ws.close();
        } catch (error) {
          clearTimeout(timeout);
          resolve(); // Ignore close errors
        }
      } else {
        resolve();
      }
    });
  }

  describe('Multi-Client Editing', () => {
    it('should allow multiple clients to connect to the same room', async () => {
      const client1 = await createTestClient(1, 'user1');

      // Wait for first client's Yjs sync
      await waitForYjsSync(client1);
      expect(client1.connected).toBe(true);

      // Wait a bit before connecting second client
      await new Promise((resolve) => setTimeout(resolve, 200));

      const client2 = await createTestClient(2, 'user2');

      // Wait for second client's Yjs sync
      await waitForYjsSync(client2);
      expect(client2.connected).toBe(true);

      await closeClient(client1);
      await closeClient(client2);
    });

    it('should synchronize yjs updates between multiple clients', async () => {
      const client1 = await createTestClient(1, 'user1');
      await waitForYjsSync(client1);

      await new Promise((resolve) => setTimeout(resolve, 200));

      const client2 = await createTestClient(2, 'user2');
      await waitForYjsSync(client2);

      // Wait a bit more for both clients to be fully ready
      await new Promise((resolve) => setTimeout(resolve, 300));

      // Record sync count before sending update
      const client2SyncBefore = getSyncMessageCount(client2);

      // Create a yjs document and make an update
      const yjsDoc1 = new Y.Doc();
      const yjsText1 = yjsDoc1.getText('content');
      yjsText1.insert(0, 'Hello from client 1');

      const update1 = Y.encodeStateAsUpdate(yjsDoc1);
      sendSyncMessage(client1, update1);

      // Wait for sync update on client2
      const syncMsg = await waitForSyncUpdate(client2, client2SyncBefore);
      expect(syncMsg).toBeDefined();
      expect(syncMsg.data).toBeDefined();

      // Decode the update from the binary message
      const decoder = decoding.createDecoder(syncMsg.data);
      decoding.readVarUint(decoder); // skip message type (YJS_MSG_SYNC)
      const yjsDoc2 = new Y.Doc();
      syncProtocol.readSyncMessage(
        decoder,
        encoding.createEncoder(),
        yjsDoc2,
        'test'
      );

      const yjsText2 = yjsDoc2.getText('content');
      expect(yjsText2.toString()).toBe('Hello from client 1');

      await closeClient(client1);
      await closeClient(client2);
    });

    it('should handle concurrent edits from multiple clients', async () => {
      const client1 = await createTestClient(1, 'user1');
      await waitForYjsSync(client1);

      await new Promise((resolve) => setTimeout(resolve, 200));

      const client2 = await createTestClient(2, 'user2');
      await waitForYjsSync(client2);

      // Wait a bit more for both clients to be fully ready
      await new Promise((resolve) => setTimeout(resolve, 300));

      // Record sync counts before sending updates
      const client1SyncBefore = getSyncMessageCount(client1);
      const client2SyncBefore = getSyncMessageCount(client2);

      // Create yjs documents for both clients
      const yjsDoc1 = new Y.Doc();
      const yjsDoc2 = new Y.Doc();
      const yjsText1 = yjsDoc1.getText('content');
      const yjsText2 = yjsDoc2.getText('content');

      // Client 1 inserts at position 0
      yjsText1.insert(0, 'A');
      const update1 = Y.encodeStateAsUpdate(yjsDoc1);
      sendSyncMessage(client1, update1);

      // Client 2 inserts at position 0 (before seeing client1's update)
      yjsText2.insert(0, 'B');
      const update2 = Y.encodeStateAsUpdate(yjsDoc2);
      sendSyncMessage(client2, update2);

      // Wait for both updates to be received
      const sync1 = await waitForSyncUpdate(client2, client2SyncBefore);
      const sync2 = await waitForSyncUpdate(client1, client1SyncBefore);

      // Decode and apply updates
      const decoder1 = decoding.createDecoder(sync1.data);
      decoding.readVarUint(decoder1); // skip msg type
      syncProtocol.readSyncMessage(
        decoder1,
        encoding.createEncoder(),
        yjsDoc2,
        'test'
      );

      const decoder2 = decoding.createDecoder(sync2.data);
      decoding.readVarUint(decoder2); // skip msg type
      syncProtocol.readSyncMessage(
        decoder2,
        encoding.createEncoder(),
        yjsDoc1,
        'test'
      );

      // Both documents should have the same final state (CRDT merge)
      const final1 = yjsText1.toString();
      const final2 = yjsText2.toString();
      expect(final1).toBe(final2);
      expect(final1.length).toBe(2);
      expect(final1).toContain('A');
      expect(final1).toContain('B');

      await closeClient(client1);
      await closeClient(client2);
    });
  });

  describe('yjs Synchronization', () => {
    it('should maintain document consistency across clients', async () => {
      const client1 = await createTestClient(1, 'user1');
      await waitForYjsSync(client1);
      await new Promise((resolve) => setTimeout(resolve, 200));

      const client2 = await createTestClient(2, 'user2');
      await waitForYjsSync(client2);
      await new Promise((resolve) => setTimeout(resolve, 200));

      const client3 = await createTestClient(3, 'user3');
      await waitForYjsSync(client3);

      // Wait a bit more for all clients to be fully ready
      await new Promise((resolve) => setTimeout(resolve, 300));

      // Create yjs documents for all clients
      const docs = [new Y.Doc(), new Y.Doc(), new Y.Doc()];
      const texts = docs.map((doc) => doc.getText('content'));

      // Each client makes an edit
      texts[0].insert(0, 'Client1 ');
      texts[1].insert(0, 'Client2 ');
      texts[2].insert(0, 'Client3 ');

      // Record sync counts before sending
      const client1SyncBefore = getSyncMessageCount(client1);
      const client2SyncBefore = getSyncMessageCount(client2);
      const client3SyncBefore = getSyncMessageCount(client3);

      // Send updates from all clients sequentially
      sendSyncMessage(client1, Y.encodeStateAsUpdate(docs[0]));
      await Promise.all([
        waitForSyncUpdate(client2, client2SyncBefore, 5000).catch(() => null),
        waitForSyncUpdate(client3, client3SyncBefore, 5000).catch(() => null),
      ]);

      const client1SyncAfter1 = getSyncMessageCount(client1);
      const client3SyncAfter1 = getSyncMessageCount(client3);

      sendSyncMessage(client2, Y.encodeStateAsUpdate(docs[1]));
      await Promise.all([
        waitForSyncUpdate(client1, client1SyncAfter1, 5000).catch(() => null),
        waitForSyncUpdate(client3, client3SyncAfter1, 5000).catch(() => null),
      ]);

      const client1SyncAfter2 = getSyncMessageCount(client1);
      const client2SyncAfter2 = getSyncMessageCount(client2);

      sendSyncMessage(client3, Y.encodeStateAsUpdate(docs[2]));
      await Promise.all([
        waitForSyncUpdate(client1, client1SyncAfter2, 5000).catch(() => null),
        waitForSyncUpdate(client2, client2SyncAfter2, 5000).catch(() => null),
      ]);

      // Collect sync messages received after the initial handshake
      const extractSyncUpdates = (
        client: TestClient,
        initialCount: number
      ): YjsMessage[] => {
        const allSync = client.messages.filter(
          (m) => 'yjsType' in m && m.yjsType === YJS_MSG_SYNC
        ) as YjsMessage[];
        return allSync.slice(initialCount);
      };

      const syncs1 = extractSyncUpdates(client1, client1SyncBefore);
      const syncs2 = extractSyncUpdates(client2, client2SyncBefore);
      const syncs3 = extractSyncUpdates(client3, client3SyncBefore);

      // If not enough, wait a bit more
      if (syncs1.length < 2 || syncs2.length < 2 || syncs3.length < 2) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }

      // Apply received updates to each client's document
      const applyBinarySyncs = (doc: Y.Doc, syncs: YjsMessage[]) => {
        syncs.forEach((sync) => {
          const decoder = decoding.createDecoder(sync.data);
          decoding.readVarUint(decoder); // skip msg type
          syncProtocol.readSyncMessage(
            decoder,
            encoding.createEncoder(),
            doc,
            'test'
          );
        });
      };

      applyBinarySyncs(docs[0], extractSyncUpdates(client1, client1SyncBefore));
      applyBinarySyncs(docs[1], extractSyncUpdates(client2, client2SyncBefore));
      applyBinarySyncs(docs[2], extractSyncUpdates(client3, client3SyncBefore));

      const finalStates = texts.map((text) => text.toString());

      // Verify all states contain all three client texts
      finalStates.forEach((state) => {
        expect(state).toContain('Client1');
        expect(state).toContain('Client2');
        expect(state).toContain('Client3');
        expect(state.length).toBeGreaterThan(0);
      });

      const lengths = finalStates.map((s) => s.length);
      expect(lengths[0]).toBe(lengths[1]);
      expect(lengths[1]).toBe(lengths[2]);

      await closeClient(client1);
      await closeClient(client2);
      await closeClient(client3);
    });

    it('should handle large document updates', async () => {
      const client1 = await createTestClient(1, 'user1');
      await waitForYjsSync(client1);

      await new Promise((resolve) => setTimeout(resolve, 200));

      const client2 = await createTestClient(2, 'user2');
      await waitForYjsSync(client2);

      // Wait a bit more for both clients to be fully ready
      await new Promise((resolve) => setTimeout(resolve, 300));

      const client2SyncBefore = getSyncMessageCount(client2);

      const yjsDoc = new Y.Doc();
      const yjsText = yjsDoc.getText('content');

      // Insert a large amount of text
      const largeText = 'A'.repeat(10000);
      yjsText.insert(0, largeText);

      const update = Y.encodeStateAsUpdate(yjsDoc);
      sendSyncMessage(client1, update);

      const syncMsg = await waitForSyncUpdate(client2, client2SyncBefore);
      expect(syncMsg.data).toBeDefined();

      const yjsDoc2 = new Y.Doc();
      const decoder = decoding.createDecoder(syncMsg.data);
      decoding.readVarUint(decoder); // skip msg type
      syncProtocol.readSyncMessage(
        decoder,
        encoding.createEncoder(),
        yjsDoc2,
        'test'
      );
      const yjsText2 = yjsDoc2.getText('content');

      expect(yjsText2.toString()).toBe(largeText);

      await closeClient(client1);
      await closeClient(client2);
    });
  });

  describe('Reconnection Handling', () => {
    it('should allow client to reconnect to the same room', async () => {
      const client1 = await createTestClient(1, 'user1');
      await waitForYjsSync(client1);

      // Make an edit
      const yjsDoc1 = new Y.Doc();
      const yjsText1 = yjsDoc1.getText('content');
      yjsText1.insert(0, 'Initial edit');
      sendSyncMessage(client1, Y.encodeStateAsUpdate(yjsDoc1));

      // Disconnect
      await closeClient(client1);

      // Wait a bit
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Reconnect
      const client2 = await createTestClient(1, 'user1');
      await waitForYjsSync(client2);

      // Verify we received sync messages (step 1 + step 2)
      const syncMessages = client2.messages.filter(
        (m) => 'yjsType' in m && m.yjsType === YJS_MSG_SYNC
      );
      expect(syncMessages.length).toBeGreaterThanOrEqual(2);

      await closeClient(client2);
    });

    it('should restore document state after reconnection', async () => {
      const client1 = await createTestClient(1, 'user1');
      await waitForYjsSync(client1);

      // Make edits
      const yjsDoc = new Y.Doc();
      const yjsText = yjsDoc.getText('content');
      yjsText.insert(0, 'Content before disconnect');
      sendSyncMessage(client1, Y.encodeStateAsUpdate(yjsDoc));

      // Wait for snapshot to be saved
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Disconnect
      await closeClient(client1);

      // Wait for snapshot
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Reconnect
      const client2 = await createTestClient(1, 'user1');
      await waitForYjsSync(client2);

      // Verify we received sync messages on reconnection
      const syncMessages = client2.messages.filter(
        (m) => 'yjsType' in m && m.yjsType === YJS_MSG_SYNC
      );
      expect(syncMessages.length).toBeGreaterThanOrEqual(2);

      await closeClient(client2);
    });

    it('should handle multiple reconnections', async () => {
      for (let i = 0; i < 3; i++) {
        const client = await createTestClient(1, 'user1');
        await waitForYjsSync(client);

        // Make a small edit
        const yjsDoc = new Y.Doc();
        const yjsText = yjsDoc.getText('content');
        yjsText.insert(0, `Edit ${i} `);
        sendSyncMessage(client, Y.encodeStateAsUpdate(yjsDoc));

        await closeClient(client);
        await new Promise((resolve) => setTimeout(resolve, 200));
      }

      // Final connection should work
      const finalClient = await createTestClient(1, 'user1');
      await waitForYjsSync(finalClient);

      const syncMessages = finalClient.messages.filter(
        (m) => 'yjsType' in m && m.yjsType === YJS_MSG_SYNC
      );
      expect(syncMessages.length).toBeGreaterThanOrEqual(2);

      await closeClient(finalClient);
    });
  });

  describe('Presence Broadcasting', () => {
    it('should broadcast awareness messages to all clients', async () => {
      const client1 = await createTestClient(1, 'user1');
      await waitForYjsSync(client1);

      await new Promise((resolve) => setTimeout(resolve, 200));

      const client2 = await createTestClient(2, 'user2');
      await waitForYjsSync(client2);

      // Wait a bit more for both clients to be fully ready
      await new Promise((resolve) => setTimeout(resolve, 300));

      // Send awareness message from client1
      const awarenessPayload = new Uint8Array([10, 20, 30, 40]);
      sendAwarenessMessage(client1, awarenessPayload);

      // Wait for awareness message on client2
      await new Promise<void>((resolve, reject) => {
        const startTime = Date.now();
        const checkInterval = setInterval(() => {
          const awarenessMsg = client2.messages.find(
            (m) => 'yjsType' in m && m.yjsType === YJS_MSG_AWARENESS
          );
          if (awarenessMsg) {
            clearInterval(checkInterval);
            resolve();
            return;
          }
          if (Date.now() - startTime > 5000) {
            clearInterval(checkInterval);
            reject(new Error('Timeout waiting for awareness message'));
          }
        }, 50);
      });

      const awarenessMsg = client2.messages.find(
        (m) => 'yjsType' in m && m.yjsType === YJS_MSG_AWARENESS
      ) as YjsMessage;
      expect(awarenessMsg).toBeDefined();
      expect(awarenessMsg.yjsType).toBe(YJS_MSG_AWARENESS);

      await closeClient(client1);
      await closeClient(client2);
    });

    it('should handle connection and disconnection without breaking', async () => {
      const client1 = await createTestClient(1, 'user1');
      await waitForYjsSync(client1);

      await new Promise((resolve) => setTimeout(resolve, 200));

      const client2 = await createTestClient(2, 'user2');
      await waitForYjsSync(client2);

      // Wait a bit for both clients to be ready
      await new Promise((resolve) => setTimeout(resolve, 300));

      // Verify both clients are connected
      expect(client1.connected).toBe(true);
      expect(client2.connected).toBe(true);

      // Disconnect client2
      await closeClient(client2);

      // Wait a bit for disconnection to propagate
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Client1 should still be connected and functional
      expect(client1.ws.readyState).toBe(WebSocket.OPEN);

      // Client1 should still be able to send messages
      const yjsDoc = new Y.Doc();
      yjsDoc.getText('content').insert(0, 'Still working');
      sendSyncMessage(client1, Y.encodeStateAsUpdate(yjsDoc));

      await closeClient(client1);
    });
  });
});
