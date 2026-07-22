import { CAC } from 'cac';
import chalk from 'chalk';
import {
  CivicPress,
  BackupService,
  CentralConfigManager,
} from '@civicpress/core';
import * as fs from 'fs';
import * as path from 'path';
import inquirer from 'inquirer';
import * as yaml from 'yaml';
import { cliSuccess, cliError } from '../utils/cli-output.js';
import { withCli } from '../utils/with-cli.js';
import { fileURLToPath } from 'url';

// FA-CLI-005: the default record-type / status config blocks were inlined
// verbatim in every config-building path (skip-prompts and --data-dir). They
// are hoisted here to a single source so the two seed paths can never drift.
// (Kept CLI-local rather than importing core's DEFAULT_RECORD_TYPES/STATUSES,
// which carry a different, larger set — importing them would change what
// `civic init` seeds.)
const INIT_RECORD_TYPES_CONFIG = {
  bylaw: {
    label: 'Bylaws',
    description: 'Municipal bylaws and regulations',
    source: 'core',
    priority: 1,
  },
  ordinance: {
    label: 'Ordinances',
    description: 'Local ordinances and laws',
    source: 'core',
    priority: 2,
  },
  policy: {
    label: 'Policies',
    description: 'Administrative policies',
    source: 'core',
    priority: 3,
  },
  proclamation: {
    label: 'Proclamations',
    description: 'Official proclamations',
    source: 'core',
    priority: 4,
  },
  resolution: {
    label: 'Resolutions',
    description: 'Council resolutions',
    source: 'core',
    priority: 5,
  },
} as const;

const INIT_RECORD_STATUSES_CONFIG = {
  draft: {
    label: 'Draft',
    description: 'Initial working version, not yet ready for review',
    source: 'core',
    priority: 1,
  },
  pending_review: {
    label: 'Pending Review',
    description: 'Submitted for review and awaiting approval',
    source: 'core',
    priority: 2,
  },
  under_review: {
    label: 'Under Review',
    description: 'Currently under active review by authorized personnel',
    source: 'core',
    priority: 3,
  },
  approved: {
    label: 'Approved',
    description: 'Approved and currently in effect',
    source: 'core',
    priority: 4,
  },
  published: {
    label: 'Published',
    description: 'Publicly available and in effect',
    source: 'core',
    priority: 5,
  },
  rejected: {
    label: 'Rejected',
    description: 'Rejected and not approved',
    source: 'core',
    priority: 6,
  },
  archived: {
    label: 'Archived',
    description: 'No longer active but preserved for reference',
    source: 'core',
    priority: 7,
  },
  expired: {
    label: 'Expired',
    description: 'Past its effective date and no longer in force',
    source: 'core',
    priority: 8,
  },
} as const;

