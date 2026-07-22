import { withCli } from '../utils/with-cli.js';
import { CAC } from 'cac';
import { CivicPress, isSimulatedAuthEnabled } from '@civicpress/core';
import { AuthUtils } from '../utils/auth-utils.js';
import { cliSuccess, cliError } from '../utils/cli-output.js';

export default function setupAuthCommand(cli: CAC) {
  cli
    .command('auth:login', 'Authenticate with OAuth provider')
    .option('--token <token>', 'OAuth token')
    .option('--provider <provider>', 'OAuth provider (default: github)', {
      default: 'github',
    })
    .option('--json', 'Output as JSON')
    .option('--silent', 'Suppress output')
    .action(
      withCli<[any]>(
        {
          operation: 'auth:login',
          errorMessage: 'Authentication failed',
          errorCode: 'AUTH_FAILED',
          details: (error, options: any) => ({
            error: error instanceof Error ? error.message : 'Unknown error',
            provider: options.provider,
          }),
        },
        async ({ globalOptions }, options: any) => {
          if (!options.token) {
            cliError(
              '--token is required',
              'VALIDATION_ERROR',
              undefined,
              'auth:login'
            );
            process.exit(1);
          }

          // Get configuration from central config
          const { CentralConfigManager } = await import('@civicpress/core');
          const dataDir = CentralConfigManager.getDataDir();
          const dbConfig = CentralConfigManager.getDatabaseConfig();

          // Initialize CivicPress with database configuration
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

          // Check if provider is supported
          const availableProviders = authService.getAvailableOAuthProviders();
          if (!availableProviders.includes(options.provider)) {
            cliError(
              `Provider '${options.provider}' is not supported`,
              'INVALID_PROVIDER',
              {
                providedProvider: options.provider,
                availableProviders,
              },
              'auth:login'
            );
            process.exit(1);
          }

          // Authenticate with OAuth
          const session = await authService.authenticateWithOAuth(
            options.provider,
            options.token
          );

          // Persist where resolveToken() reads it (see login.ts).
          const tokenFile = AuthUtils.saveToken(session.token);

          cliSuccess(
            {
              session: {
                token: session.token,
                user: session.user,
                expiresAt: session.expiresAt,
              },
              tokenFile,
            },
            `Authentication successful: ${session.user.username} (session saved to ${tokenFile})`,
            {
              operation: 'auth:login',
              provider: options.provider,
              username: session.user.username,
              role: session.user.role,
            }
          );

          await civic.shutdown();
        }
      )
    );

  cli
    .command('auth:me', 'Show current user information')
    .alias('me')
    .option('--token <token>', 'Session token to check')
    .option('--json', 'Output as JSON')
    .option('--silent', 'Suppress output')
    .action(
      withCli<[any]>(
        {
          operation: 'auth:me',
          errorMessage: 'Failed to get user info',
          errorCode: 'GET_USER_INFO_FAILED',
          details: (error) => ({
            error: error instanceof Error ? error.message : 'Unknown error',
          }),
        },
        async ({ globalOptions }, options: any) => {
          // Use global AuthUtils for authentication
          const { user, civic } = await AuthUtils.requireAuthWithCivic(
            options.token,
            globalOptions.json
          );

          cliSuccess(
            {
              user,
              authenticated: !!user,
            },
            `Authenticated as ${user.username}`,
            {
              operation: 'auth:me',
              username: user.username,
              role: user.role,
            }
          );

          await civic.shutdown();
        }
      )
    );

  cli
    .command('auth:providers', 'List available OAuth providers')
    .option('--json', 'Output as JSON')
    .option('--silent', 'Suppress output')
    .action(
      withCli<[any]>(
        {
          operation: 'auth:providers',
          errorMessage: 'Failed to get providers',
          errorCode: 'GET_PROVIDERS_FAILED',
          details: (error) => ({
            error: error instanceof Error ? error.message : 'Unknown error',
          }),
        },
        async ({ globalOptions }, _options: any) => {
          // Get configuration from central config
          const { CentralConfigManager } = await import('@civicpress/core');
          const dataDir = CentralConfigManager.getDataDir();
          const dbConfig = CentralConfigManager.getDatabaseConfig();

          // Initialize CivicPress with database configuration
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
          const providers = authService.getAvailableOAuthProviders();

          cliSuccess(
            { providers },
            `Available OAuth providers: ${providers.join(', ')}`,
            {
              operation: 'auth:providers',
              providerCount: providers.length,
            }
          );

          await civic.shutdown();
        }
      )
    );

  cli
    .command('auth:validate', 'Validate OAuth token')
    .option('--token <token>', 'OAuth token')
    .option('--provider <provider>', 'OAuth provider (default: github)', {
      default: 'github',
    })
    .option('--json', 'Output as JSON')
    .option('--silent', 'Suppress output')
    .action(
      withCli<[any]>(
        {
          operation: 'auth:validate',
          errorMessage: 'Token validation failed',
          errorCode: 'TOKEN_VALIDATION_FAILED',
          details: (error, options: any) => ({
            error: error instanceof Error ? error.message : 'Unknown error',
            provider: options.provider,
          }),
        },
        async ({ globalOptions }, options: any) => {
          if (!options.token) {
            cliError(
              '--token is required',
              'VALIDATION_ERROR',
              undefined,
              'auth:validate'
            );
            process.exit(1);
          }

          // Get configuration from central config
          const { CentralConfigManager } = await import('@civicpress/core');
          const dataDir = CentralConfigManager.getDataDir();
          const dbConfig = CentralConfigManager.getDatabaseConfig();

          // Initialize CivicPress with database configuration
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

          // Check if provider is supported
          const availableProviders = authService.getAvailableOAuthProviders();
          if (!availableProviders.includes(options.provider)) {
            cliError(
              `Provider '${options.provider}' is not supported`,
              'INVALID_PROVIDER',
              {
                providedProvider: options.provider,
                availableProviders,
              },
              'auth:validate'
            );
            process.exit(1);
          }

          // Get OAuth provider manager to validate token
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const oauthManager = (authService as any).oauthManager;
          const user = await oauthManager.validateToken(
            options.provider,
            options.token
          );

          cliSuccess({ user }, `Token is valid for user ${user.username}`, {
            operation: 'auth:validate',
            provider: options.provider,
            username: user.username,
          });

          await civic.shutdown();
        }
      )
    );

  cli
    .command(
      'auth:simulated',
      'Authenticate with simulated account (for development)'
    )
    .option('--username <username>', 'Username for simulated account')
    .option('--role <role>', 'Role for simulated account', {
      default: 'public',
    })
    .option('--json', 'Output as JSON')
    .option('--silent', 'Suppress output')
    .action(
      withCli<[any]>(
        {
          operation: 'auth:simulated',
          errorMessage: 'Simulated authentication failed',
          errorCode: 'SIMULATED_AUTH_FAILED',
          details: (error) => ({
            error: error instanceof Error ? error.message : 'Unknown error',
          }),
        },
        async ({ globalOptions }, options: any) => {
          // FA-CLI-001: fail closed before any initialization. Only enabled in an
          // explicit dev/test environment; an unset NODE_ENV is treated as production.
          if (!isSimulatedAuthEnabled()) {
            cliError(
              'Simulated accounts are disabled in this environment ' +
                '(enable only in development with CIVIC_ALLOW_SIMULATED_AUTH=true)',
              'SIMULATED_AUTH_DISABLED',
              undefined,
              'auth:simulated'
            );
            process.exit(1);
          }

          if (!options.username) {
            cliError(
              '--username is required',
              'VALIDATION_ERROR',
              undefined,
              'auth:simulated'
            );
            process.exit(1);
          }

          // Get configuration from central config
          const { CentralConfigManager } = await import('@civicpress/core');
          const dataDir = CentralConfigManager.getDataDir();
          const dbConfig = CentralConfigManager.getDatabaseConfig();

          // Initialize CivicPress with database configuration
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

          // Validate role
          if (!(await authService.isValidRole(options.role))) {
            const availableRoles = await authService.getAvailableRoles();
            cliError(
              `Invalid role '${options.role}'`,
              'INVALID_ROLE',
              {
                providedRole: options.role,
                availableRoles,
              },
              'auth:simulated'
            );
            process.exit(1);
          }

          // Authenticate with simulated account
          const session = await authService.authenticateWithSimulatedAccount(
            options.username,
            options.role
          );

          cliSuccess(
            {
              session: {
                token: session.token,
                user: session.user,
                expiresAt: session.expiresAt,
              },
            },
            `Successfully authenticated with simulated account: ${session.user.username}`,
            {
              operation: 'auth:simulated',
              username: session.user.username,
              role: session.user.role,
            }
          );

          await civic.shutdown();
        }
      )
    );

  cli
    .command('auth:password', 'Authenticate with username and password')
    .option('--username <username>', 'Username')
    .option('--password <password>', 'Password')
    .option('--json', 'Output as JSON')
    .option('--silent', 'Suppress output')
    .action(
      withCli<[any]>(
        {
          operation: 'auth:password',
          errorMessage: 'Password authentication failed',
          errorCode: 'PASSWORD_AUTH_FAILED',
          details: (error) => ({
            error: error instanceof Error ? error.message : 'Unknown error',
          }),
        },
        async ({ globalOptions }, options: any) => {
          let username = options.username;
          let password = options.password;

          // If not provided via command line, prompt interactively
          if (!username || !password) {
            const inquirer = await import('inquirer');
            const prompts = [];

            if (!username) {
              prompts.push({
                type: 'input',
                name: 'username',
                message: 'Username:',
                validate: (input: string) => {
                  if (!input.trim()) return 'Username is required';
                  return true;
                },
              });
            }

            if (!password) {
              prompts.push({
                type: 'password',
                name: 'password',
                message: 'Password:',
                validate: (input: string) => {
                  if (!input.trim()) return 'Password is required';
                  return true;
                },
              });
            }

            const answers = await inquirer.default.prompt(prompts);
            username = username || answers.username;
            password = password || answers.password;
          }

          // Get configuration from central config
          const { CentralConfigManager } = await import('@civicpress/core');
          const dataDir = CentralConfigManager.getDataDir();
          const dbConfig = CentralConfigManager.getDatabaseConfig();

          // Initialize CivicPress with database configuration
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

          // Authenticate with username and password
          const session = await authService.authenticateWithPassword(
            username,
            password
          );

          cliSuccess(
            {
              session: {
                token: session.token,
                user: session.user,
                expiresAt: session.expiresAt,
              },
            },
            `Password authentication successful: ${session.user.username}`,
            {
              operation: 'auth:password',
              username: session.user.username,
              role: session.user.role,
            }
          );

          await civic.shutdown();
        }
      )
    );
}
