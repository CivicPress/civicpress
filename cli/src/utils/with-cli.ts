/**
 * `withCli()` — the shell every command handler repeats.
 *
 * All ~74 handlers open with the same four statements and close with the same
 * catch/finally, varying only in three string literals:
 *
 *     const globalOptions = getGlobalOptionsFromArgs();
 *     initializeCliOutput(globalOptions);
 *     const logger = initializeLogger();
 *     const endOperation = cliStartOperation('view');
 *     try { ... } catch (error) {
 *       cliError('Failed to view record', 'VIEW_FAILED', { error: ... }, 'view');
 *       process.exit(1);
 *     } finally { endOperation(); }
 *
 * Repetition is the mild problem. The sharp one is that the preamble has a
 * REQUIRED ORDER — `initializeCliOutput` must run before anything can emit —
 * and the recovery has required routing: failures go through `cliError`, not
 * `logger.error`, because Logger suppresses itself entirely in JSON mode and a
 * command that reported through it exited 1 with no output at all. Both rules
 * were previously re-stated (or missed) 74 times. Here they are stated once.
 *
 * DELIBERATELY NOT owned by this wrapper, for now: the CivicPress lifecycle.
 * Only 10 of the 31 command files ever call `civic.shutdown()`, several depend
 * on an explicit `process.exit(0)` to terminate at all, 16 of those sit INSIDE
 * a `try` (so they already skip their own `finally`), and `edit` spawns an
 * editor it does not await — a wrapper that shut down or exited on return would
 * kill it. Centralizing that is a real fix, but it is a behavioural change per
 * command and wants its own pass with tests underneath it.
 */

import { Logger } from '@civicpress/core';
import {
  GlobalOptions,
  getGlobalOptionsFromArgs,
  initializeCliOutput,
  initializeLogger,
} from './global-options.js';
import { cliError, cliStartOperation } from './cli-output.js';

/** What the wrapper has already resolved by the time a handler runs. */
export interface CliContext {
  globalOptions: GlobalOptions;
  /** Flag-aware Logger. Suppresses itself under `--json`/`--silent`. */
  logger: Logger;
}

export interface WithCliSpec {
  /** Operation name for `cliStartOperation` and the error envelope, e.g. `view`. */
  operation: string;
  /** Human failure message, e.g. `Failed to view record`. */
  errorMessage: string;
  /** Stable machine code, e.g. `VIEW_FAILED`. */
  errorCode: string;
  /**
   * Extra fields to attach to the error envelope. Merged over the default
   * `{ error: <message> }`, so a spec can add context without losing it.
   */
  details?: (error: unknown) => Record<string, unknown>;
}

/**
 * Wrap a command action with the standard lifecycle.
 *
 * Does no work at import or registration time — only when the action runs.
 * (The registration-only unit tests assert `process.exit` is never called
 * while registering, so a wrapper that acted eagerly would break them, which
 * is the intended guard.)
 */
export function withCli<A extends unknown[]>(
  spec: WithCliSpec,
  handler: (ctx: CliContext, ...args: A) => Promise<void>
): (...args: A) => Promise<void> {
  return async (...args: A): Promise<void> => {
    // Order is load-bearing: cliOutput must know the flags before anything
    // routes through it, including cliStartOperation's own bookkeeping.
    const globalOptions = getGlobalOptionsFromArgs();
    initializeCliOutput(globalOptions);

    const logger = initializeLogger();
    const endOperation = cliStartOperation(spec.operation);

    try {
      await handler({ globalOptions, logger }, ...args);
    } catch (error) {
      // cliError, never logger.error — under --json the Logger emits nothing,
      // so a failure reported through it produces exit 1 with empty output.
      // cliError writes the structured envelope to stderr, keeping stdout a
      // clean single JSON document.
      cliError(
        spec.errorMessage,
        spec.errorCode,
        {
          error: error instanceof Error ? error.message : String(error),
          ...(spec.details ? spec.details(error) : {}),
        },
        spec.operation
      );
      // Matches the existing handlers exactly, including the wart: process.exit
      // terminates synchronously, so the `finally` below does NOT run on this
      // path. Preserved rather than quietly changed — `endOperation` only ends
      // a progress span, and making it run here would alter output on every
      // failing command at the same time as the refactor.
      process.exit(1);
    } finally {
      endOperation();
    }
  };
}
