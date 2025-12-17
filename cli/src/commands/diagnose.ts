/**
 * Diagnostic Command
 *
 * CLI command for running system diagnostics
 */

import { CAC } from 'cac';
import {
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
import {
  CivicPress,
  DiagnosticService,
  CentralConfigManager,
  Logger,
  AuditLogger,
  DatabaseDiagnosticChecker,
  SearchDiagnosticChecker,
  ConfigurationDiagnosticChecker,
  FilesystemDiagnosticChecker,
  SystemDiagnosticChecker,
} from '@civicpress/core';
import * as readline from 'readline';

export function registerDiagnoseCommand(cli: CAC) {
  // Main diagnose command
  cli
    .command('diagnose [component]', 'Run system diagnostics')
    .option('--component <name>', 'Run diagnostics for specific component')
    .option('--fix', 'Attempt to auto-fix issues where safe')
    .option('--format <format>', 'Output format (human, json, yaml)', {
      default: 'human',
    })
    .option('--timeout <ms>', 'Per-check timeout in milliseconds', {
      default: '30000',
    })
    .option('--max-concurrency <n>', 'Max parallel checks', { default: '5' })
    .option('--no-cache', 'Disable result caching')
    .option('--force', 'Force fixes in production (use with caution)')
    .option('--dry-run', 'Simulate fixes without applying')
    .action(async (component: string, options: any) => {
      const globalOptions = getGlobalOptionsFromArgs();
      initializeCliOutput(globalOptions);

      const endOperation = cliStartOperation('diagnose');

      try {
        const config = await import('@civicpress/core').then((m) =>
          m.loadConfig()
        );
        if (!config) {
          cliError(
            'No CivicPress configuration found. Run "civic init" first.',
            'NOT_INITIALIZED',
            undefined,
            'diagnose'
          );
          process.exit(1);
        }

        const dataDir = config.dataDir;
        if (!dataDir) {
          throw new Error('dataDir is not configured');
        }

        // Initialize CivicPress
        const { CentralConfigManager } = await import('@civicpress/core');
        const dbConfig = CentralConfigManager.getDatabaseConfig();

        const civic = new CivicPress({
          dataDir,
          database: dbConfig,
          logger: {
            json: globalOptions.json,
            silent: globalOptions.silent,
            verbose: globalOptions.verbose,
          },
        });
        await civic.initialize();

        // Initialize diagnostic service
        const diagnosticService = new DiagnosticService({
          databaseService: civic.getDatabaseService(),
          searchService: civic.getDatabaseService().getSearchService(),
          configManager: CentralConfigManager,
          logger: civic['logger'] as Logger,
          auditLogger: new AuditLogger({ dataDir }),
          dataDir,
        });

        // Register checkers
        const databaseChecker = new DatabaseDiagnosticChecker(
          civic.getDatabaseService(),
          dataDir,
          civic['logger'] as Logger
        );
        diagnosticService.registerChecker(databaseChecker);

        const searchChecker = new SearchDiagnosticChecker(
          civic.getDatabaseService(),
          civic.getDatabaseService().getSearchService(),
          dataDir,
          civic['logger'] as Logger
        );
        diagnosticService.registerChecker(searchChecker);

        const configChecker = new ConfigurationDiagnosticChecker(
          CentralConfigManager,
          dataDir,
          civic['logger'] as Logger
        );
        diagnosticService.registerChecker(configChecker);

        const filesystemChecker = new FilesystemDiagnosticChecker(
          dataDir,
          civic['logger'] as Logger,
          process.cwd() // Project root for .system-data
        );
        diagnosticService.registerChecker(filesystemChecker);

        const systemChecker = new SystemDiagnosticChecker(
          civic['logger'] as Logger
        );
        diagnosticService.registerChecker(systemChecker);

        // Determine component to check
        const componentToCheck =
          component || options.component
            ? [component || options.component]
            : undefined;

        // Prepare diagnostic options
        const diagnosticOptions = {
          components: componentToCheck,
          timeout: parseInt(options.timeout, 10),
          maxConcurrency: parseInt(options.maxConcurrency, 10),
          enableAutoFix: options.fix || false,
          dryRun: options.dryRun || false,
        };

        // Run diagnostics
        if (componentToCheck && componentToCheck.length === 1) {
          // Single component
          cliInfo(
            `🔍 Running diagnostics for component: ${componentToCheck[0]}`,
            'diagnose'
          );
          const result = await diagnosticService.runComponent(
            componentToCheck[0],
            diagnosticOptions
          );
          await outputDiagnosticResult(result, options.format, globalOptions, {
            verbose: globalOptions.verbose,
            dryRun: options.dryRun || false,
          });

          // Show what would be fixed in dry-run mode
          if (options.dryRun && result.issues.length > 0) {
            const fixableIssues = result.issues.filter((i) => i.autoFixable);
            if (fixableIssues.length > 0) {
              cliInfo(
                `\n🔍 DRY-RUN: Would attempt to fix ${fixableIssues.length} issue(s):`,
                'diagnose'
              );
              for (const issue of fixableIssues) {
                console.log(`   • ${issue.message}`);
                if (issue.fix) {
                  console.log(`     Fix: ${issue.fix.description}`);
                  if (issue.fix.command) {
                    console.log(`     Command: ${issue.fix.command}`);
                  }
                }
              }
              console.log('');
            }
          }
        } else {
          // All components
          cliInfo('🔍 Running full system diagnostics...', 'diagnose');
          const report = await diagnosticService.runAll(diagnosticOptions);
          await outputDiagnosticReport(report, options.format, globalOptions);

          // Handle auto-fix if requested
          if (options.fix && report.issues.length > 0) {
            const fixableIssues = report.issues.filter((i) => i.autoFixable);
            if (fixableIssues.length > 0) {
              await handleAutoFix(
                diagnosticService,
                fixableIssues,
                options,
                globalOptions
              );
            }
          }
        }

        await civic.shutdown();

        // Explicitly exit to ensure process terminates
        process.exit(0);
      } catch (error) {
        cliError(
          'Diagnostic run failed',
          'DIAGNOSTIC_FAILED',
          {
            error: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined,
          },
          'diagnose'
        );
        process.exit(1);
      } finally {
        endOperation();
      }
    });

  // Component-specific commands
  registerComponentCommands(cli);
}

/**
 * Register component-specific diagnostic commands
 */
function registerComponentCommands(cli: CAC) {
  const components = ['database', 'search', 'config', 'filesystem', 'system'];

  for (const component of components) {
    cli
      .command(
        `diagnose:${component}`,
        `Run diagnostics for ${component} component`
      )
      .option('--fix', 'Attempt to auto-fix issues')
      .option('--format <format>', 'Output format', { default: 'human' })
      .option('--force', 'Force fixes in production')
      .option('--dry-run', 'Simulate fixes without applying')
      .action(async (options: any) => {
        const globalOptions = getGlobalOptionsFromArgs();
        initializeCliOutput(globalOptions);

        const endOperation = cliStartOperation(`diagnose:${component}`);

        try {
          const config = await import('@civicpress/core').then((m) =>
            m.loadConfig()
          );
          if (!config?.dataDir) {
            cliError(
              'No CivicPress configuration found.',
              'NOT_INITIALIZED',
              undefined,
              `diagnose:${component}`
            );
            process.exit(1);
          }

          const { CentralConfigManager } = await import('@civicpress/core');
          const dbConfig = CentralConfigManager.getDatabaseConfig();

          const civic = new CivicPress({
            dataDir: config.dataDir,
            database: dbConfig,
            logger: {
              json: globalOptions.json,
              silent: globalOptions.silent,
            },
          });
          await civic.initialize();

          const diagnosticService = new DiagnosticService({
            databaseService: civic.getDatabaseService(),
            searchService: civic.getDatabaseService().getSearchService(),
            configManager: CentralConfigManager,
            logger: civic['logger'] as Logger,
            auditLogger: new AuditLogger({ dataDir: config.dataDir }),
            dataDir: config.dataDir,
          });

          // Register checkers for the specific component
          if (component === 'database') {
            const databaseChecker = new DatabaseDiagnosticChecker(
              civic.getDatabaseService(),
              config.dataDir,
              civic['logger'] as Logger
            );
            diagnosticService.registerChecker(databaseChecker);
          } else if (component === 'search') {
            const searchChecker = new SearchDiagnosticChecker(
              civic.getDatabaseService(),
              civic.getDatabaseService().getSearchService(),
              config.dataDir,
              civic['logger'] as Logger
            );
            diagnosticService.registerChecker(searchChecker);
          } else if (component === 'config') {
            const configChecker = new ConfigurationDiagnosticChecker(
              CentralConfigManager,
              config.dataDir,
              civic['logger'] as Logger
            );
            diagnosticService.registerChecker(configChecker);
          } else if (component === 'filesystem') {
            const filesystemChecker = new FilesystemDiagnosticChecker(
              config.dataDir,
              civic['logger'] as Logger,
              process.cwd() // Project root for .system-data
            );
            diagnosticService.registerChecker(filesystemChecker);
          } else if (component === 'system') {
            const systemChecker = new SystemDiagnosticChecker(
              civic['logger'] as Logger
            );
            diagnosticService.registerChecker(systemChecker);
          }

          const result = await diagnosticService.runComponent(component, {
            enableAutoFix: options.fix || false,
            dryRun: options.dryRun || false,
          });

          await outputDiagnosticResult(result, options.format, globalOptions);

          if (options.fix && result.issues.length > 0) {
            const fixableIssues = result.issues.filter((i) => i.autoFixable);
            if (fixableIssues.length > 0) {
              await handleAutoFix(
                diagnosticService,
                fixableIssues,
                options,
                globalOptions
              );
            }
          }

          await civic.shutdown();

          // Explicitly exit to ensure process terminates
          process.exit(0);
        } catch (error) {
          cliError(
            `Diagnostic failed for ${component}`,
            'DIAGNOSTIC_FAILED',
            {
              error: error instanceof Error ? error.message : String(error),
            },
            `diagnose:${component}`
          );
          process.exit(1);
        } finally {
          endOperation();
        }
      });
  }
}

/**
 * Output diagnostic result in specified format
 */
async function outputDiagnosticResult(
  result: any,
  format: string,
  globalOptions: any,
  options?: { verbose?: boolean; dryRun?: boolean }
): Promise<void> {
  if (format === 'json' || globalOptions.json) {
    cliSuccess(result, 'Diagnostic result', { operation: 'diagnose' });
    return;
  }

  if (format === 'yaml') {
    const yaml = await import('yaml');
    console.log(yaml.stringify(result));
    return;
  }

  // Human-readable format
  outputHumanReadable(result, options);
}

/**
 * Output diagnostic report in specified format
 */
async function outputDiagnosticReport(
  report: any,
  format: string,
  globalOptions: any,
  options?: { verbose?: boolean; dryRun?: boolean }
): Promise<void> {
  if (format === 'json' || globalOptions.json) {
    cliSuccess(report, 'Diagnostic report', { operation: 'diagnose' });
    return;
  }

  if (format === 'yaml') {
    const yaml = await import('yaml');
    console.log(yaml.stringify(report));
    return;
  }

  // Human-readable format
  outputHumanReadableReport(report, options);
}

/**
 * Output human-readable diagnostic result
 */
function outputHumanReadable(
  result: any,
  options?: { verbose?: boolean; dryRun?: boolean }
): void {
  const statusIcon =
    result.status === 'healthy'
      ? '✅'
      : result.status === 'warning'
        ? '⚠️'
        : '❌';
  const statusColor =
    result.status === 'healthy'
      ? 'green'
      : result.status === 'warning'
        ? 'yellow'
        : 'red';

  console.log(
    `\n${statusIcon} ${result.component.toUpperCase()}: ${result.status}`
  );
  console.log(`   Duration: ${result.duration}ms`);
  console.log(`   Checks: ${result.checks.length}`);
  console.log(`   Issues: ${result.issues.length}\n`);

  if (result.issues.length > 0) {
    console.log('Issues:');
    for (const issue of result.issues) {
      const severityIcon =
        issue.severity === 'critical'
          ? '🔴'
          : issue.severity === 'high'
            ? '🟠'
            : issue.severity === 'medium'
              ? '🟡'
              : '🔵';
      console.log(`  ${severityIcon} ${issue.message}`);

      // Show issue details if available
      if (issue.details) {
        if (
          issue.details.missingTables &&
          Array.isArray(issue.details.missingTables)
        ) {
          console.log(
            `     Missing tables: ${issue.details.missingTables.join(', ')}`
          );
        }
        if (
          issue.details.missingColumns &&
          Array.isArray(issue.details.missingColumns)
        ) {
          console.log(
            `     Missing columns: ${issue.details.missingColumns.join(', ')}`
          );
        }
        if (
          issue.details.missingIndexes &&
          Array.isArray(issue.details.missingIndexes)
        ) {
          console.log(
            `     Missing indexes: ${issue.details.missingIndexes.join(', ')}`
          );
        }
        if (
          issue.details.extraTables &&
          Array.isArray(issue.details.extraTables)
        ) {
          console.log(
            `     Extra tables: ${issue.details.extraTables.join(', ')}`
          );
        }
        if (issue.details.integrityResult) {
          console.log(
            `     Integrity check result: ${issue.details.integrityResult}`
          );
        }
        if (issue.details.path) {
          console.log(`     Path: ${issue.details.path}`);
        }
        if (issue.details.size) {
          console.log(`     Size: ${issue.details.size} bytes`);
        }
        // Show missing directories/files
        if (issue.details.missing && Array.isArray(issue.details.missing)) {
          console.log(`     Missing: ${issue.details.missing.join(', ')}`);
        }
        if (
          issue.details.missingDirectories &&
          Array.isArray(issue.details.missingDirectories)
        ) {
          console.log(
            `     Missing directories: ${issue.details.missingDirectories.join(', ')}`
          );
        }
        if (
          issue.details.missingFiles &&
          Array.isArray(issue.details.missingFiles)
        ) {
          console.log(
            `     Missing files: ${issue.details.missingFiles.join(', ')}`
          );
        }
        // Show memory details
        if (issue.details.systemMemory) {
          const mem = issue.details.systemMemory as any;
          console.log(
            `     System Memory: ${mem.usedGB}GB / ${mem.totalGB}GB used (${mem.usagePercent}), ${mem.freeGB}GB free`
          );
        }
        if (issue.details.processMemory) {
          const proc = issue.details.processMemory as any;
          if (proc.heapUsedMB && proc.heapTotalMB) {
            console.log(
              `     Process Heap: ${proc.heapUsedMB}MB / ${proc.heapTotalMB}MB (${proc.heapUsagePercent})`
            );
          }
          if (proc.rssGB) {
            console.log(`     Process RSS: ${proc.rssGB}GB`);
          }
        }
        // Show CPU load details
        if (issue.details.loadAverage) {
          const load = issue.details.loadAverage as any;
          console.log(
            `     Load Average: ${load['1min']} (1min), ${load['5min']} (5min), ${load['15min']} (15min)`
          );
          console.log(
            `     Load as % of cores: ${load['1minPercent']} (1min), ${load['5minPercent']} (5min)`
          );
          console.log(`     CPU Cores: ${load.cpuCount}`);
        }
        if (issue.details.note) {
          console.log(`     Note: ${issue.details.note}`);
        }
      }

      // Show fix information
      if (issue.fix) {
        console.log(`     Fix: ${issue.fix.description}`);
        if (issue.fix.command) {
          console.log(`     Command: ${issue.fix.command}`);
        }
        if (issue.fix.estimatedDuration) {
          console.log(
            `     Estimated duration: ${issue.fix.estimatedDuration}ms`
          );
        }
      }

      if (issue.recommendations) {
        for (const rec of issue.recommendations) {
          console.log(`     → ${rec}`);
        }
      }
    }
    console.log('');
  }

  // Show check details in verbose mode
  if (options?.verbose && result.checks && result.checks.length > 0) {
    console.log('Check Details:');
    for (const check of result.checks) {
      const checkIcon =
        check.status === 'pass'
          ? '✅'
          : check.status === 'warning'
            ? '⚠️'
            : '❌';
      console.log(`  ${checkIcon} ${check.name}: ${check.status}`);
      if (check.message) {
        console.log(`     ${check.message}`);
      }
      if (check.details && typeof check.details === 'object') {
        const details = check.details as any;
        if (details.missing && Array.isArray(details.missing)) {
          console.log(`     Missing: ${details.missing.join(', ')}`);
        }
        if (details.missingTables && Array.isArray(details.missingTables)) {
          console.log(
            `     Missing tables: ${details.missingTables.join(', ')}`
          );
        }
        if (details.missingColumns && Array.isArray(details.missingColumns)) {
          console.log(
            `     Missing columns: ${details.missingColumns.join(', ')}`
          );
        }
        if (details.missingIndexes && Array.isArray(details.missingIndexes)) {
          console.log(
            `     Missing indexes: ${details.missingIndexes.join(', ')}`
          );
        }
        if (details.extra && Array.isArray(details.extra)) {
          console.log(`     Extra: ${details.extra.join(', ')}`);
        }
        if (details.extraTables && Array.isArray(details.extraTables)) {
          console.log(`     Extra tables: ${details.extraTables.join(', ')}`);
        }
        if (details.existing && Array.isArray(details.existing)) {
          console.log(`     Existing: ${details.existing.join(', ')}`);
        }
        if (details.tables) {
          console.log(`     Tables found: ${details.tables}`);
        }
        if (details.path) {
          console.log(`     Path: ${details.path}`);
        }
        if (details.size) {
          console.log(`     Size: ${details.size} bytes`);
        }
        // Show memory details in check details
        if (details.totalGB && details.usedGB) {
          console.log(
            `     System Memory: ${details.usedGB}GB / ${details.totalGB}GB used (${details.usagePercent || 'N/A'}), ${details.freeGB || 'N/A'}GB free`
          );
        }
        if (details.processRssGB) {
          console.log(`     Process RSS: ${details.processRssGB}GB`);
        }
        if (details.heapUsagePercent) {
          console.log(`     Heap Usage: ${details.heapUsagePercent}`);
        }
        if (details.heapUsedMB && details.heapTotalMB) {
          console.log(
            `     Heap: ${details.heapUsedMB}MB / ${details.heapTotalMB}MB`
          );
        }
        // Show CPU load details
        if (details.load1Min !== undefined) {
          console.log(
            `     Load Average: ${details.load1Min} (1min), ${details.load5Min || 'N/A'} (5min), ${details.load15Min || 'N/A'} (15min)`
          );
        }
        if (details.loadPercent1Min) {
          console.log(
            `     Load as % of cores: ${details.loadPercent1Min} (1min), ${details.loadPercent5Min || 'N/A'} (5min)`
          );
        }
        if (details.cpuCount) {
          console.log(`     CPU Cores: ${details.cpuCount}`);
        }
        if (details.recommendation) {
          console.log(`     Recommendation: ${details.recommendation}`);
        }
      }
    }
    console.log('');
  }
}

/**
 * Output human-readable diagnostic report
 */
function outputHumanReadableReport(
  report: any,
  options?: { verbose?: boolean; dryRun?: boolean }
): void {
  const statusIcon =
    report.overallStatus === 'healthy'
      ? '✅'
      : report.overallStatus === 'warning'
        ? '⚠️'
        : '❌';

  console.log(
    `\n${statusIcon} OVERALL STATUS: ${report.overallStatus.toUpperCase()}`
  );
  console.log(`   Run ID: ${report.runId}`);
  console.log(`   Duration: ${report.duration}ms`);
  console.log(`   Total Checks: ${report.summary.totalChecks}`);
  console.log(`   Passed: ${report.summary.passed}`);
  console.log(`   Warnings: ${report.summary.warnings}`);
  console.log(`   Errors: ${report.summary.errors}\n`);

  // Component results
  for (const component of report.components) {
    outputHumanReadable(component, options);
  }

  // Summary recommendations
  if (report.recommendations.length > 0) {
    console.log('Recommendations:');
    for (const rec of report.recommendations) {
      console.log(`  • ${rec}`);
    }
    console.log('');
  }
}

/**
 * Handle auto-fix with confirmation
 */
async function handleAutoFix(
  diagnosticService: DiagnosticService,
  issues: any[],
  options: any,
  globalOptions: any
): Promise<void> {
  if (globalOptions.json || globalOptions.silent) {
    // In JSON/silent mode, skip confirmation
    if (!options.force) {
      cliWarn('Auto-fix requires --force flag in JSON/silent mode', 'diagnose');
      return;
    }
  } else {
    // Interactive confirmation
    const confirmed = await confirmAutoFix(issues);
    if (!confirmed) {
      cliInfo('Auto-fix cancelled by user', 'diagnose');
      return;
    }
  }

  cliInfo(`🔧 Attempting to fix ${issues.length} issue(s)...`, 'diagnose');

  try {
    const fixResults = await diagnosticService.autoFix(issues, {
      force: options.force || false,
      dryRun: options.dryRun || false,
      backup: true,
    });

    const successful = fixResults.filter((r) => r.success);
    const failed = fixResults.filter((r) => !r.success);

    if (successful.length > 0) {
      cliSuccess(
        { fixed: successful.length, failed: failed.length },
        `Successfully fixed ${successful.length} issue(s)`,
        { operation: 'diagnose:fix' }
      );

      // Show details of what was fixed
      for (const result of successful) {
        console.log(`  ✅ ${result.message}`);
        if (result.backupId) {
          console.log(`     Backup created: ${result.backupId}`);
        }
        if (result.rollbackAvailable) {
          console.log(`     Rollback available: Yes`);
        }
        if (result.duration) {
          console.log(`     Duration: ${result.duration}ms`);
        }
      }
    }

    if (failed.length > 0) {
      cliWarn(`Failed to fix ${failed.length} issue(s)`, 'diagnose');
      for (const result of failed) {
        console.log(`  ❌ ${result.message}`);
        if (result.error) {
          console.log(`     Error: ${result.error.message || result.error}`);
        }
        // Check for recommendation property (may be in error.details or as a direct property)
        const recommendation =
          (result as any).recommendation ||
          result.error?.details?.recommendation;
        if (recommendation) {
          console.log(`     Recommendation: ${recommendation}`);
        }
      }
    }
  } catch (error) {
    cliError(
      'Auto-fix failed',
      'AUTO_FIX_FAILED',
      {
        error: error instanceof Error ? error.message : String(error),
      },
      'diagnose'
    );
  }
}

/**
 * Prompt user for auto-fix confirmation
 */
function confirmAutoFix(issues: any[]): Promise<boolean> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    console.log(`\n⚠️  Found ${issues.length} fixable issue(s):`);
    for (const issue of issues.slice(0, 5)) {
      console.log(`   • ${issue.message}`);
    }
    if (issues.length > 5) {
      console.log(`   ... and ${issues.length - 5} more`);
    }

    rl.question('\nDo you want to attempt auto-fix? (yes/no): ', (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'yes' || answer.toLowerCase() === 'y');
    });
  });
}
