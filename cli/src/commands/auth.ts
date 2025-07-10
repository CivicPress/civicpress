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
}
