#!/usr/bin/env node

import { cac } from 'cac';
import chalk from 'chalk';
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
import { registerTemplateCommand } from './commands/template.js';
import { registerValidateCommand } from './commands/validate.js';
import { registerHookCommand } from './commands/hook.js';
import { getLogger, setLogger, createLogger, LogLevel } from '@civicpress/core';

const cli = cac('civic');

// Global options for silent mode
cli.option('--silent', 'Suppress all output (except errors)');
cli.option('--quiet', 'Suppress info messages (show only errors and warnings)');
cli.option('--verbose', 'Show verbose output including debug messages');
cli.option('--json', 'Output in JSON format');
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
registerTemplateCommand(cli);
registerValidateCommand(cli);
registerHookCommand(cli);

// Parse and run
cli.parse();
