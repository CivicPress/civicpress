import express, { Router } from 'express';
import { ConfigurationService, CentralConfigManager } from '@civicpress/core';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import { authMiddleware, requirePermission } from '../middleware/auth.js';
import { logApiError } from '../utils/api-logger.js';
import { AuditLogger } from '@civicpress/core';

const router = Router();
const audit = new AuditLogger();

/**
 * Build a ConfigurationService against the RESOLVED data directory.
 *
 * This route used to import the `configurationService` singleton, which is
 * constructed at module-import time (`configuration-service.ts`) and therefore
 * takes the constructor defaults — `dataPath: 'data/.civic'`, relative to
 * whatever the process cwd happened to be. `resolveRawPaths()` below, in this
 * same file, instead asks CentralConfigManager. The two disagreed the moment
 * the data directory was not `./data`: with `CIVIC_DATA_DIR=/var/civic/data`
 * (the documented Docker path), `GET /config/attachment-types` and
 * `GET /config/raw/attachment-types` read DIFFERENT FILES — one the deployment's
 * real config, the other whatever happened to sit under the cwd.
 *
 * Built per call rather than memoized: the constructor only stores three
 * strings, so it costs nothing, and nothing can then go stale when the
 * underlying config is re-resolved (which tests do via
 * CentralConfigManager.reset()).
 */
function getConfigurationService(): ConfigurationService {
  return new ConfigurationService({
    dataPath: join(CentralConfigManager.getDataDir(), '.civic'),
  });
}

// Public configuration endpoints (no auth required)
/**
 * GET /api/v1/config/attachment-types
 * Get attachment types configuration (public)
 */
router.get('/attachment-types', async (req, res) => {
  try {
    const config =
      await getConfigurationService().loadConfiguration('attachment-types');
    res.json({
      success: true,
      data: config,
    });
  } catch (error) {
    logApiError('config', error, req);
    res.status(500).json({
      success: false,
      error: { message: 'Failed to get attachment types', code: 'FAILED_TO_GET_ATTACHMENT_TYPES' },
    });
  }
});

/**
 * GET /api/v1/config/link-categories
 * Get link categories configuration (public)
 */
router.get('/link-categories', async (req, res) => {
  try {
    const config =
      await getConfigurationService().loadConfiguration('link-categories');
    res.json({
      success: true,
      data: config,
    });
  } catch (error) {
    logApiError('config', error, req);
    res.status(500).json({
      success: false,
      error: { message: 'Failed to get link categories', code: 'FAILED_TO_GET_LINK_CATEGORIES' },
    });
  }
});

/**
 * POST /api/config/:type/validate
 * Validate a configuration file (public - validation should be accessible without auth)
 *
 * Request body (optional):
 * - content: string - YAML content to validate. If provided, validates this content instead of the saved file.
 *
 * Note: This endpoint is public and CSRF is skipped for it (see csrf middleware)
 */
router.post(
  '/:type/validate',
  express.text({ type: '*/*', limit: '5mb' }),
  async (req, res) => {
    try {
      const { type } = req.params;
      // Check if content was sent as text/string (raw YAML)
      // If req.body is a non-empty string, use it; otherwise validate saved file
      let content: string | undefined;
      if (typeof req.body === 'string' && req.body.trim().length > 0) {
        content = req.body;
      } else if (
        req.body &&
        typeof req.body === 'object' &&
        typeof (req.body as { content?: unknown }).content === 'string'
      ) {
        // Fallback: check if content was sent in JSON format
        content = (req.body as { content: string }).content;
      }
      // If content is undefined, validateConfiguration will load from disk

      const validation = await getConfigurationService().validateConfiguration(
        type,
        content
      );

      res.json({
        success: true,
        data: validation,
      });

      // Optional audit logging (don't require auth for validation)
      const actor = req.user;
      if (actor?.id) {
        await audit.log({
          source: 'api',
          actor: {
            id: actor?.id,
            username: actor?.username,
            role: actor?.role,
          },
          action: 'config:validate',
          target: { type: 'config', id: type },
          outcome: validation?.valid ? 'success' : 'failure',
          message: validation?.valid
            ? undefined
            : String(validation?.errors?.[0] ?? ''),
          metadata: validation,
        });
      }
    } catch (error) {
      const { type } = req.params || {};
      const actor = req.user;
      if (actor?.id) {
        await audit.log({
          source: 'api',
          actor: {
            id: actor?.id,
            username: actor?.username,
            role: actor?.role,
          },
          action: 'config:validate',
          target: { type: 'config', id: type },
          outcome: 'failure',
          message: String(error),
        });
      }
      logApiError('config', error, req);
      res.status(500).json({
        success: false,
        error: { message: 'Failed to validate configuration', code: 'FAILED_TO_VALIDATE_CONFIGURATION' },
      });
    }
  }
);

