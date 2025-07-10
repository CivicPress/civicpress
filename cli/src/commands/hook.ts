import { CAC } from 'cac';
import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { HookSystem } from '@civicpress/core';
import {
  initializeLogger,
  getGlobalOptionsFromArgs,
} from '../utils/global-options.js';
import { AuthUtils } from '../utils/auth-utils.js';
// TODO: Import userCan from @civicpress/core once exports are updated
// import { userCan } from '@civicpress/core';

export function registerHookCommand(cli: CAC) {
  cli
    .command('hook [action]', 'Manage CivicPress hooks and workflows')
    .option('--token <token>', 'Session token for authentication')
    .option('-l, --list', 'List all hooks and their status')
    .option('-c, --config', 'Show hook configuration')
    .option('-t, --test <hook>', 'Test a specific hook')
    .option('-e, --enable <hook>', 'Enable a hook')
    .option('-d, --disable <hook>', 'Disable a hook')
    .option('-w, --workflows', 'List available workflows')
    .option('--logs', 'Show hook execution logs')
    .option('--format <format>', 'Output format', { default: 'human' })
    .action(async (action: string, options: any) => {
      // Initialize logger with global options
      const globalOptions = getGlobalOptionsFromArgs();
      const logger = initializeLogger();
      const shouldOutputJson = globalOptions.json;

      // Validate authentication and get civic instance
      const { civic } = await AuthUtils.requireAuthWithCivic(
        options.token,
        shouldOutputJson
      );
      const dataDir = civic.getDataDir();

      // TODO: Add role-based authorization check
      // Check hook management permissions
      // const canManageHooks = await userCan(user, 'hooks:manage');
      // if (!canManageHooks) {
      //   if (shouldOutputJson) {
      //     console.log(
      //       JSON.stringify(
      //       {
      //         success: false,
      //         error: 'Insufficient permissions',
      //         details: 'You do not have permission to manage hooks',
      //         requiredPermission: 'hooks:manage',
      //         userRole: user.role,
      //       },
      //       null,
      //       2
      //     )
      //   );
      // } else {
      //   logger.error('❌ Insufficient permissions to manage hooks');
      //   logger.info(`Role '${user.role}' cannot manage hooks`);
      // }
      // process.exit(1);
      // }

      try {
        const hookSystem = new HookSystem(dataDir);
        await hookSystem.initialize();

        if (options.list || action === 'list') {
          await listHooks(hookSystem, options, shouldOutputJson);
        } else if (options.config || action === 'config') {
          await showConfig(hookSystem, options, shouldOutputJson);
        } else if (options.test || action === 'test') {
          await testHook(
            hookSystem,
            options.test || action,
            options,
            shouldOutputJson
          );
        } else if (options.enable || action === 'enable') {
          await enableHook(
            hookSystem,
            options.enable || action,
            options,
            shouldOutputJson
          );
        } else if (options.disable || action === 'disable') {
          await disableHook(
            hookSystem,
            options.disable || action,
            options,
            shouldOutputJson
          );
        } else if (options.workflows || action === 'workflows') {
          await listWorkflows(hookSystem, options, shouldOutputJson);
        } else if (options.logs || action === 'logs') {
          await showLogs(dataDir, options, shouldOutputJson);
        } else {
          showHelp();
        }
      } catch (error) {
        logger.error('❌ Hook management failed:', error);
        process.exit(1);
      }
    });
}

