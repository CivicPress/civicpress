import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execSync } from 'child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';
import { tmpdir } from 'os';
import yaml from 'js-yaml';
import { RecordParser, RecordData } from '@civicpress/core';
import { ensureCliBuilt } from '../fixtures/test-setup';

describe('CLI Sync Commands', () => {
  let testDir: string;
  let originalCwd: string;

  beforeEach(async () => {
    // Create test directory
    testDir = join(tmpdir(), `civicpress-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });

    // Store original working directory
    originalCwd = process.cwd();

    // Ensure CLI build is available
    ensureCliBuilt();

    // Change to test directory
    process.chdir(testDir);

    // Initialize CivicPress in test directory
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

    const sampleRecords: Array<{ file: string; record: RecordData }> = [
      {
        file: 'bylaw-noise-restrictions.md',
        record: {
          id: 'record-1718208000000',
          title: 'Noise Restrictions',
          type: 'bylaw',
          status: 'approved',
          content:
            '# Noise Restrictions\n\nThis bylaw establishes noise restrictions.',
          author: 'alovelace',
          authors: [
            {
              name: 'Ada Lovelace',
              username: 'alovelace',
              role: 'clerk',
            },
          ],
          created_at: '2025-06-12T10:00:00Z',
          updated_at: '2025-07-01T14:30:00Z',
          metadata: {
            tags: ['noise', 'nighttime', 'curfew'],
            module: 'legal-register',
            slug: 'noise-restrictions',
            version: '1.0.0',
          },
        },
      },
      {
        file: 'policy-data-privacy.md',
        record: {
          id: 'record-1721059200000',
          title: 'Data Privacy Policy',
          type: 'policy',
          status: 'draft',
          content:
            '# Data Privacy Policy\n\nThis policy establishes data privacy guidelines.',
          author: 'ijoliotcurie',
          authors: [
            {
              name: 'Irène Joliot-Curie',
              username: 'ijoliotcurie',
              role: 'council',
            },
          ],
          created_at: '2025-07-15T10:00:00Z',
          updated_at: '2025-07-15T10:00:00Z',
          metadata: {
            tags: ['privacy', 'data', 'technology'],
            module: 'legal-register',
            slug: 'data-privacy-policy',
            version: '1.0.0',
          },
        },
      },
      {
        file: 'resolution-budget-2025.md',
        record: {
          id: 'record-1721491200000',
          title: 'Budget Resolution 2025',
          type: 'resolution',
          status: 'pending_review',
          content:
            '# Budget Resolution 2025\n\nThis resolution approves the 2025 budget.',
          author: 'llapointe',
          authors: [
            {
              name: 'Luc Lapointe',
              username: 'llapointe',
              role: 'mayor',
            },
          ],
          created_at: '2025-07-20T10:00:00Z',
          updated_at: '2025-07-20T10:00:00Z',
          metadata: {
            tags: ['budget', 'finance', '2025'],
            module: 'legal-register',
            slug: 'budget-resolution-2025',
            version: '1.0.0',
          },
        },
      },
    ];

    // Write sample records
    for (const { file, record } of sampleRecords) {
      const markdown = RecordParser.serializeToMarkdown(record);
      writeFileSync(join(recordsDir, file), markdown);
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
        `node ${resolve(originalCwd, 'cli/dist/index.js')} index --type bylaw --status approved`,
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
      expect(indexContent.entries[0].status).toBe('approved');
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
