/**
 * Unit Tests for Template Cache
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { TemplateCache } from '../template-cache.js';
import { Logger } from '../../utils/logger.js';
import type { TemplateResponse } from '../types.js';

describe('TemplateCache', () => {
  let cache: TemplateCache;
  let testDataDir: string;
  let mockLogger: Logger;

  beforeEach(() => {
    testDataDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'civicpress-cache-test-')
    );

    // Create directory structure
    fs.mkdirSync(path.join(testDataDir, '.civic', 'templates', 'bylaw'), {
      recursive: true,
    });

    mockLogger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    } as any;

    cache = new TemplateCache({
      dataDir: testDataDir,
      logger: mockLogger,
      enableWatching: false, // Disable watching in tests for speed
    });
  });

  afterEach(() => {
    // Clear cache first to free memory
    if (cache) {
      cache.clear();
      cache.stopWatching();
    }

    // Cleanup test directory
    if (testDataDir && fs.existsSync(testDataDir)) {
      try {
        fs.rmSync(testDataDir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
    }
  });

  describe('get and set', () => {
    it('should store and retrieve template', () => {
      const template: TemplateResponse = {
        id: 'bylaw/test',
        type: 'bylaw',
        name: 'test',
        content: '# Test',
        rawContent: '---\ntype: bylaw\n---\n# Test',
      };

      cache.set('bylaw/test', template);
      const retrieved = cache.get('bylaw/test');

      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe('bylaw/test');
      expect(retrieved?.name).toBe('test');
    });

    it('should return null for non-existent template', () => {
      const result = cache.get('bylaw/nonexistent');

      expect(result).toBeNull();
    });

    it('should overwrite existing template', () => {
      const template1: TemplateResponse = {
        id: 'bylaw/test',
        type: 'bylaw',
        name: 'test',
        content: '# Original',
        rawContent: '---\ntype: bylaw\n---\n# Original',
      };

      const template2: TemplateResponse = {
        id: 'bylaw/test',
        type: 'bylaw',
        name: 'test',
        content: '# Updated',
        rawContent: '---\ntype: bylaw\n---\n# Updated',
      };

      cache.set('bylaw/test', template1);
      cache.set('bylaw/test', template2);

      const retrieved = cache.get('bylaw/test');
      expect(retrieved?.content).toBe('# Updated');
    });
  });

  describe('delete', () => {
    it('should delete template from cache', () => {
      const template: TemplateResponse = {
        id: 'bylaw/test',
        type: 'bylaw',
        name: 'test',
        content: '# Test',
        rawContent: '---\ntype: bylaw\n---\n# Test',
      };

      cache.set('bylaw/test', template);
      expect(cache.get('bylaw/test')).toBeDefined();

      cache.delete('bylaw/test');
      expect(cache.get('bylaw/test')).toBeNull();
    });

    it('should clear list cache when template is deleted', () => {
      const template: TemplateResponse = {
        id: 'bylaw/test',
        type: 'bylaw',
        name: 'test',
        content: '# Test',
        rawContent: '---\ntype: bylaw\n---\n# Test',
      };

      cache.setList('list:key', [template]);
      expect(cache.getList('list:key')).toBeDefined();

      cache.delete('bylaw/test');
      expect(cache.getList('list:key')).toBeNull();
    });
  });

  describe('clear', () => {
    it('should clear all templates from cache', () => {
      const template1: TemplateResponse = {
        id: 'bylaw/test1',
        type: 'bylaw',
        name: 'test1',
        content: '# Test 1',
        rawContent: '---\ntype: bylaw\n---\n# Test 1',
      };

      const template2: TemplateResponse = {
        id: 'bylaw/test2',
        type: 'bylaw',
        name: 'test2',
        content: '# Test 2',
        rawContent: '---\ntype: bylaw\n---\n# Test 2',
      };

      cache.set('bylaw/test1', template1);
      cache.set('bylaw/test2', template2);

      expect(cache.size()).toBe(2);

      cache.clear();

      expect(cache.size()).toBe(0);
      expect(cache.get('bylaw/test1')).toBeNull();
      expect(cache.get('bylaw/test2')).toBeNull();
    });

    it('should clear list cache', () => {
      const templates: TemplateResponse[] = [
        {
          id: 'bylaw/test1',
          type: 'bylaw',
          name: 'test1',
          content: '# Test 1',
          rawContent: '---\ntype: bylaw\n---\n# Test 1',
        },
      ];

      cache.setList('list:key', templates);
      expect(cache.getList('list:key')).toBeDefined();

      cache.clear();
      expect(cache.getList('list:key')).toBeNull();
    });
  });

  describe('list cache', () => {
    it('should store and retrieve template list', () => {
      const templates: TemplateResponse[] = [
        {
          id: 'bylaw/test1',
          type: 'bylaw',
          name: 'test1',
          content: '# Test 1',
          rawContent: '---\ntype: bylaw\n---\n# Test 1',
        },
        {
          id: 'bylaw/test2',
          type: 'bylaw',
          name: 'test2',
          content: '# Test 2',
          rawContent: '---\ntype: bylaw\n---\n# Test 2',
        },
      ];

      cache.setList('list:bylaw', templates);
      const retrieved = cache.getList('list:bylaw');

      expect(retrieved).toBeDefined();
      expect(retrieved?.length).toBe(2);
      expect(retrieved?.[0].id).toBe('bylaw/test1');
    });

    it('should return null for non-existent list', () => {
      const result = cache.getList('list:nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('has', () => {
    it('should return true if template exists in cache', () => {
      const template: TemplateResponse = {
        id: 'bylaw/test',
        type: 'bylaw',
        name: 'test',
        content: '# Test',
        rawContent: '---\ntype: bylaw\n---\n# Test',
      };

      cache.set('bylaw/test', template);

      expect(cache.has('bylaw/test')).toBe(true);
    });

    it('should return false if template does not exist', () => {
      expect(cache.has('bylaw/nonexistent')).toBe(false);
    });
  });

  describe('size', () => {
    it('should return correct cache size', () => {
      expect(cache.size()).toBe(0);

      const template1: TemplateResponse = {
        id: 'bylaw/test1',
        type: 'bylaw',
        name: 'test1',
        content: '# Test 1',
        rawContent: '---\ntype: bylaw\n---\n# Test 1',
      };

      const template2: TemplateResponse = {
        id: 'bylaw/test2',
        type: 'bylaw',
        name: 'test2',
        content: '# Test 2',
        rawContent: '---\ntype: bylaw\n---\n# Test 2',
      };

      cache.set('bylaw/test1', template1);
      expect(cache.size()).toBe(1);

      cache.set('bylaw/test2', template2);
      expect(cache.size()).toBe(2);
    });
  });

  describe('invalidate', () => {
    it('should invalidate specific template', () => {
      const template: TemplateResponse = {
        id: 'bylaw/test',
        type: 'bylaw',
        name: 'test',
        content: '# Test',
        rawContent: '---\ntype: bylaw\n---\n# Test',
      };

      cache.set('bylaw/test', template);
      expect(cache.has('bylaw/test')).toBe(true);

      cache.invalidate('bylaw/test');
      expect(cache.has('bylaw/test')).toBe(false);
    });

    it('should clear all cache when no ID provided', () => {
      const template1: TemplateResponse = {
        id: 'bylaw/test1',
        type: 'bylaw',
        name: 'test1',
        content: '# Test 1',
        rawContent: '---\ntype: bylaw\n---\n# Test 1',
      };

      const template2: TemplateResponse = {
        id: 'bylaw/test2',
        type: 'bylaw',
        name: 'test2',
        content: '# Test 2',
        rawContent: '---\ntype: bylaw\n---\n# Test 2',
      };

      cache.set('bylaw/test1', template1);
      cache.set('bylaw/test2', template2);

      cache.invalidate();

      expect(cache.size()).toBe(0);
    });
  });

  describe('getStats', () => {
    it('should return cache statistics', () => {
      const template: TemplateResponse = {
        id: 'bylaw/test',
        type: 'bylaw',
        name: 'test',
        content: '# Test',
        rawContent: '---\ntype: bylaw\n---\n# Test',
      };

      cache.set('bylaw/test', template);
      cache.setList('list:key', [template]);

      const stats = cache.getStats();

      expect(stats.templateCount).toBe(1);
      expect(stats.listCacheCount).toBe(1);
      expect(stats.watchedDirectories).toBe(0); // Watching disabled in tests
    });
  });

  describe('stopWatching', () => {
    it('should stop all file watchers', () => {
      cache.stopWatching();
      // Should not throw
      expect(true).toBe(true);
    });
  });
});