async function listHooks(
  hookSystem: HookSystem,
  options: any,
  shouldOutputJson?: boolean
) {
  const logger = initializeLogger();
  const config = hookSystem.getConfiguration();
  const registeredHooks = hookSystem.getRegisteredHooks();

  if (shouldOutputJson) {
    console.log(
      JSON.stringify(
        {
          registered: registeredHooks,
          configured: config?.hooks || {},
          summary: {
            totalRegistered: registeredHooks.length,
            totalConfigured: Object.keys(config?.hooks || {}).length,
          },
        },
        null,
        2
      )
    );
    return;
  }

  logger.info('🪝 CivicPress Hooks');
  logger.info('─'.repeat(50));

  // Show registered hooks
  logger.info('\n📋 Registered Hooks:');
  for (const hook of registeredHooks) {
    const hookConfig = config?.hooks[hook];
    const status = hookConfig?.enabled ? '✅ Enabled' : '❌ Disabled';
    const workflows = hookConfig?.workflows?.length
      ? `(${hookConfig.workflows.join(', ')})`
      : '(no workflows)';

    logger.info(`  ${hook} ${status} ${workflows}`);

    if (hookConfig?.description) {
      logger.info(`    ${hookConfig.description}`);
    }
  }

  // Show configured hooks not yet registered
  if (config?.hooks) {
    const configuredHooks = Object.keys(config.hooks);
    const unregisteredHooks = configuredHooks.filter(
      (h) => !registeredHooks.includes(h)
    );

    if (unregisteredHooks.length > 0) {
      logger.info('\n⚙️  Configured (Not Registered):');
      for (const hook of unregisteredHooks) {
        const hookConfig = config.hooks[hook];
        const status = hookConfig.enabled ? '✅ Enabled' : '❌ Disabled';
        logger.info(`  ${hook} ${status}`);
      }
    }
  }
}

async function showConfig(
  hookSystem: HookSystem,
  options: any,
  shouldOutputJson?: boolean
) {
  const logger = initializeLogger();
  const config = hookSystem.getConfiguration();

  if (shouldOutputJson) {
    console.log(JSON.stringify(config, null, 2));
    return;
  }

  logger.info('⚙️  Hook Configuration');
  logger.info('─'.repeat(50));

  if (!config) {
    logger.warn('⚠️  No hook configuration found');
    return;
  }

  // Show settings
  logger.info('\n🔧 Settings:');
  logger.info(`  Max Concurrent: ${config.settings.maxConcurrent}`);
  logger.info(`  Timeout: ${config.settings.timeout}ms`);
  logger.info(`  Retry Attempts: ${config.settings.retryAttempts}`);
  logger.info(`  Default Mode: ${config.settings.defaultMode}`);

  // Show hooks
  logger.info('\n🪝 Hooks:');
  for (const [hookName, hookConfig] of Object.entries(config.hooks)) {
    const status = hookConfig.enabled ? '✅' : '❌';
    logger.info(`  ${status} ${hookName}`);
    logger.info(`    Workflows: ${hookConfig.workflows.join(', ') || 'none'}`);
    logger.info(`    Audit: ${hookConfig.audit ? 'yes' : 'no'}`);
    if (hookConfig.description) {
      logger.info(`    Description: ${hookConfig.description}`);
    }
    logger.info('');
  }
}

async function testHook(
  hookSystem: HookSystem,
  hookName: string,
  options: any,
  shouldOutputJson?: boolean
) {
  const logger = initializeLogger();
  if (!hookName) {
    if (shouldOutputJson) {
      console.log(
        JSON.stringify(
          {
            error: 'Hook name required for testing',
          },
          null,
          2
        )
      );
      return;
    } else {
      logger.error('❌ Hook name required for testing');
      return;
    }
  }

  if (!shouldOutputJson) {
    logger.info(`🧪 Testing hook: ${hookName}`);
  }

  const testData = {
    record: {
      title: 'Test Record',
      type: 'policy',
      status: 'draft',
    },
    user: 'test-user',
    action: 'test',
  };

  const testContext = {
    timestamp: new Date(),
    user: 'test-user',
    session: 'test-session',
    metadata: { test: true },
  };

  try {
    await hookSystem.emit(hookName, testData, testContext);
    if (shouldOutputJson) {
      console.log(
        JSON.stringify(
          {
            success: true,
            message: 'Hook test completed successfully',
            hook: hookName,
            testData,
            testContext,
          },
          null,
          2
        )
      );
    } else {
      logger.info('✅ Hook test completed successfully');
    }
  } catch (error) {
    if (shouldOutputJson) {
      console.log(
        JSON.stringify(
          {
            success: false,
            error: 'Hook test failed',
            details: error instanceof Error ? error.message : String(error),
            hook: hookName,
          },
          null,
          2
        )
      );
    } else {
      logger.error('❌ Hook test failed:', error);
    }
  }
}