export const initCommand = (cli: CAC) => {
  cli
    .command('init', 'Initialize a new CivicPress project')
    .option('--yes', 'Skip all prompts and use defaults')
    .option('--no-prompt', 'Alias for --yes')
    .option(
      '--config <path>',
      'Path to configuration file to use instead of prompts'
    )
    .option('--data-dir <path>', 'Specify the data directory for CivicPress')
    .option(
      '--demo-data [city]',
      'Load demo data (optional: specify city name)'
    )
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .action(
      withCli<[any]>(
        {
          operation: 'init',
          errorMessage: 'Failed to initialize repository',
          errorCode: 'INIT_FAILED',
          details: (error) => ({
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            error: (error as any)?.message || error,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            stack: (error as any)?.stack || undefined,
          }),
        },
        async ({ globalOptions, logger }, options: any) => {
          const skipPrompts = options.yes || options.noPrompt;

          // Check if we should output JSON
          const shouldOutputJson = globalOptions.json;

          try {
            // If --help is present, let CAC handle it and exit 0
            if (options.help) {
              process.stdout.write('', () => process.exit(0));
            }

            if (!shouldOutputJson) {
              logger.info('🚀 Initializing CivicPress repository...');
            }

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            let config: any;
            let dataDir = 'data';

            if (skipPrompts) {
              // Use all defaults for prompts
              config = {
                version: '1.0.0',
                name: 'Civic Records',
                city: 'Richmond',
                state: 'Quebec',
                country: 'Canada',
                timezone: 'America/Montreal',
                repo_url: null,
                modules: ['legal-register'],
                record_types: ['bylaw', 'policy'],
                record_types_config: INIT_RECORD_TYPES_CONFIG,
                record_statuses_config: INIT_RECORD_STATUSES_CONFIG,
                default_role: 'clerk',
                hooks: { enabled: true },
                workflows: { enabled: true },
                audit: { enabled: true },
                created: new Date().toISOString(),
              };
              // Write config to .civicrc
              const fs = await import('fs/promises');
              await fs.writeFile('.civicrc', JSON.stringify(config, null, 2));
              // Create data directory if it doesn't exist
              const { existsSync, mkdirSync } = await import('fs');
              if (!existsSync(dataDir)) {
                mkdirSync(dataDir, { recursive: true });
              }

              // Handle demo data loading for skipPrompts mode
              if (options.demoData) {
                const demoCity =
                  typeof options.demoData === 'string'
                    ? options.demoData
                    : 'richmond-quebec';
                await loadDemoData(dataDir, demoCity, logger);
              }

              cliSuccess(
                {
                  initialized: true,
                  message: 'CivicPress project initialized with defaults.',
                },
                'CivicPress project initialized with defaults.',
                { operation: 'init' }
              );
              return;
            }

            if (options.dataDir) {
              dataDir = options.dataDir;
              // Skip interactive prompts when --data-dir is provided
              // Use default config similar to skipPrompts
              config = {
                version: '1.0.0',
                name: 'Civic Records',
                city: 'Richmond',
                state: 'Quebec',
                country: 'Canada',
                timezone: 'America/Montreal',
                repo_url: null,
                modules: ['legal-register'],
                record_types: ['bylaw', 'policy'],
                record_types_config: INIT_RECORD_TYPES_CONFIG,
                record_statuses_config: INIT_RECORD_STATUSES_CONFIG,
                default_role: 'clerk',
                hooks: {
                  enabled: true,
                },
                workflows: {
                  enabled: true,
                },
                audit: {
                  enabled: true,
                },
                database: {
                  type: 'sqlite',
                  sqlite: {
                    file: path.join(process.cwd(), '.system-data/civic.db'),
                  },
                },
                storage_path: path.join(process.cwd(), 'storage'),
              };
            } else if (options.config) {
              // Load config from file
              const configPath = path.resolve(options.config);
              if (!fs.existsSync(configPath)) {
                process.stderr.write(
                  chalk.red(`❌ Config file not found: ${configPath}\n`),
                  () => process.exit(1)
                );
                return;
              }

              const configContent = fs.readFileSync(configPath, 'utf8');
              config = yaml.parse(configContent);
              logger.info(`📁 Using config from: ${configPath}`);

              // Use data directory from config if specified, otherwise default
              dataDir = config.dataDir || 'data';
            } else {
              // Interactive prompts for data directory
              const { dataDirPrompt } = await inquirer.prompt([
                {
                  type: 'input',
                  name: 'dataDirPrompt',
                  message: 'Where should your civic data directory be?',
                  default: 'data',
                  validate: (input: string) => {
                    const trimmed = input.trim();
                    if (trimmed.length === 0)
                      return 'Data directory is required';
                    if (trimmed.includes('..'))
                      return 'Data directory cannot contain ".."';
                    return true;
                  },
                },
              ]);
              dataDir = dataDirPrompt;
            }

            // Check if .civicrc already exists (will be handled later)
            const civicrcPath = path.join(process.cwd(), '.civicrc');
            const civicrcExists = fs.existsSync(civicrcPath);

            const fullDataDir = path.resolve(dataDir);
            if (!shouldOutputJson) {
              logger.info(`📁 Using data directory: ${fullDataDir}`);
            }

            // Create data directory if it doesn't exist
            if (!fs.existsSync(fullDataDir)) {
              fs.mkdirSync(fullDataDir, { recursive: true });
              if (!shouldOutputJson) {
                logger.success('📁 Created data directory');
              }
            }

            // Ensure .civic directory exists inside data directory
            const civicDir = path.join(fullDataDir, '.civic');
            if (!fs.existsSync(civicDir)) {
              fs.mkdirSync(civicDir, { recursive: true });
            }

            // Copy default configuration files if they don't exist
            const __filename = fileURLToPath(import.meta.url);
            const projectRoot = path.resolve(
              path.dirname(__filename),
              '../../../'
            );
            const defaultsDir = path.join(
              projectRoot,
              'core',
              'src',
              'defaults'
            );

            // Copy roles.yml
            const rolesSrc = path.join(defaultsDir, 'roles.yml');
            const rolesDest = path.join(civicDir, 'roles.yml');
            if (!fs.existsSync(rolesDest) && fs.existsSync(rolesSrc)) {
              fs.copyFileSync(rolesSrc, rolesDest);
              if (!shouldOutputJson) {
                logger.success('👥 Default roles.yml created');
              }
            }

            // Copy workflows.yml
            const workflowsSrc = path.join(defaultsDir, 'workflows.yml');
            const workflowsDest = path.join(civicDir, 'workflows.yml');
            if (!fs.existsSync(workflowsDest) && fs.existsSync(workflowsSrc)) {
              fs.copyFileSync(workflowsSrc, workflowsDest);
              if (!shouldOutputJson) {
                logger.success('⚙️  Default workflows.yml created');
              }
            }

            // Copy hooks.yml
            const hooksSrc = path.join(defaultsDir, 'hooks.yml');
            const hooksDest = path.join(civicDir, 'hooks.yml');
            if (!fs.existsSync(hooksDest) && fs.existsSync(hooksSrc)) {
              fs.copyFileSync(hooksSrc, hooksDest);
              if (!shouldOutputJson) {
                logger.success('🔗 Default hooks.yml created');
              }
            }

            // Copy org-config.yml
            const orgConfigSrc = path.join(defaultsDir, 'org-config.yml');
            const orgConfigDest = path.join(civicDir, 'org-config.yml');
            if (!fs.existsSync(orgConfigDest) && fs.existsSync(orgConfigSrc)) {
              fs.copyFileSync(orgConfigSrc, orgConfigDest);
              if (!shouldOutputJson) {
                logger.success('🏢 Default org-config.yml created');
              }
            }

            // Copy config.yml (contains record_types_config and record_statuses_config)
            const configSrc = path.join(defaultsDir, 'config.yml');
            const configDest = path.join(civicDir, 'config.yml');
            if (!fs.existsSync(configDest) && fs.existsSync(configSrc)) {
              fs.copyFileSync(configSrc, configDest);
              if (!shouldOutputJson) {
                logger.success('📋 Default config.yml created');
              }
            }

            // Copy analytics.yml
            const analyticsSrc = path.join(defaultsDir, 'analytics.yml');
            const analyticsDest = path.join(civicDir, 'analytics.yml');
            if (!fs.existsSync(analyticsDest) && fs.existsSync(analyticsSrc)) {
              fs.copyFileSync(analyticsSrc, analyticsDest);
              if (!shouldOutputJson) {
                logger.success('📊 Default analytics.yml created');
              }
            }

            // Copy geography-presets.yml
            const geographyPresetsSrc = path.join(
              defaultsDir,
              'geography-presets.yml'
            );
            const geographyPresetsDest = path.join(
              civicDir,
              'geography-presets.yml'
            );
            if (
              !fs.existsSync(geographyPresetsDest) &&
              fs.existsSync(geographyPresetsSrc)
            ) {
              fs.copyFileSync(geographyPresetsSrc, geographyPresetsDest);
              if (!shouldOutputJson) {
                logger.success('🗺️  Default geography-presets.yml created');
              }
            }

            // Copy default templates
            const templatesSrc = path.join(defaultsDir, 'templates');
            const templatesDest = path.join(civicDir, 'templates');
            if (!fs.existsSync(templatesDest) && fs.existsSync(templatesSrc)) {
              // Copy templates directory recursively
              const copyRecursive = (src: string, dest: string) => {
                if (fs.statSync(src).isDirectory()) {
                  if (!fs.existsSync(dest)) {
                    fs.mkdirSync(dest, { recursive: true });
                  }
                  const files = fs.readdirSync(src);
                  files.forEach((file) => {
                    const srcPath = path.join(src, file);
                    const destPath = path.join(dest, file);
                    copyRecursive(srcPath, destPath);
                  });
                } else {
                  fs.copyFileSync(src, dest);
                }
              };

              copyRecursive(templatesSrc, templatesDest);
              if (!shouldOutputJson) {
                logger.success('📄 Default templates created');
              }
            }

            // Check if Git repo exists in data directory
            const gitExists = fs.existsSync(path.join(fullDataDir, '.git'));
            let initGit = false;

            if (!gitExists) {
              initGit = true;

              if (!options.config && !options.dataDir) {
                // Interactive prompt for git initialization
                const { initGitPrompt } = await inquirer.prompt([
                  {
                    type: 'confirm',
                    name: 'initGitPrompt',
                    message: `No Git repository found in ${dataDir}. Initialize a new Git repo here?`,
                    default: true,
                  },
                ]);
                initGit = initGitPrompt;
              }

              if (initGit) {
                // Initialize Git repository in data directory
                const { GitEngine } = await import('@civicpress/core');
                const git = new GitEngine(fullDataDir);
                await git.init();
                if (!shouldOutputJson) {
                  logger.success('📦 Initialized Git repository');
                }
              }
            }

            // Create .system-data directory in project root (for system data)
            const systemDataDir = path.join(process.cwd(), '.system-data');
            if (!fs.existsSync(systemDataDir)) {
              fs.mkdirSync(systemDataDir, { recursive: true });
              if (!shouldOutputJson) {
                logger.success('📁 Created .system-data directory');
              }
            }

            if (civicrcExists && !options.config && !options.dataDir) {
              const { overwrite } = await inquirer.prompt([
                {
                  type: 'confirm',
                  name: 'overwrite',
                  message: '.civicrc file already exists. Overwrite it?',
                  default: false,
                },
              ]);

              if (!overwrite) {
                logger.warn('⏭️  Skipping .civicrc setup');
              } else {
                const storagePath = await setupCivicrc(
                  civicrcPath,
                  dataDir,
                  logger
                );
                // Update config with storage path for setupStorage
                if (storagePath) {
                  config = { ...config, storage_path: storagePath };
                }
              }
            } else if (!civicrcExists || options.config || options.dataDir) {
              if (options.config) {
                // Use the provided config file
                await setupCivicrcFromFile(
                  civicrcPath,
                  config,
                  dataDir,
                  logger
                );
              } else if (options.dataDir) {
                // Use non-interactive setup when --data-dir is provided
                await setupCivicrcNonInteractive(civicrcPath, dataDir, logger);
              } else {
                const storagePath = await setupCivicrc(
                  civicrcPath,
                  dataDir,
                  logger
                );
                // Update config with storage path for setupStorage
                if (storagePath) {
                  config = { ...config, storage_path: storagePath };
                }
              }
            }

            // Initialize CivicPress core with data directory
            const civic = new CivicPress({ dataDir: fullDataDir });
            await civic.initialize();
            if (!shouldOutputJson) {
              logger.success('🔧 Initialized CivicPress core');
            }

            // Setup notifications configuration
            await setupNotifications(
              systemDataDir,
              logger,
              shouldOutputJson || false
            );

            // Setup storage configuration
            await setupStorage(
              systemDataDir,
              logger,
              shouldOutputJson || false,
              config?.storage_path
            );

            // Create admin user if not already specified
            if (!skipPrompts && !options.config && !options.dataDir) {
              const { createAdmin } = await inquirer.prompt([
                {
                  type: 'confirm',
                  name: 'createAdmin',
                  message: 'Would you like to create an admin user now?',
                  default: true,
                },
              ]);

              if (createAdmin) {
                const adminDetails = await inquirer.prompt([
                  {
                    type: 'input',
                    name: 'username',
                    message: 'Admin username:',
                    default: 'admin',
                    validate: (input: string) => {
                      if (!input.trim()) return 'Username is required';
                      if (input.length < 3)
                        return 'Username must be at least 3 characters';
                      return true;
                    },
                  },
                  {
                    type: 'input',
                    name: 'email',
                    message: 'Admin email:',
                    validate: (input: string) => {
                      if (!input.trim()) return 'Email is required';
                      if (!input.includes('@'))
                        return 'Please enter a valid email';
                      return true;
                    },
                  },
                  {
                    type: 'password',
                    name: 'password',
                    message: 'Admin password:',
                    validate: (input: string) => {
                      if (input.length < 6)
                        return 'Password must be at least 6 characters';
                      return true;
                    },
                  },
                  {
                    type: 'input',
                    name: 'name',
                    message: 'Admin full name:',
                    default: 'System Administrator',
                  },
                ]);

                try {
                  const authService = civic.getAuthService();

                  // Enforce the password policy on the bootstrap admin — the
                  // inline min-6 prompt check above is weaker than the policy
                  // (default: 8 + upper/lower/number/special).
                  const policy = authService.validatePasswordPolicy(
                    adminDetails.password
                  );
                  if (!policy.valid) {
                    logger.error(
                      `Admin password does not meet requirements: ${policy.errors.join('; ')}`
                    );
                    process.exit(1);
                  }

                  // Hash the password
                  const bcrypt = await import('bcrypt');
                  const passwordHash = await bcrypt.hash(
                    adminDetails.password,
                    12
                  );

                  await authService.createUserWithPassword({
                    username: adminDetails.username,
                    email: adminDetails.email,
                    passwordHash: passwordHash,
                    name: adminDetails.name,
                    role: 'admin',
                  });

                  if (!shouldOutputJson) {
                    logger.success(
                      `👤 Created admin user: ${adminDetails.username}`
                    );
                    logger.info(`📧 Email: ${adminDetails.email}`);
                    logger.info(`🔑 Role: admin`);
                  }
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                } catch (error: any) {
                  logger.warn(
                    `⚠️  Failed to create admin user: ${error.message}`
                  );
                  logger.info(
                    '💡 You can create an admin user later with: civic users create'
                  );
                }
              }
            }

            // Ask about demo data if not already specified (now at the end)
            let loadDemoDataFlag = options.demoData;
            if (
              !loadDemoDataFlag &&
              !skipPrompts &&
              !options.config &&
              !options.dataDir
            ) {
              const { loadDemo } = await inquirer.prompt([
                {
                  type: 'confirm',
                  name: 'loadDemo',
                  message: 'Would you like to load demo data to get started?',
                  default: true,
                },
              ]);

              if (loadDemo) {
                const { demoCity } = await inquirer.prompt([
                  {
                    type: 'list',
                    name: 'demoCity',
                    message: 'Which demo city would you like to load?',
                    choices: [
                      {
                        name: 'Richmond, QC, Canada - Francais',
                        value: 'richmond-quebec',
                      },
                      {
                        name: 'Springfield, VA, USA - English',
                        value: 'springfield-usa',
                      },
                      // Future: Add more cities here
                    ],
                    default: 'richmond-quebec',
                  },
                ]);
                loadDemoDataFlag = demoCity;
              }
            }

            // Load demo data if requested
            if (loadDemoDataFlag) {
              const demoCity =
                typeof loadDemoDataFlag === 'string'
                  ? loadDemoDataFlag
                  : 'richmond-quebec';
              await loadDemoData(fullDataDir, demoCity, logger);
            }

            // Always run indexing and db sync after init (whether or not demo data was loaded)
            try {
              if (!shouldOutputJson) logger.info('🔄 Indexing records...');
              const civic = new CivicPress({ dataDir: fullDataDir });
              await civic.initialize();
              const indexingService = civic.getIndexingService();
              await indexingService.generateIndexes();
              if (!shouldOutputJson) logger.success('📊 Indexing complete');

              if (!shouldOutputJson)
                logger.info('🔄 Syncing indexed records to database...');
              await indexingService.generateIndexes({ syncDatabase: true });
              if (!shouldOutputJson)
                logger.success('🗄️  Database sync complete');
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
            } catch (err: any) {
              logger.warn(
                '⚠️  Indexing or DB sync failed: ' +
                  (err && err.message ? err.message : err)
              );
            }

            // Commit all files to Git if repository was initialized
            if (initGit || gitExists) {
              try {
                const { GitEngine } = await import('@civicpress/core');
                const git = new GitEngine(fullDataDir);
                await git.initialize();

                // Create initial commit with all files
                const commitMessage = `Initial CivicPress setup

- Created configuration files (.civicrc, org-config.yml)
- Added default templates and workflows
- ${loadDemoDataFlag ? `Loaded demo data (${typeof loadDemoDataFlag === 'string' ? loadDemoDataFlag : 'richmond-quebec'})` : 'No demo data loaded'}
- Initialized CivicPress repository structure

Generated by: civic init
Date: ${new Date().toISOString()}`;

                await git.commit(commitMessage);

                if (!shouldOutputJson) {
                  logger.success('📝 Initial commit created');
                }
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
              } catch (commitError: any) {
                if (!shouldOutputJson) {
                  logger.warn(
                    `⚠️  Failed to create initial commit: ${commitError.message}`
                  );
                  logger.info(
                    '💡 You can manually commit files with: git add . && git commit -m "Initial setup"'
                  );
                }
              }
            }

            const successData = {
              success: true,
              message: 'CivicPress repository initialized successfully',
              data: {
                dataDir: fullDataDir,
                systemDataDir: systemDataDir,
                gitInitialized: initGit || gitExists,
                configPath: path.join(systemDataDir, 'config.yml'),
              },
              nextSteps: [
                `cd ${dataDir}`,
                'civic create <type> <title> - Create a new civic record',
                'civic commit -m "message" -r <role> - Commit changes',
                'civic history - View record history',
              ],
            };

            cliSuccess(
              successData,
              'CivicPress repository initialized successfully!',
              {
                operation: 'init',
              }
            );

            if (!shouldOutputJson) {
              logger.success(
                '✅ CivicPress repository initialized successfully!'
              );
              logger.info('📖 Next steps:');
              logger.info(`   cd ${dataDir}`);
              logger.info(
                '   civic create <type> <title> - Create a new civic record'
              );
              logger.info(
                '   civic commit -m "message" -r <role> - Commit changes'
              );
              logger.info('   civic history - View record history');
              logger.info('');
              logger.warn(
                "💡 Don't forget to commit your config and records to version control!"
              );
            }
            // Explicitly flush stdout before exit (for test environments)
            process.stdout.write('', () => process.exit(0));
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          } catch (err: any) {
            // The human-mode detail print stays in the handler (it needs
            // shouldOutputJson + logger); re-thrown so withCli emits the
            // INIT_FAILED envelope and exits. cliError's own call moved into the
            // wrapper via the spec above.
            if (!shouldOutputJson) {
              logger.error('❌ Failed to initialize repository:');
              logger.error(err?.message || err);
              if (err?.stack) {
                logger.error(err.stack);
              }
            }
            throw err;
          }
        }
      )
    );
};

