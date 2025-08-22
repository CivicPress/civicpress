import { Router } from 'express';
import { configurationService } from '@civicpress/core';

const router = Router();

// TODO: Add proper authentication middleware
// For now, allow all requests (will be secured later)

/**
 * GET /api/config/list
 * Get list of available configurations with metadata
 */
router.get('/list', async (req, res) => {
  try {
    const configs = await configurationService.getConfigurationList();
    res.json({
      success: true,
      data: configs,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: `Failed to get configuration list: ${error}`,
    });
  }
});

/**
 * GET /api/config/metadata/:type
 * Get configuration metadata for form generation
 */
router.get('/metadata/:type', async (req, res) => {
  try {
    const { type } = req.params;
    const metadata = await configurationService.getConfigurationMetadata(type);

    res.json({
      success: true,
      data: metadata,
    });
  } catch (error) {
    res.status(404).json({
      success: false,
      error: `Configuration metadata not found: ${error}`,
    });
  }
});

/**
 * GET /api/config/status
 * Get the status of all configuration files
 */
router.get('/status', async (req, res) => {
  try {
    const status = await configurationService.getConfigurationStatus();
    res.json({
      success: true,
      data: status,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: `Failed to get configuration status: ${error}`,
    });
  }
});

/**
 * GET /api/config/:type
 * Load a specific configuration file
 */
router.get('/:type', async (req, res) => {
  try {
    const { type } = req.params;
    const config = await configurationService.loadConfiguration(type);

    res.json({
      success: true,
      data: config,
    });
  } catch (error) {
    res.status(404).json({
      success: false,
      error: `Configuration not found: ${error}`,
    });
  }
});

/**
 * PUT /api/config/:type
 * Save a configuration file
 */
router.put('/:type', async (req, res) => {
  try {
    const { type } = req.params;
    const content = req.body;

    await configurationService.saveConfiguration(type, content);

    res.json({
      success: true,
      message: `Configuration ${type} saved successfully`,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: `Failed to save configuration: ${error}`,
    });
  }
});

/**
 * POST /api/config/:type/reset
 * Reset a configuration to defaults
 */
router.post('/:type/reset', async (req, res) => {
  try {
    const { type } = req.params;

    await configurationService.resetToDefaults(type);

    res.json({
      success: true,
      message: `Configuration ${type} reset to defaults successfully`,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: `Failed to reset configuration: ${error}`,
    });
  }
});

/**
 * POST /api/config/:type/validate
 * Validate a configuration file
 */
router.post('/:type/validate', async (req, res) => {
  try {
    const { type } = req.params;
    const validation = await configurationService.validateConfiguration(type);

    res.json({
      success: true,
      data: validation,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: `Failed to validate configuration: ${error}`,
    });
  }
});

/**
 * GET /api/config/validate/all
 * Validate all configuration files
 */
router.get('/validate/all', async (req, res) => {
  try {
    const configTypes = [
      'org-config',
      'roles',
      'workflows',
      'hooks',
      'notifications',
    ];
    const results: Record<string, any> = {};

    for (const type of configTypes) {
      try {
        results[type] = await configurationService.validateConfiguration(type);
      } catch (error) {
        results[type] = {
          valid: false,
          errors: [`Failed to validate: ${error}`],
        };
      }
    }

    res.json({
      success: true,
      data: results,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: `Failed to validate configurations: ${error}`,
    });
  }
});

export default router;
