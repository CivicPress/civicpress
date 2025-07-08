import { createLogger, setLogger } from '@civicpress/core';

export interface GlobalOptions {
  silent?: boolean;
  quiet?: boolean;
  verbose?: boolean;
  json?: boolean;
  noColor?: boolean;
}

export function initializeLogger(options: GlobalOptions): void {
  const logger = createLogger({
    silent: options.silent,
    quiet: options.quiet,
    verbose: options.verbose,
    json: options.json,
    noColor: options.noColor,
  });
  setLogger(logger);
}

export function getGlobalOptionsFromArgs(): GlobalOptions {
  const args = process.argv;
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