async function setupCivicrcFromFile(
  civicrcPath: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  config: any,
  dataDir: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  logger: any
): Promise<void> {
  logger.info('⚙️  Setting up configuration from file...');

  // Ensure required fields are present
  const requiredFields = ['name', 'city', 'state', 'country', 'timezone'];
  for (const field of requiredFields) {
    if (!config[field]) {
      throw new Error(`Missing required field in config: ${field}`);
    }
  }

  // Warn if PostgreSQL is configured in the file
  if (config.database?.type === 'postgres') {
    logger.warn('⚠️  PostgreSQL is not yet implemented and will cause errors.');
    logger.warn(
      '💡 Please use SQLite for now. PostgreSQL support is coming soon.'
    );

    // Override to SQLite to prevent errors
    logger.info('🔄 Switching to SQLite to avoid errors...');
    config.database.type = 'sqlite';
    config.database.sqlite = {
      file: path.join(process.cwd(), '.system-data/civic.db'),
    };
    delete config.database.postgres;
  }

  // Create .civicrc object (system config - only system settings)
  const civicrc = {
    version: '1.0.0',
    dataDir: dataDir,
    modules: config.modules || ['legal-register'],
    record_types: config.record_types || ['bylaw', 'policy'],
    default_role: config.default_role || 'clerk',
    hooks: {
      enabled: config.hooks?.enabled ?? true,
    },
    workflows: {
      enabled: config.workflows?.enabled ?? true,
    },
    audit: {
      enabled: config.audit?.enabled ?? true,
    },
    database: {
      type: config.database?.type || 'sqlite',
      sqlite:
        config.database?.type === 'sqlite'
          ? {
              file:
                config.database?.sqlite?.file ||
                path.join(process.cwd(), '.system-data/civic.db'),
            }
          : undefined,
      postgres:
        config.database?.type === 'postgres'
          ? {
              url:
                config.database?.postgres?.url ||
                'postgres://user:password@localhost:5432/civicpress',
            }
          : undefined,
    },
    created: new Date().toISOString(),
  };

  // Write .civicrc file (system config)
  const civicrcYaml = yaml.stringify(civicrc);
  fs.writeFileSync(civicrcPath, civicrcYaml);
  logger.success('⚙️  .civicrc saved (system configuration)');

  // Create org-config.yml object (organization config - branding and org details)
  const orgConfig = {
    // Basic Organization Information
    name: config.name,
    city: config.city,
    state: config.state,
    country: config.country,
    timezone: config.timezone,

    // Contact and Online Presence
    website: config.website || null,
    repo_url: config.repo_url || null,
    email: config.email || null,
    phone: config.phone || null,

    // Branding Assets (relative paths from data/.civic/)
    logo: config.logo || null,
    favicon: config.favicon || null,
    banner: config.banner || null,

    // Additional Branding Information
    description: config.description || null,
    tagline: config.tagline || null,
    mission: config.mission || null,

    // Social Media (optional)
    social: {
      twitter: config.social?.twitter || null,
      facebook: config.social?.facebook || null,
      linkedin: config.social?.linkedin || null,
      instagram: config.social?.instagram || null,
    },

    // Custom Branding Fields (can be extended)
    custom: {
      primary_color: config.custom?.primary_color || null,
      secondary_color: config.custom?.secondary_color || null,
      font_family: config.custom?.font_family || null,
    },

    // Metadata
    version: '1.0.0',
    created: new Date().toISOString(),
    updated: new Date().toISOString(),
  };

  // Write org-config.yml file (organization config)
  const orgConfigPath = path.join(dataDir, '.civic', 'org-config.yml');
  const orgConfigYaml = yaml.stringify(orgConfig);
  fs.writeFileSync(orgConfigPath, orgConfigYaml);
  logger.success('🏢 org-config.yml saved (organization configuration)');
}

