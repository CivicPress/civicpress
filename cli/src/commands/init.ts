import { CAC } from 'cac';
import chalk from 'chalk';
import { CivicPress } from '@civicpress/core';
import * as fs from 'fs';
import * as path from 'path';
import inquirer from 'inquirer';
import * as yaml from 'yaml';
import {
  initializeLogger,
  getGlobalOptionsFromArgs,
} from '../utils/global-options.js';
import { fileURLToPath } from 'url';

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
    .action(async (options: any) => {
      const skipPrompts = options.yes || options.noPrompt;
      // Initialize logger with global options
      const globalOptions = getGlobalOptionsFromArgs();
      const logger = initializeLogger();

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

        let config: any;
        let dataDir = 'data';

        if (skipPrompts) {
          // Use all defaults for prompts
          const config = {
            version: '1.0.0',
            name: 'Civic Records',
            city: 'Richmond',
            state: 'Quebec',
            country: 'Canada',
            timezone: 'America/Montreal',
            repo_url: null,
            modules: ['legal-register'],
            record_types: ['bylaw', 'policy'],
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

          if (!shouldOutputJson) {
            console.log('✅ CivicPress project initialized with defaults.');
          }
          return;
        }

        if (options.dataDir) {
          dataDir = options.dataDir;
          // Skip interactive prompts when --data-dir is provided
          config = { dataDir }; // Create minimal config to skip prompts
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
                if (trimmed.length === 0) return 'Data directory is required';
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
        const projectRoot = path.resolve(path.dirname(__filename), '../../../');
        const defaultsDir = path.join(projectRoot, 'core', 'src', 'defaults');

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
            await setupCivicrc(civicrcPath, dataDir, logger);
          }
        } else if (!civicrcExists || options.config || options.dataDir) {
          if (options.config) {
            // Use the provided config file
            await setupCivicrcFromFile(civicrcPath, config, dataDir, logger);
          } else if (options.dataDir) {
            // Use non-interactive setup when --data-dir is provided
            await setupCivicrcNonInteractive(civicrcPath, dataDir, logger);
          } else {
            await setupCivicrc(civicrcPath, dataDir, logger);
          }
        }

        // Initialize CivicPress core with data directory
        const civic = new CivicPress({ dataDir: fullDataDir });
        await civic.initialize();
        if (!shouldOutputJson) {
          logger.success('🔧 Initialized CivicPress core');
        }

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
                  if (!input.includes('@')) return 'Please enter a valid email';
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

              // Hash the password
              const bcrypt = await import('bcrypt');
              const passwordHash = await bcrypt.hash(adminDetails.password, 12);

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
            } catch (error: any) {
              logger.warn(`⚠️  Failed to create admin user: ${error.message}`);
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
                    name: 'Richmond, Quebec (Bilingual)',
                    value: 'richmond-quebec',
                  },
                  {
                    name: 'Springfield, Illinois (Comprehensive)',
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
          if (!shouldOutputJson) logger.success('🗄️  Database sync complete');
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

        if (shouldOutputJson) {
          console.log(
            JSON.stringify(
              {
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
              },
              null,
              2
            )
          );
        } else {
          logger.success('✅ CivicPress repository initialized successfully!');
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
      } catch (err: any) {
        if (shouldOutputJson) {
          console.error(
            JSON.stringify(
              {
                success: false,
                error: err?.message || err,
                stack: err?.stack || undefined,
              },
              null,
              2
            )
          );
        } else {
          logger.error('❌ Failed to initialize repository:');
          logger.error(err?.message || err);
          if (err?.stack) {
            logger.error(err.stack);
          }
        }
        process.exit(1);
      }
    });
};

