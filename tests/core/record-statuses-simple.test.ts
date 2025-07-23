import { describe, it, expect } from 'vitest';

// Import from the source directly to avoid build issues
const { DEFAULT_RECORD_STATUSES } = await import(
  '../../core/src/config/record-statuses.js'
);

describe('Record Statuses Configuration - Simple Tests', () => {
  describe('DEFAULT_RECORD_STATUSES', () => {
    it('should contain all expected record statuses', () => {
      expect(DEFAULT_RECORD_STATUSES).toHaveProperty('draft');
      expect(DEFAULT_RECORD_STATUSES).toHaveProperty('pending_review');
      expect(DEFAULT_RECORD_STATUSES).toHaveProperty('under_review');
      expect(DEFAULT_RECORD_STATUSES).toHaveProperty('approved');
      expect(DEFAULT_RECORD_STATUSES).toHaveProperty('published');
      expect(DEFAULT_RECORD_STATUSES).toHaveProperty('rejected');
      expect(DEFAULT_RECORD_STATUSES).toHaveProperty('archived');
      expect(DEFAULT_RECORD_STATUSES).toHaveProperty('expired');
    });

    it('should have correct structure for each record status', () => {
      const recordStatuses = Object.values(DEFAULT_RECORD_STATUSES);
      expect(recordStatuses.length).toBeGreaterThan(0);

      recordStatuses.forEach((status) => {
        expect(status).toHaveProperty('label');
        expect(status).toHaveProperty('description');
        expect(status).toHaveProperty('source');
        expect(status).toHaveProperty('priority');
        expect(typeof status.label).toBe('string');
        expect(typeof status.description).toBe('string');
        expect(status.source).toBe('core');
        expect(typeof status.priority).toBe('number');
      });
    });

    it('should have unique priorities', () => {
      const priorities = Object.values(DEFAULT_RECORD_STATUSES).map(
        (status) => status.priority
      );
      const uniquePriorities = new Set(priorities);
      expect(uniquePriorities.size).toBe(priorities.length);
    });
  });
});
