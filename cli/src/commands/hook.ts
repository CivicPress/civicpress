import { CAC } from 'cac';
import { readFile, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { loadConfig } from '@civicpress/core';
import chalk from 'chalk';
import * as fs from 'fs';
import * as yaml from 'yaml';
import { HookSystem } from '@civicpress/core';

export function registerHookCommand(cli: CAC) {
  cli
    .command('hook [action]', 'Manage CivicPress hooks and workflows')
    .option('-l, --list', 'List all hooks and their status')
    .option('-c, --config', 'Show hook configuration')
    .option('-t, --test <hook>', 'Test a specific hook')
    .option('-e, --enable <hook>', 'Enable a hook')
    .option('-d, --disable <hook>', 'Disable a hook')
    .option('-w, --workflows', 'List available workflows')
    .option('--logs', 'Show hook execution logs')
    .option('--format <format>', 'Output format', { default: 'human' })
    .action(async (action: string, options: any) => {
      try {
        const config = await loadConfig();
        if (!config) {
          console.error(
            '❌ No CivicPress configuration found. Run "civic init" first.'
          );
          process.exit(1);
        }

        const hookSystem = new HookSystem(config.dataDir);
        await hookSystem.initialize();

        if (options.list || action === 'list') {
          await listHooks(hookSystem, options);
        } else if (options.config || action === 'config') {
          await showConfig(hookSystem, options);
        } else if (options.test || action === 'test') {
          await testHook(hookSystem, options.test || action, options);
        } else if (options.enable || action === 'enable') {
          await enableHook(hookSystem, options.enable || action, options);
        } else if (options.disable || action === 'disable') {
          await disableHook(hookSystem, options.disable || action, options);
        } else if (options.workflows || action === 'workflows') {
          await listWorkflows(hookSystem, options);
        } else if (options.logs || action === 'logs') {
          await showLogs(config.dataDir, options);
        } else {
          showHelp();
        }
      } catch (error) {
        console.error('❌ Hook management failed:', error);
        process.exit(1);
      }
    });
}

async function listHooks(hookSystem: HookSystem, options: any) {
  const config = hookSystem.getConfiguration();
  const registeredHooks = hookSystem.getRegisteredHooks();

  if (options.format === 'json') {
    console.log(
      JSON.stringify(
        {
          registered: registeredHooks,
          configured: config?.hooks || {},
        },
        null,
        2
      )
    );
    return;
  }

  console.log(chalk.blue('🪝 CivicPress Hooks'));
  console.log(chalk.gray('─'.repeat(50)));

  // Show registered hooks
  console.log(chalk.cyan('\n📋 Registered Hooks:'));
  for (const hook of registeredHooks) {
    const hookConfig = config?.hooks[hook];
    const status = hookConfig?.enabled
      ? chalk.green('✅ Enabled')
      : chalk.red('❌ Disabled');
    const workflows = hookConfig?.workflows?.length
      ? chalk.gray(`(${hookConfig.workflows.join(', ')})`)
      : chalk.gray('(no workflows)');

    console.log(`  ${chalk.white(hook)} ${status} ${workflows}`);

    if (hookConfig?.description) {
      console.log(`    ${chalk.gray(hookConfig.description)}`);
    }
  }

  // Show configured hooks not yet registered
  if (config?.hooks) {
    const configuredHooks = Object.keys(config.hooks);
    const unregisteredHooks = configuredHooks.filter(
      (h) => !registeredHooks.includes(h)
    );

    if (unregisteredHooks.length > 0) {
      console.log(chalk.cyan('\n⚙️  Configured (Not Registered):'));
      for (const hook of unregisteredHooks) {
        const hookConfig = config.hooks[hook];
        const status = hookConfig.enabled
          ? chalk.green('✅ Enabled')
          : chalk.red('❌ Disabled');
        console.log(`  ${chalk.white(hook)} ${status}`);
      }
    }
  }
}

async function showConfig(hookSystem: HookSystem, options: any) {
  const config = hookSystem.getConfiguration();

  if (options.format === 'json') {
    console.log(JSON.stringify(config, null, 2));
    return;
  }

  console.log(chalk.blue('⚙️  Hook Configuration'));
  console.log(chalk.gray('─'.repeat(50)));

  if (!config) {
    console.log(chalk.yellow('⚠️  No hook configuration found'));
    return;
  }

  // Show settings
  console.log(chalk.cyan('\n🔧 Settings:'));
  console.log(`  Max Concurrent: ${config.settings.maxConcurrent}`);
  console.log(`  Timeout: ${config.settings.timeout}ms`);
  console.log(`  Retry Attempts: ${config.settings.retryAttempts}`);
  console.log(`  Default Mode: ${config.settings.defaultMode}`);

  // Show hooks
  console.log(chalk.cyan('\n🪝 Hooks:'));
  for (const [hookName, hookConfig] of Object.entries(config.hooks)) {
    const status = hookConfig.enabled ? chalk.green('✅') : chalk.red('❌');
    console.log(`  ${status} ${chalk.white(hookName)}`);
    console.log(`    Workflows: ${hookConfig.workflows.join(', ') || 'none'}`);
    console.log(`    Audit: ${hookConfig.audit ? 'yes' : 'no'}`);
    if (hookConfig.description) {
      console.log(`    Description: ${hookConfig.description}`);
    }
    console.log('');
  }
}

async function testHook(
  hookSystem: HookSystem,
  hookName: string,
  options: any
) {
  if (!hookName) {
    console.error('❌ Hook name required for testing');
    return;
  }

  console.log(chalk.blue(`🧪 Testing hook: ${hookName}`));

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
    console.log(chalk.green('✅ Hook test completed successfully'));
  } catch (error) {
    console.error(chalk.red('❌ Hook test failed:'), error);
  }
}