async function enableHook(
  hookSystem: HookSystem,
  hookName: string,
  options: any,
  shouldOutputJson?: boolean
) {
  const logger = initializeLogger();
  if (!hookName) {
    if (shouldOutputJson) {
      console.log(
        JSON.stringify(
          {
            error: 'Hook name required for enabling',
          },
          null,
          2
        )
      );
      return;
    } else {
      logger.error('❌ Hook name required for enabling');
      return;
    }
  }

  if (!shouldOutputJson) {
    logger.info(`✅ Enabling hook: ${hookName}`);
  }

  const config = hookSystem.getConfiguration();
  if (config?.hooks[hookName]) {
    config.hooks[hookName].enabled = true;
    await hookSystem.updateConfiguration(config);

    if (shouldOutputJson) {
      console.log(
        JSON.stringify(
          {
            success: true,
            message: `Hook '${hookName}' enabled`,
            hook: hookName,
          },
          null,
          2
        )
      );
    } else {
      logger.info(`✅ Hook '${hookName}' enabled`);
    }

    // Auto-commit the configuration change
    try {
      const { loadConfig } = await import('@civicpress/core');
      const civicConfig = await loadConfig();
      if (civicConfig) {
        const { GitEngine } = await import('@civicpress/core');
        const git = new GitEngine(civicConfig.dataDir);
        const commitHash = await git.commit(`feat(hooks): enable ${hookName}`, [
          '.civic/hooks.yml',
        ]);
        if (!shouldOutputJson) {
          logger.info(`💾 Configuration committed: ${commitHash}`);
        }
      }
    } catch {
      if (!shouldOutputJson) {
        logger.warn('⚠️  Failed to auto-commit configuration change');
      }
    }
  } else {
    if (shouldOutputJson) {
      console.log(
        JSON.stringify(
          {
            error: `Hook '${hookName}' not found in configuration`,
          },
          null,
          2
        )
      );
    } else {
      logger.error(`❌ Hook '${hookName}' not found in configuration`);
    }
  }
}

async function disableHook(
  hookSystem: HookSystem,
  hookName: string,
  options: any,
  shouldOutputJson?: boolean
) {
  const logger = initializeLogger();
  if (!hookName) {
    if (shouldOutputJson) {
      console.log(
        JSON.stringify(
          {
            error: 'Hook name required for disabling',
          },
          null,
          2
        )
      );
      return;
    } else {
      logger.error('❌ Hook name required for disabling');
      return;
    }
  }

  if (!shouldOutputJson) {
    logger.info(`❌ Disabling hook: ${hookName}`);
  }

  const config = hookSystem.getConfiguration();
  if (config?.hooks[hookName]) {
    config.hooks[hookName].enabled = false;
    await hookSystem.updateConfiguration(config);

    if (shouldOutputJson) {
      console.log(
        JSON.stringify(
          {
            success: true,
            message: `Hook '${hookName}' disabled`,
            hook: hookName,
          },
          null,
          2
        )
      );
    } else {
      logger.info(`✅ Hook '${hookName}' disabled`);
    }

    // Auto-commit the configuration change
    try {
      const { loadConfig } = await import('@civicpress/core');
      const civicConfig = await loadConfig();
      if (civicConfig) {
        const { GitEngine } = await import('@civicpress/core');
        const git = new GitEngine(civicConfig.dataDir);
        const commitHash = await git.commit(
          `feat(hooks): disable ${hookName}`,
          ['.civic/hooks.yml']
        );
        if (!shouldOutputJson) {
          logger.info(`💾 Configuration committed: ${commitHash}`);
        }
      }
    } catch {
      if (!shouldOutputJson) {
        logger.warn('⚠️  Failed to auto-commit configuration change');
      }
    }
  } else {
    if (shouldOutputJson) {
      console.log(
        JSON.stringify(
          {
            error: `Hook '${hookName}' not found in configuration`,
          },
          null,
          2
        )
      );
    } else {
      logger.error(`❌ Hook '${hookName}' not found in configuration`);
    }
  }
}

