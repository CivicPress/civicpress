export interface RecordTypeConfig {
  label: string;
  description: string;
  source?: 'core' | 'module' | 'plugin';
  source_name?: string;
  priority?: number;
}

export interface RecordTypesConfig {
  [key: string]: RecordTypeConfig;
}

export interface RecordTypeMetadata {
  key: string;
  label: string;
  description: string;
  source: 'core' | 'module' | 'plugin';
  source_name?: string;
  priority: number;
}

/**
 * Default record types configuration
 */
export const DEFAULT_RECORD_TYPES: RecordTypesConfig = {
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
  policy: {
    label: 'Policies',
    description: 'Administrative policies',
    source: 'core',
    priority: 3,
  },
  proclamation: {
    label: 'Proclamations',
    description: 'Official proclamations',
    source: 'core',
    priority: 4,
  },
  resolution: {
    label: 'Resolutions',
    description: 'Council resolutions',
    source: 'core',
    priority: 5,
  },
};

/**
 * Validate record type configuration
 */
export function validateRecordTypeConfig(config: RecordTypesConfig): string[] {
  const errors: string[] = [];

  for (const [key, recordType] of Object.entries(config)) {
    // Validate key format
    if (!/^[a-z][a-z0-9_-]*$/.test(key)) {
      errors.push(
        `Invalid record type key "${key}": must be lowercase, start with letter, and contain only letters, numbers, hyphens, and underscores`
      );
    }

    // Validate required fields
    if (!recordType.label || typeof recordType.label !== 'string') {
      errors.push(`Record type "${key}" missing or invalid label`);
    }

    if (!recordType.description || typeof recordType.description !== 'string') {
      errors.push(`Record type "${key}" missing or invalid description`);
    }

    // Validate source
    if (
      recordType.source &&
      !['core', 'module', 'plugin'].includes(recordType.source)
    ) {
      errors.push(
        `Record type "${key}" has invalid source: ${recordType.source}`
      );
    }

    // Validate priority
    if (
      recordType.priority &&
      (typeof recordType.priority !== 'number' || recordType.priority < 0)
    ) {
      errors.push(
        `Record type "${key}" has invalid priority: ${recordType.priority}`
      );
    }
  }

  return errors;
}

/**
 * Merge record types with priority handling
 */
export function mergeRecordTypes(
  base: RecordTypesConfig,
  additions: RecordTypesConfig
): RecordTypesConfig {
  const merged = { ...base };

  for (const [key, recordType] of Object.entries(additions)) {
    const existing = merged[key];

    // If existing record type has higher priority, keep it
    if (existing && (existing.priority || 0) > (recordType.priority || 0)) {
      continue;
    }

    // Otherwise, add or replace
    merged[key] = recordType;
  }

  return merged;
}

/**
 * Get record types with metadata
 */
export function getRecordTypesWithMetadata(
  config: RecordTypesConfig
): RecordTypeMetadata[] {
  return Object.entries(config).map(([key, recordType]) => ({
    key,
    label: recordType.label,
    description: recordType.description,
    source: recordType.source || 'core',
    source_name: recordType.source_name,
    priority: recordType.priority || 0,
  }));
}
