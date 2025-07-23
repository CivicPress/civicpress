import { describe, it, expect, beforeEach } from 'vitest';
import {
  DEFAULT_RECORD_TYPES,
  validateRecordTypeConfig,
  mergeRecordTypes,
  getRecordTypesWithMetadata,
  type RecordTypesConfig,
  type RecordTypeConfig,
} from '../../core/src/config/record-types.js';

describe('Record Types Configuration', () => {
  let validConfig: RecordTypesConfig;

  beforeEach(() => {
    validConfig = {
      bylaw: {
        label: 'Bylaws',
        description: 'Municipal bylaws and regulations',
        source: 'core',
        priority: 1,
      },
      ordinance: {
        label: 'Ordinances',
        description: 'Local ordinances and laws',
        source: 'core',
        priority: 2,
      },
    };
  });

  describe('DEFAULT_RECORD_TYPES', () => {
    it('should contain all expected record types', () => {
      expect(DEFAULT_RECORD_TYPES).toHaveProperty('bylaw');
      expect(DEFAULT_RECORD_TYPES).toHaveProperty('ordinance');
      expect(DEFAULT_RECORD_TYPES).toHaveProperty('policy');
      expect(DEFAULT_RECORD_TYPES).toHaveProperty('proclamation');
      expect(DEFAULT_RECORD_TYPES).toHaveProperty('resolution');
    });

    it('should have correct structure for each record type', () => {
      Object.values(DEFAULT_RECORD_TYPES).forEach(
        (recordType: RecordTypeConfig) => {
          expect(recordType).toHaveProperty('label');
          expect(recordType).toHaveProperty('description');
          expect(recordType).toHaveProperty('source');
          expect(recordType).toHaveProperty('priority');
          expect(typeof recordType.label).toBe('string');
          expect(typeof recordType.description).toBe('string');
          expect(recordType.source).toBe('core');
          expect(typeof recordType.priority).toBe('number');
        }
      );
    });
  });

  describe('validateRecordTypeConfig', () => {
    it('should pass validation for valid config', () => {
      const errors = validateRecordTypeConfig(validConfig);
      expect(errors).toHaveLength(0);
    });

    it('should reject invalid key format', () => {
      const invalidConfig = {
        ...validConfig,
        InvalidKey: {
          label: 'Invalid',
          description: 'Invalid key format',
          source: 'core',
          priority: 1,
        },
      };
      const errors = validateRecordTypeConfig(invalidConfig);
      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain('Invalid record type key');
    });

    it('should reject missing label', () => {
      const invalidConfig = {
        ...validConfig,
        test: {
          description: 'Missing label',
          source: 'core',
          priority: 1,
        } as RecordTypeConfig,
      };
      const errors = validateRecordTypeConfig(invalidConfig);
      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain('missing or invalid label');
    });

    it('should reject missing description', () => {
      const invalidConfig = {
        ...validConfig,
        test: {
          label: 'Test',
          source: 'core',
          priority: 1,
        } as RecordTypeConfig,
      };
      const errors = validateRecordTypeConfig(invalidConfig);
      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain('missing or invalid description');
    });

    it('should reject invalid source', () => {
      const invalidConfig = {
        ...validConfig,
        test: {
          label: 'Test',
          description: 'Test description',
          source: 'invalid' as any,
          priority: 1,
        },
      };
      const errors = validateRecordTypeConfig(invalidConfig);
      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain('invalid source');
    });

    it('should reject invalid priority', () => {
      const invalidConfig = {
        ...validConfig,
        test: {
          label: 'Test',
          description: 'Test description',
          source: 'core',
          priority: -1,
        },
      };
      const errors = validateRecordTypeConfig(invalidConfig);
      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain('invalid priority');
    });

    it('should handle multiple validation errors', () => {
      const invalidConfig = {
        'invalid-key': {
          description: 'Missing label and invalid key',
          source: 'invalid' as any,
          priority: -1,
        } as RecordTypeConfig,
      };
      const errors = validateRecordTypeConfig(invalidConfig);
      expect(errors.length).toBeGreaterThan(1);
    });
  });

  describe('mergeRecordTypes', () => {
    it('should merge two valid configs', () => {
      const baseConfig = {
        bylaw: {
          label: 'Bylaws',
          description: 'Municipal bylaws',
          source: 'core',
          priority: 1,
        },
      };

      const additions = {
        ordinance: {
          label: 'Ordinances',
          description: 'Local ordinances',
          source: 'module',
          priority: 2,
        },
      };

      const merged = mergeRecordTypes(baseConfig, additions);
      expect(merged).toHaveProperty('bylaw');
      expect(merged).toHaveProperty('ordinance');
      expect(merged.ordinance.source).toBe('module');
    });

    it('should handle priority conflicts correctly', () => {
      const baseConfig = {
        bylaw: {
          label: 'Bylaws',
          description: 'Municipal bylaws',
          source: 'core',
          priority: 5, // Higher priority
        },
      };

      const additions = {
        bylaw: {
          label: 'Custom Bylaws',
          description: 'Custom bylaws',
          source: 'plugin',
          priority: 1, // Lower priority
        },
      };

      const merged = mergeRecordTypes(baseConfig, additions);
      expect(merged.bylaw.label).toBe('Bylaws'); // Should keep original
      expect(merged.bylaw.source).toBe('core');
    });

    it('should allow higher priority additions to override', () => {
      const baseConfig = {
        bylaw: {
          label: 'Bylaws',
          description: 'Municipal bylaws',
          source: 'core',
          priority: 1, // Lower priority
        },
      };

      const additions = {
        bylaw: {
          label: 'Custom Bylaws',
          description: 'Custom bylaws',
          source: 'plugin',
          priority: 5, // Higher priority
        },
      };

      const merged = mergeRecordTypes(baseConfig, additions);
      expect(merged.bylaw.label).toBe('Custom Bylaws'); // Should override
      expect(merged.bylaw.source).toBe('plugin');
    });

    it('should handle empty additions', () => {
      const merged = mergeRecordTypes(validConfig, {});
      expect(merged).toEqual(validConfig);
    });

    it('should handle empty base config', () => {
      const additions = {
        test: {
          label: 'Test',
          description: 'Test description',
          source: 'core',
          priority: 1,
        },
      };
      const merged = mergeRecordTypes({}, additions);
      expect(merged).toEqual(additions);
    });
  });

  describe('getRecordTypesWithMetadata', () => {
    it('should return correct metadata structure', () => {
      const metadata = getRecordTypesWithMetadata(validConfig);

      expect(metadata).toHaveLength(2);
      expect(metadata[0]).toHaveProperty('key');
      expect(metadata[0]).toHaveProperty('label');
      expect(metadata[0]).toHaveProperty('description');
      expect(metadata[0]).toHaveProperty('source');
      expect(metadata[0]).toHaveProperty('priority');
    });

    it('should include all required fields', () => {
      const metadata = getRecordTypesWithMetadata(validConfig);

      metadata.forEach((item) => {
        expect(typeof item.key).toBe('string');
        expect(typeof item.label).toBe('string');
        expect(typeof item.description).toBe('string');
        expect(['core', 'module', 'plugin']).toContain(item.source);
        expect(typeof item.priority).toBe('number');
      });
    });

    it('should handle config with missing optional fields', () => {
      const minimalConfig = {
        test: {
          label: 'Test',
          description: 'Test description',
        } as RecordTypeConfig,
      };

      const metadata = getRecordTypesWithMetadata(minimalConfig);
      expect(metadata[0].source).toBe('core'); // Default value
      expect(metadata[0].priority).toBe(0); // Default value
    });

    it('should preserve source_name when present', () => {
      const configWithSourceName = {
        test: {
          label: 'Test',
          description: 'Test description',
          source: 'plugin',
          source_name: 'test-plugin',
          priority: 1,
        },
      };

      const metadata = getRecordTypesWithMetadata(configWithSourceName);
      expect(metadata[0].source_name).toBe('test-plugin');
    });
  });
});
