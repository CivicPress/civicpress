import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import { CivicPressAPI } from '../../modules/api/src/index.js';
import { mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';

// Enable bypass auth for tests
process.env.BYPASS_AUTH = 'true';

// Mock the CivicPress core to avoid complex setup in tests
vi.mock('@civicpress/core', () => ({
  CentralConfigManager: {
    getDatabaseConfig: vi.fn().mockReturnValue({
      type: 'sqlite',
      database: ':memory:',
    }),
  },
  CivicPress: vi.fn().mockImplementation(() => ({
    initialize: vi.fn().mockResolvedValue(undefined),
    shutdown: vi.fn().mockResolvedValue(undefined),
    getRecordManager: vi.fn(() => ({
      createRecord: vi.fn().mockResolvedValue({ id: 'test-record-1' }),
      updateRecord: vi.fn().mockResolvedValue({ id: 'test-record-1' }),
      getRecord: vi.fn().mockResolvedValue({ id: 'test-record-1' }),
      listRecords: vi.fn().mockResolvedValue({ records: [], total: 0 }),
    })),
    getIndexingService: vi.fn(() => ({
      generateIndexes: vi.fn().mockImplementation((options: any = {}) => {
        const index = {
          entries: [
            {
              title: 'Noise Restrictions',
              type: 'bylaw',
              status: 'adopted',
              module: 'legal-register',
              tags: ['noise', 'nighttime', 'curfew'],
              authors: [{ name: 'Ada Lovelace', role: 'clerk' }],
              created: '2025-06-12',
              updated: '2025-07-01',
              slug: 'noise-restrictions',
              path: 'records/bylaw-noise-restrictions.md',
            },
            {
              title: 'Data Privacy Policy',
              type: 'policy',
              status: 'draft',
              module: 'legal-register',
              tags: ['privacy', 'data', 'technology'],
              authors: [{ name: 'Irène Joliot-Curie', role: 'council' }],
              created: '2025-07-15',
              updated: '2025-07-15',
              slug: 'data-privacy-policy',
              path: 'records/policy-data-privacy.md',
            },
            {
              title: 'Budget Resolution 2025',
              type: 'resolution',
              status: 'proposed',
              module: 'legal-register',
              tags: ['budget', 'finance', '2025'],
              authors: [{ name: 'Luc Lapointe', role: 'mayor' }],
              created: '2025-07-20',
              updated: '2025-07-20',
              slug: 'budget-resolution-2025',
              path: 'records/resolution-budget-2025.md',
            },
          ],
          metadata: {
            totalRecords: 3,
            modules: ['legal-register'],
            types: ['bylaw', 'policy', 'resolution'],
            statuses: ['adopted', 'draft', 'proposed'],
            generatedAt: new Date().toISOString(),
          },
        };

        // Apply filters if provided
        if (options.types) {
          index.entries = index.entries.filter((entry) =>
            options.types.includes(entry.type)
          );
        }
        if (options.statuses) {
          index.entries = index.entries.filter((entry) =>
            options.statuses.includes(entry.status)
          );
        }
        if (options.modules) {
          index.entries = index.entries.filter((entry) =>
            options.modules.includes(entry.module)
          );
        }

        return index;
      }),
      loadIndex: vi.fn().mockImplementation((path: string) => {
        if (path.includes('non-existent')) {
          return null;
        }
        return {
          entries: [
            {
              title: 'Noise Restrictions',
              type: 'bylaw',
              status: 'adopted',
              module: 'legal-register',
              tags: ['noise', 'nighttime', 'curfew'],
              authors: [{ name: 'Ada Lovelace', role: 'clerk' }],
              created: '2025-06-12',
              updated: '2025-07-01',
              slug: 'noise-restrictions',
              path: 'records/bylaw-noise-restrictions.md',
            },
          ],
          metadata: {
            totalRecords: 1,
            modules: ['legal-register'],
            types: ['bylaw'],
            statuses: ['adopted'],
            generatedAt: new Date().toISOString(),
          },
        };
      }),
      searchIndex: vi
        .fn()
        .mockImplementation((index: any, query: string, filters: any = {}) => {
          let results = index.entries;

          // Apply search query
          if (query) {
            results = results.filter(
              (entry: any) =>
                entry.title.toLowerCase().includes(query.toLowerCase()) ||
                entry.tags.some((tag: string) =>
                  tag.toLowerCase().includes(query.toLowerCase())
                ) ||
                entry.authors.some((author: any) =>
                  author.name.toLowerCase().includes(query.toLowerCase())
                )
            );
          }

          // Apply filters
          if (filters.type) {
            results = results.filter(
              (entry: any) => entry.type === filters.type
            );
          }
          if (filters.status) {
            results = results.filter(
              (entry: any) => entry.status === filters.status
            );
          }

          return results;
        }),
      syncRecordsToDatabase: vi.fn().mockImplementation((options: any = {}) => {
        return {
          totalRecords: 3,
          created: 3,
          updated: 0,
          conflicts: 0,
          conflictResolution: options.conflictResolution || 'file-wins',
          details: {
            bylaw: { created: 1, updated: 0 },
            policy: { created: 1, updated: 0 },
            resolution: { created: 1, updated: 0 },
          },
        };
      }),
    })),
  })),
  WorkflowConfigManager: vi.fn().mockImplementation(() => ({
    initialize: vi.fn().mockResolvedValue(undefined),
    loadWorkflows: vi.fn().mockResolvedValue([]),
    getWorkflow: vi.fn().mockReturnValue(null),
    listWorkflows: vi.fn().mockReturnValue([]),
  })),
  Logger: vi.fn().mockImplementation(() => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  })),
}));

