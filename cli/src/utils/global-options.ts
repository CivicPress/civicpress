import { Logger } from '@civicpress/core';
import { cliOutput, CliOutputOptions } from './cli-output.js';

export interface GlobalOptions {
  silent?: boolean;
  quiet?: boolean;
  verbose?: boolean;
  json?: boolean;
  noColor?: boolean;
}

/**
 * Build the per-command Logger with the global flags applied.
 *
 * This used to be `new Logger()` — no options — so the logger's `json` stayed
 * `false` no matter what the user passed. `Logger` already suppresses ALL of
 * its own output in JSON mode (see `logger.ts`: every level early-returns on
 * `this.json`); it was simply never told. The result was that under `--json`
 * every `logger.info()/output()/success()` in a command body still wrote human
 * banners, separators and rendered markdown to stdout, wrapping the single JSON
 * blob emitted by `cliSuccess()` in prose — so `civic view <record> --json`
 * (and the other 12 commands that call this) did not produce parseable stdout.
 * `--silent`/`--quiet`/`--verbose`/`--no-color` were dropped on the floor here
 * for the same reason.
 */
export function initializeLogger(): Logger {
  const options = getGlobalOptionsFromArgs();
  return new Logger({
    json: options.json,
    silent: options.silent,
    quiet: options.quiet,
    verbose: options.verbose,
    noColor: options.noColor,
  });
}

export function getGlobalOptionsFromArgs(): GlobalOptions {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
