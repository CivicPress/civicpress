import { Logger } from '@civicpress/core';
import { cliOutput, CliOutputOptions } from './cli-output.js';

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

export function initializeCliOutput(options: GlobalOptions): void {
  const cliOptions: CliOutputOptions = {
    silent: options.silent || options.quiet,
    json: options.json,
    noColor: options.noColor,
    verbose: options.verbose,
  };

  cliOutput.setOptions(cliOptions);
}

export function getCliOutputOptions(): CliOutputOptions {
  const globalOptions = getGlobalOptionsFromArgs();
  return {
    silent: globalOptions.silent || globalOptions.quiet,
    json: globalOptions.json,
    noColor: globalOptions.noColor,
    verbose: globalOptions.verbose,
  };
}
