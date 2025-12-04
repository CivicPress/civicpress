import { CAC } from 'cac';
import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { HookSystem } from '@civicpress/core';
import {
  initializeLogger,
  getGlobalOptionsFromArgs,
  initializeCliOutput,
} from '../utils/global-options.js';
import { AuthUtils } from '../utils/auth-utils.js';
import { userCan } from '@civicpress/core';
import {
  cliSuccess,
  cliError,
  cliInfo,
  cliWarn,
  cliStartOperation,
} from '../utils/cli-output.js';

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
      // Initialize CLI output with global options
      const globalOptions = getGlobalOptionsFromArgs();
      initializeCliOutput(globalOptions);

      const endOperation = cliStartOperation('hook');

      // Validate authentication and get civic instance
      const { civic, user } = await AuthUtils.requireAuthWithCivic(
        options.token,
        globalOptions.json
      );
      const dataDir = civic.getDataDir();

      // Check hook management permissions
      const canManageHooks = await userCan(user, 'hooks:manage');
      if (!canManageHooks) {
        cliError(
          'Insufficient permissions to manage hooks',
          'PERMISSION_DENIED',
          {
            requiredPermission: 'hooks:manage',
            userRole: user.role,
          },
          'hook'
        );
        process.exit(1);
      }

      try {
        const hookSystem = new HookSystem(dataDir);
        await hookSystem.initialize();

        if (options.list || action === 'list') {
          await listHooks(hookSystem);
        } else if (options.config || action === 'config') {
          await showConfig(hookSystem);
        } else if (options.test || action === 'test') {
          await testHook(hookSystem, options.test || action);
        } else if (options.enable || action === 'enable') {
          await enableHook(hookSystem, options.enable || action);
        } else if (options.disable || action === 'disable') {
          await disableHook(hookSystem, options.disable || action);
        } else if (options.workflows || action === 'workflows') {
          await listWorkflows(hookSystem);
        } else if (options.logs || action === 'logs') {
          await showLogs(dataDir, options);
        } else {
          showHelp();
        }
      } catch (error) {
        cliError(
          'Hook management failed',
          'HOOK_MANAGEMENT_FAILED',
          {
            error: error instanceof Error ? error.message : String(error),
          },
          'hook'
        );
        process.exit(1);
      } finally {
        endOperation();
      }
    });
}

async function listHooks(hookSystem: HookSystem) {
  const config = hookSystem.getConfiguration();
  const registeredHooks = hookSystem.getRegisteredHooks();

  cliSuccess(
    {
      registered: registeredHooks,
      configured: config?.hooks || {},
      summary: {
        totalRegistered: registeredHooks.length,
        totalConfigured: Object.keys(config?.hooks || {}).length,
      },
    },
    `Found ${registeredHooks.length} registered hook${registeredHooks.length === 1 ? '' : 's'}`,
    {
      operation: 'hook:list',
      totalRegistered: registeredHooks.length,
      totalConfigured: Object.keys(config?.hooks || {}).length,
    }
  );
}

async function showConfig(hookSystem: HookSystem) {
  const config = hookSystem.getConfiguration();

  if (!config) {
    cliWarn('No hook configuration found', 'hook:config');
    return;
  }

  cliSuccess({ config }, 'Hook configuration retrieved', {
    operation: 'hook:config',
    hooksCount: Object.keys(config.hooks || {}).length,
  });
}

async function testHook(hookSystem: HookSystem, hookName: string) {
  if (!hookName) {
    cliError(
      'Hook name required for testing',
      'VALIDATION_ERROR',
      undefined,
      'hook:test'
    );
    return;
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
    cliSuccess(
      {
        hook: hookName,
        testData,
        testContext,
      },
      `Hook '${hookName}' test completed successfully`,
      {
        operation: 'hook:test',
        hookName,
      }
    );
  } catch (error) {
    cliError(
      'Hook test failed',
      'HOOK_TEST_FAILED',
      {
        error: error instanceof Error ? error.message : String(error),
        hook: hookName,
      },
      'hook:test'
    );
    throw error;
  }
}

