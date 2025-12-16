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

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export const cleanupCommand = (cli: CAC) => {
  cli
    .command('cleanup', 'Remove all data and reset to clean default state')
    .option('--force', 'Skip confirmation prompts')

    .option('--json', 'Output in JSON format')
    .option('--silent', 'Suppress output')
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
          confirmed = true;
        } else {
          // Load package.json to get project name
          const packageJsonPath = join(projectRoot, 'package.json');
          let projectName = 'CivicPress';

          try {
            const packageJson = JSON.parse(
              readFileSync(packageJsonPath, 'utf-8')
            );
            projectName = packageJson.name || 'CivicPress';
          } catch {
            // Use default if package.json can't be read
          }

          const expectedCity = projectName.toLowerCase().replace(/[^a-z]/g, '');

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
