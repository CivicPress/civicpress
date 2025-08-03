export interface RecordStatusConfig {
  label: string;
  description: string;
  source?: 'core' | 'module' | 'plugin';
  source_name?: string;
  priority?: number;
}

export interface RecordStatusesConfig {
  [key: string]: RecordStatusConfig;
}

export interface RecordStatusMetadata {
  key: string;
  label: string;
  description: string;
  source: 'core' | 'module' | 'plugin';
  source_name?: string;
  priority: number;
}

export const DEFAULT_RECORD_STATUSES: RecordStatusesConfig = {
  draft: {
    label: 'Draft',
    description: 'Initial working version, not yet ready for review',
    source: 'core',
    priority: 1,
  },
  pending_review: {
    label: 'Pending Review',
    description: 'Submitted for review and awaiting approval',
    source: 'core',
    priority: 2,
  },
  under_review: {
    label: 'Under Review',
    description: 'Currently under active review by authorized personnel',
    source: 'core',
    priority: 3,
  },
  approved: {
    label: 'Approved',
    description: 'Approved and currently in effect',
    source: 'core',
    priority: 4,
  },
  published: {
    label: 'Published',
    description: 'Publicly available and in effect',
    source: 'core',
    priority: 5,
  },
  rejected: {
    label: 'Rejected',
    description: 'Rejected and not approved',
    source: 'core',
    priority: 6,
  },
  archived: {
    label: 'Archived',
    description: 'No longer active but preserved for reference',
    source: 'core',
    priority: 7,
  },
  expired: {
    label: 'Expired',
    description: 'Past its effective date and no longer in force',
    source: 'core',
    priority: 8,
  },
};

export function validateRecordStatusConfig(
  config: RecordStatusesConfig
): string[] {
  const errors: string[] = [];

  for (const [key, status] of Object.entries(config)) {
    // Validate key format (lowercase with underscores)
    if (!/^[a-z][a-z0-9_]*$/.test(key)) {
      errors.push(
        `Invalid record status key: "${key}". Must be lowercase with underscores only.`
      );
    }

    // Validate required fields
    if (!status.label || typeof status.label !== 'string') {
      errors.push(`Record status "${key}" must have a valid label.`);
    }

    if (!status.description || typeof status.description !== 'string') {
      errors.push(`Record status "${key}" must have a valid description.`);
    }

    // Validate source
    if (
      status.source &&
      !['core', 'module', 'plugin'].includes(status.source)
    ) {
      errors.push(
        `Record status "${key}" has invalid source: "${status.source}". Must be 'core', 'module', or 'plugin'.`
      );
    }

    // Validate priority
    if (
      status.priority !== undefined &&
      (typeof status.priority !== 'number' || status.priority < 0)
    ) {
      errors.push(
        `Record status "${key}" must have a valid priority (non-negative number).`
      );
    }
  }

  return errors;
}

export function mergeRecordStatuses(
  base: RecordStatusesConfig,
  additions: RecordStatusesConfig
): RecordStatusesConfig {
  const merged = { ...base };

  for (const [key, status] of Object.entries(additions)) {
    // If key exists, merge with priority (higher priority wins)
    if (merged[key]) {
      const existingPriority = merged[key].priority || 0;
      const newPriority = status.priority || 0;

      if (newPriority >= existingPriority) {
        merged[key] = { ...status };
      }
    } else {
      merged[key] = status;
    }
  }

  return merged;
}

export function getRecordStatusesWithMetadata(
  config: RecordStatusesConfig
): RecordStatusMetadata[] {
  return Object.entries(config).map(([key, status]) => {
    const metadata: RecordStatusMetadata = {
      key,
      label: status.label,
      description: status.description,
      source: status.source || 'core',
      priority: status.priority || 0,
    };

    // Only include source_name if it's defined
    if (status.source_name) {
      metadata.source_name = status.source_name;
    }

    return metadata;
  });
}
