import { CAC } from 'cac';
import { CivicPress } from '@civicpress/core';
import { AuthUtils } from '../utils/auth-utils.js';
import {
  getGlobalOptionsFromArgs,
  initializeCliOutput,
} from '../utils/global-options.js';
import {
  cliSuccess,
  cliError,
  cliInfo,
  cliStartOperation,
} from '../utils/cli-output.js';

export default function setupUsersCommand(cli: CAC) {
  cli
    .command('users:create', 'Create a new user account')
    .option('--token <token>', 'Session token for authentication')
    .option('--username <username>', 'Username')
    .option('--email <email>', 'Email address')
    .option('--name <name>', 'Full name')
    .option('--role <role>', 'User role', { default: 'public' })
    .option('--password <password>', 'Password')
    .option('--json', 'Output as JSON')
    .option('--silent', 'Suppress output')
    .action(async (options) => {
      // Initialize CLI output with global options
      const globalOptions = getGlobalOptionsFromArgs();
      initializeCliOutput(globalOptions);

      const endOperation = cliStartOperation('users:create');

      try {
        let username = options.username;
        let email = options.email;
        let name = options.name;
        let role = options.role;
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
                if (input.length < 8)
                  return 'Password must be at least 8 characters';
                return true;
              },
            });
          }

          if (!email) {
            prompts.push({
              type: 'input',
              name: 'email',
              message: 'Email (optional):',
            });
          }

          if (!name) {
            prompts.push({
              type: 'input',
              name: 'name',
              message: 'Full name (optional):',
            });
          }

          const answers = await inquirer.default.prompt(prompts);
          username = username || answers.username;
          password = password || answers.password;
          email = email || answers.email;
          name = name || answers.name;
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

        // Require authentication for user creation
        const { user } = await AuthUtils.requireAuthWithCivic(
          options.token,
          options.json
        );

        // Check permission to create users
        if (
          user.role !== 'admin' &&
          !(await civic.getAuthService().userCan(user, 'users:manage'))
        ) {
          cliError(
            'Insufficient permissions to create users',
            'PERMISSION_DENIED',
            {
              requiredPermission: 'users:manage',
              userRole: user.role,
              details: 'You do not have permission to create users',
            },
            'users:create'
          );
          process.exit(1);
        }

        const authService = civic.getAuthService();

        // Validate role
        if (!(await authService.isValidRole(role))) {
          const availableRoles = await authService.getAvailableRoles();
          cliError(
            `Invalid role '${role}'`,
            'INVALID_ROLE',
            {
              providedRole: role,
              availableRoles,
            },
            'users:create'
          );
          process.exit(1);
        }

        // Hash password
        const bcrypt = await import('bcrypt');
        const saltRounds = 12;
        const passwordHash = await bcrypt.hash(password, saltRounds);

        // Create user with password authentication
        const newUser = await authService.createUserWithPassword({
          username,
          email,
          name,
          role,
          passwordHash,
          auth_provider: 'password', // Explicitly set for CLI-created users
          email_verified: false, // Require email verification for new users
        });

        cliSuccess(
          {
            user: {
              id: newUser.id,
              username: newUser.username,
              role: newUser.role,
              email: newUser.email,
              name: newUser.name,
              created_at: newUser.created_at,
            },
            loginCommand: `civic auth:password --username ${newUser.username}`,
          },
          `User created successfully: ${newUser.username}`,
          {
            operation: 'users:create',
            userId: newUser.id,
            username: newUser.username,
            role: newUser.role,
          }
        );

        await civic.shutdown();
      } catch (error) {
        cliError(
          'Failed to create user',
          'CREATE_USER_FAILED',
          {
            error: error instanceof Error ? error.message : 'Unknown error',
          },
          'users:create'
        );
        process.exit(1);
      } finally {
        endOperation();
      }
    });

  cli
    .command('users:list', 'List all users')
    .option('--token <token>', 'Session token for authentication')
    .option('--json', 'Output as JSON')
    .option('--silent', 'Suppress output')
    .action(async (options) => {
      // Initialize CLI output with global options
      const globalOptions = getGlobalOptionsFromArgs();
      initializeCliOutput(globalOptions);

      const endOperation = cliStartOperation('users:list');

      try {
        // Require authentication and get user/civic
        const { user, civic } = await AuthUtils.requireAuthWithCivic(
          options.token,
          globalOptions.json
        );
        // Check permission
        if (
          user.role !== 'admin' &&
          !(await civic.getAuthService().userCan(user, 'users:manage'))
        ) {
          cliError(
            'Insufficient permissions to list users',
            'PERMISSION_DENIED',
            {
              requiredPermission: 'users:manage',
              userRole: user.role,
              details: 'You do not have permission to list users',
            },
            'users:list'
          );
          process.exit(1);
        }
        const dbService = civic.getDatabaseService();
        const users = await dbService.listUsers({ limit: 100, offset: 0 });

        const userList = users.users.map((user) => ({
          id: user.id,
          username: user.username,
          role: user.role,
          email: user.email,
          name: user.name,
          created_at: user.created_at,
        }));

        cliSuccess(
          {
            users: userList,
            total: users.total,
          },
          users.total === 0
            ? 'No users found'
            : `Found ${users.total} user${users.total === 1 ? '' : 's'}`,
          {
            operation: 'users:list',
            totalUsers: users.total,
          }
        );

        await civic.shutdown();
      } catch (error) {
        cliError(
          'Failed to list users',
          'LIST_USERS_FAILED',
          {
            error: error instanceof Error ? error.message : 'Unknown error',
          },
          'users:list'
        );
        process.exit(1);
      } finally {
        endOperation();
      }
    });

  cli
    .command('users:update', 'Update a user account')
    .option('--token <token>', 'Session token for authentication')
    .option('--username <username>', 'Username of the user to update')
    .option('--id <id>', 'User ID to update')
    .option('--email <email>', 'New email address')
    .option('--name <name>', 'New full name')
    .option('--role <role>', 'New user role')
    .option('--password <password>', 'New password')
    .option('--json', 'Output as JSON')
    .option('--silent', 'Suppress output')
    .action(async (options) => {
      // Initialize CLI output with global options
      const globalOptions = getGlobalOptionsFromArgs();
      initializeCliOutput(globalOptions);

      const endOperation = cliStartOperation('users:update');

      try {
        const { user, civic } = await AuthUtils.requireAuthWithCivic(
          options.token,
          globalOptions.json
        );
        if (
          user.role !== 'admin' &&
          !(await civic.getAuthService().userCan(user, 'users:manage'))
        ) {
          cliError(
            'Insufficient permissions to update users',
            'PERMISSION_DENIED',
            {
              requiredPermission: 'users:manage',
              userRole: user.role,
              details: 'You do not have permission to update users',
            },
            'users:update'
          );
          process.exit(1);
        }
        const { username, id, email, name, role, password } = options;
        if (!username && !id) {
          cliError(
            '--username or --id is required',
            'VALIDATION_ERROR',
            undefined,
            'users:update'
          );
          process.exit(1);
        }
        const dbService = civic.getDatabaseService();
        let targetUser = null;
        if (id) {
          targetUser = await dbService.getUserById(Number(id));
        } else if (username) {
          targetUser = await dbService.getUserByUsername(username);
        }
        if (!targetUser) {
          cliError(
            'User not found',
            'USER_NOT_FOUND',
            undefined,
            'users:update'
          );
          process.exit(1);
        }
        const authService = civic.getAuthService();

        const updates: any = {};
        if (email) updates.email = email;
        if (name) updates.name = name;
        if (role) updates.role = role;
        if (password) {
          // SECURITY GUARD: Check if user can set password
          if (!authService.canSetPassword(targetUser)) {
            const provider = authService.getUserAuthProvider(targetUser);
            cliError(
              `User '${targetUser.username}' is authenticated via ${provider}`,
              'EXTERNAL_AUTH_USER',
              {
                username: targetUser.username,
                provider,
                details:
                  'Password management is handled by the external provider',
              },
              'users:update'
            );
            process.exit(1);
          }

          const bcrypt = await import('bcrypt');
          updates.passwordHash = await bcrypt.hash(password, 12);
        }
        if (Object.keys(updates).length === 0) {
          cliError(
            'No updates specified',
            'VALIDATION_ERROR',
            undefined,
            'users:update'
          );
          process.exit(1);
        }
        await dbService.updateUser(targetUser.id, updates);

        // Get the updated user data
        const updatedUser = await dbService.getUserById(targetUser.id);

        const message = role
          ? `User updated successfully: ${targetUser.username} (role: ${role})`
          : `User updated successfully: ${targetUser.username}`;

        cliSuccess(
          {
            user: {
              id: updatedUser.id,
              username: updatedUser.username,
              role: updatedUser.role,
              email: updatedUser.email,
              name: updatedUser.name,
            },
          },
          message,
          {
            operation: 'users:update',
            userId: updatedUser.id,
            username: updatedUser.username,
          }
        );

        await civic.shutdown();
      } catch (error) {
        cliError(
          'Failed to update user',
          'UPDATE_USER_FAILED',
          {
            error: error instanceof Error ? error.message : 'Unknown error',
          },
          'users:update'
        );
        process.exit(1);
      } finally {
        endOperation();
      }
    });

  cli
    .command('users:delete', 'Delete a user account')
    .option('--token <token>', 'Session token for authentication')
    .option('--username <username>', 'Username of the user to delete')
    .option('--id <id>', 'User ID to delete')
    .option('--json', 'Output as JSON')
    .option('--silent', 'Suppress output')
    .action(async (options) => {
      // Initialize CLI output with global options
      const globalOptions = getGlobalOptionsFromArgs();
      initializeCliOutput(globalOptions);

      const endOperation = cliStartOperation('users:delete');

      try {
        const { user, civic } = await AuthUtils.requireAuthWithCivic(
          options.token,
          globalOptions.json
        );
        if (
          user.role !== 'admin' &&
          !(await civic.getAuthService().userCan(user, 'users:manage'))
        ) {
          cliError(
            'Insufficient permissions to delete users',
            'PERMISSION_DENIED',
            {
              requiredPermission: 'users:manage',
              userRole: user.role,
              details: 'You do not have permission to delete users',
            },
            'users:delete'
          );
          process.exit(1);
        }
        const { username, id } = options;
        if (!username && !id) {
          cliError(
            '--username or --id is required',
            'VALIDATION_ERROR',
            undefined,
            'users:delete'
          );
          process.exit(1);
        }
        const dbService = civic.getDatabaseService();
        let targetUser = null;
        if (id) {
          targetUser = await dbService.getUserById(Number(id));
        } else if (username) {
          targetUser = await dbService.getUserByUsername(username);
        }
        if (!targetUser) {
          cliError(
            'User not found',
            'USER_NOT_FOUND',
            undefined,
            'users:delete'
          );
          process.exit(1);
        }
        await dbService.deleteUser(targetUser.id);
        cliSuccess(
          {
            user: {
              id: targetUser.id,
              username: targetUser.username,
              role: targetUser.role,
              email: targetUser.email,
              name: targetUser.name,
            },
          },
          `User deleted successfully: ${targetUser.username}`,
          {
            operation: 'users:delete',
            userId: targetUser.id,
            username: targetUser.username,
          }
        );
        await civic.shutdown();
      } catch (error) {
        cliError(
          'Failed to delete user',
          'DELETE_USER_FAILED',
          {
            error: error instanceof Error ? error.message : 'Unknown error',
          },
          'users:delete'
        );
        process.exit(1);
      } finally {
        endOperation();
      }
    });

  cli
    .command(
      'users:delete-all-test',
      'Delete all test users (usernames starting with test)'
    )
    .option('--token <token>', 'Session token for authentication')
    .option('--json', 'Output as JSON')
    .option('--silent', 'Suppress output')
    .action(async (options) => {
      // Initialize CLI output with global options
      const globalOptions = getGlobalOptionsFromArgs();
      initializeCliOutput(globalOptions);

      const endOperation = cliStartOperation('users:delete-all-test');

      try {
        const { user, civic } = await AuthUtils.requireAuthWithCivic(
          options.token,
          globalOptions.json
        );
        if (
          user.role !== 'admin' &&
          !(await civic.getAuthService().userCan(user, 'users:manage'))
        ) {
          cliError(
            'Insufficient permissions to delete test users',
            'PERMISSION_DENIED',
            {
              requiredPermission: 'users:manage',
              userRole: user.role,
              details: 'You do not have permission to delete test users',
            },
            'users:delete-all-test'
          );
          process.exit(1);
        }
        const dbService = civic.getDatabaseService();
        const users = await dbService.listUsers({ limit: 1000, offset: 0 });
        const testUsers = users.users.filter((u) =>
          u.username.startsWith('test')
        );
        for (const user of testUsers) {
          await dbService.deleteUser(user.id);
        }
        cliSuccess(
          { deleted: testUsers.length },
          `Deleted ${testUsers.length} test user${testUsers.length === 1 ? '' : 's'}`,
          {
            operation: 'users:delete-all-test',
            deletedCount: testUsers.length,
          }
        );
        await civic.shutdown();
      } catch (error) {
        cliError(
          'Failed to delete test users',
          'DELETE_TEST_USERS_FAILED',
          {
            error: error instanceof Error ? error.message : 'Unknown error',
          },
          'users:delete-all-test'
        );
        process.exit(1);
      } finally {
        endOperation();
      }
    });

  // ===============================
  // NEW SECURITY COMMANDS
  // ===============================

  cli
    .command('users:change-password <username>', 'Change user password')
    .option('--token <token>', 'Session token for authentication')
    .option('--current-password <password>', 'Current password')
    .option('--new-password <password>', 'New password')
    .option('--json', 'Output as JSON')
    .option('--silent', 'Suppress output')
    .action(async (username, options) => {
      // Initialize CLI output with global options
      const globalOptions = getGlobalOptionsFromArgs();
      initializeCliOutput(globalOptions);

      const endOperation = cliStartOperation('users:change-password');

      try {
        // Validate authentication
        const authInfo = await AuthUtils.validateAuth(options.token);
        if (!authInfo.isValid) {
          cliError(
            'Authentication required',
            'AUTH_REQUIRED',
            undefined,
            'users:change-password'
          );
          process.exit(1);
        }

        // Get configuration from central config
        const { CentralConfigManager } = await import('@civicpress/core');
        const dataDir = CentralConfigManager.getDataDir();
        const dbConfig = CentralConfigManager.getDatabaseConfig();

        // Initialize CivicPress
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

        // Get user by username
        const user = await authService.getUserByUsername(username);
        if (!user) {
          cliError(
            `User '${username}' not found`,
            'USER_NOT_FOUND',
            undefined,
            'users:change-password'
          );
          process.exit(1);
        }

        // Check if user can set password
        if (!authService.canSetPassword(user)) {
          const provider = authService.getUserAuthProvider(user);
          cliError(
            `User '${username}' is authenticated via ${provider}`,
            'EXTERNAL_AUTH_USER',
            {
              username,
              provider,
              details:
                'Password changes must be done through the external provider',
            },
            'users:change-password'
          );
          process.exit(1);
        }

        let currentPassword = options.currentPassword;
        let newPassword = options.newPassword;

        // Interactive prompts if not provided
        if (!currentPassword || !newPassword) {
          const inquirer = await import('inquirer');
          const prompts = [];

          if (!currentPassword) {
            prompts.push({
              type: 'password',
              name: 'currentPassword',
              message: 'Current password:',
              validate: (input: string) => {
                if (!input.trim()) return 'Current password is required';
                return true;
              },
            });
          }

          if (!newPassword) {
            prompts.push({
              type: 'password',
              name: 'newPassword',
              message: 'New password:',
              validate: (input: string) => {
                if (!input.trim()) return 'New password is required';
                if (input.length < 8)
                  return 'Password must be at least 8 characters';
                return true;
              },
            });
          }

          if (prompts.length > 0) {
            const answers = await inquirer.default.prompt(prompts);
            currentPassword = currentPassword || answers.currentPassword;
            newPassword = newPassword || answers.newPassword;
          }
        }

        // Change password
        const result = await authService.changePassword(
          user.id,
          newPassword,
          currentPassword
        );

        if (result.success) {
          cliSuccess(
            {
              user: {
                id: user.id,
                username: user.username,
                email: user.email,
              },
            },
            `Password changed successfully for user '${username}'`,
            {
              operation: 'users:change-password',
              username,
              userId: user.id,
            }
          );
        } else {
          cliError(
            result.message || 'Failed to change password',
            'CHANGE_PASSWORD_FAILED',
            { username },
            'users:change-password'
          );
          process.exit(1);
        }
        await civic.shutdown();
      } catch (error: any) {
        cliError(
          'Error changing password',
          'CHANGE_PASSWORD_ERROR',
          {
            error: error.message || 'Unknown error',
            username,
          },
          'users:change-password'
        );
        process.exit(1);
      } finally {
        endOperation();
      }
    });

  cli
    .command(
      'users:set-password <username>',
      'Set password for user (admin only)'
    )
    .option('--token <token>', 'Session token for authentication')
    .option('--password <password>', 'New password')
    .option('--json', 'Output as JSON')
    .option('--silent', 'Suppress output')
    .action(async (username, options) => {
      // Initialize CLI output with global options
      const globalOptions = getGlobalOptionsFromArgs();
      initializeCliOutput(globalOptions);

      const endOperation = cliStartOperation('users:set-password');

      try {
        // Validate authentication
        const authInfo = await AuthUtils.validateAuth(options.token);
        if (!authInfo.isValid) {
          cliError(
            'Authentication required',
            'AUTH_REQUIRED',
            undefined,
            'users:set-password'
          );
          process.exit(1);
        }

        // Get configuration from central config
        const { CentralConfigManager } = await import('@civicpress/core');
        const dataDir = CentralConfigManager.getDataDir();
        const dbConfig = CentralConfigManager.getDatabaseConfig();

        // Initialize CivicPress
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

        // Check admin permissions
        const adminUser = await authService.getUserById(authInfo.userId);
        if (
          !adminUser ||
          !(await authService.userCan(adminUser, 'users:manage'))
        ) {
          cliError(
            'Admin privileges required',
            'PERMISSION_DENIED',
            undefined,
            'users:set-password'
          );
          process.exit(1);
        }

        // Get target user
        const user = await authService.getUserByUsername(username);
        if (!user) {
          cliError(
            `User '${username}' not found`,
            'USER_NOT_FOUND',
            undefined,
            'users:set-password'
          );
          process.exit(1);
        }

        // Check if user can set password
        if (!authService.canSetPassword(user)) {
          const provider = authService.getUserAuthProvider(user);
          cliError(
            `User '${username}' is authenticated via ${provider}`,
            'EXTERNAL_AUTH_USER',
            {
              username,
              provider,
              details:
                'Password management is handled by the external provider',
            },
            'users:set-password'
          );
          process.exit(1);
        }

        let password = options.password;

        // Interactive prompt if not provided
        if (!password) {
          const inquirer = await import('inquirer');
          const answers = await inquirer.default.prompt([
            {
              type: 'password',
              name: 'password',
              message: 'New password:',
              validate: (input: string) => {
                if (!input.trim()) return 'Password is required';
                if (input.length < 8)
                  return 'Password must be at least 8 characters';
                return true;
              },
            },
          ]);
          password = answers.password;
        }

        // Set password
        const result = await authService.setUserPassword(
          user.id,
          password,
          adminUser.id
        );

        if (result.success) {
          cliSuccess(
            {
              user: {
                id: user.id,
                username: user.username,
                email: user.email,
              },
            },
            `Password set successfully for user '${username}'`,
            {
              operation: 'users:set-password',
              username,
              userId: user.id,
            }
          );
        } else {
          cliError(
            result.message || 'Failed to set password',
            'SET_PASSWORD_FAILED',
            { username },
            'users:set-password'
          );
          process.exit(1);
        }
        await civic.shutdown();
      } catch (error: any) {
        cliError(
          'Error setting password',
          'SET_PASSWORD_ERROR',
          {
            error: error.message || 'Unknown error',
            username,
          },
          'users:set-password'
        );
        process.exit(1);
      } finally {
        endOperation();
      }
    });

  cli
    .command(
      'users:request-email-change <username>',
      'Request email change for user'
    )
    .option('--token <token>', 'Session token for authentication')
    .option('--email <email>', 'New email address')
    .option('--json', 'Output as JSON')
    .option('--silent', 'Suppress output')
    .action(async (username, options) => {
      // Initialize CLI output with global options
      const globalOptions = getGlobalOptionsFromArgs();
      initializeCliOutput(globalOptions);

      const endOperation = cliStartOperation('users:request-email-change');

      try {
        // Validate authentication
        const authInfo = await AuthUtils.validateAuth(options.token);
        if (!authInfo.isValid) {
          cliError(
            'Authentication required',
            'AUTH_REQUIRED',
            undefined,
            'users:request-email-change'
          );
          process.exit(1);
        }

        // Get configuration from central config
        const { CentralConfigManager } = await import('@civicpress/core');
        const dataDir = CentralConfigManager.getDataDir();
        const dbConfig = CentralConfigManager.getDatabaseConfig();

        // Initialize CivicPress
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

        // Get user by username
        const user = await authService.getUserByUsername(username);
        if (!user) {
          cliError(
            `User '${username}' not found`,
            'USER_NOT_FOUND',
            undefined,
            'users:request-email-change'
          );
          process.exit(1);
        }

        // Check permissions (self or admin)
        const requestingUser = await authService.getUserById(authInfo.userId);
        if (!requestingUser) {
          cliError(
            'Invalid authentication',
            'AUTH_ERROR',
            undefined,
            'users:request-email-change'
          );
          process.exit(1);
        }

        const isAdmin = await authService.userCan(
          requestingUser,
          'users:manage'
        );
        if (user.id !== requestingUser.id && !isAdmin) {
          cliError(
            'You can only change your own email address',
            'PERMISSION_DENIED',
            undefined,
            'users:request-email-change'
          );
          process.exit(1);
        }

        let email = options.email;

        // Interactive prompt if not provided
        if (!email) {
          const inquirer = await import('inquirer');
          const answers = await inquirer.default.prompt([
            {
              type: 'input',
              name: 'email',
              message: 'New email address:',
              validate: (input: string) => {
                if (!input.trim()) return 'Email address is required';
                const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                if (!emailRegex.test(input)) return 'Invalid email format';
                return true;
              },
            },
          ]);
          email = answers.email;
        }

        // Request email change
        const result = await authService.requestEmailChange(user.id, email);

        if (result.success) {
          cliSuccess(
            {
              requiresVerification: result.requiresVerification,
              user: {
                id: user.id,
                username: user.username,
                currentEmail: user.email,
                pendingEmail: email,
              },
            },
            `Email change requested for user '${username}'. A verification email has been sent to the new address`,
            {
              operation: 'users:request-email-change',
              username,
              userId: user.id,
            }
          );
        } else {
          cliError(
            result.message || 'Failed to request email change',
            'REQUEST_EMAIL_CHANGE_FAILED',
            { username },
            'users:request-email-change'
          );
          process.exit(1);
        }
        await civic.shutdown();
      } catch (error: any) {
        cliError(
          'Error requesting email change',
          'REQUEST_EMAIL_CHANGE_ERROR',
          {
            error: error.message || 'Unknown error',
            username,
          },
          'users:request-email-change'
        );
        process.exit(1);
      } finally {
        endOperation();
      }
    });

  cli
    .command('users:verify-email <token>', 'Verify email change with token')
    .option('--json', 'Output as JSON')
    .option('--silent', 'Suppress output')
    .action(async (token, options) => {
      // Initialize CLI output with global options
      const globalOptions = getGlobalOptionsFromArgs();
      initializeCliOutput(globalOptions);

      const endOperation = cliStartOperation('users:verify-email');

      try {
        // Get configuration from central config
        const { CentralConfigManager } = await import('@civicpress/core');
        const dataDir = CentralConfigManager.getDataDir();
        const dbConfig = CentralConfigManager.getDatabaseConfig();

        // Initialize CivicPress
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

        // Verify email change
        const result = await authService.completeEmailChange(token);

        if (result.success) {
          cliSuccess({}, result.message, {
            operation: 'users:verify-email',
          });
        } else {
          cliError(
            result.message || 'Failed to verify email',
            'VERIFY_EMAIL_FAILED',
            undefined,
            'users:verify-email'
          );
          process.exit(1);
        }
        await civic.shutdown();
      } catch (error: any) {
        cliError(
          'Error verifying email',
          'VERIFY_EMAIL_ERROR',
          {
            error: error.message || 'Unknown error',
          },
          'users:verify-email'
        );
        process.exit(1);
      } finally {
        endOperation();
      }
    });

  cli
    .command(
      'users:cancel-email-change <username>',
      'Cancel pending email change'
    )
    .option('--token <token>', 'Session token for authentication')
    .option('--json', 'Output as JSON')
    .option('--silent', 'Suppress output')
    .action(async (username, options) => {
      // Initialize CLI output with global options
      const globalOptions = getGlobalOptionsFromArgs();
      initializeCliOutput(globalOptions);

      const endOperation = cliStartOperation('users:cancel-email-change');

      try {
        // Validate authentication
        const authInfo = await AuthUtils.validateAuth(options.token);
        if (!authInfo.isValid) {
          cliError(
            'Authentication required',
            'AUTH_REQUIRED',
            undefined,
            'users:cancel-email-change'
          );
          process.exit(1);
        }

        // Get configuration from central config
        const { CentralConfigManager } = await import('@civicpress/core');
        const dataDir = CentralConfigManager.getDataDir();
        const dbConfig = CentralConfigManager.getDatabaseConfig();

        // Initialize CivicPress
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

        // Get user by username
        const user = await authService.getUserByUsername(username);
        if (!user) {
          cliError(
            `User '${username}' not found`,
            'USER_NOT_FOUND',
            undefined,
            'users:cancel-email-change'
          );
          process.exit(1);
        }

        // Check permissions (self or admin)
        const requestingUser = await authService.getUserById(authInfo.userId);
        if (!requestingUser) {
          cliError(
            'Invalid authentication',
            'AUTH_ERROR',
            undefined,
            'users:cancel-email-change'
          );
          process.exit(1);
        }

        const isAdmin = await authService.userCan(
          requestingUser,
          'users:manage'
        );
        if (user.id !== requestingUser.id && !isAdmin) {
          cliError(
            'You can only cancel your own email change request',
            'PERMISSION_DENIED',
            undefined,
            'users:cancel-email-change'
          );
          process.exit(1);
        }

        // Cancel email change
        const result = await authService.cancelEmailChange(user.id);

        if (result.success) {
          cliSuccess(
            {
              user: {
                id: user.id,
                username: user.username,
                email: user.email,
              },
            },
            `Email change cancelled for user '${username}'`,
            {
              operation: 'users:cancel-email-change',
              username,
              userId: user.id,
            }
          );
        } else {
          cliError(
            result.message || 'Failed to cancel email change',
            'CANCEL_EMAIL_CHANGE_FAILED',
            { username },
            'users:cancel-email-change'
          );
          process.exit(1);
        }
        await civic.shutdown();
      } catch (error: any) {
        cliError(
          'Error cancelling email change',
          'CANCEL_EMAIL_CHANGE_ERROR',
          {
            error: error.message || 'Unknown error',
            username,
          },
          'users:cancel-email-change'
        );
        process.exit(1);
      } finally {
        endOperation();
      }
    });

  cli
    .command('users:security-info <username>', 'Get user security information')
    .option('--token <token>', 'Session token for authentication')
    .option('--json', 'Output as JSON')
    .option('--silent', 'Suppress output')
    .action(async (username, options) => {
      // Initialize CLI output with global options
      const globalOptions = getGlobalOptionsFromArgs();
      initializeCliOutput(globalOptions);

      const endOperation = cliStartOperation('users:security-info');

      try {
        // Validate authentication
        const authInfo = await AuthUtils.validateAuth(options.token);
        if (!authInfo.isValid) {
          cliError(
            'Authentication required',
            'AUTH_REQUIRED',
            undefined,
            'users:security-info'
          );
          process.exit(1);
        }

        // Get configuration from central config
        const { CentralConfigManager } = await import('@civicpress/core');
        const dataDir = CentralConfigManager.getDataDir();
        const dbConfig = CentralConfigManager.getDatabaseConfig();

        // Initialize CivicPress
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

        // Get user by username
        const user = await authService.getUserByUsername(username);
        if (!user) {
          cliError(
            `User '${username}' not found`,
            'USER_NOT_FOUND',
            undefined,
            'users:security-info'
          );
          process.exit(1);
        }

        // Check permissions (self or admin)
        const requestingUser = await authService.getUserById(authInfo.userId);
        if (!requestingUser) {
          cliError(
            'Invalid authentication',
            'AUTH_ERROR',
            undefined,
            'users:security-info'
          );
          process.exit(1);
        }

        const isAdmin = await authService.userCan(
          requestingUser,
          'users:manage'
        );
        if (user.id !== requestingUser.id && !isAdmin) {
          cliError(
            'You can only view your own security information',
            'PERMISSION_DENIED',
            undefined,
            'users:security-info'
          );
          process.exit(1);
        }

        // Get pending email change info
        const pendingEmailChange = await authService.getPendingEmailChange(
          user.id
        );

        const securityInfo = {
          userId: user.id,
          username: user.username,
          email: user.email,
          authProvider: authService.getUserAuthProvider(user),
          emailVerified: user.email_verified || false,
          canSetPassword: authService.canSetPassword(user),
          isExternalAuth: authService.isExternalAuthUser(user),
          pendingEmailChange: {
            email: pendingEmailChange.pendingEmail,
            expiresAt: pendingEmailChange.expiresAt,
          },
        };

        cliSuccess(securityInfo, `Security information for '${username}'`, {
          operation: 'users:security-info',
          username,
          userId: user.id,
        });

        await civic.shutdown();
      } catch (error: any) {
        cliError(
          'Error getting security info',
          'GET_SECURITY_INFO_ERROR',
          {
            error: error.message || 'Unknown error',
            username,
          },
          'users:security-info'
        );
        process.exit(1);
      } finally {
        endOperation();
      }
    });
}
