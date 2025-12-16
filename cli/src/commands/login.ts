import { CAC } from 'cac';
import chalk from 'chalk';
import { CivicPress } from '@civicpress/core';
import * as fs from 'fs';
import inquirer from 'inquirer';
import {
  initializeLogger,
  getGlobalOptionsFromArgs,
  initializeCliOutput,
} from '../utils/global-options.js';
import {
  cliSuccess,
  cliError,
  cliInfo,
  cliWarn,
  cliStartOperation,
} from '../utils/cli-output.js';

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
      // Initialize CLI output with global options
      const globalOptions = getGlobalOptionsFromArgs();
      initializeCliOutput(globalOptions);

      const endOperation = cliStartOperation('login');

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
          cliError(
            'CivicPress not initialized. Run "civic init" first.',
            'NOT_INITIALIZED',
            undefined,
            'login'
          );
          process.exit(1);
        }

        // Initialize CivicPress with database configuration
        const civic = new CivicPress({
          dataDir,
          database: dbConfig,
        });
        await civic.initialize();

        if (options.logout) {
          // Handle logout
          await handleLogout(civic);
        } else if (options.status) {
          // Handle status check
          await handleStatus(civic);
        } else {
          // Handle login
          await handleLogin(civic, options);
        }

        await civic.shutdown();
      } catch (error) {
        cliError(
          error instanceof Error ? error.message : 'Unknown error occurred',
          'LOGIN_FAILED',
          {
            error: error instanceof Error ? error.message : String(error),
          },
          'login'
        );
        process.exit(1);
      } finally {
        endOperation();
      }
    });
};

async function handleLogin(civic: CivicPress, options: any): Promise<void> {
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

    cliSuccess(
      {
        session: {
          token: session.token,
          user: session.user,
          expiresAt: session.expiresAt,
        },
      },
      `Successfully authenticated as ${session.user.username}`,
      {
        operation: 'login',
        username: session.user.username,
        role: session.user.role,
      }
    );
  } catch (error) {
    cliError(
      error instanceof Error ? error.message : 'Authentication failed',
      'AUTHENTICATION_FAILED',
      {
        error: error instanceof Error ? error.message : String(error),
        method: options.method || 'password',
      },
      'login'
    );
    throw error;
  }
}

async function handleLogout(civic: CivicPress): Promise<void> {
  try {
    const authService = civic.getAuthService();
    await authService.logout();

    cliSuccess({ success: true }, 'Successfully logged out', {
      operation: 'logout',
    });
  } catch (error) {
    cliError(
      error instanceof Error ? error.message : 'Logout failed',
      'LOGOUT_FAILED',
      {
        error: error instanceof Error ? error.message : String(error),
      },
      'logout'
    );
    throw error;
  }
}

async function handleStatus(civic: CivicPress): Promise<void> {
  try {
    const authService = civic.getAuthService();
    const currentUser = await authService.getCurrentUser();

    if (currentUser) {
      cliSuccess(
        {
          authenticated: true,
          user: currentUser,
        },
        `Authenticated as ${currentUser.username}`,
        {
          operation: 'login:status',
          username: currentUser.username,
          role: currentUser.role,
        }
      );
    } else {
      cliWarn(
        'Not authenticated. Run "civic login" to authenticate',
        'login:status'
      );
    }
  } catch (error) {
    cliError(
      error instanceof Error ? error.message : 'Failed to check status',
      'STATUS_CHECK_FAILED',
      {
        error: error instanceof Error ? error.message : String(error),
      },
      'login:status'
    );
    throw error;
  }
}
