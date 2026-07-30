/* eslint-disable @typescript-eslint/no-explicit-any -- CLI command handlers pass CAC's untyped options through withCli. */
import { CAC } from 'cac';
import { cliSuccess, cliError, cliInfo, cliWarn } from '../utils/cli-output.js';
import { withCli } from '../utils/with-cli.js';
import { readFileSync, existsSync, rmSync, mkdirSync } from 'fs';
import { join } from 'path';
import { parse as parseYaml } from 'yaml';
import { CentralConfigManager } from '@civicpress/core';

/** The on-disk locations a full `civic cleanup` removes and recreates. */
export interface CleanupTargets {
  /** Directory holding `.civicrc` (or cwd when none) — the deletion anchor. */
  projectRoot: string;
  /** Core-resolved record data directory. */
  dataDir: string;
  /** Core-resolved system-data dir (DB + secret + storage credentials). */
  systemDataDir: string;
  /** Absolute path to the root `.civicrc`. */
  civicrcPath: string;
  /** Everything to remove, in order (dataDir, systemDataDir, .civicrc). */
  pathsToRemove: string[];
}

/**
 * Resolve what `civic cleanup` should delete THROUGH core's config authority
 * (honoring `.civicrc` / CIVIC_DATA_DIR and the project-root anchor) rather than
 * from the CLI's own install location. A relocated dataDir — or the command run
 * from a real install instead of the monorepo checkout — then targets the actual
 * project instead of wiping the wrong directory and missing the real one. The
 * getters fall back to project-root-relative defaults so a partially-initialized
 * or config-less project can still be reset.
 */
export function resolveCleanupTargets(): CleanupTargets {
  const projectRoot = CentralConfigManager.getProjectRoot();
  let dataDir: string;
  try {
    dataDir = CentralConfigManager.getDataDir();
  } catch {
    dataDir = join(projectRoot, 'data');
  }
  let systemDataDir: string;
  try {
    systemDataDir = CentralConfigManager.getSystemDataDir();
  } catch {
    systemDataDir = join(projectRoot, '.system-data');
  }
  const civicrcPath = join(projectRoot, '.civicrc');
  // Everything a fresh `civic init` would recreate: the records (dataDir), the
  // WHOLE system-data dir (database + secret + storage credentials — the
  // previous version deleted only civic.db and left the crypto material behind,
  // so a re-init silently reused the old secret), and the root config file.
  return {
    projectRoot,
    dataDir,
    systemDataDir,
    civicrcPath,
    pathsToRemove: [dataDir, systemDataDir, civicrcPath],
  };
}

/**
 * Whether the caller supplied the `--yes-i-know` acknowledgement that
 * FA-CLI-002 requires alongside `--force`. Read defensively: cac camelizes
 * `--yes-i-know` to the key `yesI-know` (it only transforms the first hyphen
 * segment), so the intuitive `options.yesIKnow` lookup is ALWAYS undefined —
 * which silently made the guard refuse every non-interactive `--force` run
 * (the documented CI path never worked). Accept every plausible spelling.
 */
export function isForceAcknowledged(options: Record<string, unknown>): boolean {
  return Boolean(
    options.yesIKnow ?? options['yes-i-know'] ?? options['yesI-know']
  );
}

const normalizeChallenge = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z]/g, '');

/**
 * FA-CLI-002: derive the deletion challenge from the configured ORGANIZATION,
 * not from the CLI's own package.json name (which is the constant "civicpress"
 * for every install — no protection at all). Falls back to the package name
 * only when no org config is present. `dataDir` is the core-resolved data
 * directory (org config lives at `<dataDir>/.civic/org-config.yml`).
 */
const resolveOrgChallengeName = (
  dataDir: string,
  projectRoot: string
): string => {
  const orgConfigPath = join(dataDir, '.civic', 'org-config.yml');
  try {
    if (existsSync(orgConfigPath)) {
      const parsed = parseYaml(readFileSync(orgConfigPath, 'utf-8')) as
        | {
            name?: { value?: unknown } | string;
            _metadata?: { name?: unknown };
          }
        | undefined;
      // FA-CLI-002 (re-audit): prefer the ORG's own name field (`name.value`)
      // over `_metadata.name`, which is just the config file's descriptive
      // label (e.g. 'Test Org') — the challenge should be the organization's
      // real name so it is specific to this install.
      const nameField = parsed?.name;
      const raw =
        (typeof nameField === 'object' ? nameField?.value : undefined) ??
        (typeof nameField === 'string' ? nameField : undefined) ??
        parsed?._metadata?.name;
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
    .action(
      withCli<[any]>(
        {
          operation: 'cleanup',
          errorMessage: 'Cleanup command failed',
          errorCode: 'CLEANUP_FAILED',
        },
        async ({ globalOptions, logger }, options: any) => {
          const globalOpts = globalOptions;

          // Resolve the REAL on-disk locations through core (see
          // resolveCleanupTargets) instead of paths hardcoded relative to where
          // the CLI happens to be installed.
          const {
            projectRoot,
            dataDir,
            systemDataDir,
            civicrcPath,
            pathsToRemove,
          } = resolveCleanupTargets();

          // Check if any of these paths exist
          const existingPaths = pathsToRemove.filter((path) =>
            existsSync(path)
          );

          if (existingPaths.length === 0) {
            const result = {
              success: true,
              message:
                'No data to clean up - project is already in clean state',
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
            if (!isForceAcknowledged(options)) {
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
            const expectedCity = resolveOrgChallengeName(dataDir, projectRoot);

            if (!globalOpts.silent) {
              logger.warn(
                '⚠️  This will permanently delete all CivicPress data:'
              );
              logger.warn(`   - Record data (${dataDir})`);
              logger.warn(
                `   - System data — database, secret, storage credentials (${systemDataDir})`
              );
              logger.warn(`   - Configuration file (${civicrcPath})`);
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
            try {
              if (existsSync(path)) {
                rmSync(path, { recursive: true, force: true });
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

          // Recreate the fresh data directory structure at the resolved location
          try {
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
        }
      )
    );
};
