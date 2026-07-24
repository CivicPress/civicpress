/* eslint-disable @typescript-eslint/no-explicit-any -- CLI command handlers pass CAC's untyped options through withCli. */
import { CAC } from 'cac';
import { cliSuccess } from '../utils/cli-output.js';
import { withCli } from '../utils/with-cli.js';

export const infoCommand = (cli: CAC) => {
  cli
    .command('info', 'Show organization and system configuration info')
    .option('--json', 'Output as JSON')
    .option(
      '--token <token>',
      'Session token for authentication (required for system config)'
    )
    .action(
      withCli<[any]>(
        {
          operation: 'info',
          errorMessage: 'Failed to load info',
          errorCode: 'LOAD_INFO_FAILED',
        },
        async ({ globalOptions }, options: any) => {
          const token = options.token;
          let isAdmin = false;
          let userInfo: any = null;
          let systemConfig: any = null;
          let dataDir: string | undefined = undefined;
          let dbConfig: any = undefined;
          const { CentralConfigManager } = await import('@civicpress/core');
          const orgConfig = CentralConfigManager.getOrgConfig();
          if (token) {
            // Validate token and check admin without exiting
            const { CivicPress } = await import('@civicpress/core');
            try {
              dataDir = CentralConfigManager.getDataDir();
              dbConfig = CentralConfigManager.getDatabaseConfig();

              const civic = new CivicPress({
                dataDir,
                database: dbConfig,
                logger: {
                  json: globalOptions.json,
                  silent: globalOptions.silent,
                },
              });
              await civic.initialize();

              const authService = civic.getAuthService();
              const user = await authService.validateSession(token);

              if (user) {
                userInfo = user;
                isAdmin = user.role === 'admin';
              } else {
                isAdmin = false;
                userInfo = null;
              }

              await civic.shutdown();
            } catch {
              // Invalid token, treat as not admin but don't exit
              isAdmin = false;
              userInfo = null;
            }
          }
          if (isAdmin) {
            systemConfig = CentralConfigManager.getConfig();
            dataDir = CentralConfigManager.getDataDir();
            dbConfig = CentralConfigManager.getDatabaseConfig();
          }

          const output: any = {
            organization: orgConfig,
          };
          if (isAdmin) {
            output.system = {
              ...systemConfig,
              dataDir,
              database: dbConfig,
            };
            output.user = userInfo;
          } else if (token) {
            output.note = 'System config is only visible to admin users.';
            if (userInfo) output.user = userInfo;
          }

          const message = isAdmin
            ? `Organization and system information (authenticated as ${userInfo?.username || 'admin'})`
            : token
              ? `Organization information (system config requires admin access)`
              : 'Organization information';

          cliSuccess(output, message, {
            operation: 'info',
            isAdmin,
            hasToken: !!token,
          });
        }
      )
    );
};
