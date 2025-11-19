import { CAC } from 'cac';
import { CivicPress } from '@civicpress/core';
import { AuthUtils } from '../utils/auth-utils.js';

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
          if (options.json) {
            console.log(
              JSON.stringify(
                {
                  success: false,
                  error: 'Insufficient permissions',
                  details: 'You do not have permission to create users',
                },
                null,
                2
              )
            );
          } else {
            console.error('❌ Insufficient permissions to create users');
          }
          process.exit(1);
        }

        const authService = civic.getAuthService();

        // Validate role
        if (!(await authService.isValidRole(role))) {
          const availableRoles = await authService.getAvailableRoles();
          if (!options.silent) {
            console.error(`Error: Invalid role '${role}'`);
            console.error(`Available roles: ${availableRoles.join(', ')}`);
          }
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

        if (options.json) {
          console.log(
            JSON.stringify(
              {
                success: true,
                user: {
                  id: newUser.id,
                  username: newUser.username,
                  role: newUser.role,
                  email: newUser.email,
                  name: newUser.name,
                  created_at: newUser.created_at,
                },
              },
              null,
              2
            )
          );
        } else if (!options.silent) {
          console.log('✅ User created successfully!');
          console.log(`👤 Username: ${newUser.username}`);
          console.log(`📝 Name: ${newUser.name || 'Not provided'}`);
          console.log(`📧 Email: ${newUser.email || 'Not provided'}`);
          console.log(`🔑 Role: ${newUser.role}`);
          console.log(`🆔 User ID: ${newUser.id}`);
          console.log('');
          console.log('💡 You can now login with:');
          console.log(`   civic auth:password --username ${newUser.username}`);
        }

        await civic.shutdown();
      } catch (error) {
        if (!options.silent) {
          console.error(
            '❌ Failed to create user:',
            error instanceof Error ? error.message : 'Unknown error'
          );
        }
        process.exit(1);
      }
    });

  cli
    .command('users:list', 'List all users')
    .option('--token <token>', 'Session token for authentication')
    .option('--json', 'Output as JSON')
    .option('--silent', 'Suppress output')
    .action(async (options) => {
      try {
        const shouldOutputJson = options.json;
        // Require authentication and get user/civic
        const { user, civic } = await AuthUtils.requireAuthWithCivic(
          options.token,
          shouldOutputJson
        );
        // Check permission
        if (
          user.role !== 'admin' &&
          !(await civic.getAuthService().userCan(user, 'users:manage'))
        ) {
          if (shouldOutputJson) {
            console.log(
              JSON.stringify(
                {
                  success: false,
                  error: 'Insufficient permissions',
                  details: 'You do not have permission to list users',
                },
                null,
                2
              )
            );
          } else {
            console.error('❌ Insufficient permissions to list users');
          }
          process.exit(1);
        }
        const dbService = civic.getDatabaseService();
        const users = await dbService.listUsers({ limit: 100, offset: 0 });
        if (shouldOutputJson) {
          console.log(
            JSON.stringify(
              {
                success: true,
                users: users.users.map((user) => ({
                  id: user.id,
                  username: user.username,
                  role: user.role,
                  email: user.email,
                  name: user.name,
                  created_at: user.created_at,
                })),
                total: users.total,
              },
              null,
              2
            )
          );
        } else if (!options.silent) {
          console.log('👥 Users:');
          if (users.users.length === 0) {
            console.log('  No users found');
          } else {
            users.users.forEach((user) => {
              console.log(`  • ${user.username} (${user.role})`);
              if (user.name) console.log(`    Name: ${user.name}`);
              if (user.email) console.log(`    Email: ${user.email}`);
              console.log(`    Created: ${user.created_at}`);
              console.log('');
            });
          }
        }
        await civic.shutdown();
      } catch (error) {
        if (!options.silent) {
          console.error(
            '❌ Failed to list users:',
            error instanceof Error ? error.message : 'Unknown error'
          );
        }
        process.exit(1);
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
      try {
        const shouldOutputJson = options.json;
        const { user, civic } = await AuthUtils.requireAuthWithCivic(
          options.token,
          shouldOutputJson
        );
        if (
          user.role !== 'admin' &&
          !(await civic.getAuthService().userCan(user, 'users:manage'))
        ) {
          if (shouldOutputJson) {
            console.log(
              JSON.stringify(
                {
                  success: false,
                  error: 'Insufficient permissions',
                  details: 'You do not have permission to update users',
                },
                null,
                2
              )
            );
          } else {
            console.error('❌ Insufficient permissions to update users');
          }
          process.exit(1);
        }
        const { username, id, email, name, role, password } = options;
        if (!username && !id) {
          console.error('Error: --username or --id is required');
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
          if (!options.silent) console.error('User not found');
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
            if (!options.silent) {
              console.error(
                `Error: User '${targetUser.username}' is authenticated via ${provider}`
              );
              console.error(
                'Password management is handled by the external provider'
              );
            }
            process.exit(1);
          }

          const bcrypt = await import('bcrypt');
          updates.passwordHash = await bcrypt.hash(password, 12);
        }
        if (Object.keys(updates).length === 0) {
          if (!options.silent) console.error('No updates specified');
          process.exit(1);
        }
        await dbService.updateUser(targetUser.id, updates);

        // Get the updated user data
        const updatedUser = await dbService.getUserById(targetUser.id);

        if (options.json) {
          console.log(
            JSON.stringify(
              {
                success: true,
                user: {
                  id: updatedUser.id,
                  username: updatedUser.username,
                  role: updatedUser.role,
                  email: updatedUser.email,
                  name: updatedUser.name,
                },
              },
              null,
              2
            )
          );
        } else if (!options.silent) {
          if (role) {
            console.log(
              `✅ User updated successfully: ${targetUser.username} (role: ${role})`
            );
          } else {
            console.log(`✅ User updated successfully: ${targetUser.username}`);
          }
        }
        await civic.shutdown();
      } catch (error) {
        if (!options.silent) {
          console.error(
            '❌ Failed to update user:',
            error instanceof Error ? error.message : 'Unknown error'
          );
        }
        process.exit(1);
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
      try {
        const shouldOutputJson = options.json;
        const { user, civic } = await AuthUtils.requireAuthWithCivic(
          options.token,
          shouldOutputJson
        );
        if (
          user.role !== 'admin' &&
          !(await civic.getAuthService().userCan(user, 'users:manage'))
        ) {
          if (shouldOutputJson) {
            console.log(
              JSON.stringify(
                {
                  success: false,
                  error: 'Insufficient permissions',
                  details: 'You do not have permission to delete users',
                },
                null,
                2
              )
            );
          } else {
            console.error('❌ Insufficient permissions to delete users');
          }
          process.exit(1);
        }
        const { username, id } = options;
        if (!username && !id) {
          console.error('Error: --username or --id is required');
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
          if (!options.silent) console.error('User not found');
          process.exit(1);
        }
        await dbService.deleteUser(targetUser.id);
        if (options.json) {
          console.log(
            JSON.stringify(
              {
                success: true,
                message: 'User deleted successfully',
                user: {
                  id: targetUser.id,
                  username: targetUser.username,
                  role: targetUser.role,
                  email: targetUser.email,
                  name: targetUser.name,
                },
              },
              null,
              2
            )
          );
        } else if (!options.silent) {
          console.log(`✅ User deleted successfully: ${targetUser.username}`);
        }
        await civic.shutdown();
      } catch (error) {
        if (!options.silent) {
          console.error(
            '❌ Failed to delete user:',
            error instanceof Error ? error.message : 'Unknown error'
          );
        }
        process.exit(1);
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
      try {
        const shouldOutputJson = options.json;
        const { user, civic } = await AuthUtils.requireAuthWithCivic(
          options.token,
          shouldOutputJson
        );
        if (
          user.role !== 'admin' &&
          !(await civic.getAuthService().userCan(user, 'users:manage'))
        ) {
          if (shouldOutputJson) {
            console.log(
              JSON.stringify(
                {
                  success: false,
                  error: 'Insufficient permissions',
                  details: 'You do not have permission to delete test users',
                },
                null,
                2
              )
            );
          } else {
            console.error('❌ Insufficient permissions to delete test users');
          }
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
        if (options.json) {
          console.log(
            JSON.stringify(
              { success: true, deleted: testUsers.length },
              null,
              2
            )
          );
        } else if (!options.silent) {
          console.log(`✅ Deleted ${testUsers.length} test users.`);
        }
        await civic.shutdown();
      } catch (error) {
        if (!options.silent) {
          console.error(
            '❌ Failed to delete test users:',
            error instanceof Error ? error.message : 'Unknown error'
          );
        }
        process.exit(1);
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
      try {
        // Validate authentication
        const authInfo = await AuthUtils.validateAuth(options.token);
        if (!authInfo.isValid) {
          if (!options.silent) {
            console.error('Error: Authentication required');
          }
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
            json: options.json,
            silent: options.silent,
          },
        });
        await civic.initialize();

        const authService = civic.getAuthService();

        // Get user by username
        const user = await authService.getUserByUsername(username);
        if (!user) {
          if (!options.silent) {
            console.error(`Error: User '${username}' not found`);
          }
          process.exit(1);
        }

        // Check if user can set password
        if (!authService.canSetPassword(user)) {
          const provider = authService.getUserAuthProvider(user);
          if (!options.silent) {
            console.error(
              `Error: User '${username}' is authenticated via ${provider}`
            );
            console.error(
              'Password changes must be done through the external provider'
            );
          }
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
          const output = {
            success: true,
            message: result.message,
            user: {
              id: user.id,
              username: user.username,
              email: user.email,
            },
          };

          if (options.json) {
            console.log(JSON.stringify(output, null, 2));
          } else if (!options.silent) {
            console.log(
              `✓ Password changed successfully for user '${username}'`
            );
          }
        } else {
          if (!options.silent) {
            console.error(`Error: ${result.message}`);
          }
          process.exit(1);
        }
      } catch (error: any) {
        if (!options.silent) {
          console.error(`Error changing password: ${error.message}`);
        }
        process.exit(1);
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
      try {
        // Validate authentication
        const authInfo = await AuthUtils.validateAuth(options.token);
        if (!authInfo.isValid) {
          if (!options.silent) {
            console.error('Error: Authentication required');
          }
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
            json: options.json,
            silent: options.silent,
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
          if (!options.silent) {
            console.error('Error: Admin privileges required');
          }
          process.exit(1);
        }

        // Get target user
        const user = await authService.getUserByUsername(username);
        if (!user) {
          if (!options.silent) {
            console.error(`Error: User '${username}' not found`);
          }
          process.exit(1);
        }

        // Check if user can set password
        if (!authService.canSetPassword(user)) {
          const provider = authService.getUserAuthProvider(user);
          if (!options.silent) {
            console.error(
              `Error: User '${username}' is authenticated via ${provider}`
            );
            console.error(
              'Password management is handled by the external provider'
            );
          }
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
          const output = {
            success: true,
            message: result.message,
            user: {
              id: user.id,
              username: user.username,
              email: user.email,
            },
          };

          if (options.json) {
            console.log(JSON.stringify(output, null, 2));
          } else if (!options.silent) {
            console.log(`✓ Password set successfully for user '${username}'`);
          }
        } else {
          if (!options.silent) {
            console.error(`Error: ${result.message}`);
          }
          process.exit(1);
        }
      } catch (error: any) {
        if (!options.silent) {
          console.error(`Error setting password: ${error.message}`);
        }
        process.exit(1);
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
      try {
        // Validate authentication
        const authInfo = await AuthUtils.validateAuth(options.token);
        if (!authInfo.isValid) {
          if (!options.silent) {
            console.error('Error: Authentication required');
          }
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
            json: options.json,
            silent: options.silent,
          },
        });
        await civic.initialize();

        const authService = civic.getAuthService();

        // Get user by username
        const user = await authService.getUserByUsername(username);
        if (!user) {
          if (!options.silent) {
            console.error(`Error: User '${username}' not found`);
          }
          process.exit(1);
        }

        // Check permissions (self or admin)
        const requestingUser = await authService.getUserById(authInfo.userId);
        if (!requestingUser) {
          if (!options.silent) {
            console.error('Error: Invalid authentication');
          }
          process.exit(1);
        }

        const isAdmin = await authService.userCan(
          requestingUser,
          'users:manage'
        );
        if (user.id !== requestingUser.id && !isAdmin) {
          if (!options.silent) {
            console.error('Error: You can only change your own email address');
          }
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
          const output = {
            success: true,
            message: result.message,
            requiresVerification: result.requiresVerification,
            user: {
              id: user.id,
              username: user.username,
              currentEmail: user.email,
              pendingEmail: email,
            },
          };

          if (options.json) {
            console.log(JSON.stringify(output, null, 2));
          } else if (!options.silent) {
            console.log(`✓ Email change requested for user '${username}'`);
            console.log(`  Current email: ${user.email}`);
            console.log(`  Pending email: ${email}`);
            console.log(
              '  A verification email has been sent to the new address'
            );
          }
        } else {
          if (!options.silent) {
            console.error(`Error: ${result.message}`);
          }
          process.exit(1);
        }
      } catch (error: any) {
        if (!options.silent) {
          console.error(`Error requesting email change: ${error.message}`);
        }
        process.exit(1);
      }
    });

  cli
    .command('users:verify-email <token>', 'Verify email change with token')
    .option('--json', 'Output as JSON')
    .option('--silent', 'Suppress output')
    .action(async (token, options) => {
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
            json: options.json,
            silent: options.silent,
          },
        });
        await civic.initialize();

        const authService = civic.getAuthService();

        // Verify email change
        const result = await authService.completeEmailChange(token);

        if (result.success) {
          const output = {
            success: true,
            message: result.message,
          };

          if (options.json) {
            console.log(JSON.stringify(output, null, 2));
          } else if (!options.silent) {
            console.log(`✓ ${result.message}`);
          }
        } else {
          if (!options.silent) {
            console.error(`Error: ${result.message}`);
          }
          process.exit(1);
        }
      } catch (error: any) {
        if (!options.silent) {
          console.error(`Error verifying email: ${error.message}`);
        }
        process.exit(1);
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
      try {
        // Validate authentication
        const authInfo = await AuthUtils.validateAuth(options.token);
        if (!authInfo.isValid) {
          if (!options.silent) {
            console.error('Error: Authentication required');
          }
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
            json: options.json,
            silent: options.silent,
          },
        });
        await civic.initialize();

        const authService = civic.getAuthService();

        // Get user by username
        const user = await authService.getUserByUsername(username);
        if (!user) {
          if (!options.silent) {
            console.error(`Error: User '${username}' not found`);
          }
          process.exit(1);
        }

        // Check permissions (self or admin)
        const requestingUser = await authService.getUserById(authInfo.userId);
        if (!requestingUser) {
          if (!options.silent) {
            console.error('Error: Invalid authentication');
          }
          process.exit(1);
        }

        const isAdmin = await authService.userCan(
          requestingUser,
          'users:manage'
        );
        if (user.id !== requestingUser.id && !isAdmin) {
          if (!options.silent) {
            console.error(
              'Error: You can only cancel your own email change request'
            );
          }
          process.exit(1);
        }

        // Cancel email change
        const result = await authService.cancelEmailChange(user.id);

        if (result.success) {
          const output = {
            success: true,
            message: result.message,
            user: {
              id: user.id,
              username: user.username,
              email: user.email,
            },
          };

          if (options.json) {
            console.log(JSON.stringify(output, null, 2));
          } else if (!options.silent) {
            console.log(`✓ Email change cancelled for user '${username}'`);
          }
        } else {
          if (!options.silent) {
            console.error(`Error: ${result.message}`);
          }
          process.exit(1);
        }
      } catch (error: any) {
        if (!options.silent) {
          console.error(`Error cancelling email change: ${error.message}`);
        }
        process.exit(1);
      }
    });

  cli
    .command('users:security-info <username>', 'Get user security information')
    .option('--token <token>', 'Session token for authentication')
    .option('--json', 'Output as JSON')
    .option('--silent', 'Suppress output')
    .action(async (username, options) => {
      try {
        // Validate authentication
        const authInfo = await AuthUtils.validateAuth(options.token);
        if (!authInfo.isValid) {
          if (!options.silent) {
            console.error('Error: Authentication required');
          }
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
            json: options.json,
            silent: options.silent,
          },
        });
        await civic.initialize();

        const authService = civic.getAuthService();

        // Get user by username
        const user = await authService.getUserByUsername(username);
        if (!user) {
          if (!options.silent) {
            console.error(`Error: User '${username}' not found`);
          }
          process.exit(1);
        }

        // Check permissions (self or admin)
        const requestingUser = await authService.getUserById(authInfo.userId);
        if (!requestingUser) {
          if (!options.silent) {
            console.error('Error: Invalid authentication');
          }
          process.exit(1);
        }

        const isAdmin = await authService.userCan(
          requestingUser,
          'users:manage'
        );
        if (user.id !== requestingUser.id && !isAdmin) {
          if (!options.silent) {
            console.error(
              'Error: You can only view your own security information'
            );
          }
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

        if (options.json) {
          console.log(JSON.stringify(securityInfo, null, 2));
        } else if (!options.silent) {
          console.log(`Security Information for '${username}':`);
          console.log(`  User ID: ${securityInfo.userId}`);
          console.log(`  Email: ${securityInfo.email}`);
          console.log(
            `  Email Verified: ${securityInfo.emailVerified ? '✓' : '✗'}`
          );
          console.log(`  Auth Provider: ${securityInfo.authProvider}`);
          console.log(
            `  Can Set Password: ${securityInfo.canSetPassword ? '✓' : '✗'}`
          );
          console.log(
            `  External Auth: ${securityInfo.isExternalAuth ? '✓' : '✗'}`
          );

          if (securityInfo.pendingEmailChange.email) {
            console.log(
              `  Pending Email: ${securityInfo.pendingEmailChange.email}`
            );
            console.log(
              `  Expires At: ${securityInfo.pendingEmailChange.expiresAt}`
            );
          } else {
            console.log(`  Pending Email: None`);
          }
        }
      } catch (error: any) {
        if (!options.silent) {
          console.error(`Error getting security info: ${error.message}`);
        }
        process.exit(1);
      }
    });
}
