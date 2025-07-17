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

        // DEBUG: Print config values (only in non-JSON mode)
        if (!options.json) {
          console.log('[DEBUG] dataDir:', dataDir);
          console.log('[DEBUG] dbConfig:', dbConfig);
        }

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

        // Create user
        const newUser = await authService.createUserWithPassword({
          username,
          email,
          name,
          role,
          passwordHash,
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
        const updates: any = {};
        if (email) updates.email = email;
        if (name) updates.name = name;
        if (role) updates.role = role;
        if (password) {
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
}
