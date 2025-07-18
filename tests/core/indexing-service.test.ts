import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  IndexingService,
  CivicIndex,
  CivicIndexEntry,
} from '../../core/src/indexing/indexing-service.js';
import { CivicPress } from '../../core/src/civic-core.js';
import { mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import {
  createTestDirectory,
  cleanupTestDirectory,
  createRolesConfig,
} from '../fixtures/test-setup';

describe('IndexingService', () => {
  let indexingService: IndexingService;
  let civicPress: CivicPress;
  let testConfig: any;

  beforeEach(async () => {
    // Create test directory with proper structure
    testConfig = createTestDirectory('indexing-service-test');

    // Create roles configuration
    createRolesConfig(testConfig);

    // Initialize CivicPress with test database
    civicPress = new CivicPress({
      dataDir: testConfig.dataDir,
      database: {
        type: 'sqlite' as const,
        sqlite: {
          file: join(testConfig.testDir, 'test.db'),
        },
      },
    });
    await civicPress.initialize();

    // Mock getRecordManager for sync tests
    civicPress.getRecordManager = vi.fn().mockReturnValue({
      createRecord: vi.fn().mockResolvedValue({ id: 'test-record-1' }),
      updateRecord: vi.fn().mockResolvedValue({ id: 'test-record-1' }),
      getRecord: vi.fn().mockResolvedValue({ id: 'test-record-1' }),
      listRecords: vi.fn().mockResolvedValue({ records: [], total: 0 }),
    } as any);

    // Create test records directory
    const recordsDir = join(testConfig.recordsDir);
    mkdirSync(recordsDir, { recursive: true });

    // Create sample records
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

    indexingService = new IndexingService(civicPress, testConfig.dataDir);
  });

  afterEach(async () => {
    // Clean up test data
    cleanupTestDirectory(testConfig);
    await civicPress.shutdown();
  });

  describe('generateIndexes', () => {
    it('should generate indexes from markdown files', async () => {
      const index = await indexingService.generateIndexes();

      expect(index).toBeDefined();
      expect(index.entries).toHaveLength(3);
      expect(index.metadata.totalRecords).toBe(3);
      expect(index.metadata.modules).toContain('legal-register');
      expect(index.metadata.types).toContain('bylaw');
      expect(index.metadata.types).toContain('policy');
      expect(index.metadata.types).toContain('resolution');
      expect(index.metadata.statuses).toContain('adopted');
      expect(index.metadata.statuses).toContain('draft');
      expect(index.metadata.statuses).toContain('proposed');
    });

    it('should filter by type', async () => {
      const index = await indexingService.generateIndexes({ types: ['bylaw'] });

      expect(index.entries).toHaveLength(1);
      expect(index.entries[0].type).toBe('bylaw');
    });

    it('should filter by status', async () => {
      const index = await indexingService.generateIndexes({
        statuses: ['draft'],
      });

      expect(index.entries).toHaveLength(1);
      expect(index.entries[0].status).toBe('draft');
    });

    it('should filter by module', async () => {
      const index = await indexingService.generateIndexes({
        modules: ['legal-register'],
      });

      expect(index.entries).toHaveLength(3);
      expect(
        index.entries.every((entry) => entry.module === 'legal-register')
      ).toBe(true);
    });
  });

  describe('loadIndex', () => {
    it('should load existing index', async () => {
      // Generate index first
      await indexingService.generateIndexes();

      const indexPath = join(testConfig.recordsDir, 'index.yml');
      const loadedIndex = indexingService.loadIndex(indexPath);

      expect(loadedIndex).toBeDefined();
      expect(loadedIndex?.entries).toHaveLength(3);
      expect(loadedIndex?.metadata.totalRecords).toBe(3);
    });

    it('should return null for non-existent index', () => {
      const loadedIndex = indexingService.loadIndex('non-existent.yml');
      expect(loadedIndex).toBeNull();
    });
  });

  describe('searchIndex', () => {
    let index: CivicIndex;

    beforeEach(async () => {
      index = await indexingService.generateIndexes();
    });

    it('should search by title', () => {
      const results = indexingService.searchIndex(index, 'noise', {});
      expect(results).toHaveLength(1);
      expect(results[0].title).toContain('Noise');
    });

    it('should search by tags', () => {
      const results = indexingService.searchIndex(index, 'privacy', {});
      expect(results).toHaveLength(1);
      expect(results[0].tags).toContain('privacy');
    });

    it('should search by author name', () => {
      const results = indexingService.searchIndex(index, 'Ada', {});
      expect(results).toHaveLength(1);
      expect(results[0].authors?.[0].name).toContain('Ada');
    });

    it('should filter by type', () => {
      const results = indexingService.searchIndex(index, '', { type: 'bylaw' });
      expect(results).toHaveLength(1);
      expect(results[0].type).toBe('bylaw');
    });

    it('should filter by status', () => {
      const results = indexingService.searchIndex(index, '', {
        status: 'draft',
      });
      expect(results).toHaveLength(1);
      expect(results[0].status).toBe('draft');
    });

    it('should filter by module', () => {
      const results = indexingService.searchIndex(index, '', {
        module: 'legal-register',
      });
      expect(results).toHaveLength(3);
      expect(results.every((entry) => entry.module === 'legal-register')).toBe(
        true
      );
    });

    it('should filter by tags', () => {
      const results = indexingService.searchIndex(index, '', {
        tags: ['noise'],
      });
      expect(results).toHaveLength(1);
      expect(results[0].tags).toContain('noise');
    });

    it('should combine search and filters', () => {
      const results = indexingService.searchIndex(index, 'data', {
        type: 'policy',
      });
      expect(results).toHaveLength(1);
      expect(results[0].title).toContain('Data');
      expect(results[0].type).toBe('policy');
    });
  });

  describe('index structure', () => {
    it('should extract correct metadata from frontmatter', async () => {
      const index = await indexingService.generateIndexes();
      const noiseEntry = index.entries.find((entry) =>
        entry.title.includes('Noise')
      );

      expect(noiseEntry).toBeDefined();
      expect(noiseEntry?.file).toBe('bylaw-noise-restrictions.md');
      expect(noiseEntry?.title).toBe('Noise Restrictions');
      expect(noiseEntry?.type).toBe('bylaw');
      expect(noiseEntry?.status).toBe('adopted');
      expect(noiseEntry?.module).toBe('legal-register');
      expect(noiseEntry?.tags).toEqual(['noise', 'nighttime', 'curfew']);
      expect(noiseEntry?.authors).toEqual([
        { name: 'Ada Lovelace', role: 'clerk' },
      ]);
      expect(noiseEntry?.created).toBe('2025-06-12');
      expect(noiseEntry?.updated).toBe('2025-07-01');
      expect(noiseEntry?.slug).toBe('noise-restrictions');
    });
  });

  describe('generateIndexes with sync', () => {
    it('should generate indexes with sync to database', async () => {
      const index = await indexingService.generateIndexes({
        syncDatabase: true,
        conflictResolution: 'file-wins',
      });

      expect(index).toBeDefined();
      expect(index.entries).toHaveLength(3);
      expect(index.metadata.totalRecords).toBe(3);
    });

    it('should generate indexes with different conflict resolution strategies', async () => {
      const strategies = ['file-wins', 'database-wins', 'timestamp', 'manual'];

      for (const strategy of strategies) {
        const index = await indexingService.generateIndexes({
          syncDatabase: true,
          conflictResolution: strategy as any,
        });

        expect(index).toBeDefined();
        expect(index.metadata.totalRecords).toBe(3);
      }
    });
  });
});
