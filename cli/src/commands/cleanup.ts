import { CAC } from 'cac';
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
import { readFileSync, existsSync, rmSync, mkdirSync } from 'fs';
import { join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { parse as parseYaml } from 'yaml';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const normalizeChallenge = (value: string): string =>
  value.trim().toLowerCase().replace(/[^a-z]/g, '');

/**
 * FA-CLI-002: derive the deletion challenge from the configured ORGANIZATION,
 * not from the CLI's own package.json name (which is the constant "civicpress"
 * for every install — no protection at all). Falls back to the package name
 * only when no org config is present.
 */
const resolveOrgChallengeName = (projectRoot: string): string => {
  const orgConfigPath = join(projectRoot, 'data', '.civic', 'org-config.yml');
  try {
    if (existsSync(orgConfigPath)) {
      const parsed = parseYaml(readFileSync(orgConfigPath, 'utf-8')) as
        | Record<string, any>
        | undefined;
      const raw =
        parsed?._metadata?.name ??
        parsed?.name?.value ??
        (typeof parsed?.name === 'string' ? parsed.name : undefined);
      const normalized = raw ? normalizeChallenge(String(raw)) : '';
      if (normalized) return normalized;
    }
  } catch {
    // fall through to the package-name fallback
  }
  try {
    const packageJson = JSON.parse(
      readFileSync(join(projectRoot, 'package.json'), 'utf-8')
    );
    return normalizeChallenge(packageJson.name || 'CivicPress');
  } catch {
    return 'civicpress';
  }
};

export const cleanupCommand = (cli: CAC) => {
  cli
    .command('cleanup', 'Remove all data and reset to clean default state')
    .option('--force', 'Skip the interactive confirmation prompts')
    .option(
      '--yes-i-know',
      'Required with --force: acknowledge that this irreversibly deletes all data'
    )
    .option('--json', 'Output in JSON format')
    .option('--silent', 'Suppress output')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .action(async (options: any) => {
      // Initialize CLI output with global options
      const globalOpts = getGlobalOptionsFromArgs();
      initializeCliOutput(globalOpts);

      const logger = initializeLogger();
      const endOperation = cliStartOperation('cleanup');

      try {
        // Get project root
        const projectRoot = resolve(__dirname, '../../../');

        // Define paths to clean up
        const pathsToRemove = [
          '.system-data/civic.db',
          '.civicrc',
          'data',
          'modules/api/data',
          'modules/api/.civic',
        ];

        // Check if any of these paths exist
        const existingPaths = pathsToRemove.filter((path) =>
          existsSync(join(projectRoot, path))
        );

        if (existingPaths.length === 0) {
          const result = {
            success: true,
            message: 'No data to clean up - project is already in clean state',
            cleanedPaths: [],
          };

          cliSuccess(
            result,
            'Project is already in clean state - no data to remove',
            {
              operation: 'cleanup',
            }
          );
          return;
        }

        // Confirmation logic
        let confirmed = false;

        if (options.force) {
          // FA-CLI-002: --force alone must NOT wipe a municipality's records.
          // Require an explicit second flag so a stray --force (CI, shell
          // history, fat-finger) can't irreversibly delete everything.
          if (!options.yesIKnow) {
            cliError(
              '--force requires --yes-i-know to confirm irreversible deletion of all CivicPress data. ' +
                'Re-run with both flags, or omit --force to be prompted.',
              'FORCE_REQUIRES_CONFIRMATION',
              undefined,
              'cleanup'
            );
            process.exit(1);
          }
          confirmed = true;
        } else {
          // FA-CLI-002: challenge on the configured ORGANIZATION name, not the
          // constant CLI package name.
          const expectedCity = resolveOrgChallengeName(projectRoot);

          if (!globalOpts.silent) {
            logger.warn(
              '⚠️  This will permanently delete all CivicPress data:'
            );
            logger.warn('   - Database files (civic.db)');
            logger.warn('   - Configuration files (.civicrc)');
            logger.warn('   - All record data (data/ directory)');
            logger.warn('   - API module data and temporary files');
            logger.warn('');
            logger.warn('This action cannot be undone!');
            logger.warn('');
            logger.warn(
              `To confirm, type the name of the organization: "${expectedCity}"`
            );

            // Read user input
            const readline = await import('readline');
            const rl = readline.createInterface({
              input: process.stdin,
              output: process.stdout,
            });

            const answer = await new Promise<string>((resolve) => {
              rl.question('Organization name: ', (input) => {
                rl.close();
                resolve(
                  input
                    .trim()
                    .toLowerCase()
                    .replace(/[^a-z]/g, '')
                );
              });
            });

            if (answer === expectedCity) {
              // Second confirmation
              const rl2 = readline.createInterface({
                input: process.stdin,
                output: process.stdout,
              });

              const finalAnswer = await new Promise<string>((resolve) => {
                rl2.question('Are you sure? (y/N): ', (input) => {
                  rl2.close();
                  resolve(input.trim().toLowerCase());
                });
              });

              confirmed = finalAnswer === 'y' || finalAnswer === 'yes';
            } else {
              logger.error(
                `❌ Incorrect organization name. Expected: "${expectedCity}", got: "${answer}"`
              );
            }
          }
        }

        if (!confirmed) {
          process.exit(1);
        }

        // Perform cleanup
        let cleanedPaths: string[] = [];
        let errors: string[] = [];

        for (const path of existingPaths) {
          const fullPath = join(projectRoot, path);
          try {
            if (existsSync(fullPath)) {
              rmSync(fullPath, { recursive: true, force: true });
              cleanedPaths.push(path);
            }
          } catch (error) {
            const errorMsg = `Failed to remove ${path}: ${error instanceof Error ? error.message : 'Unknown error'}`;
            errors.push(errorMsg);
            if (!globalOpts.silent) {
              logger.warn(`⚠️  ${errorMsg}`);
            }
          }
        }

        // Create fresh data directory structure
        try {
          const dataDir = join(projectRoot, 'data');
          if (!existsSync(dataDir)) {
            mkdirSync(dataDir, { recursive: true });
          }

          const civicDir = join(dataDir, '.civic');
          if (!existsSync(civicDir)) {
            mkdirSync(civicDir, { recursive: true });
          }
        } catch (error) {
          const errorMsg = `Failed to create fresh data directory: ${error instanceof Error ? error.message : 'Unknown error'}`;
          errors.push(errorMsg);
          if (!globalOpts.silent) {
            logger.warn(`⚠️  ${errorMsg}`);
          }
        }

        // Output results
        const result = {
          success: errors.length === 0,
          cleanedPaths,
          errors,
          message:
            errors.length === 0
              ? 'Cleanup completed successfully'
              : 'Cleanup completed with some errors',
        };

        cliSuccess(result, result.message, {
          operation: 'cleanup',
        });

        if (cleanedPaths.length > 0) {
          cliInfo(
            `🗑️  Removed ${cleanedPaths.length} data locations:`,
            'cleanup'
          );
          cleanedPaths.forEach((path) => {
            cliInfo(`   - ${path}`, 'cleanup');
          });
        }

        if (errors.length > 0) {
          cliWarn(
            `⚠️  ${errors.length} errors occurred during cleanup`,
            'cleanup'
          );
        }

        cliInfo('', 'cleanup');
        cliInfo('🎯 Project is now in clean default state', 'cleanup');
        cliInfo(
          '📝 Run "civic init" to initialize with fresh configuration',
          'cleanup'
        );
      } catch (error) {
        cliError(
          'Cleanup command failed',
          'CLEANUP_FAILED',
          {
            error: error instanceof Error ? error.message : String(error),
          },
          'cleanup'
        );
        process.exit(1);
      } finally {
        endOperation();
      }
    });
};