// Secured configuration routes: require authenticated admin permission
router.use((req, res, next) => {
  const civicPress = req.civicPress;
  if (!civicPress) return next();
  return authMiddleware(civicPress)(req, res, next);
});
router.use(requirePermission('config:manage'));

/**
 * GET /api/config/list
 * Get list of available configurations with metadata
 */
router.get('/list', async (req, res) => {
  try {
    const configs = await getConfigurationService().getConfigurationList();
    res.json({
      success: true,
      data: configs,
    });
  } catch (error) {
    logApiError('config', error, req);
    res.status(500).json({
      success: false,
      error: { message: 'Failed to get configuration list', code: 'FAILED_TO_GET_CONFIGURATION_LIST' },
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
    const metadata =
      await getConfigurationService().getConfigurationMetadata(type);

    res.json({
      success: true,
      data: metadata,
    });
  } catch (error) {
    logApiError('config', error, req);
    res.status(404).json({
      success: false,
      error: { message: 'Configuration metadata not found', code: 'CONFIGURATION_METADATA_NOT_FOUND' },
    });
  }
});

// FA-API-012: raised when the caller-supplied config type is not a bare name.
class InvalidConfigTypeError extends Error {}

function resolveRawPaths(type: string) {
  const key = (type || '').toLowerCase().trim();
  const canonical = key.startsWith('notif') ? 'notifications' : key;
  // FA-API-012: the canonical name becomes a filesystem segment; reject anything
  // that is not a bare config name so `../`, path separators, NUL, and absolute
  // segments cannot escape the intended config directories.
  if (!/^[a-z0-9-]+$/.test(canonical)) {
    throw new InvalidConfigTypeError(`Invalid config type: ${type}`);
  }
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
    } catch {
      // intentional: user config file may not exist; fall back to defaults below
    }
    if (!yaml) {
      yaml = await readFile(defaultPath, 'utf-8');
    }

    res.setHeader('Content-Type', 'text/yaml; charset=utf-8');
    res.status(200).send(yaml);
  } catch (error) {
    if (error instanceof InvalidConfigTypeError) {
      return res.status(400).json({ success: false, error: { message: error.message, code: 'INVALID_CONFIG_TYPE' } });
    }
    logApiError('config', error, req);
    res.status(404).json({
      success: false,
      error: { message: 'Raw configuration not found', code: 'RAW_CONFIGURATION_NOT_FOUND' },
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
          .json({ success: false, error: { message: 'YAML content is required', code: 'YAML_CONTENT_IS_REQUIRED' } });
      }

      const { userPath } = resolveRawPaths(type);
      await mkdir(dirname(userPath), { recursive: true });
      await writeFile(userPath, yamlContent, 'utf-8');

      res.json({
        success: true,
        message: `Raw configuration ${type} saved successfully`,
      });

      // Audit success
      const actor = req.user;
      await audit.log({
        source: 'api',
        actor: { id: actor?.id, username: actor?.username, role: actor?.role },
        action: 'config:raw:put',
        target: { type: 'config', id: type, path: userPath },
        outcome: 'success',
      });
    } catch (error) {
      const { type } = req.params || {};
      const actor = req.user;
      await audit.log({
        source: 'api',
        actor: { id: actor?.id, username: actor?.username, role: actor?.role },
        action: 'config:raw:put',
        target: { type: 'config', id: type },
        outcome: 'failure',
        message: String(error),
      });
      if (error instanceof InvalidConfigTypeError) {
        return res.status(400).json({ success: false, error: { message: error.message, code: 'INVALID_CONFIG_TYPE' } });
      }
      logApiError('config', error, req);
      res.status(500).json({
        success: false,
        error: { message: 'Failed to save raw configuration', code: 'FAILED_TO_SAVE_RAW_CONFIGURATION' },
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
    const status = await getConfigurationService().getConfigurationStatus();
    res.json({
      success: true,
      data: status,
    });
  } catch (error) {
    logApiError('config', error, req);
    res.status(500).json({
      success: false,
      error: { message: 'Failed to get configuration status', code: 'FAILED_TO_GET_CONFIGURATION_STATUS' },
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
    const config = await getConfigurationService().loadConfiguration(type);

    res.json({
      success: true,
      data: config,
    });
  } catch (error) {
    logApiError('config', error, req);
    res.status(404).json({
      success: false,
      error: { message: 'Configuration not found', code: 'CONFIGURATION_NOT_FOUND' },
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

    await getConfigurationService().saveConfiguration(type, content);

    res.json({
      success: true,
      message: `Configuration ${type} saved successfully`,
    });

    const actor = req.user;
    await audit.log({
      source: 'api',
      actor: { id: actor?.id, username: actor?.username, role: actor?.role },
      action: 'config:save',
      target: { type: 'config', id: type },
      outcome: 'success',
    });
  } catch (error) {
    const { type } = req.params || {};
    const actor = req.user;
    await audit.log({
      source: 'api',
      actor: { id: actor?.id, username: actor?.username, role: actor?.role },
      action: 'config:save',
      target: { type: 'config', id: type },
      outcome: 'failure',
      message: String(error),
    });
    logApiError('config', error, req);
    res.status(500).json({
      success: false,
      error: { message: 'Failed to save configuration', code: 'FAILED_TO_SAVE_CONFIGURATION' },
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

    await getConfigurationService().resetToDefaults(type);

    res.json({
      success: true,
      message: `Configuration ${type} reset to defaults successfully`,
    });

    const actor = req.user;
    await audit.log({
      source: 'api',
      actor: { id: actor?.id, username: actor?.username, role: actor?.role },
      action: 'config:reset',
      target: { type: 'config', id: type },
      outcome: 'success',
    });
  } catch (error) {
    const { type } = req.params || {};
    const actor = req.user;
    await audit.log({
      source: 'api',
      actor: { id: actor?.id, username: actor?.username, role: actor?.role },
      action: 'config:reset',
      target: { type: 'config', id: type },
      outcome: 'failure',
      message: String(error),
    });
    logApiError('config', error, req);
    res.status(500).json({
      success: false,
      error: { message: 'Failed to reset configuration', code: 'FAILED_TO_RESET_CONFIGURATION' },
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const results: Record<string, any> = {};

    for (const type of configTypes) {
      try {
        results[type] =
          await getConfigurationService().validateConfiguration(type);
      } catch (error) {
        logApiError('config', error, req);
        results[type] = {
          valid: false,
          errors: ['Failed to validate'],
        };
      }
    }

    res.json({
      success: true,
      data: results,
    });
  } catch (error) {
    logApiError('config', error, req);
    res.status(500).json({
      success: false,
      error: { message: 'Failed to validate configurations', code: 'FAILED_TO_VALIDATE_CONFIGURATIONS' },
    });
  }
});

export default router;
