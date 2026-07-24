import { Router } from 'express';
import { CentralConfigManager } from '@civicpress/core';
import type { AuthUser } from '@civicpress/core';
import { logApiError } from '../utils/api-logger.js';

const router = Router();

type CentralConfig = ReturnType<typeof CentralConfigManager.getConfig>;
type DbConfig = ReturnType<typeof CentralConfigManager.getDatabaseConfig>;

interface InfoData {
  organization: ReturnType<typeof CentralConfigManager.getOrgConfig>;
  analytics: {
    inject_head: string;
    inject_body_start: string;
    inject_body_end: string;
  } | null;
  system?: CentralConfig & { dataDir?: string; database?: DbConfig };
  user?: AuthUser;
  note?: string;
}

router.get('/', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader?.replace('Bearer ', '');

    let isAdmin = false;
    let userInfo: AuthUser | null = null;
    let systemConfig: CentralConfig | undefined;
    let dataDir: string | undefined = undefined;
    let dbConfig: DbConfig | undefined = undefined;

    // Get organization config
    const orgConfig = CentralConfigManager.getOrgConfig();

    // Get analytics config (public, no auth needed)
    const analyticsConfig = CentralConfigManager.getAnalyticsConfig();

    // Validate token if provided. Use the shared CivicPress instance
    // injected by the mount middleware (api-001 fix). Previously this
    // block created a fresh CivicPress per request — a trivial DoS
    // amplifier on an unauthenticated endpoint.
    if (token) {
      try {
        const civic = req.civicPress;
        if (civic) {
          const authService = civic.getAuthService();
          const user = await authService.validateSession(token);
          if (user) {
            userInfo = user;
            isAdmin = user.role === 'admin';
          }
        }
        // If civic is not on the request, the core isn't initialised
        // (or the mount didn't inject); treat as unauthenticated.
      } catch {
        // Invalid token, treat as not admin
        isAdmin = false;
        userInfo = null;
      }
    }

    // Get system config only for admins
    if (isAdmin) {
      systemConfig = CentralConfigManager.getConfig();
      dataDir = CentralConfigManager.getDataDir();
      dbConfig = CentralConfigManager.getDatabaseConfig();
    }

    // Build the payload. Canonical envelope: the fields live under `data`,
    // not at the top level. (UI consumers — index.vue, app.vue, Logo.vue —
    // were updated to read `.data.organization` / `.data.analytics`.)
    const data: InfoData = {
      organization: orgConfig,
      analytics: analyticsConfig.enabled
        ? {
            inject_head: analyticsConfig.inject_head || '',
            inject_body_start: analyticsConfig.inject_body_start || '',
            inject_body_end: analyticsConfig.inject_body_end || '',
          }
        : null,
    };

    if (isAdmin && systemConfig) {
      data.system = {
        ...systemConfig,
        dataDir,
        database: dbConfig,
      };
      if (userInfo) data.user = userInfo;
    } else if (token) {
      data.note = 'System config is only visible to admin users.';
      if (userInfo) data.user = userInfo;
    }

    res.json({ success: true, data });
  } catch (error) {
    // Unauthenticated endpoint — never surface the raw message (this route
    // reads YAML config, so errors can carry filesystem paths).
    logApiError('info', error, req);
    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to load system info',
        code: 'LOAD_SYSTEM_INFO_FAILED',
      },
    });
  }
});

export default router;
