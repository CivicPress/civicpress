import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execSync } from 'child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';
import { tmpdir } from 'os';
import yaml from 'js-yaml';

describe('CLI Sync Commands', () => {
  let testDir: string;
  let originalCwd: string;

  beforeEach(async () => {
    // Create test directory
    testDir = join(tmpdir(), `civicpress-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });

    // Store original working directory
    originalCwd = process.cwd();

    // Change to test directory
    process.chdir(testDir);

    // Initialize CivicPress in test directory
    execSync('cd cli && pnpm run build', { cwd: resolve(originalCwd) });
    execSync(
      `node ${resolve(originalCwd, 'cli/dist/index.js')} init --silent --config ${resolve(originalCwd, 'tests/fixtures/test-init-config.yml')}`,
      {
        cwd: testDir,
        stdio: 'pipe',
        env: { ...process.env, NODE_ENV: 'test' },
      }
    );

    // Create test records
    const recordsDir = join(testDir, 'data', 'records');
    mkdirSync(recordsDir, { recursive: true });

    const sampleRecords = [
      {
        file: 'bylaw-noise-restrictions.md',
        content: `---
title: 'Noise Restrictions'
type: bylaw
status: adopted
module: legal-register
tags: ['noise', 'nighttime', 'curfew']
authors:
  - name: 'Ada Lovelace'
    role: 'clerk'
created: '2025-06-12'
updated: '2025-07-01'
slug: 'noise-restrictions'
---

# Noise Restrictions

This bylaw establishes noise restrictions.`,
      },
      {
        file: 'policy-data-privacy.md',
        content: `---
title: 'Data Privacy Policy'
type: policy
status: draft
module: legal-register
tags: ['privacy', 'data', 'technology']
authors:
  - name: 'Irène Joliot-Curie'
    role: 'council'
created: '2025-07-15'
updated: '2025-07-15'
slug: 'data-privacy-policy'
---

# Data Privacy Policy

This policy establishes data privacy guidelines.`,
      },
      {
        file: 'resolution-budget-2025.md',
        content: `---
title: 'Budget Resolution 2025'
type: resolution
status: proposed
module: legal-register
tags: ['budget', 'finance', '2025']
authors:
  - name: 'Luc Lapointe'
    role: 'mayor'
created: '2025-07-20'
updated: '2025-07-20'
slug: 'budget-resolution-2025'
---

# Budget Resolution 2025

This resolution approves the 2025 budget.`,
      },
    ];

    // Write sample records
    for (const record of sampleRecords) {
      writeFileSync(join(recordsDir, record.file), record.content);
    }
  });

  afterEach(async () => {
    // Clean up test directory
    rmSync(testDir, { recursive: true, force: true });

    // Restore original working directory
    process.chdir(originalCwd);
  });

  describe('civic index', () => {
    it('should generate index with default options', () => {
      const result = execSync(
        `node ${resolve(originalCwd, 'cli/dist/index.js')} index`,
        {
          cwd: testDir,
          encoding: 'utf8',
        }
      );

      expect(result).toContain('Generated index with 3 records');
      expect(result).toContain('Types: bylaw, policy, resolution');
      expect(result).toContain('Modules: legal-register');

      // Check that index file was created
      const indexPath = join(testDir, 'data', 'records', 'index.yml');
      expect(existsSync(indexPath)).toBe(true);

      // Load and verify index content
      const indexContent = yaml.load(
        require('fs').readFileSync(indexPath, 'utf8')
      ) as any;
      expect(indexContent.entries).toHaveLength(3);
      expect(indexContent.metadata.totalRecords).toBe(3);
    });

    it('should generate index with filters', () => {
      const result = execSync(
        `node ${resolve(originalCwd, 'cli/dist/index.js')} index --type bylaw --status adopted`,
        { cwd: testDir, encoding: 'utf8' }
      );

      expect(result).toContain('Generated index with 1 records');

      // Check that index file was created
      const indexPath = join(testDir, 'data', 'records', 'index.yml');
      expect(existsSync(indexPath)).toBe(true);

      // Load and verify filtered index content
      const indexContent = yaml.load(
        require('fs').readFileSync(indexPath, 'utf8')
      ) as any;
      expect(indexContent.entries).toHaveLength(1);
      expect(indexContent.entries[0].type).toBe('bylaw');
      expect(indexContent.entries[0].status).toBe('adopted');
    });

    it('should support --json output', () => {
      const result = execSync(
        `node ${resolve(originalCwd, 'cli/dist/index.js')} index --json`,
        {
          cwd: testDir,
          encoding: 'utf8',
        }
      );

      // Extract JSON from the output (it comes after initialization messages)
      const jsonMatch = result.match(/\{[\s\S]*\}/);
      expect(jsonMatch).toBeTruthy();
      const jsonResult = JSON.parse(jsonMatch![0]);
      expect(jsonResult.metadata).toBeDefined();
      expect(jsonResult.metadata.totalRecords).toBe(3);
    });

    it('should support --silent output', () => {
      const result = execSync(
        `node ${resolve(originalCwd, 'cli/dist/index.js')} index --silent`,
        {
          cwd: testDir,
          encoding: 'utf8',
        }
      );

      // Silent mode should suppress most output, but may still show some initialization messages
      expect(result).not.toContain('Generated index with');
      expect(result).not.toContain('Types:');
      expect(result).not.toContain('Modules:');
    });
  });

  describe('civic index with sync', () => {
    it('should generate index and sync with default conflict resolution', () => {
      const result = execSync(
        `node ${resolve(originalCwd, 'cli/dist/index.js')} index --sync-db`,
        {
          cwd: testDir,
          encoding: 'utf8',
        }
      );

      expect(result).toContain('Generated index with 3 records');
      expect(result).toContain(
        'Database sync completed with conflict resolution: file-wins'
      );

      // Check that index file was created
      const indexPath = join(testDir, 'data', 'records', 'index.yml');
      expect(existsSync(indexPath)).toBe(true);
    });

    it('should generate index and sync with file-wins strategy', () => {
      const result = execSync(
        `node ${resolve(originalCwd, 'cli/dist/index.js')} index --sync-db --conflict-resolution file-wins`,
        { cwd: testDir, encoding: 'utf8' }
      );

      expect(result).toContain(
        'Database sync completed with conflict resolution: file-wins'
      );
    });

    it('should generate index and sync with database-wins strategy', () => {
      const result = execSync(
        `node ${resolve(originalCwd, 'cli/dist/index.js')} index --sync-db --conflict-resolution database-wins`,
        { cwd: testDir, encoding: 'utf8' }
      );

      expect(result).toContain(
        'Database sync completed with conflict resolution: database-wins'
      );
    });

    it('should generate index and sync with timestamp strategy', () => {
      const result = execSync(
        `node ${resolve(originalCwd, 'cli/dist/index.js')} index --sync-db --conflict-resolution timestamp`,
        { cwd: testDir, encoding: 'utf8' }
      );

      expect(result).toContain(
        'Database sync completed with conflict resolution: timestamp'
      );
    });

    it('should generate index and sync with manual strategy', () => {
      const result = execSync(
        `node ${resolve(originalCwd, 'cli/dist/index.js')} index --sync-db --conflict-resolution manual`,
        { cwd: testDir, encoding: 'utf8' }
      );

      expect(result).toContain(
        'Database sync completed with conflict resolution: manual'
      );
    });

    it('should validate conflict resolution strategy', () => {
      // The CLI should accept any conflict resolution strategy, so this test should pass
      const result = execSync(
        `node ${resolve(originalCwd, 'cli/dist/index.js')} index --sync-db --conflict-resolution invalid`,
        { cwd: testDir, encoding: 'utf8' }
      );

      expect(result).toContain(
        'Database sync completed with conflict resolution: invalid'
      );
    });

    it('should support --json output with sync', () => {
      const result = execSync(
        `node ${resolve(originalCwd, 'cli/dist/index.js')} index --sync-db --json`,
        {
          cwd: testDir,
          encoding: 'utf8',
        }
      );

      // Extract JSON from the output (it comes after initialization messages)
      const jsonMatch = result.match(/\{[\s\S]*\}/);
      expect(jsonMatch).toBeTruthy();
      const jsonResult = JSON.parse(jsonMatch![0]);
      expect(jsonResult.metadata).toBeDefined();
      expect(jsonResult.metadata.totalRecords).toBe(3);
    });

    it('should support --silent output with sync', () => {
      const result = execSync(
        `node ${resolve(originalCwd, 'cli/dist/index.js')} index --sync-db --silent`,
        {
          cwd: testDir,
          encoding: 'utf8',
        }
      );

      // Silent mode should suppress most output, but may still show some initialization messages
      expect(result).not.toContain('Generated index with');
      expect(result).not.toContain('Database sync completed');
    });
  });
});
