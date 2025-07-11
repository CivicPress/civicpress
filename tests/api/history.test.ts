import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { CivicPressAPI } from '../../modules/api/src/index';
import { join } from 'path';
import { mkdir, writeFile } from 'fs/promises';
import { execSync } from 'child_process';

describe('History API', () => {
  let api: CivicPressAPI;
  let authToken: string;

  beforeEach(async () => {
    // Create test data directory
    const testDataDir = join(__dirname, '../fixtures/test-history-data');
    await mkdir(testDataDir, { recursive: true });
    await mkdir(join(testDataDir, 'records'), { recursive: true });
    await mkdir(join(testDataDir, 'records/policy'), { recursive: true });

    // Create a test record
    const testRecordPath = join(testDataDir, 'records/policy/test-policy.md');
    await writeFile(
      testRecordPath,
      `---
title: Test Policy
type: policy
status: draft
---

# Test Policy

This is a test policy for history testing.
`
    );

    // Initialize Git repository
    execSync('git init', { cwd: testDataDir });
    execSync('git config user.name "Test User"', { cwd: testDataDir });
    execSync('git config user.email "test@example.com"', { cwd: testDataDir });
    execSync('git add .', { cwd: testDataDir });
    execSync('git commit -m "feat(test): Add test policy"', {
      cwd: testDataDir,
    });

    // Create API instance
    api = new CivicPressAPI(3001);

    await api.initialize(testDataDir);
    await api.start();

    // Mock authentication token
    authToken = 'test-token';
  });

  afterEach(async () => {
    if (api) {
      await api.shutdown();
    }
  });

  describe('GET /api/history', () => {
    it('should return history for all records', async () => {
      const response = await request(api.getApp())
        .get('/api/history')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.history).toBeDefined();
      expect(response.body.data.summary).toBeDefined();
      expect(response.body.data.summary.totalCommits).toBeGreaterThan(0);
    });

    it('should filter by record', async () => {
      const response = await request(api.getApp())
        .get('/api/history?record=policy/test-policy')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.history).toBeDefined();
      expect(response.body.data.summary.record).toBe('policy/test-policy');
    });

    it('should support pagination', async () => {
      const response = await request(api.getApp())
        .get('/api/history?limit=5&offset=0')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.summary.limit).toBe(5);
      expect(response.body.data.summary.offset).toBe(0);
    });

    it('should validate limit parameter', async () => {
      const response = await request(api.getApp())
        .get('/api/history?limit=150')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error.message).toBe('Invalid request data');
    });

    it('should require authentication', async () => {
      const response = await request(api.getApp()).get('/api/history');

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });
  });

  describe('GET /api/history/:record', () => {
    it('should return history for specific record', async () => {
      const response = await request(api.getApp())
        .get('/api/history/policy/test-policy')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.history).toBeDefined();
      expect(response.body.data.summary.record).toBe('policy/test-policy');
    });

    it('should support filtering by author', async () => {
      const response = await request(api.getApp())
        .get('/api/history/policy/test-policy?author=test')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.summary.filters.author).toBe('test');
    });

    it('should support date filtering', async () => {
      const since = new Date();
      since.setDate(since.getDate() - 1);

      const response = await request(api.getApp())
        .get(`/api/history/policy/test-policy?since=${since.toISOString()}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.summary.filters.since).toBe(
        since.toISOString()
      );
    });

    it('should require authentication', async () => {
      const response = await request(api.getApp()).get(
        '/api/history/policy/test-policy'
      );

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });
  });

  describe('History Data Structure', () => {
    it('should return properly formatted history entries', async () => {
      const response = await request(api.getApp())
        .get('/api/history')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);

      if (response.body.data.history.length > 0) {
        const historyEntry = response.body.data.history[0];

        expect(historyEntry).toHaveProperty('hash');
        expect(historyEntry).toHaveProperty('shortHash');
        expect(historyEntry).toHaveProperty('message');
        expect(historyEntry).toHaveProperty('author');
        expect(historyEntry).toHaveProperty('email');
        expect(historyEntry).toHaveProperty('date');
        expect(historyEntry).toHaveProperty('timestamp');
        expect(historyEntry).toHaveProperty('record');

        expect(typeof historyEntry.hash).toBe('string');
        expect(typeof historyEntry.shortHash).toBe('string');
        expect(typeof historyEntry.message).toBe('string');
        expect(typeof historyEntry.author).toBe('string');
        expect(typeof historyEntry.timestamp).toBe('string');
      }
    });

    it('should return proper summary structure', async () => {
      const response = await request(api.getApp())
        .get('/api/history')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);

      const summary = response.body.data.summary;
      expect(summary).toHaveProperty('totalCommits');
      expect(summary).toHaveProperty('returnedCommits');
      expect(summary).toHaveProperty('limit');
      expect(summary).toHaveProperty('offset');
      expect(summary).toHaveProperty('record');
      expect(summary).toHaveProperty('filters');

      expect(typeof summary.totalCommits).toBe('number');
      expect(typeof summary.returnedCommits).toBe('number');
      expect(typeof summary.limit).toBe('number');
      expect(typeof summary.offset).toBe('number');
    });
  });
});
