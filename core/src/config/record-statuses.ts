export interface RecordStatusConfig {
  label: string;
  description: string;
  source?: 'core' | 'module' | 'plugin';
  source_name?: string;
  priority?: number;
  /**
   * May an ANONYMOUS reader see records in this status?
   *
   * Absent means **no**. Publication is the act that makes a civic record
   * public, so a status has to say so explicitly — a municipality adding a
   * custom status ("in_camera", "legal_hold") must not have it become world
   * readable by omission. Custom statuses are merged OVER these defaults, so
   * the public set below survives unless it is deliberately overridden.
   */
  public?: boolean;
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
    // The status whose own description is 'Publicly available and in effect'.
    public: true,
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
    // A repealed or superseded bylaw stays part of the public record.
    public: true,
  },
  expired: {
    label: 'Expired',
    description: 'Past its effective date and no longer in force',
    source: 'core',
    priority: 8,
    // Past its effective date, but still citable history.
    public: true,
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
        // An override REPLACES the definition, with one exception: `public`
        // carries over unless the override states it. Otherwise a municipality
        // that re-labels `published` in its own config silently drops
        // `public: true` and its entire public site goes blank. Fail-safe
        // rather than fail-open — omitting `public` on a NEW status still
        // means not public — but "I renamed a label" must not mean "I
        // unpublished everything".
        merged[key] = {
          ...status,
          public: status.public ?? merged[key].public,
        };
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
