import { CAC } from 'cac';
import { spawn } from 'child_process';
import { createRequire } from 'module';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';
import * as path from 'path';
import { collectEnvStatus } from '../utils/env-status.js';
import { cliError } from '../utils/cli-output.js';

/**
 * Locate the built @civicpress/api entry to run as the server. Tries package
 * resolution first (published / hoisted installs), then walks up from this
 * file to find the monorepo's `modules/api/dist/index.js` (dev + Docker).
 */
function resolveApiEntry(): string | null {
  try {
    return createRequire(import.meta.url).resolve('@civicpress/api');
  } catch {
    // Not resolvable as a package — fall back to the monorepo layout.
  }
  let dir = path.dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 8; i++) {
    const candidate = path.join(dir, 'modules', 'api', 'dist', 'index.js');
    if (existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

export function registerServeCommand(cli: CAC) {
  cli
    .command(
      'serve',
      'Run the CivicPress server (API + realtime + transcription + broadcast-box)'
    )
    .option('--port <port>', 'Port for the API (default 3000 / $PORT)')
    .action(async (options: { port?: string }) => {
      const port = options.port || process.env.PORT || '3000';

      const apiEntry = resolveApiEntry();
      if (!apiEntry) {
        cliError(
          'Could not locate the @civicpress/api server. Build it first ' +
            '(`pnpm --filter @civicpress/api build`) or run from the monorepo.',
          'API_NOT_FOUND',
          undefined,
          'serve'
        );
        process.exit(1);
      }

      // Ready-banner: surface what will actually come up (config + env derived),
      // so an optional subsystem that silently idles (missing whisper/ffmpeg,
      // module not enabled) is visible at a glance instead of a mystery.
      const s = collectEnvStatus();
      const transcriptionState = s.transcription.enabled
        ? s.transcription.whisperReady
          ? '✓ on'
          : '⚠ on (whisper missing → idles)'
        : '· off';
      const banner = [
        '',
        '  CivicPress — starting server',
        `  ├─ API             http://localhost:${port}`,
        `  ├─ realtime WS     ws://localhost:3001/realtime`,
        `  ├─ modules         ${s.modules.join(', ') || '(none)'}`,
        `  ├─ broadcast-box   ${s.broadcastBox ? '✓ on' : '· off'}`,
        `  ├─ transcription   ${transcriptionState}`,
        `  ├─ ffmpeg/ffprobe  ${s.ffmpeg && s.ffprobe ? '✓' : '✗ (broadcast-box/transcription need it)'}`,
        `  ├─ secret          ${s.secret.configured ? `✓ ${s.secret.source}` : '✗ not configured — run `civic doctor`'}`,
        `  └─ auth            ${s.simulatedAuth ? '⚠ SIMULATED (dev backdoor)' : s.productionPosture ? 'production' : 'development'}`,
        '',
      ];
      process.stdout.write(banner.join('\n') + '\n');

      const child = spawn(process.execPath, [apiEntry], {
        stdio: 'inherit',
        env: { ...process.env, PORT: String(port) },
      });
      const forward = (sig: 'SIGINT' | 'SIGTERM') => () => child.kill(sig);
      process.on('SIGINT', forward('SIGINT'));
      process.on('SIGTERM', forward('SIGTERM'));
      child.on('error', (err) => {
        cliError(
          `Failed to start the server: ${err.message}`,
          'SERVE_FAILED',
          undefined,
          'serve'
        );
        process.exit(1);
      });
      child.on('exit', (code) => process.exit(code ?? 0));
    });
}
