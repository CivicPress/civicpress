import { Router } from 'express';
import { CentralConfigManager } from '@civicpress/core';
import { getRecordTypesWithMetadata } from '@civicpress/core';

const router = Router();

/**
 * GET /api/config/record-types
 * Get available record types with metadata
 */
router.get('/record-types', async (req, res) => {
  try {
    const recordTypesConfig = CentralConfigManager.getRecordTypesConfig();
    const recordTypesWithMetadata =
      getRecordTypesWithMetadata(recordTypesConfig);

    res.json({
      success: true,
      data: {
        record_types: recordTypesWithMetadata,
        total: recordTypesWithMetadata.length,
      },
    });
  } catch (error: any) {
    console.error('Error fetching record types config:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch record types configuration',
      message: error.message,
    });
  }
});

/**
 * GET /api/config/system
 * Get system configuration
 */
router.get('/system', async (req, res) => {
  try {
    const config = CentralConfigManager.getConfig();

    res.json({
      success: true,
      data: {
        modules: config.modules || [],
        default_role: config.default_role || 'clerk',
        hooks: config.hooks || { enabled: true },
        workflows: config.workflows || { enabled: true },
        audit: config.audit || { enabled: true },
        version: config.version || '1.0.0',
      },
    });
  } catch (error: any) {
    console.error('Error fetching system config:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch system configuration',
      message: error.message,
    });
  }
});

export default router;
