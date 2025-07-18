import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { WorkflowConfigManager } from '../../core/src/config/workflow-config.js';
import { join } from 'path';
import { writeFile, mkdir } from 'fs/promises';
import * as fs from 'fs';

describe('WorkflowConfigManager', () => {
  let testDir: string;
  let configManager: WorkflowConfigManager;

  beforeEach(() => {
    testDir = join(process.cwd(), 'test-workflow-config');
    fs.mkdirSync(testDir, { recursive: true });
    fs.mkdirSync(join(testDir, '.civic'), { recursive: true });
    configManager = new WorkflowConfigManager(testDir);
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('loadConfig', () => {
    it('should load default config when no file exists', async () => {
      const config = await configManager.loadConfig();

      expect(config.statuses).toEqual([
        'draft',
        'proposed',
        'reviewed',
        'approved',
        'archived',
      ]);
      expect(config.transitions).toHaveProperty('draft');
      expect(config.roles).toHaveProperty('clerk');
    });

    it('should load custom config from file', async () => {
      const customConfig = {
        statuses: ['draft', 'approved', 'archived'],
        transitions: {
          draft: ['approved'],
          approved: ['archived'],
          archived: [],
        },
        roles: {
          clerk: {
            can_transition: {
              draft: ['approved'],
              any: ['archived'],
            },
          },
        },
      };

      await writeFile(
        join(testDir, '.civic', 'workflows.yml'),
        JSON.stringify(customConfig)
      );

      const config = await configManager.loadConfig();

      expect(config.statuses).toEqual(['draft', 'approved', 'archived']);
      expect(config.transitions.draft).toEqual(['approved']);
    });
  });

  describe('validateTransition', () => {
    it('should allow valid transitions', async () => {
      const result = await configManager.validateTransition(
        'draft',
        'proposed'
      );
      expect(result.valid).toBe(true);
    });

    it('should reject invalid transitions', async () => {
      const result = await configManager.validateTransition(
        'draft',
        'approved'
      );
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('not allowed');
    });

    it('should validate role permissions', async () => {
      const result = await configManager.validateTransition(
        'draft',
        'proposed',
        'clerk'
      );
      expect(result.valid).toBe(true);
    });

    it('should reject unauthorized role transitions', async () => {
      const result = await configManager.validateTransition(
        'reviewed',
        'approved',
        'clerk'
      );
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('cannot transition');
    });

    it('should reject unknown roles', async () => {
      const result = await configManager.validateTransition(
        'draft',
        'proposed',
        'unknown_role'
      );
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('not found');
    });
  });

  describe('validateAction', () => {
    it('should allow actions for authorized roles', async () => {
      const result = await configManager.validateAction(
        'create',
        'bylaw',
        'clerk'
      );
      expect(result.valid).toBe(true);
    });

    it('should reject actions for unauthorized roles', async () => {
      const result = await configManager.validateAction(
        'create',
        'bylaw',
        'public'
      );
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('cannot create');
    });

    it('should allow actions when no role restrictions', async () => {
      const result = await configManager.validateAction('view', 'bylaw');
      expect(result.valid).toBe(true);
    });
  });

  describe('getAvailableStatuses', () => {
    it('should return all statuses by default', async () => {
      const statuses = await configManager.getAvailableStatuses();
      expect(statuses).toContain('draft');
      expect(statuses).toContain('approved');
      expect(statuses).toContain('archived');
    });

    it('should return type-specific statuses when configured', async () => {
      // This would test recordType-specific statuses when implemented
      const statuses = await configManager.getAvailableStatuses('bylaw');
      expect(statuses).toContain('draft');
    });
  });

  describe('getAvailableTransitions', () => {
    it('should return all transitions for a status', async () => {
      const transitions = await configManager.getAvailableTransitions('draft');
      expect(transitions).toContain('proposed');
    });

    it('should filter transitions by role', async () => {
      const transitions = await configManager.getAvailableTransitions(
        'draft',
        'clerk'
      );
      expect(transitions).toContain('proposed');
    });

    it('should return empty array for unknown status', async () => {
      const transitions =
        await configManager.getAvailableTransitions('unknown');
      expect(transitions).toEqual([]);
    });
  });

  describe('getRoles', () => {
    it('should return all configured roles', async () => {
      const roles = await configManager.getRoles();
      expect(roles).toContain('clerk');
      expect(roles).toContain('council');
      expect(roles).toContain('public');
    });
  });
});
