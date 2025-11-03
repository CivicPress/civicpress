import { Router } from 'express';
import {
  CentralConfigManager,
  getRecordTypesWithMetadata,
  getRecordStatusesWithMetadata,
} from '@civicpress/core';

const router = Router();

/**
 * GET /api/v1/system/record-types
 * Returns available record types with metadata (loaded from config)
 */
router.get('/record-types', (req, res) => {
  try {
    // Load record types dynamically from configuration
    const recordTypesConfig = CentralConfigManager.getRecordTypesConfig();
    const recordTypesMetadata = getRecordTypesWithMetadata(recordTypesConfig);

    // Transform to API response format
    const recordTypes = recordTypesMetadata.map((type) => ({
      key: type.key,
      label: type.label,
      description: type.description,
      source: type.source,
      priority: type.priority,
      fields: ['id', 'title', 'content', 'status', 'author', 'created', 'updated'],
      validation: ['required_title', 'required_type', 'required_status', 'required_author'],
    }));

    res.json({
      success: true,
      data: {
        record_types: recordTypes,
        total: recordTypes.length,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to fetch record types',
        code: 'RECORD_TYPES_FETCH_FAILED',
        details: error instanceof Error ? error.message : String(error),
      },
    });
  }
});

/**
 * GET /api/v1/system/record-statuses
 * Returns available record statuses with metadata (loaded from config)
 */
router.get('/record-statuses', (req, res) => {
  try {
    // Load record statuses dynamically from configuration
    const recordStatusesConfig = CentralConfigManager.getRecordStatusesConfig();
    const recordStatusesMetadata = getRecordStatusesWithMetadata(recordStatusesConfig);

    // Transform to API response format with additional metadata
    const recordStatuses = recordStatusesMetadata.map((status) => ({
      key: status.key,
      label: status.label,
      description: status.description,
      source: status.source,
      priority: status.priority,
      // Map status keys to UI colors (can be extended in config later)
      color: getStatusColor(status.key),
      // Transitions would come from workflow config (not implemented here)
      transitions: [],
      editable: !['published', 'archived', 'expired'].includes(status.key),
    }));

    res.json({
      success: true,
      data: {
        record_statuses: recordStatuses,
        total: recordStatuses.length,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to fetch record statuses',
        code: 'RECORD_STATUSES_FETCH_FAILED',
        details: error instanceof Error ? error.message : String(error),
      },
    });
  }
});

/**
 * Map status key to UI color (can be made configurable later)
 */
function getStatusColor(statusKey: string): string {
  const colorMap: Record<string, string> = {
    draft: 'gray',
    pending_review: 'blue',
    under_review: 'yellow',
    approved: 'green',
    published: 'green',
    rejected: 'red',
    archived: 'gray',
    expired: 'orange',
  };
  return colorMap[statusKey] || 'gray';
}

export default router;
