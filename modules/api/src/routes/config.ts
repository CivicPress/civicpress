import express, { Router } from 'express';
import { configurationService, CentralConfigManager } from '@civicpress/core';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import { authMiddleware, requirePermission } from '../middleware/auth.js';
import { AuditLogger } from '../../../../core/src/audit/audit-logger.js';

const router = Router();
const audit = new AuditLogger();

// Secured configuration routes: require authenticated admin permission
router.use((req, res, next) => {
  const civicPress = (req as any).civicPress;
  if (!civicPress) return next();
  return authMiddleware(civicPress)(req as any, res as any, next as any);
});
router.use(requirePermission('config:manage'));

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

function resolveRawPaths(type: string) {
  const key = (type || '').toLowerCase().trim();
  const canonical = key.startsWith('notif') ? 'notifications' : key;
  const dataDir = CentralConfigManager.getDataDir();
  const userPath =
    canonical === 'notifications'
      ? join('.system-data', `${canonical}.yml`)
      : join(dataDir, '.civic', `${canonical}.yml`);
  const defaultPath = join('core', 'src', 'defaults', `${canonical}.yml`);
  return { userPath, defaultPath };
}

/**
 * RAW: GET /api/config/raw/:type
 * Return raw YAML content without transforms
 */
router.get('/raw/:type', async (req, res) => {
  try {
    const { type } = req.params;
    const { userPath, defaultPath } = resolveRawPaths(type);

    // Prefer user file, fallback to defaults
    let yaml: string | null = null;
    try {
      yaml = await readFile(userPath, 'utf-8');
    } catch {}
    if (!yaml) {
      yaml = await readFile(defaultPath, 'utf-8');
    }

    res.setHeader('Content-Type', 'text/yaml; charset=utf-8');
    res.status(200).send(yaml);
  } catch (error) {
    res.status(404).json({
      success: false,
      error: `Raw configuration not found: ${error}`,
    });
  }
});

/**
 * RAW: PUT /api/config/raw/:type
 * Accept raw YAML and write as-is (no transforms)
 */
router.put(
  '/raw/:type',
  express.text({ type: '*/*', limit: '5mb' }),
  async (req, res) => {
    try {
      const { type } = req.params;
      const yamlContent = typeof req.body === 'string' ? req.body : '';
      if (!yamlContent) {
        return res
          .status(400)
          .json({ success: false, error: 'YAML content is required' });
      }

      const { userPath } = resolveRawPaths(type);
      await mkdir(dirname(userPath), { recursive: true });
      await writeFile(userPath, yamlContent, 'utf-8');

      res.json({
        success: true,
        message: `Raw configuration ${type} saved successfully`,
      });

      // Audit success
      const actor = (req as any).user || {};
      await audit.log({
        source: 'api',
        actor: { id: actor.id, username: actor.username, role: actor.role },
        action: 'config:raw:put',
        target: { type: 'config', id: type, path: userPath },
        outcome: 'success',
      });
    } catch (error) {
      const { type } = req.params || ({} as any);
      const actor = (req as any).user || {};
      await audit.log({
        source: 'api',
        actor: { id: actor.id, username: actor.username, role: actor.role },
        action: 'config:raw:put',
        target: { type: 'config', id: type },
        outcome: 'failure',
        message: String(error),
      });
      res.status(500).json({
        success: false,
        error: `Failed to save raw configuration: ${error}`,
      });
    }
  }
);

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

    const actor = (req as any).user || {};
    await audit.log({
      source: 'api',
      actor: { id: actor.id, username: actor.username, role: actor.role },
      action: 'config:save',
      target: { type: 'config', id: type },
      outcome: 'success',
    });
  } catch (error) {
    const { type } = req.params || ({} as any);
    const actor = (req as any).user || {};
    await audit.log({
      source: 'api',
      actor: { id: actor.id, username: actor.username, role: actor.role },
      action: 'config:save',
      target: { type: 'config', id: type },
      outcome: 'failure',
      message: String(error),
    });
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

    const actor = (req as any).user || {};
    await audit.log({
      source: 'api',
      actor: { id: actor.id, username: actor.username, role: actor.role },
      action: 'config:reset',
      target: { type: 'config', id: type },
      outcome: 'success',
    });
  } catch (error) {
    const { type } = req.params || ({} as any);
    const actor = (req as any).user || {};
    await audit.log({
      source: 'api',
      actor: { id: actor.id, username: actor.username, role: actor.role },
      action: 'config:reset',
      target: { type: 'config', id: type },
      outcome: 'failure',
      message: String(error),
    });
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

    const actor = (req as any).user || {};
    await audit.log({
      source: 'api',
      actor: { id: actor.id, username: actor.username, role: actor.role },
      action: 'config:validate',
      target: { type: 'config', id: type },
      outcome: validation?.valid ? 'success' : 'failure',
      message: validation?.valid ? undefined : (validation?.errors?.[0] as any),
      metadata: validation,
    });
  } catch (error) {
    const { type } = req.params || ({} as any);
    const actor = (req as any).user || {};
    await audit.log({
      source: 'api',
      actor: { id: actor.id, username: actor.username, role: actor.role },
      action: 'config:validate',
      target: { type: 'config', id: type },
      outcome: 'failure',
      message: String(error),
    });
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