async function listWorkflows(
  hookSystem: HookSystem,
  options: any,
  shouldOutputJson?: boolean
) {
  const logger = initializeLogger();
  const config = hookSystem.getConfiguration();
  const workflows = new Set<string>();

  // Collect all workflows from hook configurations
  if (config?.hooks) {
    for (const hookConfig of Object.values(config.hooks)) {
      hookConfig.workflows.forEach((w) => workflows.add(w));
    }
  }

  if (shouldOutputJson) {
    console.log(
      JSON.stringify(
        {
          workflows: Array.from(workflows).sort(),
          summary: {
            totalWorkflows: workflows.size,
          },
        },
        null,
        2
      )
    );
    return;
  }

  logger.info('⚙️  Available Workflows');
  logger.info('─'.repeat(50));

  if (workflows.size === 0) {
    logger.warn('⚠️  No workflows configured');
    return;
  }

  for (const workflow of Array.from(workflows).sort()) {
    logger.info(`  📋 ${workflow}`);
  }

  logger.info(
    '\n💡 Workflows are executed automatically when their associated hooks are triggered.'
  );
  logger.info('   To add custom workflows, create files in .civic/workflows/');
}

async function showLogs(
  dataDir: string,
  options: any,
  shouldOutputJson?: boolean
) {
  const logger = initializeLogger();
  const logPath = join(dataDir, '.civic', 'hooks.log.jsonl');

  if (!existsSync(logPath)) {
    if (shouldOutputJson) {
      console.log(
        JSON.stringify(
          {
            error: 'No hook logs found',
          },
          null,
          2
        )
      );
      return;
    } else {
      logger.warn('⚠️  No hook logs found');
      return;
    }
  }

  try {
    const logContent = await readFile(logPath, 'utf-8');
    const lines = logContent
      .trim()
      .split('\n')
      .filter((line) => line.trim());

    if (options.format === 'json') {
      logger.info(
        JSON.stringify(
          lines.map((line) => JSON.parse(line)),
          null,
          2
        )
      );
      return;
    }

    logger.info('📋 Hook Execution Logs');
    logger.info('─'.repeat(50));

    if (lines.length === 0) {
      logger.warn('⚠️  No log entries found');
      return;
    }

    // Show last 10 entries
    const recentLines = lines.slice(-10);
    for (const line of recentLines) {
      try {
        const entry = JSON.parse(line);
        const timestamp = new Date(entry.timestamp).toLocaleString();
        const type =
          entry.type === 'emit'
            ? '🪝'
            : entry.type === 'workflow'
              ? '⚙️'
              : '❌';

        logger.info(`${type} ${timestamp} ${entry.name}`);
        if (entry.type === 'error') {
          logger.error(`    ${entry.data.error}`);
        }
      } catch {
        logger.warn(`  Invalid log entry: ${line}`);
      }
    }

    if (lines.length > 10) {
      logger.info(`\n... and ${lines.length - 10} more entries`);
    }
  } catch (error) {
    logger.error('❌ Failed to read logs:', error);
  }
}

function showHelp() {
  const logger = initializeLogger();
  logger.info('🪝 CivicPress Hook Management');
  logger.info('─'.repeat(50));
  logger.info('  civic hook list                    # List all hooks');
  logger.info('  civic hook config                  # Show configuration');
  logger.info('  civic hook test <hook>             # Test a hook');
  logger.info('  civic hook enable <hook>           # Enable a hook');
  logger.info('  civic hook disable <hook>          # Disable a hook');
  logger.info('  civic hook workflows               # List workflows');
  logger.info('  civic hook logs                    # Show execution logs');
  logger.info('  civic hook --format json           # JSON output');
}