async function enableHook(
  hookSystem: HookSystem,
  hookName: string,
  options: any
) {
  if (!hookName) {
    console.error('❌ Hook name required for enabling');
    return;
  }

  console.log(chalk.blue(`✅ Enabling hook: ${hookName}`));

  const config = hookSystem.getConfiguration();
  if (config?.hooks[hookName]) {
    config.hooks[hookName].enabled = true;
    await hookSystem.updateConfiguration(config);
    console.log(chalk.green(`✅ Hook '${hookName}' enabled`));

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
        console.log(chalk.green(`💾 Configuration committed: ${commitHash}`));
      }
    } catch (error) {
      console.warn(
        chalk.yellow('⚠️  Failed to auto-commit configuration change')
      );
    }
  } else {
    console.error(
      chalk.red(`❌ Hook '${hookName}' not found in configuration`)
    );
  }
}

async function disableHook(
  hookSystem: HookSystem,
  hookName: string,
  options: any
) {
  if (!hookName) {
    console.error('❌ Hook name required for disabling');
    return;
  }

  console.log(chalk.blue(`❌ Disabling hook: ${hookName}`));

  const config = hookSystem.getConfiguration();
  if (config?.hooks[hookName]) {
    config.hooks[hookName].enabled = false;
    await hookSystem.updateConfiguration(config);
    console.log(chalk.green(`✅ Hook '${hookName}' disabled`));

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
        console.log(chalk.green(`💾 Configuration committed: ${commitHash}`));
      }
    } catch (error) {
      console.warn(
        chalk.yellow('⚠️  Failed to auto-commit configuration change')
      );
    }
  } else {
    console.error(
      chalk.red(`❌ Hook '${hookName}' not found in configuration`)
    );
  }
}

async function listWorkflows(hookSystem: HookSystem, options: any) {
  const config = hookSystem.getConfiguration();
  const workflows = new Set<string>();

  // Collect all workflows from hook configurations
  if (config?.hooks) {
    for (const hookConfig of Object.values(config.hooks)) {
      hookConfig.workflows.forEach((w) => workflows.add(w));
    }
  }

  if (options.format === 'json') {
    console.log(JSON.stringify(Array.from(workflows), null, 2));
    return;
  }

  console.log(chalk.blue('⚙️  Available Workflows'));
  console.log(chalk.gray('─'.repeat(50)));

  if (workflows.size === 0) {
    console.log(chalk.yellow('⚠️  No workflows configured'));
    return;
  }

  for (const workflow of Array.from(workflows).sort()) {
    console.log(`  📋 ${chalk.white(workflow)}`);
  }

  console.log(
    chalk.gray(
      '\n💡 Workflows are executed automatically when their associated hooks are triggered.'
    )
  );
  console.log(
    chalk.gray('   To add custom workflows, create files in .civic/workflows/')
  );
}

async function showLogs(dataDir: string, options: any) {
  const logPath = join(dataDir, '.civic', 'hooks.log.jsonl');

  if (!existsSync(logPath)) {
    console.log(chalk.yellow('⚠️  No hook logs found'));
    return;
  }

  try {
    const logContent = await readFile(logPath, 'utf-8');
    const lines = logContent
      .trim()
      .split('\n')
      .filter((line) => line.trim());

    if (options.format === 'json') {
      console.log(
        JSON.stringify(
          lines.map((line) => JSON.parse(line)),
          null,
          2
        )
      );
      return;
    }

    console.log(chalk.blue('📋 Hook Execution Logs'));
    console.log(chalk.gray('─'.repeat(50)));

    if (lines.length === 0) {
      console.log(chalk.yellow('⚠️  No log entries found'));
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

        console.log(
          `${type} ${chalk.gray(timestamp)} ${chalk.white(entry.name)}`
        );
        if (entry.type === 'error') {
          console.log(`    ${chalk.red(entry.data.error)}`);
        }
      } catch (error) {
        console.log(chalk.gray(`  Invalid log entry: ${line}`));
      }
    }

    if (lines.length > 10) {
      console.log(chalk.gray(`\n... and ${lines.length - 10} more entries`));
    }
  } catch (error) {
    console.error(chalk.red('❌ Failed to read logs:'), error);
  }
}

function showHelp() {
  console.log(chalk.blue('🪝 CivicPress Hook Management'));
  console.log(chalk.gray('─'.repeat(50)));
  console.log(
    chalk.gray('  civic hook list                    # List all hooks')
  );
  console.log(
    chalk.gray('  civic hook config                  # Show configuration')
  );
  console.log(chalk.gray('  civic hook test <hook>             # Test a hook'));
  console.log(
    chalk.gray('  civic hook enable <hook>           # Enable a hook')
  );
  console.log(
    chalk.gray('  civic hook disable <hook>          # Disable a hook')
  );
  console.log(
    chalk.gray('  civic hook workflows               # List workflows')
  );
  console.log(
    chalk.gray('  civic hook logs                    # Show execution logs')
  );
  console.log(chalk.gray('  civic hook --format json           # JSON output'));
}
