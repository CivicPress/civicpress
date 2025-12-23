/**
 * Unit Tests for RealtimeServer
 *
 * Tests WebSocket server connection handling, authentication, message routing, and error handling
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { WebSocket, WebSocketServer } from 'ws';
import { RealtimeServer } from '../realtime-server.js';
import { RealtimeConfigManager } from '../realtime-config-manager.js';
import { RoomManager } from '../rooms/room-manager.js';
import type {
  Logger,
  HookSystem,
  AuthService,
  RecordManager,
  DatabaseService,
  CivicPressConfig,
  AuthUser,
} from '@civicpress/core';
import {
  AuthenticationFailedError,
  ConnectionLimitExceededError,
} from '../errors/realtime-errors.js';
import { MessageType, PresenceEvent, ControlEvent } from '../types/messages.js';
import * as Y from 'yjs';
import { join } from 'path';

describe('RealtimeServer', () => {
  let realtimeServer: RealtimeServer;
  let mockLogger: Logger;
  let mockHookSystem: HookSystem;
  let mockAuthService: AuthService;
  let mockRecordManager: RecordManager;
  let mockDatabaseService: DatabaseService;
  let configManager: RealtimeConfigManager;
  let config: CivicPressConfig;
  let testDir: string;
  let serverPort: number;

  beforeEach(async () => {
    // Create temporary directory for config
    const { mkdtemp, mkdir } = await import('fs/promises');
    const { join } = await import('path');
    const os = await import('os');
    testDir = await mkdtemp(join(os.tmpdir(), 'civicpress-realtime-test-'));
    await mkdir(join(testDir, '.system-data'), { recursive: true });

    // Use random port for testing
    serverPort = 30000 + Math.floor(Math.random() * 1000);

    // Create realtime config
    const { writeFile } = await import('fs/promises');
    const { stringify } = await import('yaml');
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
          messages_per_second: 100, // High limit for tests
          connections_per_ip: 100,
          connections_per_user: 10,
        },
      },
    };
    await writeFile(
      join(testDir, '.system-data', 'realtime.yml'),
      stringify(realtimeConfig),
      'utf8'
    );

    // Create mocks
    mockLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
      isVerbose: () => false,
    } as any;

    mockHookSystem = {
      emit: vi.fn().mockResolvedValue(undefined), // Return Promise for async handling
      on: vi.fn(),
      off: vi.fn(),
    } as any;

    const mockUser: AuthUser = {
      id: 1,
      username: 'testuser',
      email: 'test@example.com',
      name: 'Test User',
      role: 'admin',
    };

    mockAuthService = {
      validateSession: vi.fn().mockResolvedValue(mockUser),
      userCan: vi.fn().mockResolvedValue(true),
      createSession: vi.fn().mockResolvedValue({ token: 'test-token' }),
    } as any;

    mockRecordManager = {
      getRecord: vi.fn().mockResolvedValue({
        id: 'test-record-1',
        title: 'Test Record',
        type: 'bylaw',
        content: '# Test Content',
        status: 'published',
      }),
    } as any;

    mockDatabaseService = {
      query: vi.fn(),
      execute: vi.fn(),
    } as any;

    configManager = new RealtimeConfigManager(join(testDir, '.system-data'));
    config = {
      dataDir: testDir,
      database: {
        type: 'sqlite',
        sqlite: { file: join(testDir, '.system-data', 'test.db') },
      },
    };

    realtimeServer = new RealtimeServer(
      mockLogger,
      mockHookSystem,
      mockAuthService,
      configManager,
      config
    );

    realtimeServer.setRecordManager(mockRecordManager);
    realtimeServer.setDatabaseService(mockDatabaseService);

    const roomManager = new RoomManager(mockLogger, realtimeServer);
    realtimeServer.setRoomManager(roomManager);

    // Mock database methods needed for snapshot table creation
    (mockDatabaseService.query as any).mockResolvedValue([]);
    (mockDatabaseService.execute as any).mockResolvedValue(undefined);
  });

  afterEach(async () => {
    if (realtimeServer) {
      try {
        await realtimeServer.shutdown();
      } catch (error) {
        // Ignore shutdown errors
      }
    }
    // Cleanup test directory
    try {
      const { rm } = await import('fs/promises');
      await rm(testDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('Server Initialization', () => {
    it('should initialize and start WebSocket server', async () => {
      await realtimeServer.initialize();

      const health = realtimeServer.getHealthStatus();
      expect(health.server.listening).toBe(true);
      expect(health.server.port).toBe(serverPort);
    });

    it('should shutdown server gracefully', async () => {
      await realtimeServer.initialize();
      await realtimeServer.shutdown();

      const health = realtimeServer.getHealthStatus();
      expect(health.server.listening).toBe(false);
    });
  });

  describe('Connection Establishment', () => {
    it('should accept valid WebSocket connection with authentication', async () => {
      await realtimeServer.initialize();

      // Wait for server to be ready
      await new Promise((resolve) => setTimeout(resolve, 100));

      const { token } = await mockAuthService.createSession(1, 24);

      return new Promise<void>((resolve, reject) => {
        const ws = new WebSocket(
          `ws://127.0.0.1:${serverPort}/realtime/records/test-record-1`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );

        const timeout = setTimeout(() => {
          ws.close();
          reject(new Error('Connection timeout'));
        }, 3000);

        ws.on('open', () => {
          clearTimeout(timeout);
          ws.close();
          resolve();
        });

        ws.on('error', (error) => {
          clearTimeout(timeout);
          reject(error);
        });
      });
    });

    it('should reject connection without authentication token', async () => {
      await realtimeServer.initialize();
      await new Promise((resolve) => setTimeout(resolve, 200));

      return new Promise<void>((resolve, reject) => {
        let errorReceived = false;
        let closeReceived = false;

        const ws = new WebSocket(
          `ws://127.0.0.1:${serverPort}/realtime/records/test-record-1`
        );

        const timeout = setTimeout(() => {
          if (!errorReceived && !closeReceived) {
            reject(new Error('Expected connection to be rejected'));
          }
        }, 3000);

        ws.on('open', () => {
          // Connection might open before error is sent, wait for error message
        });

        ws.on('message', (data: Buffer) => {
          try {
            const message = JSON.parse(data.toString());
            if (
              message.type === MessageType.CONTROL &&
              message.event === ControlEvent.ERROR
            ) {
              errorReceived = true;
              // Connection should close after error
              setTimeout(() => {
                if (ws.readyState === WebSocket.CLOSED || closeReceived) {
                  clearTimeout(timeout);
                  resolve();
                }
              }, 100);
            }
          } catch (error) {
            // Ignore parse errors
          }
        });

        ws.on('error', () => {
          errorReceived = true;
          if (closeReceived) {
            clearTimeout(timeout);
            resolve();
          }
        });

        ws.on('close', () => {
          closeReceived = true;
          if (errorReceived) {
            clearTimeout(timeout);
            resolve();
          } else {
            // Give it a moment for error to arrive
            setTimeout(() => {
              clearTimeout(timeout);
              resolve(); // Accept close as rejection
            }, 200);
          }
        });
      });
    });

    it('should reject connection with invalid token', async () => {
      await realtimeServer.initialize();
      (mockAuthService.validateSession as any).mockResolvedValueOnce(null);
      await new Promise((resolve) => setTimeout(resolve, 200));

      return new Promise<void>((resolve, reject) => {
        let errorReceived = false;
        let closeReceived = false;

        const ws = new WebSocket(
          `ws://127.0.0.1:${serverPort}/realtime/records/test-record-1`,
          {
            headers: {
              Authorization: 'Bearer invalid-token',
            },
          }
        );

        const timeout = setTimeout(() => {
          if (!errorReceived && !closeReceived) {
            reject(new Error('Expected connection to be rejected'));
          }
        }, 3000);

        ws.on('open', () => {
          // Connection might open before error is sent, wait for error message
        });

        ws.on('message', (data: Buffer) => {
          try {
            const message = JSON.parse(data.toString());
            if (
              message.type === MessageType.CONTROL &&
              message.event === ControlEvent.ERROR
            ) {
              errorReceived = true;
              // Connection should close after error
              setTimeout(() => {
                if (ws.readyState === WebSocket.CLOSED || closeReceived) {
                  clearTimeout(timeout);
                  resolve();
                }
              }, 100);
            }
          } catch (error) {
            // Ignore parse errors
          }
        });

        ws.on('error', () => {
          errorReceived = true;
          if (closeReceived) {
            clearTimeout(timeout);
            resolve();
          }
        });

        ws.on('close', () => {
          closeReceived = true;
          if (errorReceived) {
            clearTimeout(timeout);
            resolve();
          } else {
            // Give it a moment for error to arrive
            setTimeout(() => {
              clearTimeout(timeout);
              resolve(); // Accept close as rejection
            }, 200);
          }
        });
      });
    });

    it('should reject connection to non-existent record', async () => {
      await realtimeServer.initialize();
      (mockRecordManager.getRecord as any).mockResolvedValueOnce(null);
      await new Promise((resolve) => setTimeout(resolve, 200));

      const { token } = await mockAuthService.createSession(1, 24);

      return new Promise<void>((resolve, reject) => {
        let errorReceived = false;
        let closeReceived = false;

        const ws = new WebSocket(
          `ws://127.0.0.1:${serverPort}/realtime/records/non-existent`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );

        const timeout = setTimeout(() => {
          if (!errorReceived && !closeReceived) {
            reject(new Error('Expected connection to be rejected'));
          }
        }, 3000);

        ws.on('open', () => {
          // Wait for error message
          setTimeout(() => {
            if (!errorReceived && !closeReceived) {
              clearTimeout(timeout);
              ws.close();
              reject(new Error('Connection should have been rejected'));
            }
          }, 500);
        });

        ws.on('message', (data: Buffer) => {
          try {
            const message = JSON.parse(data.toString());
            if (
              message.type === MessageType.CONTROL &&
              message.event === ControlEvent.ERROR
            ) {
              errorReceived = true;
              if (closeReceived || ws.readyState === WebSocket.CLOSING) {
                clearTimeout(timeout);
                resolve();
              }
            }
          } catch (error) {
            // Ignore parse errors
          }
        });

        ws.on('error', () => {
          errorReceived = true;
          if (closeReceived) {
            clearTimeout(timeout);
            resolve();
          }
        });

        ws.on('close', () => {
          closeReceived = true;
          if (errorReceived) {
            clearTimeout(timeout);
            resolve();
          } else {
            // Give it a moment for error to arrive
            setTimeout(() => {
              clearTimeout(timeout);
              resolve(); // Accept close as rejection
            }, 200);
          }
        });
      });
    });
  });

  describe('Message Routing', () => {
    let ws: WebSocket;
    let token: string;

    beforeEach(async () => {
      await realtimeServer.initialize();
      await new Promise((resolve) => setTimeout(resolve, 100));
      token = (await mockAuthService.createSession(1, 24)).token;
    });

    afterEach(() => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    });

    it('should handle ping message and respond with pong', async () => {
      return new Promise<void>((resolve, reject) => {
        ws = new WebSocket(
          `ws://127.0.0.1:${serverPort}/realtime/records/test-record-1`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );

        const timeout = setTimeout(() => {
          ws.close();
          reject(new Error('Test timeout'));
        }, 3000);

        ws.on('open', () => {
          // Send ping
          ws.send(JSON.stringify({ type: MessageType.PING }));
        });

        ws.on('message', (data: Buffer) => {
          try {
            const message = JSON.parse(data.toString());
            if (message.type === MessageType.PONG) {
              clearTimeout(timeout);
              ws.close();
              resolve();
            }
          } catch (error) {
            // Ignore other messages
          }
        });

        ws.on('error', (error) => {
          clearTimeout(timeout);
          reject(error);
        });
      });
    });

    it('should send room state on connection', async () => {
      return new Promise<void>((resolve, reject) => {
        ws = new WebSocket(
          `ws://127.0.0.1:${serverPort}/realtime/records/test-record-1`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );

        const timeout = setTimeout(() => {
          ws.close();
          reject(new Error('Test timeout'));
        }, 3000);

        ws.on('open', () => {
          // Wait for room state
        });

        ws.on('message', (data: Buffer) => {
          try {
            const message = JSON.parse(data.toString());
            if (
              message.type === MessageType.CONTROL &&
              message.event === ControlEvent.ROOM_STATE
            ) {
              expect(message.room).toBeDefined();
              expect(message.room.id).toBeDefined();
              clearTimeout(timeout);
              ws.close();
              resolve();
            }
          } catch (error) {
            // Ignore parse errors
          }
        });

        ws.on('error', (error) => {
          clearTimeout(timeout);
          reject(error);
        });
      });
    });

    it('should route sync messages and broadcast to other clients', async () => {
      return new Promise<void>((resolve, reject) => {
        let client1: WebSocket;
        let client2: WebSocket;
        let client1Received = false;

        const timeout = setTimeout(() => {
          if (client1) client1.close();
          if (client2) client2.close();
          reject(new Error('Test timeout'));
        }, 5000);

        // Connect first client
        client1 = new WebSocket(
          `ws://127.0.0.1:${serverPort}/realtime/records/test-record-1`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );

        client1.on('open', () => {
          // Wait for room state
          let roomStateReceived = false;
          client1.on('message', (data: Buffer) => {
            try {
              const message = JSON.parse(data.toString());
              if (
                message.type === MessageType.CONTROL &&
                message.event === ControlEvent.ROOM_STATE
              ) {
                roomStateReceived = true;
              }
            } catch (error) {
              // Ignore
            }
          });

          // Connect second client after first is ready
          setTimeout(() => {
            client2 = new WebSocket(
              `ws://127.0.0.1:${serverPort}/realtime/records/test-record-1`,
              {
                headers: {
                  Authorization: `Bearer ${token}`,
                },
              }
            );

            client2.on('open', () => {
              // Wait for room state, then send sync
              let roomStateReceived2 = false;
              client2.on('message', (data: Buffer) => {
                try {
                  const message = JSON.parse(data.toString());
                  if (
                    message.type === MessageType.CONTROL &&
                    message.event === ControlEvent.ROOM_STATE
                  ) {
                    roomStateReceived2 = true;
                  } else if (
                    message.type === MessageType.SYNC &&
                    roomStateReceived2
                  ) {
                    // Client2 received sync from client1
                    clearTimeout(timeout);
                    client1.close();
                    client2.close();
                    resolve();
                  }
                } catch (error) {
                  // Ignore
                }
              });

              // Send sync message from client1 after both are ready
              setTimeout(() => {
                if (roomStateReceived && roomStateReceived2) {
                  const yjsDoc = new Y.Doc();
                  const yjsText = yjsDoc.getText('content');
                  yjsText.insert(0, 'Test update');
                  const update = Y.encodeStateAsUpdate(yjsDoc);

                  client1.send(
                    JSON.stringify({
                      type: MessageType.SYNC,
                      update: Buffer.from(update).toString('base64'),
                    })
                  );
                }
              }, 500);
            });

            client2.on('error', (error) => {
              clearTimeout(timeout);
              if (client1) client1.close();
              reject(error);
            });
          }, 500);
        });

        client1.on('error', (error) => {
          clearTimeout(timeout);
          if (client2) client2.close();
          reject(error);
        });
      });
    });

    it('should route presence messages (cursor updates)', async () => {
      return new Promise<void>((resolve, reject) => {
        let client1: WebSocket;
        let client2: WebSocket;

        const timeout = setTimeout(() => {
          if (client1) client1.close();
          if (client2) client2.close();
          reject(new Error('Test timeout'));
        }, 5000);

        // Connect first client
        client1 = new WebSocket(
          `ws://127.0.0.1:${serverPort}/realtime/records/test-record-1`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );

        client1.on('open', () => {
          // Connect second client
          client2 = new WebSocket(
            `ws://127.0.0.1:${serverPort}/realtime/records/test-record-1`,
            {
              headers: {
                Authorization: `Bearer ${token}`,
              },
            }
          );

          client2.on('open', () => {
            // Wait a bit for both to be ready
            setTimeout(() => {
              // Send cursor update from client1
              client1.send(
                JSON.stringify({
                  type: MessageType.PRESENCE,
                  event: PresenceEvent.CURSOR,
                  cursor: { position: 10 },
                })
              );
            }, 500);
          });

          client2.on('message', (data: Buffer) => {
            try {
              const message = JSON.parse(data.toString());
              if (
                message.type === MessageType.PRESENCE &&
                message.event === PresenceEvent.CURSOR
              ) {
                expect(message.cursor).toBeDefined();
                expect(message.cursor.position).toBe(10);
                clearTimeout(timeout);
                client1.close();
                client2.close();
                resolve();
              }
            } catch (error) {
              // Ignore
            }
          });

          client2.on('error', (error) => {
            clearTimeout(timeout);
            if (client1) client1.close();
            reject(error);
          });
        });

        client1.on('error', (error) => {
          clearTimeout(timeout);
          if (client2) client2.close();
          reject(error);
        });
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid message format gracefully', async () => {
      await realtimeServer.initialize();
      await new Promise((resolve) => setTimeout(resolve, 100));
      const token = (await mockAuthService.createSession(1, 24)).token;

      return new Promise<void>((resolve, reject) => {
        const ws = new WebSocket(
          `ws://127.0.0.1:${serverPort}/realtime/records/test-record-1`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );

        const timeout = setTimeout(() => {
          ws.close();
          reject(new Error('Test timeout'));
        }, 3000);

        ws.on('open', () => {
          // Send invalid JSON
          ws.send('invalid json');
          // Connection should remain open (errors are logged but don't close connection)
          setTimeout(() => {
            clearTimeout(timeout);
            ws.close();
            resolve();
          }, 500);
        });

        ws.on('error', (error) => {
          clearTimeout(timeout);
          reject(error);
        });
      });
    });

    it('should handle missing record manager gracefully', async () => {
      // Use a different port to avoid conflicts
      const testPort = serverPort + 1;
      const testConfigPath = join(testDir, '.system-data', 'realtime-test.yml');
      const { writeFile } = await import('fs/promises');
      const { stringify } = await import('yaml');
      await writeFile(
        testConfigPath,
        stringify({
          realtime: {
            enabled: true,
            port: testPort,
            host: '127.0.0.1',
            path: '/realtime',
            rooms: { max_rooms: 100, cleanup_timeout: 3600 },
            snapshots: { enabled: false },
            rate_limiting: {
              messages_per_second: 100,
              connections_per_ip: 100,
              connections_per_user: 10,
            },
          },
        }),
        'utf8'
      );

      const testConfigManager = new RealtimeConfigManager(
        join(testDir, '.system-data')
      );
      // Override config path
      (testConfigManager as any).configPath = testConfigPath;

      const serverWithoutRecordManager = new RealtimeServer(
        mockLogger,
        mockHookSystem,
        mockAuthService,
        testConfigManager,
        config
      );

      // Don't set record manager
      await serverWithoutRecordManager.initialize();
      await new Promise((resolve) => setTimeout(resolve, 200));
      const token = (await mockAuthService.createSession(1, 24)).token;

      return new Promise<void>((resolve, reject) => {
        let errorReceived = false;
        let closeReceived = false;

        const ws = new WebSocket(
          `ws://127.0.0.1:${testPort}/realtime/records/test-record-1`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );

        const timeout = setTimeout(() => {
          if (!errorReceived && !closeReceived) {
            reject(new Error('Expected connection to be rejected'));
          }
        }, 3000);

        ws.on('open', () => {
          // Wait for error message
          setTimeout(() => {
            if (!errorReceived && !closeReceived) {
              clearTimeout(timeout);
              ws.close();
              reject(new Error('Connection should have been rejected'));
            }
          }, 500);
        });

        ws.on('message', (data: Buffer) => {
          try {
            const message = JSON.parse(data.toString());
            if (
              message.type === MessageType.CONTROL &&
              message.event === ControlEvent.ERROR
            ) {
              errorReceived = true;
              if (closeReceived || ws.readyState === WebSocket.CLOSING) {
                clearTimeout(timeout);
                resolve();
              }
            }
          } catch (error) {
            // Ignore parse errors
          }
        });

        ws.on('error', () => {
          errorReceived = true;
          if (closeReceived) {
            clearTimeout(timeout);
            resolve();
          }
        });

        ws.on('close', () => {
          closeReceived = true;
          if (errorReceived) {
            clearTimeout(timeout);
            resolve();
          } else {
            // Give it a moment for error to arrive
            setTimeout(() => {
              clearTimeout(timeout);
              resolve(); // Accept close as rejection
            }, 200);
          }
        });
      }).finally(async () => {
        try {
          await serverWithoutRecordManager.shutdown();
        } catch (error) {
          // Ignore
        }
      });
    });
  });

  describe('Disconnect Handling', () => {
    it('should cleanup connection on disconnect', async () => {
      await realtimeServer.initialize();
      await new Promise((resolve) => setTimeout(resolve, 200));
      const token = (await mockAuthService.createSession(1, 24)).token;

      return new Promise<void>((resolve, reject) => {
        const ws = new WebSocket(
          `ws://127.0.0.1:${serverPort}/realtime/records/test-record-1`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );

        const timeout = setTimeout(() => {
          ws.close();
          // Check if hook was called (might be called before close event)
          const disconnectCalls = (
            mockHookSystem.emit as any
          ).mock.calls.filter(
            (call: any[]) => call[0] === 'realtime:client:disconnected'
          );
          if (disconnectCalls.length > 0) {
            resolve();
          } else {
            reject(new Error('Disconnect hook not called'));
          }
        }, 5000);

        ws.on('open', () => {
          // Wait a bit for connection to be fully established
          setTimeout(() => {
            // Close connection
            ws.close();
          }, 200);
        });

        ws.on('close', () => {
          // Wait a bit for cleanup to complete
          setTimeout(() => {
            // Verify hook was emitted
            const disconnectCalls = (
              mockHookSystem.emit as any
            ).mock.calls.filter(
              (call: any[]) => call[0] === 'realtime:client:disconnected'
            );
            if (disconnectCalls.length > 0) {
              clearTimeout(timeout);
              resolve();
            }
          }, 300);
        });

        ws.on('error', (error) => {
          clearTimeout(timeout);
          reject(error);
        });
      });
    });
  });
});
