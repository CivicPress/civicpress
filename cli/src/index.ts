#!/usr/bin/env node

import { cac } from 'cac';
import { initCommand } from './commands/init.js';
import { createCommand } from './commands/create.js';
import { commitCommand } from './commands/commit.js';
import { historyCommand } from './commands/history.js';
import { listCommand } from './commands/list.js';
import { viewCommand } from './commands/view.js';
import { editCommand } from './commands/edit.js';
import { statusCommand } from './commands/status.js';
import { registerSearchCommand } from './commands/search.js';
import { registerDiffCommand } from './commands/diff.js';
import { registerExportCommand } from './commands/export.js';
import { registerImportCommand } from './commands/import.js';
import { registerTemplateCommand } from './commands/template.js';
import { registerValidateCommand } from './commands/validate.js';
import { registerHookCommand } from './commands/hook.js';
import { loginCommand } from './commands/login.js';
import { indexCommand } from './commands/index.js';
import { autoIndexCommand } from './commands/auto-index.js';
import { cleanupCommand } from './commands/cleanup.js';
import { registerConfigCommands } from './commands/config.js';

import setupAuthCommand from './commands/auth.js';
import setupUsersCommand from './commands/users.js';
import setupStorageCommand from './commands/storage.js';
import { registerGeographyCommand } from './commands/geography.js';
// import { registerStorageConfigCommand } from './commands/storage-config.js';
import { CentralConfigManager } from '@civicpress/core';
import { infoCommand } from './commands/info.js';
import notifyCommand from './commands/notify.js';
import { registerBackupCommand } from './commands/backup.js';
import { registerRecordsCommand } from './commands/records.js';
import { registerDiagnoseCommand } from './commands/diagnose.js';

// Set logger options immediately to prevent warnings during config loading
CentralConfigManager.setLoggerOptions({
  json: process.argv.includes('--json'),
  silent: process.argv.includes('--silent'),
  quiet: process.argv.includes('--quiet'),
  verbose: process.argv.includes('--verbose'),
  noColor: process.argv.includes('--no-color'),
});

const cli = cac('civic');

// Global options for silent mode
cli.option('--silent', 'Suppress all output except errors');
cli.option('--quiet', 'Suppress info messages (show only errors and warnings)');
cli.option('--verbose', 'Show verbose output including debug messages');
cli.option('--json', 'Output as JSON');
cli.option('--no-color', 'Disable colored output');

cli.version('1.0.0').help();

// Add commands
initCommand(cli);
createCommand(cli);
commitCommand(cli);
historyCommand(cli);
listCommand(cli);
viewCommand(cli);
editCommand(cli);
statusCommand(cli);
registerSearchCommand(cli);
registerDiffCommand(cli);
registerExportCommand(cli);
registerImportCommand(cli);
registerTemplateCommand(cli);
registerValidateCommand(cli);
registerHookCommand(cli);
loginCommand(cli);
indexCommand(cli);
autoIndexCommand(cli);
cleanupCommand(cli);
registerConfigCommands(cli);
registerBackupCommand(cli);
registerRecordsCommand(cli);
registerDiagnoseCommand(cli);

infoCommand(cli);

// Setup auth commands
setupAuthCommand(cli);

// Setup users commands
setupUsersCommand(cli);

// Setup storage commands
setupStorageCommand(cli);

// Setup geography commands
registerGeographyCommand(cli);

// Setup storage configuration commands
// registerStorageConfigCommand(cli); // Temporarily disabled due to import issues

// Setup notification commands
notifyCommand(cli);

// Parse and run
cli.parse();
