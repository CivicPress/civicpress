import { Router } from 'express';
import { CentralConfigManager } from '@civicpress/core';
import {
  getRecordTypesWithMetadata,
  getRecordStatusesWithMetadata,
} from '@civicpress/core';
import * as fs from 'fs';
import * as path from 'path';
import yaml from 'yaml';

// Declare setTimeout and clearTimeout for TypeScript
// declare const setTimeout: any;
// declare const clearTimeout: any;

const router = Router();

// // Development-only delay middleware for testing loading states
// const addDevDelay = async (req: any, res: any, next: any) => {
//   // Check if we're in development mode (NODE_ENV not set or equals 'development')
//   const isDev = !process.env.NODE_ENV || process.env.NODE_ENV === 'development';

//   console.log(
//     '🔍 Delay middleware - NODE_ENV:',
//     process.env.NODE_ENV,
//     'isDev:',
//     isDev
//   );

//   if (isDev) {
//     console.log('🔄 Adding 3-second delay for config endpoint:', req.path);
//     // Simple delay using promise
//     await new Promise((resolve) => {
//       const timer = setTimeout(resolve, 5000);
//       // Clean up timer if request is cancelled
//       req.on('close', () => clearTimeout(timer));
//     });
//   }
//   next();
// };

// Apply delay middleware to all config routes in development
// router.use(addDevDelay);

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
 * GET /api/config/record-statuses
 * Get available record statuses with metadata
 */
router.get('/record-statuses', async (req, res) => {
  try {
    const recordStatusesConfig = CentralConfigManager.getRecordStatusesConfig();
    const recordStatusesWithMetadata =
      getRecordStatusesWithMetadata(recordStatusesConfig);

    res.json({
      success: true,
      data: {
        record_statuses: recordStatusesWithMetadata,
        total: recordStatusesWithMetadata.length,
      },
    });
  } catch (error: any) {
    console.error('Error fetching record statuses config:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch record statuses configuration',
      message: error.message,
    });
  }
});

/**
 * GET /api/config/roles
 * Get available roles with metadata
 */
router.get('/roles', async (req, res) => {
  try {
    // Get the data directory from central config
    const dataDir = CentralConfigManager.getDataDir();
    const rolesConfigPath = path.join(dataDir, '.civic', 'roles.yml');

    let rolesConfig: any = {};

    // Try to read the roles configuration file
    if (fs.existsSync(rolesConfigPath)) {
      try {
        const content = fs.readFileSync(rolesConfigPath, 'utf-8');
        rolesConfig = yaml.parse(content);
      } catch (error) {
        console.error('Error reading roles config file:', error);
      }
    }

    // If no roles config found, use default roles
    if (!rolesConfig.roles) {
      rolesConfig = {
        roles: {
          admin: {
            name: 'Administrator',
            description: 'Full system access',
            permissions: ['*'],
            status_transitions: [
              'draft',
              'review',
              'approved',
              'rejected',
              'archived',
            ],
          },
          clerk: {
            name: 'Clerk',
            description: 'Can create and edit records',
            permissions: [
              'records:create',
              'records:edit',
              'records:view',
              'records:list',
            ],
            status_transitions: ['draft', 'review'],
          },
          public: {
            name: 'Public',
            description: 'Read-only access',
            permissions: ['records:view', 'records:list'],
            status_transitions: [],
          },
        },
      };
    }

    // Transform roles to the expected format
    const rolesWithMetadata = Object.entries(rolesConfig.roles).map(
      ([key, role]: [string, any]) => ({
        key,
        name: role.name || key,
        description: role.description || '',
        permissions: role.permissions || [],
        record_types: role.record_types || {},
        status_transitions: role.status_transitions || [],
      })
    );

    res.json({
      success: true,
      data: {
        roles: rolesWithMetadata,
        total: rolesWithMetadata.length,
      },
    });
  } catch (error: any) {
    console.error('Error fetching roles config:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch roles configuration',
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
