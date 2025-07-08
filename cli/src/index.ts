#!/usr/bin/env node

import { cac } from 'cac';
import chalk from 'chalk';
import { initCommand } from './commands/init';
import { createCommand } from './commands/create';
import { commitCommand } from './commands/commit';
import { historyCommand } from './commands/history';
import { listCommand } from './commands/list';
import { viewCommand } from './commands/view';
import { editCommand } from './commands/edit';
import { statusCommand } from './commands/status';
import { registerSearchCommand } from './commands/search';
import { registerDiffCommand } from './commands/diff';
import { registerExportCommand } from './commands/export';
import { registerTemplateCommand } from './commands/template';
import { registerValidateCommand } from './commands/validate';

const cli = cac('civic');

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

// Parse and run
cli.parse();