async function setupCivicrcFromFile(
  civicrcPath: string,
  config: any,
  dataDir: string,
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
  logger: any
): Promise<void> {
  try {
    logger.info(`📦 Loading demo data for ${demoCity}...`);

    // Get the demo data directory path
    const __filename = fileURLToPath(import.meta.url);
    const projectRoot = path.resolve(path.dirname(__filename), '../../../');
    const demoDataDir = path.join(projectRoot, 'cli', 'src', 'demo-data');

    // Load demo config
    const configPath = path.join(demoDataDir, 'config', `${demoCity}.yml`);
    if (!fs.existsSync(configPath)) {
      throw new Error(
        `Demo city '${demoCity}' not found. Available cities: richmond-quebec`
      );
    }

    const configContent = fs.readFileSync(configPath, 'utf8');
    const demoConfig = yaml.parse(configContent);

    // Create records directory
    const recordsDir = path.join(dataDir, 'records');
    if (!fs.existsSync(recordsDir)) {
      fs.mkdirSync(recordsDir, { recursive: true });
    }

    // Copy demo records
    const recordsSrc = path.join(demoDataDir, 'records');
    let copiedCount = 0;

    for (const recordFile of demoConfig.demo_data.records) {
      const srcPath = path.join(recordsSrc, recordFile);
      const destPath = path.join(recordsDir, recordFile);

      if (fs.existsSync(srcPath)) {
        fs.copyFileSync(srcPath, destPath);
        copiedCount++;
      } else {
        logger.warn(`⚠️  Demo record not found: ${recordFile}`);
      }
    }

    // Copy hooks if they exist
    if (demoConfig.demo_data.hooks) {
      const hooksSrc = path.join(demoDataDir, 'hooks');
      const hooksDest = path.join(dataDir, '.civic', 'hooks');
      if (!fs.existsSync(hooksDest)) {
        fs.mkdirSync(hooksDest, { recursive: true });
      }

      for (const hookFile of demoConfig.demo_data.hooks) {
        const srcPath = path.join(hooksSrc, hookFile);
        const destPath = path.join(hooksDest, hookFile);

        if (fs.existsSync(srcPath)) {
          fs.copyFileSync(srcPath, destPath);
          logger.info(`📋 Copied hook: ${hookFile}`);
        }
      }
    }

    // Copy templates if they exist
    if (demoConfig.demo_data.templates) {
      const templatesSrc = path.join(demoDataDir, 'templates');
      const templatesDest = path.join(dataDir, '.civic', 'templates');
      if (!fs.existsSync(templatesDest)) {
        fs.mkdirSync(templatesDest, { recursive: true });
      }

      for (const templateFile of demoConfig.demo_data.templates) {
        const srcPath = path.join(templatesSrc, templateFile);
        const destPath = path.join(templatesDest, templateFile);

        if (fs.existsSync(srcPath)) {
          fs.copyFileSync(srcPath, destPath);
          logger.info(`📄 Copied template: ${templateFile}`);
        }
      }
    }

    // Copy workflows if they exist
    if (demoConfig.demo_data.workflows) {
      const workflowsSrc = path.join(demoDataDir, 'workflows');
      const workflowsDest = path.join(dataDir, '.civic', 'workflows');
      if (!fs.existsSync(workflowsDest)) {
        fs.mkdirSync(workflowsDest, { recursive: true });
      }

      for (const workflowFile of demoConfig.demo_data.workflows) {
        const srcPath = path.join(workflowsSrc, workflowFile);
        const destPath = path.join(workflowsDest, workflowFile);

        if (fs.existsSync(srcPath)) {
          fs.copyFileSync(srcPath, destPath);
          logger.info(`⚙️  Copied workflow: ${workflowFile}`);
        }
      }
    }

    logger.success(`✅ Loaded ${copiedCount} demo records for ${demoCity}`);

    // Trigger hooks for demo data loading
    try {
      const { CivicPress } = await import('@civicpress/core');
      const civic = new CivicPress({ dataDir });
      await civic.initialize();

      const hookSystem = civic.getHookSystem();

      // Trigger demo data loaded hook
      await hookSystem.emit(
        'demo:data:loaded',
        {
          demoCity,
          recordCount: copiedCount,
          records: demoConfig.demo_data.records,
          hooks: demoConfig.demo_data.hooks || [],
          templates: demoConfig.demo_data.templates || [],
          workflows: demoConfig.demo_data.workflows || [],
        },
        {
          user: 'system',
          action: 'demo-data-load',
          metadata: {
            demoCity,
            source: 'init-command',
          },
        }
      );

      // Trigger individual record created hooks for each loaded record
      for (const recordFile of demoConfig.demo_data.records) {
        const recordPath = path.join(recordsDir, recordFile);
        if (fs.existsSync(recordPath)) {
          const recordContent = fs.readFileSync(recordPath, 'utf8');
          const frontmatterMatch = recordContent.match(/^---\n([\s\S]*?)\n---/);

          if (frontmatterMatch) {
            const frontmatter = yaml.parse(frontmatterMatch[1]);
            await hookSystem.emit(
              'record:created',
              {
                record: {
                  title: frontmatter.title,
                  type: frontmatter.type,
                  status: frontmatter.status,
                  path: recordPath,
                  slug: frontmatter.slug,
                  authors: frontmatter.authors,
                  tags: frontmatter.tags,
                },
                demoData: true,
              },
              {
                user: 'system',
                action: 'demo-record-created',
                metadata: {
                  demoCity,
                  recordFile,
                },
              }
            );
          }
        }
      }

      logger.info(`🎯 Triggered hooks for demo data loading`);
    } catch (hookError: any) {
      logger.warn(`⚠️  Hook triggering failed: ${hookError.message}`);
      // Don't fail the entire demo data loading if hooks fail
    }
  } catch (error: any) {
    logger.error(`❌ Failed to load demo data: ${error.message}`);
    throw error;
  }
}

async function setupCivicrc(
  civicrcPath: string,
  dataDir: string,
  logger: any
): Promise<void> {
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
      type: 'input',
      name: 'repo_url',
      message: 'Repository URL (optional):',
      default: '',
    },
    {
      type: 'list',
      name: 'database_type',
      message: 'Select database type:',
      choices: [
        { name: 'SQLite (recommended for local development)', value: 'sqlite' },
        { name: 'PostgreSQL (for production)', value: 'postgres' },
      ],
      default: 'sqlite',
    },
    {
      type: 'input',
      name: 'database_path',
      message: 'SQLite database file path:',
      default: path.join(process.cwd(), '.system-data/civic.db'),
      when: (answers: any) => answers.database_type === 'sqlite',
    },
    {
      type: 'input',
      name: 'database_url',
      message: 'PostgreSQL connection URL:',
      default: 'postgres://user:password@localhost:5432/civicpress',
      when: (answers: any) => answers.database_type === 'postgres',
    },
  ]);

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
    repo_url: answers.repo_url || null,
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
