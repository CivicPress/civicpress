#!/usr/bin/env node

import { cac } from 'cac';
import chalk from 'chalk';
import { initCommand } from './commands/init';
import { createCommand } from './commands/create';
import { commitCommand } from './commands/commit';
import { historyCommand } from './commands/history';

const cli = cac('civic');

cli.version('1.0.0').help();

// Add commands
initCommand(cli);
createCommand(cli);
commitCommand(cli);
historyCommand(cli);

// Parse and run
cli.parse();
