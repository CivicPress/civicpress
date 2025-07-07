import { CAC } from 'cac';
import chalk from 'chalk';
import { CivicPress } from '@civicpress/core';
import * as fs from 'fs';
import * as path from 'path';
import inquirer from 'inquirer';
import * as yaml from 'yaml';

export const initCommand = (cli: CAC) => {
  cli
    .command('init', 'Initialize a new CivicPress repository')
    .action(async () => {
      try {
        console.log(chalk.blue('🚀 Initializing CivicPress repository...'));

        // Check if we're in a Git repository
        const gitExists = fs.existsSync('.git');
        if (!gitExists) {
          console.log(
            chalk.yellow('⚠️  No Git repository found. Initializing Git...')
          );
          // TODO: Initialize Git repository
        }

        // Create .civic directory structure
        const civicDir = '.civic';
        if (!fs.existsSync(civicDir)) {
          fs.mkdirSync(civicDir, { recursive: true });
          console.log(chalk.green('📁 Created .civic directory'));
        }

        // Create basic directory structure
        const dirs = ['specs', 'diagrams', 'tools'];
        for (const dir of dirs) {
          const dirPath = path.join(civicDir, dir);
          if (!fs.existsSync(dirPath)) {
            fs.mkdirSync(dirPath, { recursive: true });
          }
        }

        // Check if config already exists
        const configPath = path.join(civicDir, 'config.yml');
        const configExists = fs.existsSync(configPath);

        if (configExists) {
          const { overwrite } = await inquirer.prompt([
            {
              type: 'confirm',
              name: 'overwrite',
              message: 'Configuration file already exists. Overwrite it?',
              default: false,
            },
          ]);

          if (!overwrite) {
            console.log(chalk.yellow('⏭️  Skipping configuration setup'));
          } else {
            await setupConfiguration(configPath);
          }
        } else {
          await setupConfiguration(configPath);
        }

        // Initialize CivicPress core
        const civic = new CivicPress();
        console.log(chalk.green('🔧 Initialized CivicPress core'));

        console.log(
          chalk.green('✅ CivicPress repository initialized successfully!')
        );
        console.log(chalk.blue('📖 Next steps:'));
        console.log(
          chalk.blue(
            '   civic create <type> <title> - Create a new civic record'
          )
        );
        console.log(
          chalk.blue('   civic commit -m "message" -r <role> - Commit changes')
        );
        console.log(chalk.blue('   civic history - View record history'));
      } catch (error) {
        console.error(chalk.red('❌ Failed to initialize repository:'), error);
        process.exit(1);
      }
    });
};

async function setupConfiguration(configPath: string): Promise<void> {
  console.log(chalk.blue('⚙️  Setting up CivicPress configuration...'));

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
  console.log(chalk.green('⚙️  Configuration saved to .civic/config.yml'));
}