async function setupCivicrcNonInteractive(
  civicrcPath: string,
  dataDir: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  logger: any
): Promise<void> {
  logger.info('⚙️  Setting up configuration (non-interactive)...');

  // Create .civicrc object with default values (system config)
  const civicrc = {
    version: '1.0.0',
    dataDir: dataDir,
    modules: ['legal-register'],
    record_types: ['bylaw', 'policy'],
    default_role: 'clerk',
    hooks: {
      enabled: true,
    },
    workflows: {
      enabled: true,
    },
    audit: {
      enabled: true,
    },
    database: {
      type: 'sqlite',
      sqlite: {
        file: path.join(process.cwd(), '.system-data/civic.db'),
      },
    },
    created: new Date().toISOString(),
  };

  // Write .civicrc file (system config)
  const civicrcYaml = yaml.stringify(civicrc);
  fs.writeFileSync(civicrcPath, civicrcYaml);
  logger.success('⚙️  .civicrc saved (system configuration)');

  // Create org-config.yml object with default values (organization config)
  const orgConfig = {
    // Basic Organization Information
    name: 'Civic Records',
    city: 'Richmond',
    state: 'Quebec',
    country: 'Canada',
    timezone: 'America/Montreal',

    // Contact and Online Presence
    website: null,
    repo_url: null,
    email: null,
    phone: null,

    // Branding Assets (relative paths from data/.civic/)
    logo: null,
    favicon: null,
    banner: null,

    // Additional Branding Information
    description: null,
    tagline: null,
    mission: null,

    // Social Media (optional)
    social: {
      twitter: null,
      facebook: null,
      linkedin: null,
      instagram: null,
    },

    // Custom Branding Fields (can be extended)
    custom: {
      primary_color: null,
      secondary_color: null,
      font_family: null,
    },

    // Metadata
    version: '1.0.0',
    created: new Date().toISOString(),
    updated: new Date().toISOString(),
  };

  // Write org-config.yml file (organization config)
  const orgConfigPath = path.join(dataDir, '.civic', 'org-config.yml');
  const orgConfigYaml = yaml.stringify(orgConfig);
  fs.writeFileSync(orgConfigPath, orgConfigYaml);
  logger.success('🏢 org-config.yml saved (organization configuration)');
}

