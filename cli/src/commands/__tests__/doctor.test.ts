/**
 * Unit + registration tests for `civic doctor` / `civic serve`.
 *
 * `toChecks` is a pure function of an EnvStatus, so its severity logic (what
 * counts as fail vs warn) is pinned here without any filesystem/process I/O.
 * Command registration is pinned the same way the rest of the CLI family is.
 */

import { describe, it, expect } from 'vitest';
import { cac } from 'cac';
import { toChecks, type EnvStatus } from '../../utils/env-status.js';
import { registerServeCommand } from '../serve.js';
import { registerDoctorCommand } from '../doctor.js';

function baseStatus(overrides: Partial<EnvStatus> = {}): EnvStatus {
  return {
    node: 'v22.0.0',
    port: 3000,
    nodeEnv: 'production',
    productionPosture: true,
    simulatedAuth: false,
    secret: { configured: true, source: 'secrets.yml' },
    ffmpeg: true,
    ffprobe: true,
    modules: ['legal-register'],
    broadcastBox: false,
    transcription: { enabled: false, whisperReady: false },
    ...overrides,
  };
}

const byLabel = (checks: ReturnType<typeof toChecks>, label: string) =>
  checks.find((c) => c.label === label);

describe('civic doctor — toChecks severity', () => {
  it('an all-good instance has no failures', () => {
    expect(toChecks(baseStatus()).some((c) => c.status === 'fail')).toBe(false);
  });

  it('missing secret under production posture is a FAIL', () => {
    const checks = toChecks(
      baseStatus({ secret: { configured: false, source: 'none' } })
    );
    expect(byLabel(checks, 'Signing secret')?.status).toBe('fail');
  });

  it('missing secret in development is only a WARN', () => {
    const checks = toChecks(
      baseStatus({
        productionPosture: false,
        secret: { configured: false, source: 'none' },
      })
    );
    expect(byLabel(checks, 'Signing secret')?.status).toBe('warn');
  });

  it('simulated auth is a FAIL', () => {
    const checks = toChecks(baseStatus({ simulatedAuth: true }));
    expect(byLabel(checks, 'Auth posture')?.status).toBe('fail');
  });

  it('missing ffmpeg with broadcast-box enabled is a FAIL', () => {
    const checks = toChecks(
      baseStatus({
        ffmpeg: false,
        ffprobe: false,
        broadcastBox: true,
        modules: ['legal-register', 'broadcast-box'],
      })
    );
    expect(byLabel(checks, 'ffmpeg + ffprobe')?.status).toBe('fail');
  });

  it('missing ffmpeg without any media feature is only a WARN', () => {
    const checks = toChecks(baseStatus({ ffmpeg: false, ffprobe: false }));
    expect(byLabel(checks, 'ffmpeg + ffprobe')?.status).toBe('warn');
  });

  it('transcription enabled but whisper missing warns with a hint', () => {
    const checks = toChecks(
      baseStatus({
        transcription: {
          enabled: true,
          whisperReady: false,
          binary: '/x',
          model: '/y',
        },
      })
    );
    const c = byLabel(checks, 'Transcription (whisper.cpp)');
    expect(c?.status).toBe('warn');
    expect(c?.hint).toBeTruthy();
  });
});

describe('serve + doctor command registration', () => {
  it('registers `serve` with a --port option', () => {
    const cli = cac('civic');
    registerServeCommand(cli);
    const cmd = cli.commands.find((c: any) => c.name === 'serve');
    expect(cmd).toBeTruthy();
    expect((cmd?.options ?? []).map((o: any) => o.name)).toContain('port');
  });

  it('registers `doctor` with a --json option', () => {
    const cli = cac('civic');
    registerDoctorCommand(cli);
    const cmd = cli.commands.find((c: any) => c.name === 'doctor');
    expect(cmd).toBeTruthy();
    expect((cmd?.options ?? []).map((o: any) => o.name)).toContain('json');
  });
});
