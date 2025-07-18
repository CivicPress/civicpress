import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { HookSystem } from '../../core/src/hooks/hook-system';
import { existsSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('Hook System', () => {
  let testDir: string;
  let hookSystem: HookSystem;

  beforeEach(async () => {
    testDir = join(tmpdir(), `civicpress-hooks-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });

    hookSystem = new HookSystem(testDir);
    await hookSystem.initialize();
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('Configuration Loading', () => {
    it('should load hooks configuration from file', () => {
      const config = hookSystem.getConfiguration();

      expect(config).toBeDefined();
      expect(config?.hooks).toBeDefined();
      expect(config?.settings).toBeDefined();
    });

    it('should create default config if file does not exist', async () => {
      const newTestDir = join(tmpdir(), `civicpress-hooks-test-${Date.now()}`);
      mkdirSync(newTestDir, { recursive: true });

      const newHookSystem = new HookSystem(newTestDir);
      await newHookSystem.initialize();
      const config = newHookSystem.getConfiguration();

      expect(config).toBeDefined();
      expect(config?.hooks).toBeDefined();

      rmSync(newTestDir, { recursive: true, force: true });
    });
  });

  describe('Hook Registration and Emission', () => {
    it('should register and emit hooks', async () => {
      const mockHandler = vi.fn();
      hookSystem.registerHook('test:event', mockHandler);

      await hookSystem.emit('test:event', { data: 'test' });

      expect(mockHandler).toHaveBeenCalledWith(
        { data: 'test' },
        expect.objectContaining({
          timestamp: expect.any(Date),
        })
      );
    });

    it('should handle multiple handlers for same event', async () => {
      const mockHandler1 = vi.fn();
      const mockHandler2 = vi.fn();

      hookSystem.registerHook('test:event', mockHandler1);
      hookSystem.registerHook('test:event', mockHandler2);

      await hookSystem.emit('test:event', { data: 'test' });

      expect(mockHandler1).toHaveBeenCalled();
      expect(mockHandler2).toHaveBeenCalled();
    });

    it('should handle events with no registered handlers', async () => {
      // Should not throw when emitting event with no handlers
      await expect(
        hookSystem.emit('unregistered:event', { data: 'test' })
      ).resolves.not.toThrow();
    });
  });

  describe('Configuration Management', () => {
    it('should update configuration', async () => {
      const newConfig = {
        hooks: {
          'record:created': {
            enabled: false,
            workflows: ['test-workflow'],
            audit: true,
            description: 'Test hook',
          },
        },
      };

      await hookSystem.updateConfiguration(newConfig);
      const config = hookSystem.getConfiguration();

      expect(config?.hooks['record:created']).toEqual(
        newConfig.hooks['record:created']
      );
    });
  });

  describe('Hook Registration', () => {
    it('should get registered hooks', () => {
      const registeredHooks = hookSystem.getRegisteredHooks();

      expect(Array.isArray(registeredHooks)).toBe(true);
      expect(registeredHooks).toContain('civic:initialized');
      expect(registeredHooks).toContain('record:created');
    });

    it('should remove hooks', async () => {
      const mockHandler = vi.fn();
      hookSystem.registerHook('test:event', mockHandler);

      // Verify the hook was registered
      const hooksBefore = hookSystem.getRegisteredHooks();
      expect(hooksBefore).toContain('test:event');

      // Remove the hook
      hookSystem.removeHook('test:event', mockHandler);

      // Note: getRegisteredHooks() may return all ever-registered hooks
      // So we test that the handler is actually removed by trying to emit the event
      await hookSystem.emit('test:event', { data: 'test' });

      // The mockHandler should not have been called since it was removed
      expect(mockHandler).not.toHaveBeenCalled();
    });
  });
});
