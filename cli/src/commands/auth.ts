import { CAC } from 'cac';
import { CivicPress } from '@civicpress/core';
import { AuthUtils } from '../utils/auth-utils.js';

export default function setupAuthCommand(cli: CAC) {
  cli
    .command('auth:login', 'Authenticate with OAuth provider')
    .option('--token <token>', 'OAuth token')
    .option('--provider <provider>', 'OAuth provider (default: github)', {
      default: 'github',
    })
    .option('--json', 'Output as JSON')
    .option('--silent', 'Suppress output')
    .action(async (options) => {
      try {
        if (!options.token) {
          if (!options.silent) {
            console.error('Error: --token is required');
          }
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
            json: options.json,
            silent: options.silent,
          },
        });
        await civic.initialize();

        const authService = civic.getAuthService();

        // Check if provider is supported
        const availableProviders = authService.getAvailableOAuthProviders();
        if (!availableProviders.includes(options.provider)) {
          if (!options.silent) {
            console.error(
              `Error: Provider '${options.provider}' is not supported`
            );
            console.error(
              `Available providers: ${availableProviders.join(', ')}`
            );
          }
          process.exit(1);
        }

        // Authenticate with OAuth
        const session = await authService.authenticateWithOAuth(
          options.provider,
          options.token
        );

        if (options.json) {
          console.log(
            JSON.stringify(
              {
                success: true,
                session: {
                  token: session.token,
                  user: session.user,
                  expiresAt: session.expiresAt,
                },
              },
              null,
              2
            )
          );
        } else if (!options.silent) {
          console.log('✅ Authentication successful!');
          console.log(
            `👤 User: ${session.user.username} (${session.user.name})`
          );
          console.log(`🔑 Role: ${session.user.role}`);
          console.log(`⏰ Expires: ${session.expiresAt.toISOString()}`);
          console.log(`🎫 Session token: ${session.token.substring(0, 20)}...`);
        }

        await civic.shutdown();
      } catch (error) {
        if (!options.silent) {
          console.error(
            '❌ Authentication failed:',
            error instanceof Error ? error.message : 'Unknown error'
          );
        }
        process.exit(1);
      }
    });

  cli
    .command('auth:me', 'Show current user information')
    .alias('me')
    .option('--token <token>', 'Session token to check')
    .option('--json', 'Output as JSON')
    .option('--silent', 'Suppress output')
    .action(async (options) => {
      const shouldOutputJson = options.json;
      try {
        // Use global AuthUtils for authentication
        const { user, civic } = await AuthUtils.requireAuthWithCivic(
          options.token,
          shouldOutputJson
        );
        // Output user info if authenticated
        if (shouldOutputJson) {
          console.log(
            JSON.stringify(
              {
                success: true,
                user,
                authenticated: !!user,
              },
              null,
              2
            )
          );
        } else if (!options.silent) {
          if (user) {
            console.log('✅ You are authenticated!');
            console.log(`👤 Username: ${user.username}`);
            console.log(`📝 Name: ${user.name || 'Not provided'}`);
            console.log(`📧 Email: ${user.email || 'Not provided'}`);
            console.log(`🔑 Role: ${user.role}`);
          }
        }
        await civic.shutdown();
      } catch (error) {
        // AuthUtils already outputs the error and exits, so this is just a fallback
        if (!options.silent) {
          console.error(
            '❌ Failed to get user info:',
            error instanceof Error ? error.message : 'Unknown error'
          );
        }
        process.exit(1);
      }
    });

  cli
    .command('auth:providers', 'List available OAuth providers')
    .option('--json', 'Output as JSON')
    .option('--silent', 'Suppress output')
    .action(async (options) => {
      try {
        // Get configuration from central config
        const { CentralConfigManager } = await import('@civicpress/core');
        const dataDir = CentralConfigManager.getDataDir();
        const dbConfig = CentralConfigManager.getDatabaseConfig();

        // Initialize CivicPress with database configuration
        const civic = new CivicPress({
          dataDir,
          database: dbConfig,
          logger: {
            json: options.json,
            silent: options.silent,
          },
        });
        await civic.initialize();

        const authService = civic.getAuthService();
        const providers = authService.getAvailableOAuthProviders();

        if (options.json) {
          console.log(
            JSON.stringify(
              {
                success: true,
                providers,
              },
              null,
              2
            )
          );
        } else if (!options.silent) {
          console.log('🔐 Available OAuth providers:');
          providers.forEach((provider) => {
            console.log(`  • ${provider}`);
          });
        }

        await civic.shutdown();
      } catch (error) {
        if (!options.silent) {
          console.error(
            '❌ Failed to get providers:',
            error instanceof Error ? error.message : 'Unknown error'
          );
        }
        process.exit(1);
      }
    });

  cli
    .command('auth:validate', 'Validate OAuth token')
    .option('--token <token>', 'OAuth token')
    .option('--provider <provider>', 'OAuth provider (default: github)', {
      default: 'github',
    })
    .option('--json', 'Output as JSON')
    .option('--silent', 'Suppress output')
    .action(async (options) => {
      try {
        if (!options.token) {
          if (!options.silent) {
            console.error('Error: --token is required');
          }
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
        });
        await civic.initialize();

        const authService = civic.getAuthService();

        // Check if provider is supported
        const availableProviders = authService.getAvailableOAuthProviders();
        if (!availableProviders.includes(options.provider)) {
          if (!options.silent) {
            console.error(
              `Error: Provider '${options.provider}' is not supported`
            );
            console.error(
              `Available providers: ${availableProviders.join(', ')}`
            );
          }
          process.exit(1);
        }

        // Get OAuth provider manager to validate token
        const oauthManager = (authService as any).oauthManager;
        const user = await oauthManager.validateToken(
          options.provider,
          options.token
        );

        if (options.json) {
          console.log(
            JSON.stringify(
              {
                success: true,
                user,
              },
              null,
              2
            )
          );
        } else if (!options.silent) {
          console.log('✅ Token is valid!');
          console.log(`👤 User: ${user.username} (${user.name})`);
          console.log(`📧 Email: ${user.email || 'Not provided'}`);
          console.log(`🆔 Provider ID: ${user.providerUserId}`);
          console.log(`🔗 Provider: ${user.provider}`);
        }

        await civic.shutdown();
      } catch (error) {
        if (!options.silent) {
          console.error(
            '❌ Token validation failed:',
            error instanceof Error ? error.message : 'Unknown error'
          );
        }
        process.exit(1);
      }
    });

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
    .action(async (options) => {
      // Check production environment first, before any initialization
      if (process.env.NODE_ENV === 'production') {
        if (options.json) {
          console.log(
            JSON.stringify(
              { error: 'Simulated accounts are disabled in production' },
              null,
              2
            )
          );
        } else {
          console.error('Error: Simulated accounts are disabled in production');
        }
        process.exit(1);
      }

      try {
        if (!options.username) {
          if (!options.silent) {
            console.error('Error: --username is required');
          }
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
        });
        await civic.initialize();

        const authService = civic.getAuthService();

        // Validate role
        if (!(await authService.isValidRole(options.role))) {
          const availableRoles = await authService.getAvailableRoles();
          if (!options.silent) {
            console.error(`Error: Invalid role '${options.role}'`);
            console.error(`Available roles: ${availableRoles.join(', ')}`);
          }
          process.exit(1);
        }

        // Authenticate with simulated account
        const session = await authService.authenticateWithSimulatedAccount(
          options.username,
          options.role
        );

        if (options.json) {
          console.log(
            JSON.stringify(
              {
                success: true,
                message: 'Successfully authenticated with simulated account',
                session: {
                  token: session.token,
                  user: session.user,
                  expiresAt: session.expiresAt,
                },
              },
              null,
              2
            )
          );
        } else {
          console.log('✅ Successfully authenticated with simulated account!');
          console.log(
            `👤 User: ${session.user.username} (${session.user.role})`
          );
          console.log(`⏰ Session expires: ${session.expiresAt.toISOString()}`);
          console.log(`🎫 Session token: ${session.token.substring(0, 20)}...`);
          console.log(
            '💡 You can now use CivicPress commands without specifying --role'
          );
        }

        await civic.shutdown();
      } catch (error) {
        const errorMsg =
          error instanceof Error
            ? error.message
            : 'Simulated authentication failed';
        if (options.json) {
          console.log(JSON.stringify({ error: errorMsg }, null, 2));
        } else {
          console.error(`❌ ${errorMsg}`);
        }
        process.exit(1);
      }
    });

  cli
    .command('auth:password', 'Authenticate with username and password')
    .option('--username <username>', 'Username')
    .option('--password <password>', 'Password')
    .option('--json', 'Output as JSON')
    .option('--silent', 'Suppress output')
    .action(async (options) => {
      try {
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
            json: options.json,
            silent: options.silent,
          },
        });
        await civic.initialize();

        const authService = civic.getAuthService();

        // Authenticate with username and password
        const session = await authService.authenticateWithPassword(
          username,
          password
        );

        if (options.json) {
          console.log(
            JSON.stringify(
              {
                success: true,
                session: {
                  token: session.token,
                  user: session.user,
                  expiresAt: session.expiresAt,
                },
              },
              null,
              2
            )
          );
        } else if (!options.silent) {
          console.log('✅ Password authentication successful!');
          console.log(
            `👤 User: ${session.user.username} (${session.user.name})`
          );
          console.log(`🔑 Role: ${session.user.role}`);
          console.log(`⏰ Expires: ${session.expiresAt.toISOString()}`);
          console.log(`🎫 Session token: ${session.token.substring(0, 20)}...`);
        }

        await civic.shutdown();
      } catch (error) {
        if (!options.silent) {
          console.error(
            '❌ Password authentication failed:',
            error instanceof Error ? error.message : 'Unknown error'
          );
        }
        process.exit(1);
      }
    });
}
