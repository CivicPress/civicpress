import { Router } from 'express';
import { CentralConfigManager } from '@civicpress/core';
import { CivicPress } from '@civicpress/core';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader?.replace('Bearer ', '');

    let isAdmin = false;
    let userInfo: any = null;
    let systemConfig: any = null;
    let dataDir: string | undefined = undefined;
    let dbConfig: any = undefined;

    // Get organization config
    const orgConfig = CentralConfigManager.getOrgConfig();

    // Validate token if provided
    if (token) {
      try {
        const dataDir = CentralConfigManager.getDataDir();
        const dbConfig = CentralConfigManager.getDatabaseConfig();

        const civic = new CivicPress({
          dataDir,
          database: dbConfig,
          logger: { json: true },
        });
        await civic.initialize();

        const authService = civic.getAuthService();
        const user = await authService.validateSession(token);

        if (user) {
          userInfo = user;
          isAdmin = user.role === 'admin';
        }

        await civic.shutdown();
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

    // Build response
    const response: any = {
      success: true,
      organization: orgConfig,
    };

    if (isAdmin) {
      response.system = {
        ...systemConfig,
        dataDir,
        database: dbConfig,
      };
      response.user = userInfo;
    } else if (token) {
      response.note = 'System config is only visible to admin users.';
      if (userInfo) response.user = userInfo;
    }

    res.json(response);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;
