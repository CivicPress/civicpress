import { CAC } from 'cac';
import chalk from 'chalk';
import { CivicPress } from '@civicpress/core';
import * as fs from 'fs';
import inquirer from 'inquirer';
import {
  initializeLogger,
  getGlobalOptionsFromArgs,
} from '../utils/global-options.js';

// Node.js globals
declare const process: any;
declare const console: any;

export const loginCommand = (cli: CAC) => {
  cli
    .command('login', 'Authenticate with CivicPress')
    .option('--token <token>', 'GitHub OAuth token for authentication')
    .option('--username <username>', 'Username for password authentication')
    .option('--password <password>', 'Password for authentication')
    .option('--method <method>', 'Authentication method (github, password)', {
      default: 'password',
    })
    .option('--logout', 'Log out and clear current session')
    .option('--status', 'Show current authentication status')
    .action(async (options: any) => {
      // Initialize logger with global options
      const globalOptions = getGlobalOptionsFromArgs();

      // Check if we should output JSON
      const shouldOutputJson = globalOptions.json;

      try {
        // If --help is present, let CAC handle it and exit 0
        if (options.help) {
          process.stdout.write('', () => process.exit(0));
        }

        // Get configuration from central config
        const { CentralConfigManager } = await import('@civicpress/core');
        const dataDir = CentralConfigManager.getDataDir();
        const dbConfig = CentralConfigManager.getDatabaseConfig();

        // Check if CivicPress is initialized
        if (!fs.existsSync(dataDir)) {
          const errorMsg =
            'CivicPress not initialized. Run "civic init" first.';
          if (shouldOutputJson) {
            console.log(JSON.stringify({ error: errorMsg }, null, 2));
          } else {
            process.stderr.write(chalk.red(`❌ ${errorMsg}\n`), () =>
              process.exit(1)
            );
          }
          return;
        }

        // Initialize CivicPress with database configuration
        const civic = new CivicPress({
          dataDir,
          database: dbConfig,
        });
        await civic.initialize();

        if (options.logout) {
          // Handle logout
          await handleLogout(
            civic,
            shouldOutputJson || false,
            initializeLogger()
          );
        } else if (options.status) {
          // Handle status check
          await handleStatus(
            civic,
            shouldOutputJson || false,
            initializeLogger()
          );
        } else {
          // Handle login
          await handleLogin(
            civic,
            options,
            shouldOutputJson || false,
            initializeLogger()
          );
        }

        await civic.shutdown();
      } catch (error) {
        const errorMsg =
          error instanceof Error ? error.message : 'Unknown error occurred';
        if (shouldOutputJson) {
          console.log(JSON.stringify({ error: errorMsg }, null, 2));
        } else {
          process.stderr.write(chalk.red(`❌ ${errorMsg}\n`), () =>
            process.exit(1)
          );
        }
      }
    });
};

async function handleLogin(
  civic: CivicPress,
  options: any,
  shouldOutputJson: boolean,
  logger: any
): Promise<void> {
  const authService = civic.getAuthService();
  let session: any;

  try {
    if (options.method === 'github') {
      // GitHub OAuth authentication
      let token: string;

      if (options.token) {
        token = options.token;
      } else {
        // Interactive prompt for token
        const { githubToken } = await inquirer.prompt([
          {
            type: 'password',
            name: 'githubToken',
            message: 'Enter your GitHub OAuth token:',
            validate: (input: string) => {
              if (!input.trim()) return 'GitHub token is required';
              return true;
            },
          },
        ]);
        token = githubToken;
      }

      session = await authService.authenticateWithGitHub(token);
    } else {
      // Username/password authentication
      let username: string;
      let password: string;

      if (options.username && options.password) {
        username = options.username;
        password = options.password;
      } else {
        // Interactive prompts for username/password
        const credentials = await inquirer.prompt([
          {
            type: 'input',
            name: 'username',
            message: 'Username:',
            validate: (input: string) => {
              if (!input.trim()) return 'Username is required';
              return true;
            },
          },
          {
            type: 'password',
            name: 'password',
            message: 'Password:',
            validate: (input: string) => {
              if (!input.trim()) return 'Password is required';
              return true;
            },
          },
        ]);
        username = credentials.username;
        password = credentials.password;
      }

      session = await authService.authenticateWithPassword(username, password);
    }

    if (shouldOutputJson) {
      console.log(
        JSON.stringify(
          {
            success: true,
            message: 'Successfully authenticated',
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
      logger.success('✅ Successfully authenticated!');
      logger.info(`👤 User: ${session.user.username} (${session.user.role})`);
      logger.info(`📧 Email: ${session.user.email || 'Not provided'}`);
      logger.info(`⏰ Session expires: ${session.expiresAt.toISOString()}`);
      logger.info(`🎫 Session token: ${session.token.substring(0, 20)}...`);
      logger.info(
        '💡 You can now use CivicPress commands with --token <token>'
      );
    }
  } catch (error) {
    const errorMsg =
      error instanceof Error ? error.message : 'Authentication failed';
    if (shouldOutputJson) {
      console.log(JSON.stringify({ error: errorMsg }, null, 2));
    } else {
      process.stderr.write(chalk.red(`❌ ${errorMsg}\n`), () =>
        process.exit(1)
      );
    }
  }
}

async function handleLogout(
  civic: CivicPress,
  shouldOutputJson: boolean,
  logger: any
): Promise<void> {
  try {
    const authService = civic.getAuthService();
    await authService.logout();

    if (shouldOutputJson) {
      console.log(
        JSON.stringify(
          {
            success: true,
            message: 'Successfully logged out',
          },
          null,
          2
        )
      );
    } else {
      logger.success('✅ Successfully logged out');
      logger.info(
        '💡 You will need to authenticate again for protected operations'
      );
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Logout failed';
    if (shouldOutputJson) {
      console.log(JSON.stringify({ error: errorMsg }, null, 2));
    } else {
      process.stderr.write(chalk.red(`❌ ${errorMsg}\n`), () =>
        process.exit(1)
      );
    }
  }
}

async function handleStatus(
  civic: CivicPress,
  shouldOutputJson: boolean,
  logger: any
): Promise<void> {
  try {
    const authService = civic.getAuthService();
    const currentUser = await authService.getCurrentUser();

    if (shouldOutputJson) {
      console.log(
        JSON.stringify(
          {
            authenticated: !!currentUser,
            user: currentUser || null,
          },
          null,
          2
        )
      );
    } else {
      if (currentUser) {
        logger.success('✅ Authenticated');
        logger.info(`👤 User: ${currentUser.username} (${currentUser.role})`);
        logger.info(`📧 Email: ${currentUser.email || 'Not provided'}`);
      } else {
        logger.warn('❌ Not authenticated');
        logger.info('💡 Run "civic login" to authenticate');
      }
    }
  } catch (error) {
    const errorMsg =
      error instanceof Error ? error.message : 'Failed to check status';
    if (shouldOutputJson) {
      console.log(JSON.stringify({ error: errorMsg }, null, 2));
    } else {
      process.stderr.write(chalk.red(`❌ ${errorMsg}\n`), () =>
        process.exit(1)
      );
    }
  }
}
