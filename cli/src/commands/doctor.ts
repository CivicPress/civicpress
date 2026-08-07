import { CAC } from 'cac';
import { collectEnvStatus, toChecks } from '../utils/env-status.js';

/**
 * `civic doctor` — an environment preflight. Answers "will this instance run,
 * and is it safe to expose?" for both a new dev ("why isn't transcription
 * working?") and a deployer ("am I ready to go public?"). Exits non-zero if any
 * hard problem (a `fail`) is found, so it can gate a deploy script.
 */
export function registerDoctorCommand(cli: CAC) {
  cli
    .command(
      'doctor',
      'Check the environment for running a CivicPress instance (deps, secret, modules)'
    )
    .option('--json', 'Output as JSON')
    .action(async (options: { json?: boolean }) => {
      const status = collectEnvStatus();
      const checks = toChecks(status);
      const failed = checks.filter((c) => c.status === 'fail');
      const warned = checks.filter((c) => c.status === 'warn');

      if (options.json) {
        // Emit pure JSON to stdout directly: cliSuccess keys off the *global*
        // --json mode (set via withCli), which this standalone command does not
        // use, so it would otherwise print a human line and break the JSON.
        process.stdout.write(
          JSON.stringify({ ok: failed.length === 0, status, checks }, null, 2) +
            '\n'
        );
        if (failed.length) process.exit(1);
        return;
      }

      const icon = (st: string) =>
        st === 'ok' ? '✓' : st === 'warn' ? '⚠' : '✗';
      process.stdout.write('\n  civic doctor — environment check\n\n');
      for (const c of checks) {
        process.stdout.write(
          `  ${icon(c.status)} ${c.label.padEnd(26)} ${c.detail}\n`
        );
        if (c.hint && c.status !== 'ok') {
          process.stdout.write(`      → ${c.hint}\n`);
        }
      }
      const summary = failed.length
        ? `✗ ${failed.length} problem(s) to fix`
        : warned.length
          ? `⚠ ${warned.length} warning(s)`
          : '✓ all good';
      process.stdout.write(
        `\n  ${summary} — ${status.productionPosture ? 'production' : 'development'} posture\n\n`
      );
      if (failed.length) process.exit(1);
    });
}
