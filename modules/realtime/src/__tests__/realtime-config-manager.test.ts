/**
 * Unit Tests for RealtimeConfigManager
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { RealtimeConfigManager } from '../realtime-config-manager.js';

describe('RealtimeConfigManager', () => {
  let testDir: string;
  let configManager: RealtimeConfigManager;

  beforeEach(async () => {
    testDir = await fs.mkdtemp(
      path.join(os.tmpdir(), 'civicpress-realtime-config-')
    );
    // Create .system-data subdirectory to match expected structure
    await fs.mkdir(path.join(testDir, '.system-data'), { recursive: true });
    configManager = new RealtimeConfigManager(
      path.join(testDir, '.system-data')
    );
  });

  afterEach(async () => {
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('loadConfig', () => {
    it('should throw error when file does not exist', async () => {
      await expect(configManager.loadConfig()).rejects.toThrow();
    });

    it('should load config from file when it exists', async () => {
      const configPath = path.join(testDir, '.system-data', 'realtime.yml');
      const configContent = `realtime:
  enabled: false
  port: 3002
  host: '127.0.0.1'
  path: '/ws'
  rate_limiting:
    messages_per_second: 20
    connections_per_ip: 50
    connections_per_user: 5
`;
      await fs.writeFile(configPath, configContent, 'utf-8');

      const config = await configManager.loadConfig();

      // YAML parsing may convert boolean strings - check actual values
      expect(config.enabled).toBe(false);
      expect(config.port).toBe(3002);
      expect(config.host).toBe('127.0.0.1');
      expect(config.path).toBe('/ws');
      expect(config.rate_limiting.messages_per_second).toBe(20);
      expect(config.rate_limiting.connections_per_ip).toBe(50);
      expect(config.rate_limiting.connections_per_user).toBe(5);
    });

    it('should merge partial config with defaults', async () => {
      const configPath = path.join(testDir, '.system-data', 'realtime.yml');
      const configContent = `realtime:
  port: 4000
  rate_limiting:
    messages_per_second: 15
`;
      await fs.writeFile(configPath, configContent, 'utf-8');

      const config = await configManager.loadConfig();

      // Should use provided values
      expect(config.port).toBe(4000);
      expect(config.rate_limiting.messages_per_second).toBe(15);

      // Should use defaults for missing values
      expect(config.enabled).toBe(true);
      expect(config.host).toBe('0.0.0.0');
      expect(config.path).toBe('/realtime');
      expect(config.rate_limiting.connections_per_ip).toBe(100);
      expect(config.rate_limiting.connections_per_user).toBe(10);
    });
  });

  describe('validateConfig', () => {
    it('should validate valid config', () => {
      const config = configManager.getDefaultConfig();

      expect(() => configManager.validateConfig(config)).not.toThrow();
    });

    it('should throw error for invalid port', () => {
      const config = configManager.getDefaultConfig();
      config.port = -1;

      expect(() => configManager.validateConfig(config)).toThrow();
    });

    it('should throw error for invalid messages_per_second', () => {
      const config = configManager.getDefaultConfig();
      config.rate_limiting.messages_per_second = 0;

      expect(() => configManager.validateConfig(config)).toThrow();
    });

    it('should throw error for negative connections_per_ip', () => {
      const config = configManager.getDefaultConfig();
      config.rate_limiting.connections_per_ip = -1;

      expect(() => configManager.validateConfig(config)).toThrow();
    });
  });

  describe('getDefaultConfig', () => {
    it('should return default configuration', () => {
      const config = configManager.getDefaultConfig();

      expect(config).toMatchObject({
        enabled: true,
        port: 3001,
        host: '0.0.0.0',
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
          messages_per_second: 10,
          connections_per_ip: 100,
          connections_per_user: 10,
        },
      });
    });
  });
});
