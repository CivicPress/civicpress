import { CAC } from 'cac';
import chalk from 'chalk';
import { CivicPress, getLogger } from '@civicpress/core';
import * as fs from 'fs';
import * as path from 'path';
import inquirer from 'inquirer';
import * as yaml from 'yaml';
import {
  initializeLogger,
  getGlobalOptionsFromArgs,
} from '../utils/global-options.js';

export const initCommand = (cli: CAC) => {
  cli
    .command('init', 'Initialize a new CivicPress repository')
    .option(
      '--config <path>',
      'Path to configuration file to use instead of prompts'
    )
    .action(async (options: any) => {
      // Initialize logger with global options
      const globalOptions = getGlobalOptionsFromArgs();
      initializeLogger(globalOptions);
      const logger = getLogger();

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

        if (options.config) {
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

        // Check if Git repo exists in data directory
        const gitExists = fs.existsSync(path.join(fullDataDir, '.git'));
        let initGit = false;

        if (!gitExists) {
          initGit = true;

          if (!options.config) {
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

        // Create .civic directory inside data (only for config)
        const civicDir = path.join(fullDataDir, '.civic');
        if (!fs.existsSync(civicDir)) {
          fs.mkdirSync(civicDir, { recursive: true });
          if (!shouldOutputJson) {
            logger.success('📁 Created .civic directory');
          }
        }

        // Check if config already exists
        const configPath = path.join(civicDir, 'config.yml');
        const configExists = fs.existsSync(configPath);

        if (configExists && !options.config) {
          const { overwrite } = await inquirer.prompt([
            {
              type: 'confirm',
              name: 'overwrite',
              message: 'Configuration file already exists. Overwrite it?',
              default: false,
            },
          ]);

          if (!overwrite) {
            logger.warn('⏭️  Skipping configuration setup');
          } else {
            await setupConfiguration(configPath);
          }
        } else if (!configExists || options.config) {
          if (options.config) {
            // Use the provided config file
            await setupConfigurationFromFile(configPath, config);
          } else {
            await setupConfiguration(configPath);
          }
        }

        // Initialize CivicPress core with data directory
        const civic = new CivicPress({ repoPath: fullDataDir });
        if (!shouldOutputJson) {
          logger.success('🔧 Initialized CivicPress core');
        }

        if (shouldOutputJson) {
          console.log(
            JSON.stringify(
              {
                success: true,
                message: 'CivicPress repository initialized successfully',
                data: {
                  dataDir: fullDataDir,
                  civicDir: civicDir,
                  gitInitialized: initGit || gitExists,
                  configPath: path.join(civicDir, 'config.yml'),
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
      } catch (error) {
        if (shouldOutputJson) {
          console.log(
            JSON.stringify(
              {
                success: false,
                error: 'Failed to initialize repository',
                details: error instanceof Error ? error.message : String(error),
              },
              null,
              2
            )
          );
        } else {
          const logger = getLogger();
          logger.error('❌ Failed to initialize repository:', error);
        }
        process.exit(1);
      }
    });
};

async function setupConfigurationFromFile(
  configPath: string,
  config: any
): Promise<void> {
  const logger = getLogger();
  logger.info('⚙️  Setting up CivicPress configuration from file...');

  // Ensure required fields are present
  const requiredFields = ['name', 'city', 'state', 'country', 'timezone'];
  for (const field of requiredFields) {
    if (!config[field]) {
      throw new Error(`Missing required field in config: ${field}`);
    }
  }

  // Set defaults for optional fields
  const finalConfig = {
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
    created: new Date().toISOString(),
  };

  // Write configuration file
  const yamlContent = yaml.stringify(finalConfig);
  fs.writeFileSync(configPath, yamlContent);
  logger.success('⚙️  Configuration saved to .civic/config.yml');
}

async function setupConfiguration(configPath: string): Promise<void> {
  const logger = getLogger();
  logger.info('⚙️  Setting up CivicPress configuration...');

  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'name',
      message: 'Project name:',
      default: 'Civic Records',
      validate: (input: string) =>
        input.trim().length > 0 ? true : 'Project name is required',
    },
    {
      type: 'input',
      name: 'city',
      message: 'City name:',
      default: 'Richmond',
      validate: (input: string) =>
        input.trim().length > 0 ? true : 'City name is required',
    },
    {
      type: 'input',
      name: 'state',
      message: 'State/Province:',
      default: 'Virginia',
    },
    {
      type: 'input',
      name: 'country',
      message: 'Country:',
      default: 'USA',
    },
    {
      type: 'input',
      name: 'timezone',
      message: 'Timezone:',
      default: 'America/New_York',
    },
    {
      type: 'input',
      name: 'repo_url',
      message: 'Git repository URL (optional):',
      default: '',
    },
    {
      type: 'checkbox',
      name: 'modules',
      message: 'Select modules to enable:',
      choices: [
        {
          name: 'Legal Register (bylaws, policies)',
          value: 'legal-register',
          checked: true,
        },
        { name: 'Feedback System', value: 'feedback' },
        { name: 'Notifications', value: 'notifications' },
        { name: 'Voting System', value: 'votes' },
        { name: 'Audit Logging', value: 'audit' },
      ],
    },
    {
      type: 'checkbox',
      name: 'record_types',
      message: 'Select record types to support:',
      choices: [
        { name: 'Bylaws', value: 'bylaw', checked: true },
        { name: 'Policies', value: 'policy', checked: true },
        { name: 'Proposals', value: 'proposal' },
        { name: 'Resolutions', value: 'resolution' },
        { name: 'Minutes', value: 'minutes' },
      ],
    },
    {
      type: 'list',
      name: 'default_role',
      message: 'Default user role:',
      choices: [
        { name: 'Clerk', value: 'clerk' },
        { name: 'Council Member', value: 'council' },
        { name: 'Public', value: 'public' },
      ],
      default: 'clerk',
    },
    {
      type: 'confirm',
      name: 'hooks_enabled',
      message: 'Enable event hooks?',
      default: true,
    },
    {
      type: 'confirm',
      name: 'workflows_enabled',
      message: 'Enable workflow automation?',
      default: true,
    },
    {
      type: 'confirm',
      name: 'audit_enabled',
      message: 'Enable audit logging?',
      default: true,
    },
  ]);

  // Create configuration object
  const config = {
    version: '1.0.0',
    name: answers.name,
    city: answers.city,
    state: answers.state,
    country: answers.country,
    timezone: answers.timezone,
    repo_url: answers.repo_url || null,
    modules: answers.modules,
    record_types: answers.record_types,
    default_role: answers.default_role,
    hooks: {
      enabled: answers.hooks_enabled,
    },
    workflows: {
      enabled: answers.workflows_enabled,
    },
    audit: {
      enabled: answers.audit_enabled,
    },
    created: new Date().toISOString(),
  };

  // Write configuration file
  const yamlContent = yaml.stringify(config);
  fs.writeFileSync(configPath, yamlContent);
  logger.success('⚙️  Configuration saved to .civic/config.yml');
}
