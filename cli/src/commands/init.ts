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

        // Check if .civicrc already exists
        const civicrcPath = path.join(process.cwd(), '.civicrc');
        const civicrcExists = fs.existsSync(civicrcPath);

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
            if (!shouldOutputJson) {
              logger.warn('Initialization cancelled by user.');
            }
            return;
          }
        }

        // Ask about demo data if not already specified
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

        // Copy default roles.yml if it doesn't exist
        const __filename = fileURLToPath(import.meta.url);
        const projectRoot = path.resolve(path.dirname(__filename), '../../../');
        const rolesSrc = path.join(
          projectRoot,
          '.system-data',
          'roles.default.yml'
        );
        const rolesDest = path.join(civicDir, 'roles.yml');
        if (!fs.existsSync(rolesDest) && fs.existsSync(rolesSrc)) {
          fs.copyFileSync(rolesSrc, rolesDest);
          if (!shouldOutputJson) {
            logger.success('👥 Default roles.yml created');
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

        // Load demo data if requested
        if (loadDemoDataFlag) {
          const demoCity =
            typeof loadDemoDataFlag === 'string'
              ? loadDemoDataFlag
              : 'richmond-quebec';
          await loadDemoData(fullDataDir, demoCity, logger);
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
  logger.info('⚙️  Setting up .civicrc from file...');

  // Ensure required fields are present
  const requiredFields = ['name', 'city', 'state', 'country', 'timezone'];
  for (const field of requiredFields) {
    if (!config[field]) {
      throw new Error(`Missing required field in config: ${field}`);
    }
  }

  // Set defaults for optional fields
  const finalCivicrc = {
    version: '1.0.0',
    name: config.name,
    city: config.city,
    state: config.state,
    country: config.country,
    timezone: config.timezone,
    repo_url: config.repo_url || null,
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
      type: 'sqlite', // Default to SQLite
      path: path.join(dataDir, 'civicpress.db'),
    },
    created: new Date().toISOString(),
  };

  // Write .civicrc file
  const yamlContent = yaml.stringify(finalCivicrc);
  fs.writeFileSync(civicrcPath, yamlContent);
  logger.success('⚙️  .civicrc saved to .civicrc');
}

async function setupCivicrcNonInteractive(
  civicrcPath: string,
  dataDir: string,
  logger: any
): Promise<void> {
  logger.info('⚙️  Setting up .civicrc (non-interactive)...');

  // Create .civicrc object with default values
  const civicrc = {
    dataDir: dataDir,
    database: {
      type: 'sqlite',
      sqlite: {
        file: path.join(process.cwd(), '.system-data/civic.db'),
      },
    },
  };

  // Write .civicrc file
  const yamlContent = yaml.stringify(civicrc);
  fs.writeFileSync(civicrcPath, yamlContent);
  logger.success('⚙️  .civicrc saved to .civicrc');
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
  logger.info('⚙️  Setting up .civicrc...');

  const answers = await inquirer.prompt([
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

  // Create .civicrc object with simplified format
  const civicrc = {
    dataDir: dataDir,
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
  };

  // Write .civicrc file
  const yamlContent = yaml.stringify(civicrc);
  fs.writeFileSync(civicrcPath, yamlContent);
  logger.success('⚙️  .civicrc saved to .civicrc');
}
