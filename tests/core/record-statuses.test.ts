import { describe, it, expect, beforeEach } from 'vitest';
import {
  DEFAULT_RECORD_STATUSES,
  validateRecordStatusConfig,
  mergeRecordStatuses,
  getRecordStatusesWithMetadata,
  type RecordStatusesConfig,
  type RecordStatusConfig,
} from '../../core/src/config/record-statuses.js';

describe('Record Statuses Configuration', () => {
  let validConfig: RecordStatusesConfig;

  beforeEach(() => {
    validConfig = {
      draft: {
        label: 'Draft',
        description: 'Initial working version',
        source: 'core',
        priority: 1,
      },
      pending_review: {
        label: 'Pending Review',
        description: 'Submitted for review',
        source: 'core',
        priority: 2,
      },
    };
  });

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
      Object.values(DEFAULT_RECORD_STATUSES).forEach(
        (recordStatus: RecordStatusConfig) => {
          expect(recordStatus).toHaveProperty('label');
          expect(recordStatus).toHaveProperty('description');
          expect(recordStatus).toHaveProperty('source');
          expect(recordStatus).toHaveProperty('priority');
          expect(typeof recordStatus.label).toBe('string');
          expect(typeof recordStatus.description).toBe('string');
          expect(recordStatus.source).toBe('core');
          expect(typeof recordStatus.priority).toBe('number');
        }
      );
    });

    it('should have unique priorities', () => {
      const priorities = Object.values(DEFAULT_RECORD_STATUSES).map(
        (status) => status.priority
      );
      const uniquePriorities = new Set(priorities);
      expect(uniquePriorities.size).toBe(priorities.length);
    });
  });

  describe('validateRecordStatusConfig', () => {
    it('should accept valid configuration', () => {
      const errors = validateRecordStatusConfig(validConfig);
      expect(errors).toHaveLength(0);
    });

    it('should reject invalid key format', () => {
      const invalidConfig = {
        ...validConfig,
        InvalidKey: {
          label: 'Invalid',
          description: 'Invalid key format',
          source: 'core' as const,
          priority: 1,
        },
      };
      const errors = validateRecordStatusConfig(invalidConfig);
      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain('Invalid record status key');
    });

    it('should reject missing label', () => {
      const invalidConfig = {
        ...validConfig,
        draft: {
          ...validConfig.draft,
          label: '',
        },
      };
      const errors = validateRecordStatusConfig(invalidConfig);
      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain('must have a valid label');
    });

    it('should reject missing description', () => {
      const invalidConfig = {
        ...validConfig,
        draft: {
          ...validConfig.draft,
          description: '',
        },
      };
      const errors = validateRecordStatusConfig(invalidConfig);
      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain('must have a valid description');
    });

    it('should reject invalid source', () => {
      const invalidConfig = {
        ...validConfig,
        draft: {
          ...validConfig.draft,
          source: 'invalid' as any,
        },
      };
      const errors = validateRecordStatusConfig(invalidConfig);
      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain('invalid source');
    });

    it('should reject negative priority', () => {
      const invalidConfig = {
        ...validConfig,
        draft: {
          ...validConfig.draft,
          priority: -1,
        },
      };
      const errors = validateRecordStatusConfig(invalidConfig);
      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain('valid priority');
    });
  });

  describe('mergeRecordStatuses', () => {
    it('should merge configurations correctly', () => {
      const base = {
        draft: {
          label: 'Draft',
          description: 'Base draft',
          source: 'core',
          priority: 1,
        },
      };
      const additions = {
        pending_review: {
          label: 'Pending',
          description: 'New status',
          source: 'core',
          priority: 2,
        },
      };
      const merged = mergeRecordStatuses(base, additions);

      expect(merged).toHaveProperty('draft');
      expect(merged).toHaveProperty('pending_review');
      expect(merged.draft.label).toBe('Draft');
      expect(merged.pending_review.label).toBe('Pending');
    });

    it('should handle priority conflicts (higher priority wins)', () => {
      const base = {
        draft: {
          label: 'Draft',
          description: 'Base',
          source: 'core',
          priority: 1,
        },
      };
      const additions = {
        draft: {
          label: 'Updated Draft',
          description: 'Updated',
          source: 'core',
          priority: 2,
        },
      };
      const merged = mergeRecordStatuses(base, additions);

      expect(merged.draft.label).toBe('Updated Draft');
      expect(merged.draft.description).toBe('Updated');
    });

    it('should not override when new priority is lower', () => {
      const base = {
        draft: {
          label: 'Draft',
          description: 'Base',
          source: 'core',
          priority: 2,
        },
      };
      const additions = {
        draft: {
          label: 'Updated Draft',
          description: 'Updated',
          source: 'core',
          priority: 1,
        },
      };
      const merged = mergeRecordStatuses(base, additions);

      expect(merged.draft.label).toBe('Draft');
      expect(merged.draft.description).toBe('Base');
    });
  });

  describe('getRecordStatusesWithMetadata', () => {
    it('should convert configuration to metadata format', () => {
      const config = {
        draft: {
          label: 'Draft',
          description: 'Test',
          source: 'core',
          priority: 1,
        },
      };
      const metadata = getRecordStatusesWithMetadata(config);

      expect(metadata).toHaveLength(1);
      expect(metadata[0]).toHaveProperty('key', 'draft');
      expect(metadata[0]).toHaveProperty('label', 'Draft');
      expect(metadata[0]).toHaveProperty('description', 'Test');
      expect(metadata[0]).toHaveProperty('source', 'core');
      expect(metadata[0]).toHaveProperty('priority', 1);
    });

    it('should handle missing optional fields', () => {
      const config = {
        draft: { label: 'Draft', description: 'Test' },
      };
      const metadata = getRecordStatusesWithMetadata(config);

      expect(metadata[0]).toHaveProperty('source', 'core');
      expect(metadata[0]).toHaveProperty('priority', 0);
      expect(metadata[0]).not.toHaveProperty('source_name');
    });
  });
});
