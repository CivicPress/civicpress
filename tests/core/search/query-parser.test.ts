import { describe, it, expect } from 'vitest';
import {
  parseSearchQuery,
  buildFTS5Query,
  calculateSimilarity,
} from '../../../core/src/search/query-parser.js';

describe('Query Parser', () => {
  describe('parseSearchQuery', () => {
    it('should parse simple single word query', () => {
      const result = parseSearchQuery('budget');
      expect(result.words).toEqual(['budget']);
      expect(result.operator).toBe('AND');
    });

    it('should parse multi-word query', () => {
      const result = parseSearchQuery('budget 2024');
      expect(result.words).toEqual(['budget', '2024']);
    });

    it('should parse quoted phrase', () => {
      const result = parseSearchQuery('"noise ordinance"');
      expect(result.phrases).toEqual(['noise ordinance']);
    });

    it('should parse OR operator', () => {
      const result = parseSearchQuery('budget OR 2024');
      expect(result.operator).toBe('OR');
    });
  });

  describe('buildFTS5Query', () => {
    it('should build simple FTS5 query', () => {
      const parsed = parseSearchQuery('budget');
      const query = buildFTS5Query(parsed);
      expect(query).toBe('budget*');
    });

    it('should build multi-word query', () => {
      const parsed = parseSearchQuery('budget 2024');
      const query = buildFTS5Query(parsed);
      expect(query).toBe('budget* 2024*');
    });
  });

  describe('calculateSimilarity', () => {
    it('should return 1.0 for identical strings', () => {
      expect(calculateSimilarity('budget', 'budget')).toBe(1.0);
    });

    it('should return high similarity for typos', () => {
      const similarity = calculateSimilarity('budget', 'budjet');
      expect(similarity).toBeGreaterThan(0.7);
    });
  });
});