describe('Indexing API', () => {
  let api: CivicPressAPI;
  let testDataDir: string;
  let authToken: string;

  beforeEach(async () => {
    // Create test data directory
    testDataDir = join(process.cwd(), 'test-indexing-api-data');
    mkdirSync(testDataDir, { recursive: true });

    // Create test records directory
    const recordsDir = join(testDataDir, 'records');
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

    // Initialize API with dynamic port
    const port = 3003 + Math.floor(Math.random() * 1000);
    api = new CivicPressAPI(port);
    await api.initialize(testDataDir);
    await api.start();

    // Create auth token for testing
    authToken = 'test-auth-token';
  });

  afterEach(async () => {
    // Clean up test data
    rmSync(testDataDir, { recursive: true, force: true });
    await api.shutdown();
  });

  describe('GET /api/indexing/status', () => {
    it('should return indexing status', async () => {
      const response = await request(api.getApp())
        .get('/api/indexing/status')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.status).toBeDefined();
      expect(response.body.status.totalRecords).toBeGreaterThan(0);
      expect(response.body.status.modules).toContain('legal-register');
      expect(response.body.status.types).toContain('bylaw');
      expect(response.body.status.types).toContain('policy');
      expect(response.body.status.types).toContain('resolution');
    });

    it('should return 404 when no index exists', async () => {
      // Remove the index file
      const indexPath = join(testDataDir, 'records', 'index.yml');
      if (require('fs').existsSync(indexPath)) {
        require('fs').unlinkSync(indexPath);
      }

      const response = await request(api.getApp())
        .get('/api/indexing/status')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe('INDEX_NOT_FOUND');
    });

    it('should require authentication', async () => {
      const response = await request(api.getApp()).get('/api/indexing/status');

      expect(response.status).toBe(401);
    });
  });

  describe('GET /api/indexing/search', () => {
    it('should search records by query', async () => {
      const response = await request(api.getApp())
        .get('/api/indexing/search?q=noise')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.results.query).toBe('noise');
      expect(response.body.results.total).toBeGreaterThan(0);
      expect(response.body.results.records).toBeDefined();
    });

    it('should filter by type', async () => {
      const response = await request(api.getApp())
        .get('/api/indexing/search?q=&type=bylaw')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.results.records).toBeDefined();
      expect(
        response.body.results.records.every((r: any) => r.type === 'bylaw')
      ).toBe(true);
    });

    it('should filter by status', async () => {
      const response = await request(api.getApp())
        .get('/api/indexing/search?q=&status=draft')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.results.records).toBeDefined();
      expect(
        response.body.results.records.every((r: any) => r.status === 'draft')
      ).toBe(true);
    });

    it('should require query parameter', async () => {
      const response = await request(api.getApp())
        .get('/api/indexing/search')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(400);
      expect(response.body.error.message).toContain(
        'Query parameter "q" is required'
      );
    });

    it('should return empty results for non-matching query', async () => {
      const response = await request(api.getApp())
        .get('/api/indexing/search?q=nonexistent')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.results.total).toBe(0);
      expect(response.body.results.records).toHaveLength(0);
    });
  });

  describe('POST /api/indexing/generate', () => {
    it('should generate indexes', async () => {
      const response = await request(api.getApp())
        .post('/api/indexing/generate')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          rebuild: true,
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.index).toBeDefined();
      expect(response.body.index.totalRecords).toBeGreaterThan(0);
    });

    it('should filter by type', async () => {
      const response = await request(api.getApp())
        .post('/api/indexing/generate')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          types: ['bylaw'],
        });

      expect(response.status).toBe(200);
      expect(response.body.index.types).toContain('bylaw');
    });

    it('should filter by status', async () => {
      const response = await request(api.getApp())
        .post('/api/indexing/generate')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          statuses: ['draft'],
        });

      expect(response.status).toBe(200);
      expect(response.body.index.statuses).toContain('draft');
    });

    it('should require authentication', async () => {
      const response = await request(api.getApp())
        .post('/api/indexing/generate')
        .send({ rebuild: true });

      expect(response.status).toBe(401);
    });
  });

  describe('POST /api/indexing/sync', () => {
    it('should sync records to database', async () => {
      const response = await request(api.getApp())
        .post('/api/indexing/sync')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          conflictResolution: 'file-wins',
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Database sync completed');
      expect(response.body.results).toBeDefined();
      expect(response.body.results.totalRecords).toBeGreaterThan(0);
      expect(response.body.results.conflictResolution).toBe('file-wins');
    });

    it('should use default conflict resolution', async () => {
      const response = await request(api.getApp())
        .post('/api/indexing/sync')
        .set('Authorization', `Bearer ${authToken}`)
        .send({});

      expect(response.status).toBe(200);
      expect(response.body.results.conflictResolution).toBe('file-wins');
    });

    it('should validate conflict resolution strategy', async () => {
      const response = await request(api.getApp())
        .post('/api/indexing/sync')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          conflictResolution: 'invalid-strategy',
        });

      expect(response.status).toBe(400);
      expect(response.body.error.message).toContain('Invalid request data');
    });

    it('should require authentication', async () => {
      const response = await request(api.getApp())
        .post('/api/indexing/sync')
        .send({ conflictResolution: 'file-wins' });

      expect(response.status).toBe(401);
    });
  });

  describe('Conflict Resolution Strategies', () => {
    it('should handle file-wins strategy', async () => {
      const response = await request(api.getApp())
        .post('/api/indexing/sync')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          conflictResolution: 'file-wins',
        });

      expect(response.status).toBe(200);
      expect(response.body.results.conflictResolution).toBe('file-wins');
    });

    it('should handle database-wins strategy', async () => {
      const response = await request(api.getApp())
        .post('/api/indexing/sync')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          conflictResolution: 'database-wins',
        });

      expect(response.status).toBe(200);
      expect(response.body.results.conflictResolution).toBe('database-wins');
    });

    it('should handle timestamp strategy', async () => {
      const response = await request(api.getApp())
        .post('/api/indexing/sync')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          conflictResolution: 'timestamp',
        });

      expect(response.status).toBe(200);
      expect(response.body.results.conflictResolution).toBe('timestamp');
    });

    it('should handle manual strategy', async () => {
      const response = await request(api.getApp())
        .post('/api/indexing/sync')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          conflictResolution: 'manual',
        });

      expect(response.status).toBe(200);
      expect(response.body.results.conflictResolution).toBe('manual');
    });
  });
});