async function loadDemoData(
  dataDir: string,
  demoCity: string = 'richmond-quebec',
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  logger: any
): Promise<void> {
  try {
    logger.info(`📦 Loading demo data for ${demoCity}...`);

    // Get the demo data directory path
    const __filename = fileURLToPath(import.meta.url);
    const projectRoot = path.resolve(path.dirname(__filename), '../../../');
    const demoDataDir = path.join(projectRoot, 'cli', 'src', 'demo-data');

    // Map demo city name to backup filename
    const backupFileName = `${demoCity}.tar.gz`;
    const backupPath = path.join(demoDataDir, backupFileName);

    // Check if backup file exists
    if (!fs.existsSync(backupPath)) {
      throw new Error(
        `Demo backup file not found: ${backupFileName}. Available backups: ${fs
          .readdirSync(demoDataDir)
          .filter((f) => f.endsWith('.tar.gz'))
          .join(', ')}`
      );
    }

    logger.info(`📦 Found backup file: ${backupFileName}`);

    // Get system data directory (defaults to .system-data in project root)
    // During init, systemDataDir is at process.cwd() level, same as dataDir's parent
    const systemDataDir = path.join(process.cwd(), '.system-data');

    // Get database config if available (for storage file restoration)
    let dbConfig;
    try {
      dbConfig = CentralConfigManager.getDatabaseConfig();
    } catch {
      // Database config might not be available during init, that's okay
      logger.info(
        '⚠️  Database config not available, storage file metadata will not be restored'
      );
    }

    // Restore backup using BackupService
    logger.info(`🔄 Restoring backup from ${backupFileName}...`);
    const restoreResult = await BackupService.restoreBackup({
      backupDir: backupPath, // BackupService handles .tar.gz files automatically
      dataDir: dataDir,
      systemDataDir: systemDataDir,
      restoreStorage: true, // Include storage files
      overwrite: true, // Overwrite existing data
      logger: logger,
      databaseConfig: dbConfig,
    });

    // Log warnings if any
    if (restoreResult.warnings && restoreResult.warnings.length > 0) {
      for (const warning of restoreResult.warnings) {
        logger.warn(`⚠️  ${warning}`);
      }
    }

    // Count records loaded
    const recordsDir = path.join(dataDir, 'records');
    let recordCount = 0;
    if (fs.existsSync(recordsDir)) {
      const recordFiles = fs
        .readdirSync(recordsDir, { recursive: true })
        .filter((f): f is string => typeof f === 'string' && f.endsWith('.md'));
      recordCount = recordFiles.length;
    }

    logger.success(
      `✅ Restored demo data for ${demoCity} (${recordCount} records)`
    );

    // Trigger hooks for demo data loading
    try {
      const civic = new CivicPress({ dataDir });
      await civic.initialize();

      const hookSystem = civic.getHookSystem();

      // Trigger demo data loaded hook
      await hookSystem.emit(
        'demo:data:loaded',
        {
          demoCity,
          recordCount: recordCount,
          source: 'backup-restore',
        },
        {
          user: 'system',
          action: 'demo-data-load',
          metadata: {
            demoCity,
            source: 'init-command',
            backupFile: backupFileName,
          },
        }
      );

      logger.info(`🎯 Triggered hooks for demo data loading`);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (hookError: any) {
      logger.warn(`⚠️  Hook triggering failed: ${hookError.message}`);
      // Don't fail the entire demo data loading if hooks fail
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (error: any) {
    logger.error(`❌ Failed to load demo data: ${error.message}`);
    throw error;
  }
}

async function setupCivicrc(
  civicrcPath: string,
  dataDir: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  logger: any
): Promise<string | undefined> {
  logger.info('⚙️  Setting up configuration...');

  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'name',
      message: 'Organization name:',
      default: 'Civic Records',
      validate: (input: string) => {
        if (!input.trim()) return 'Organization name is required';
        return true;
      },
    },
    {
      type: 'input',
      name: 'city',
      message: 'City:',
      default: 'Richmond',
      validate: (input: string) => {
        if (!input.trim()) return 'City is required';
        return true;
      },
    },
    {
      type: 'input',
      name: 'state',
      message: 'State/Province:',
      default: 'Quebec',
      validate: (input: string) => {
        if (!input.trim()) return 'State/Province is required';
        return true;
      },
    },
    {
      type: 'input',
      name: 'country',
      message: 'Country:',
      default: 'Canada',
      validate: (input: string) => {
        if (!input.trim()) return 'Country is required';
        return true;
      },
    },
    {
      type: 'input',
      name: 'timezone',
      message: 'Timezone:',
      default: 'America/Montreal',
      validate: (input: string) => {
        if (!input.trim()) return 'Timezone is required';
        return true;
      },
    },
    {
      type: 'list',
      name: 'database_type',
      message: 'Select database type:',
      choices: [
        { name: 'SQLite (recommended for local development)', value: 'sqlite' },
        {
          name: 'PostgreSQL (unsupported - not implemented yet)',
          value: 'postgres',
        },
      ],
      default: 'sqlite',
    },
    {
      type: 'input',
      name: 'database_path',
      message: 'SQLite database file path:',
      default: path.join(process.cwd(), '.system-data/civic.db'),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      when: (answers: any) => answers.database_type === 'sqlite',
    },
    {
      type: 'input',
      name: 'database_url',
      message: 'PostgreSQL connection URL:',
      default: 'postgres://user:password@localhost:5432/civicpress',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      when: (answers: any) => answers.database_type === 'postgres',
    },
    {
      type: 'input',
      name: 'storage_path',
      message: 'Where should files be stored?',
      default: path.join(process.cwd(), 'storage'),
      validate: (input: string) => {
        const trimmed = input.trim();
        if (trimmed.length === 0) return 'Storage path is required';
        if (trimmed.includes('..')) return 'Storage path cannot contain ".."';
        return true;
      },
    },
  ]);

  // Warn if PostgreSQL is selected
  if (answers.database_type === 'postgres') {
    logger.warn('⚠️  PostgreSQL is not yet implemented and will cause errors.');
    logger.warn(
      '💡 Please use SQLite for now. PostgreSQL support is coming soon.'
    );

    const { continueWithPostgres } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'continueWithPostgres',
        message:
          'Do you want to continue with PostgreSQL anyway? (not recommended)',
        default: false,
      },
    ]);

    if (!continueWithPostgres) {
      logger.info('🔄 Switching to SQLite...');
      answers.database_type = 'sqlite';
      answers.database_path = path.join(process.cwd(), '.system-data/civic.db');
    }
  }

  // Create .civicrc object (system config - only system settings)
  const civicrc = {
    version: '1.0.0',
    dataDir: dataDir,
    modules: ['legal-register'],
    record_types: ['bylaw', 'policy'],
    default_role: 'clerk',
    hooks: {
      enabled: true,
    },
    workflows: {
      enabled: true,
    },
    audit: {
      enabled: true,
    },
    database: {
      type: answers.database_type,
      sqlite:
        answers.database_type === 'sqlite'
          ? {
              file: answers.database_path,
            }
          : undefined,
      postgres:
        answers.database_type === 'postgres'
          ? {
              url: answers.database_url,
            }
          : undefined,
    },
    created: new Date().toISOString(),
  };

  // Write .civicrc file (system config)
  const civicrcYaml = yaml.stringify(civicrc);
  fs.writeFileSync(civicrcPath, civicrcYaml);
  logger.success('⚙️  .civicrc saved (system configuration)');

  // Create org-config.yml object (organization config - branding and org details)
  const orgConfig = {
    // Basic Organization Information
    name: answers.name,
    city: answers.city,
    state: answers.state,
    country: answers.country,
    timezone: answers.timezone,

    // Contact and Online Presence
    website: null,
    repo_url: null,
    email: null,
    phone: null,

    // Branding Assets (relative paths from data/.civic/)
    logo: null,
    favicon: null,
    banner: null,

    // Additional Branding Information
    description: null,
    tagline: null,
    mission: null,

    // Social Media (optional)
    social: {
      twitter: null,
      facebook: null,
      linkedin: null,
      instagram: null,
    },

    // Custom Branding Fields (can be extended)
    custom: {
      primary_color: null,
      secondary_color: null,
      font_family: null,
    },

    // Metadata
    version: '1.0.0',
    created: new Date().toISOString(),
    updated: new Date().toISOString(),
  };

  // Write org-config.yml file (organization config)
  const orgConfigPath = path.join(dataDir, '.civic', 'org-config.yml');
  const orgConfigYaml = yaml.stringify(orgConfig);
  fs.writeFileSync(orgConfigPath, orgConfigYaml);
  logger.success('🏢 org-config.yml saved (organization configuration)');

  // Return the storage path for use in setupStorage
  return answers.storage_path;
}