async function enableHook(hookSystem: HookSystem, hookName: string) {
  if (!hookName) {
    cliError(
      'Hook name required for enabling',
      'VALIDATION_ERROR',
      undefined,
      'hook:enable'
    );
    return;
  }

  const config = hookSystem.getConfiguration();
  if (config?.hooks[hookName]) {
    config.hooks[hookName].enabled = true;
    await hookSystem.updateConfiguration(config);

    cliSuccess({ hook: hookName }, `Hook '${hookName}' enabled`, {
      operation: 'hook:enable',
      hookName,
    });

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
        cliInfo(`Configuration committed: ${commitHash}`, 'hook:enable');
      }
    } catch {
      cliWarn('Failed to auto-commit configuration change', 'hook:enable');
    }
  } else {
    cliError(
      `Hook '${hookName}' not found in configuration`,
      'HOOK_NOT_FOUND',
      { hookName },
      'hook:enable'
    );
  }
}

async function disableHook(hookSystem: HookSystem, hookName: string) {
  if (!hookName) {
    cliError(
      'Hook name required for disabling',
      'VALIDATION_ERROR',
      undefined,
      'hook:disable'
    );
    return;
  }

  const config = hookSystem.getConfiguration();
  if (config?.hooks[hookName]) {
    config.hooks[hookName].enabled = false;
    await hookSystem.updateConfiguration(config);

    cliSuccess({ hook: hookName }, `Hook '${hookName}' disabled`, {
      operation: 'hook:disable',
      hookName,
    });

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
        cliInfo(`Configuration committed: ${commitHash}`, 'hook:disable');
      }
    } catch {
      cliWarn('Failed to auto-commit configuration change', 'hook:disable');
    }
  } else {
    cliError(
      `Hook '${hookName}' not found in configuration`,
      'HOOK_NOT_FOUND',
      { hookName },
      'hook:disable'
    );
  }
}

async function listWorkflows(hookSystem: HookSystem) {
  const config = hookSystem.getConfiguration();
  const workflows = new Set<string>();

  // Collect all workflows from hook configurations
  if (config?.hooks) {
    for (const hookConfig of Object.values(config.hooks)) {
      // Handle both old and new metadata formats
      const workflowsArray = Array.isArray(hookConfig.workflows)
        ? hookConfig.workflows
        : (hookConfig.workflows?.value ?? []);
      workflowsArray.forEach((w: string) => workflows.add(w));
    }
  }

  if (workflows.size === 0) {
    cliWarn('No workflows configured', 'hook:workflows');
    return;
  }

  cliSuccess(
    {
      workflows: Array.from(workflows).sort(),
      summary: {
        totalWorkflows: workflows.size,
      },
    },
    `Found ${workflows.size} workflow${workflows.size === 1 ? '' : 's'}`,
    {
      operation: 'hook:workflows',
      totalWorkflows: workflows.size,
    }
  );
}

async function showLogs(dataDir: string, options: any) {
  const logPath = join(dataDir, '.civic', 'hooks.log.jsonl');

  if (!existsSync(logPath)) {
    cliWarn('No hook logs found', 'hook:logs');
    return;
  }

  try {
    const logContent = await readFile(logPath, 'utf-8');
    const lines = logContent
      .trim()
      .split('\n')
      .filter((line) => line.trim());

    if (lines.length === 0) {
      cliWarn('No log entries found', 'hook:logs');
      return;
    }

    const logEntries = lines
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .filter((entry) => entry !== null);

    const recentEntries = logEntries.slice(-10);

    cliSuccess(
      {
        entries: recentEntries,
        totalEntries: logEntries.length,
        showing: recentEntries.length,
      },
      `Showing ${recentEntries.length} of ${logEntries.length} log entr${logEntries.length === 1 ? 'y' : 'ies'}`,
      {
        operation: 'hook:logs',
        totalEntries: logEntries.length,
        showing: recentEntries.length,
      }
    );
  } catch (error) {
    cliError(
      'Failed to read logs',
      'READ_LOGS_FAILED',
      {
        error: error instanceof Error ? error.message : String(error),
      },
      'hook:logs'
    );
    throw error;
  }
}

function showHelp() {
  cliInfo(
    'CivicPress Hook Management\n' +
      '  civic hook list                    # List all hooks\n' +
      '  civic hook config                  # Show configuration\n' +
      '  civic hook test <hook>             # Test a hook\n' +
      '  civic hook enable <hook>           # Enable a hook\n' +
      '  civic hook disable <hook>          # Disable a hook\n' +
      '  civic hook workflows               # List workflows\n' +
      '  civic hook logs                    # Show execution logs\n' +
      '  civic hook --format json           # JSON output',
    'hook'
  );
}
