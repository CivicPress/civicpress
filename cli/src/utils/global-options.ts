import { Logger } from '@civicpress/core';

export interface GlobalOptions {
  silent?: boolean;
  quiet?: boolean;
  verbose?: boolean;
  json?: boolean;
  noColor?: boolean;
}

export function initializeLogger(): Logger {
  return new Logger();
}

export function getGlobalOptionsFromArgs(): GlobalOptions {
  const args = (globalThis as any).process?.argv || [];
  const options: GlobalOptions = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case '--silent':
        options.silent = true;
        break;
      case '--quiet':
        options.quiet = true;
        break;
      case '--verbose':
        options.verbose = true;
        break;
      case '--json':
        options.json = true;
        break;
      case '--no-color':
        options.noColor = true;
        break;
    }
  }

  return options;
}
