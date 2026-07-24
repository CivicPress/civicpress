import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { withCli } from '../with-cli.js';
import * as globalOptions from '../global-options.js';
import * as cliOutput from '../cli-output.js';

/**
 * The wrapper's job is to state, once, two rules that were previously restated
 * (or missed) in every one of ~74 handlers:
 *
 *  - `initializeCliOutput` runs before anything can emit.
 *  - failures are reported via `cliError`, never `logger.error`, because Logger
 *    suppresses itself under `--json` and a command reporting through it exits
 *    1 with no output at all.
 */
describe('withCli', () => {
  let exitSpy: any;

  beforeEach(() => {
    exitSpy = vi
      .spyOn(process, 'exit')
      .mockImplementation(((code?: number) => {
        throw new Error(`__exit__:${code}`);
      }) as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does no work until the action actually runs', () => {
    const initSpy = vi.spyOn(globalOptions, 'initializeCliOutput');

    withCli(
      { operation: 'noop', errorMessage: 'x', errorCode: 'X' },
      async () => {}
    );

    // Registration-time side effects would break the CLI's registration-only
    // unit tests, several of which assert process.exit is never called while
    // commands are being registered.
    expect(initSpy).not.toHaveBeenCalled();
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it('initializes CLI output BEFORE starting the operation', async () => {
    const order: string[] = [];
    vi.spyOn(globalOptions, 'initializeCliOutput').mockImplementation(() => {
      order.push('initializeCliOutput');
    });
    vi.spyOn(cliOutput, 'cliStartOperation').mockImplementation((() => {
      order.push('cliStartOperation');
      return () => order.push('endOperation');
    }) as never);

    await withCli(
      { operation: 'view', errorMessage: 'x', errorCode: 'X' },
      async () => {
        order.push('handler');
      }
    )();

    expect(order).toEqual([
      'initializeCliOutput',
      'cliStartOperation',
      'handler',
      'endOperation',
    ]);
  });

  it('passes the resolved context and the command arguments through', async () => {
    const seen: unknown[] = [];

    await withCli<[string, { raw?: boolean }]>(
      { operation: 'view', errorMessage: 'x', errorCode: 'X' },
      async (ctx, record, options) => {
        seen.push(ctx.globalOptions, ctx.logger, record, options);
      }
    )('bylaw-001', { raw: true });

    expect(seen[0]).toBeDefined(); // globalOptions
    expect(seen[1]).toBeDefined(); // logger
    expect(seen[2]).toBe('bylaw-001');
    expect(seen[3]).toEqual({ raw: true });
  });

  it('reports a thrown error through cliError and exits 1', async () => {
    const errorSpy = vi
      .spyOn(cliOutput, 'cliError')
      .mockImplementation(() => {});

    await expect(
      withCli(
        {
          operation: 'view',
          errorMessage: 'Failed to view record',
          errorCode: 'VIEW_FAILED',
        },
        async () => {
          throw new Error('boom');
        }
      )()
    ).rejects.toThrow('__exit__:1');

    expect(errorSpy).toHaveBeenCalledWith(
      'Failed to view record',
      'VIEW_FAILED',
      expect.objectContaining({ error: 'boom' }),
      'view'
    );
  });

  it('merges spec.details into the envelope without losing the error', async () => {
    const errorSpy = vi
      .spyOn(cliOutput, 'cliError')
      .mockImplementation(() => {});

    await expect(
      withCli(
        {
          operation: 'backup',
          errorMessage: 'Backup failed',
          errorCode: 'BACKUP_FAILED',
          details: () => ({ source: 'records' }),
        },
        async () => {
          throw new Error('disk full');
        }
      )()
    ).rejects.toThrow('__exit__:1');

    expect(errorSpy).toHaveBeenCalledWith(
      'Backup failed',
      'BACKUP_FAILED',
      { error: 'disk full', source: 'records' },
      'backup'
    );
  });

  it('stringifies a non-Error throw rather than reporting undefined', async () => {
    const errorSpy = vi
      .spyOn(cliOutput, 'cliError')
      .mockImplementation(() => {});

    await expect(
      withCli(
        { operation: 'op', errorMessage: 'm', errorCode: 'C' },
        async () => {
          throw 'a bare string';
        }
      )()
    ).rejects.toThrow('__exit__:1');

    expect(errorSpy).toHaveBeenCalledWith(
      'm',
      'C',
      expect.objectContaining({ error: 'a bare string' }),
      'op'
    );
  });

  it('ends the operation on the success path', async () => {
    const end = vi.fn();
    vi.spyOn(cliOutput, 'cliStartOperation').mockImplementation(
      (() => end) as never
    );

    await withCli(
      { operation: 'op', errorMessage: 'm', errorCode: 'C' },
      async () => {}
    )();

    expect(end).toHaveBeenCalledTimes(1);
  });
});