async function setupNotifications(
  systemDataDir: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  logger: any,
  shouldOutputJson: boolean
): Promise<void> {
  try {
    // Create notifications.yml file in .system-data directory
    const notificationsPath = path.join(systemDataDir, 'notifications.yml');

    // Check if notifications.yml already exists
    if (fs.existsSync(notificationsPath)) {
      if (!shouldOutputJson) {
        logger.info('📧 Notifications configuration already exists');
      }
      return;
    }

    // Load default notifications configuration
    const __filename = fileURLToPath(import.meta.url);
    const projectRoot = path.resolve(path.dirname(__filename), '../../../');
    const defaultNotificationsPath = path.join(
      projectRoot,
      'core',
      'src',
      'defaults',
      'notifications.yml'
    );

    if (fs.existsSync(defaultNotificationsPath)) {
      // Copy default notifications configuration
      const defaultConfig = fs.readFileSync(defaultNotificationsPath, 'utf8');
      fs.writeFileSync(notificationsPath, defaultConfig);

      if (!shouldOutputJson) {
        logger.success('📧 Created notifications.yml (disabled by default)');
        logger.info(
          '💡 Configure email providers in .system-data/notifications.yml'
        );
        logger.info(
          '💡 Test with: civic notify:test --to your-email@domain.com --provider smtp'
        );
      }
    } else {
      // Create basic notifications configuration if default doesn't exist
      const basicNotificationsConfig = {
        channels: {
          email: {
            enabled: false,
            provider: 'smtp',
            smtp: {
              host: 'localhost',
              port: 587,
              secure: false,
              auth: {
                user: '',
                pass: '',
              },
              from: 'noreply@civicpress.local',
              tls: {
                rejectUnauthorized: false,
              },
            },
            sendgrid: {
              apiKey: '',
              from: 'noreply@civicpress.local',
              sandboxMode: true,
            },
          },
        },
        auth_templates: {
          email_verification: {
            subject: 'Verify your CivicPress account',
            body: 'Please click the following link to verify your account: {{verification_url}}',
          },
          password_reset: {
            subject: 'Reset your CivicPress password',
            body: 'Click here to reset your password: {{reset_url}}',
          },
          two_factor_auth: {
            subject: 'Your CivicPress verification code',
            body: 'Your verification code is: {{code}}',
          },
          security_alert: {
            subject: 'Security alert for your account',
            body: 'Suspicious activity detected: {{details}}',
          },
        },
        rules: {
          rate_limits: {
            email_per_hour: 100,
            sms_per_hour: 50,
            slack_per_hour: 200,
          },
          retry_attempts: 3,
          retry_delay: 5000,
        },
        security: {
          encrypt_sensitive_data: true,
          audit_all_notifications: true,
          filter_pii: true,
        },
      };

      const notificationsYaml = yaml.stringify(basicNotificationsConfig);
      fs.writeFileSync(notificationsPath, notificationsYaml);

      if (!shouldOutputJson) {
        logger.success('📧 Created notifications.yml (disabled by default)');
        logger.info(
          '💡 Configure email providers in .system-data/notifications.yml'
        );
        logger.info(
          '💡 Test with: civic notify:test --to your-email@domain.com --provider smtp'
        );
      }
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (error: any) {
    if (!shouldOutputJson) {
      logger.warn(`⚠️  Failed to setup notifications: ${error.message}`);
      logger.info(
        '💡 You can configure notifications later in .system-data/notifications.yml'
      );
    }
  }
}

async function setupStorage(
  systemDataDir: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  logger: any,
  shouldOutputJson: boolean,
  storagePath?: string
): Promise<void> {
  try {
    // Create storage.yml file in .system-data directory
    const storageConfigPath = path.join(systemDataDir, 'storage.yml');

    // Check if storage.yml already exists
    if (fs.existsSync(storageConfigPath)) {
      if (!shouldOutputJson) {
        logger.info('📁 Storage configuration already exists');
      }
      return;
    }

    // Use provided storage path or default to 'storage' in project root
    const userStoragePath = storagePath || path.join(process.cwd(), 'storage');

    // Load default storage configuration
    const __filename = fileURLToPath(import.meta.url);
    const projectRoot = path.resolve(path.dirname(__filename), '../../../');
    const defaultStorageTemplatePath = path.join(
      projectRoot,
      'core',
      'src',
      'defaults',
      'storage.yml'
    );

    if (fs.existsSync(defaultStorageTemplatePath)) {
      // Copy default storage configuration and update the storage path
      const defaultConfig = fs.readFileSync(defaultStorageTemplatePath, 'utf8');
      const configObj = yaml.parse(defaultConfig);

      // Update the storage path in the configuration
      // Store absolute path like database configuration
      const absoluteStoragePath = path.isAbsolute(userStoragePath)
        ? userStoragePath
        : path.resolve(process.cwd(), userStoragePath);

      if (configObj.backend) {
        configObj.backend.path = absoluteStoragePath;
      }
      if (configObj.providers?.local) {
        configObj.providers.local.path = absoluteStoragePath;
      }

      const updatedConfig = yaml.stringify(configObj);
      fs.writeFileSync(storageConfigPath, updatedConfig);

      // Create storage directories
      const storageDir = path.isAbsolute(userStoragePath)
        ? userStoragePath
        : path.resolve(process.cwd(), userStoragePath);

      if (!fs.existsSync(storageDir)) {
        fs.mkdirSync(storageDir, { recursive: true });
        if (!shouldOutputJson) {
          logger.success(`📁 Created storage directory: ${storageDir}`);
        }
      }

      // Create default storage folders
      const folders = ['public', 'sessions', 'permits', 'private', 'icons'];
      for (const folder of folders) {
        const folderPath = path.join(storageDir, folder);
        if (!fs.existsSync(folderPath)) {
          fs.mkdirSync(folderPath, { recursive: true });
        }
      }

      if (!shouldOutputJson) {
        logger.success('📁 Created storage.yml (local storage enabled)');
        logger.info(`📁 Created storage directory: ${userStoragePath}`);
        logger.info(
          '💡 Configure storage providers in .system-data/storage.yml'
        );
        logger.info('💡 Test with: civic storage:list');
      }
    } else {
      // Create basic storage configuration if default doesn't exist
      // Store absolute path like database configuration
      const absoluteStoragePath = path.isAbsolute(userStoragePath)
        ? userStoragePath
        : path.resolve(process.cwd(), userStoragePath);

      const basicStorageConfig = {
        backend: {
          type: 'local',
          path: absoluteStoragePath,
        },
        providers: {
          local: {
            type: 'local',
            path: absoluteStoragePath,
            enabled: true,
          },
        },
        active_provider: 'local',
        failover_providers: ['local'],
        global: {
          max_file_size: '100MB',
          health_checks: true,
          health_check_interval: 5,
          retry_attempts: 3,
          cross_provider_backup: false,
          backup_providers: [],
        },
        folders: {
          public: {
            path: 'public',
            access: 'public',
            allowed_types: ['jpg', 'jpeg', 'png', 'gif', 'pdf', 'txt', 'md'],
            max_size: '10MB',
            description: 'Public files for testing',
          },
          icons: {
            path: 'icons',
            access: 'public',
            allowed_types: ['png', 'svg', 'jpg', 'jpeg', 'gif', 'webp', 'ico'],
            max_size: '2MB',
            description: 'Icons and map-related images for geography records',
          },
        },
        metadata: {
          auto_generate_thumbnails: true,
          store_exif: true,
          compress_images: true,
          backup_included: true,
        },
      };

      const storageYaml = yaml.stringify(basicStorageConfig);
      fs.writeFileSync(storageConfigPath, storageYaml);

      // Create storage directories
      const storageDir = path.isAbsolute(userStoragePath)
        ? userStoragePath
        : path.resolve(process.cwd(), userStoragePath);

      if (!fs.existsSync(storageDir)) {
        fs.mkdirSync(storageDir, { recursive: true });
        if (!shouldOutputJson) {
          logger.success(`📁 Created storage directory: ${storageDir}`);
        }
      }

      // Create default storage folders
      const folders = ['public', 'sessions', 'permits', 'private', 'icons'];
      for (const folder of folders) {
        const folderPath = path.join(storageDir, folder);
        if (!fs.existsSync(folderPath)) {
          fs.mkdirSync(folderPath, { recursive: true });
        }
      }

      if (!shouldOutputJson) {
        logger.success('📁 Created storage.yml (local storage enabled)');
        logger.info(`📁 Created storage directory: ${userStoragePath}`);
        logger.info(
          '💡 Configure storage providers in .system-data/storage.yml'
        );
        logger.info('💡 Test with: civic storage:list');
      }
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (error: any) {
    if (!shouldOutputJson) {
      logger.warn(`⚠️  Failed to setup storage: ${error.message}`);
      logger.info(
        '💡 You can configure storage later in .system-data/storage.yml'
      );
    }
  }
}
