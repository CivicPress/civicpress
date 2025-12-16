/**
 * Unit Tests for Search Suggestions with Word Extraction
 *
 * Tests the word and title suggestion extraction in SQLiteSearchService
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SQLiteSearchService } from '../sqlite-search-service.js';
import type { DatabaseAdapter } from '../../database/database-adapter.js';

describe('Search Suggestions - Word and Title Extraction', () => {
  let searchService: SQLiteSearchService;
  let mockAdapter: any;

  beforeEach(() => {
    // Mock database adapter
    mockAdapter = {
      query: vi.fn(),
    };

    // Create search service instance
    searchService = new SQLiteSearchService(mockAdapter as DatabaseAdapter);
  });

  describe('getSuggestions - Word Extraction', () => {
    it('should extract words from titles and return them separately', async () => {
      // Mock database results with titles containing the query
      mockAdapter.query.mockResolvedValueOnce([
        { title: 'Article 23 - Bruit répété ou continu', tags: null },
        { title: 'Article 24 - Bruit et ordre', tags: null },
        { title: 'Article 27 - Bruit extérieur', tags: null },
      ]);

      // Mock title suggestions query
      mockAdapter.query.mockResolvedValueOnce([
        { suggestion: 'Article 23 - Bruit répété ou continu', frequency: 1 },
        { suggestion: 'Article 24 - Bruit et ordre', frequency: 1 },
      ]);

      const suggestions = await searchService.getSuggestions('bru', 10, false);

      // Should have both words and titles
      const words = suggestions.filter((s) => s.type === 'word');
      const titles = suggestions.filter((s) => s.type === 'title');

      expect(words.length).toBeGreaterThan(0);
      expect(titles.length).toBeGreaterThan(0);
      expect(words[0].text).toBe('bruit');
      expect(words[0].type).toBe('word');
    });

    it('should filter out stop words from word suggestions', async () => {
      mockAdapter.query.mockResolvedValueOnce([
        { title: 'Article about the noise', tags: null },
      ]);

      mockAdapter.query.mockResolvedValueOnce([
        { suggestion: 'Article about the noise', frequency: 1 },
      ]);

      const suggestions = await searchService.getSuggestions('the', 10, false);

      const words = suggestions.filter((s) => s.type === 'word');
      // "the" is a stop word, should not appear in word suggestions
      expect(words.find((w) => w.text === 'the')).toBeUndefined();
    });

    it('should extract words from tags', async () => {
      mockAdapter.query.mockResolvedValueOnce([
        { title: 'Article 1', tags: 'bruit,noise,son' },
      ]);

      mockAdapter.query.mockResolvedValueOnce([
        { suggestion: 'Article 1', frequency: 1 },
      ]);

      const suggestions = await searchService.getSuggestions('bru', 10, false);

      const words = suggestions.filter((s) => s.type === 'word');
      expect(words.length).toBeGreaterThan(0);
      expect(words.some((w) => w.text === 'bruit')).toBe(true);
    });

    it('should limit word suggestions to 5 or 40% of limit', async () => {
      mockAdapter.query.mockResolvedValueOnce(
        Array(20)
          .fill(null)
          .map((_, i) => ({
            title: `Article ${i} - Bruit test ${i}`,
            tags: null,
          }))
      );

      mockAdapter.query.mockResolvedValueOnce([]);

      const suggestions = await searchService.getSuggestions('bru', 10, false);

      const words = suggestions.filter((s) => s.type === 'word');
      // Should be limited to 5 words max
      expect(words.length).toBeLessThanOrEqual(5);
    });

    it('should prioritize prefix matches over contains matches', async () => {
      mockAdapter.query.mockResolvedValueOnce([
        { title: 'Article about bruit', tags: null },
        { title: 'Article about abrutissement', tags: null },
      ]);

      mockAdapter.query.mockResolvedValueOnce([]);

      const suggestions = await searchService.getSuggestions('bru', 10, false);

      const words = suggestions.filter((s) => s.type === 'word');
      const bruitIndex = words.findIndex((w) => w.text === 'bruit');
      const abrutissementIndex = words.findIndex(
        (w) => w.text === 'abrutissement'
      );

      // "bruit" starts with "bru" (prefix match) should come before "abrutissement" (contains match)
      if (bruitIndex !== -1 && abrutissementIndex !== -1) {
        expect(bruitIndex).toBeLessThan(abrutissementIndex);
      }
    });

    it('should handle queries with hyphens', async () => {
      mockAdapter.query.mockResolvedValueOnce([
        { title: 'Article 306 - Contre-expertise', tags: null },
      ]);

      mockAdapter.query.mockResolvedValueOnce([
        { suggestion: 'Article 306 - Contre-expertise', frequency: 1 },
      ]);

      const suggestions = await searchService.getSuggestions(
        'contre-expertise',
        10,
        false
      );

      const words = suggestions.filter((s) => s.type === 'word');
      expect(words.length).toBeGreaterThan(0);
      expect(
        words.some(
          (w) => w.text.includes('contre') || w.text.includes('expertise')
        )
      ).toBe(true);
    });

    it('should return empty words array when no matching words found', async () => {
      mockAdapter.query.mockResolvedValueOnce([
        { title: 'Article about something else', tags: null },
      ]);

      mockAdapter.query.mockResolvedValueOnce([
        { suggestion: 'Article about something else', frequency: 1 },
      ]);

      const suggestions = await searchService.getSuggestions('xyz', 10, false);

      const words = suggestions.filter((s) => s.type === 'word');
      expect(words.length).toBe(0);
    });

    it('should ensure all suggestions have a type field', async () => {
      mockAdapter.query.mockResolvedValueOnce([
        { title: 'Article 23 - Bruit répété', tags: null },
      ]);

      mockAdapter.query.mockResolvedValueOnce([
        { suggestion: 'Article 23 - Bruit répété', frequency: 1 },
      ]);

      const suggestions = await searchService.getSuggestions('bru', 10, false);

      suggestions.forEach((s) => {
        expect(s.type).toBeDefined();
        expect(['word', 'title']).toContain(s.type);
      });
    });
  });

  describe('getSuggestions - Response Structure', () => {
    it('should return suggestions with words first, then titles', async () => {
      mockAdapter.query.mockResolvedValueOnce([
        { title: 'Article 23 - Bruit répété', tags: null },
      ]);

      mockAdapter.query.mockResolvedValueOnce([
        { suggestion: 'Article 23 - Bruit répété', frequency: 1 },
      ]);

      const suggestions = await searchService.getSuggestions('bru', 10, false);

      // First suggestions should be words
      const firstWordIndex = suggestions.findIndex((s) => s.type === 'word');
      const firstTitleIndex = suggestions.findIndex((s) => s.type === 'title');

      if (firstWordIndex !== -1 && firstTitleIndex !== -1) {
        expect(firstWordIndex).toBeLessThan(firstTitleIndex);
      }
    });

    it('should maintain backward compatibility with flat suggestions array', async () => {
      mockAdapter.query.mockResolvedValueOnce([
        { title: 'Article 23 - Bruit répété', tags: null },
      ]);

      mockAdapter.query.mockResolvedValueOnce([
        { suggestion: 'Article 23 - Bruit répété', frequency: 1 },
      ]);

      const suggestions = await searchService.getSuggestions('bru', 10, false);

      // All suggestions should have text property
      suggestions.forEach((s) => {
        expect(s.text).toBeDefined();
        expect(typeof s.text).toBe('string');
      });
    });
  });
});
