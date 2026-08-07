import { spawnSync } from 'child_process';
import { existsSync } from 'fs';
import * as path from 'path';
import { CentralConfigManager } from '@civicpress/core';

/**
 * Runtime/environment inspection shared by `civic doctor` (a full preflight
 * checklist) and `civic serve` (a compact ready-banner). Both need to answer
 * the same questions — is ffmpeg here, is a secret configured, which modules
 * will mount — so the crash-safe "silent idle" of optional subsystems is
 * visible instead of a mystery.
 */

export interface EnvCheck {
  label: string;
  status: 'ok' | 'warn' | 'fail';
  detail: string;
  hint?: string;
}

export interface EnvStatus {
  node: string;
  port: number;
  nodeEnv: string;
  productionPosture: boolean;
  simulatedAuth: boolean;
  secret: { configured: boolean; source: string };
  ffmpeg: boolean;
  ffprobe: boolean;
  modules: string[];
  broadcastBox: boolean;
  transcription: {
    enabled: boolean;
    whisperReady: boolean;
    binary?: string;
    model?: string;
  };
}

function safe<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

/** True if a binary is runnable on PATH (probes `<bin> -version`). */
function binAvailable(bin: string): boolean {
  try {
    return !spawnSync(bin, ['-version'], { stdio: 'ignore' }).error;
  } catch {
    return false;
  }
}

export function collectEnvStatus(): EnvStatus {
  const nodeEnv = process.env.NODE_ENV || '';
  const isDev = nodeEnv === 'development' || nodeEnv === 'test';
  // An unset NODE_ENV is treated as production by the auth/secret gates.
  const productionPosture = !isDev;
  const simulatedAuth =
    isDev && process.env.CIVIC_ALLOW_SIMULATED_AUTH === 'true';

  let secretConfigured = false;
  let secretSource = 'none';
  if (process.env.CIVICPRESS_SECRET) {
    secretConfigured = true;
    secretSource = 'CIVICPRESS_SECRET';
  } else if (
    process.env.CIVICPRESS_SECRET_FILE &&
    existsSync(process.env.CIVICPRESS_SECRET_FILE)
  ) {
    secretConfigured = true;
    secretSource = 'CIVICPRESS_SECRET_FILE';
  } else {
    const secretsYml = safe(
      () => path.join(CentralConfigManager.getSystemDataDir(), 'secrets.yml'),
      ''
    );
    if (secretsYml && existsSync(secretsYml)) {
      secretConfigured = true;
      secretSource = 'secrets.yml';
    }
  }

  const modules = safe(() => CentralConfigManager.getModules(), []);
  const tConfig = safe(
    () => CentralConfigManager.getTranscriptionConfig(),
    undefined
  ) as
    | { enabled?: boolean; whisper_cpp?: { binary?: string; model?: string } }
    | undefined;
  const whisperBinary = tConfig?.whisper_cpp?.binary;
  const whisperModel = tConfig?.whisper_cpp?.model;
  const whisperReady = !!(
    whisperBinary &&
    whisperModel &&
    existsSync(whisperBinary) &&
    existsSync(whisperModel)
  );

  return {
    node: process.version,
    port: parseInt(process.env.PORT || '3000', 10),
    nodeEnv: nodeEnv || '(unset)',
    productionPosture,
    simulatedAuth,
    secret: { configured: secretConfigured, source: secretSource },
    ffmpeg: binAvailable('ffmpeg'),
    ffprobe: binAvailable('ffprobe'),
    modules,
    broadcastBox: modules.includes('broadcast-box'),
    transcription: {
      enabled: !!tConfig?.enabled,
      whisperReady,
      binary: whisperBinary,
      model: whisperModel,
    },
  };
}

/** Ordered checks for `civic doctor`, each with a fix hint when not OK. */
export function toChecks(s: EnvStatus): EnvCheck[] {
  const checks: EnvCheck[] = [];
  const mediaNeeded = s.broadcastBox || s.transcription.enabled;

  const nodeMajor = parseInt((s.node || 'v0').slice(1).split('.')[0], 10);
  checks.push({
    label: 'Node.js',
    status: nodeMajor >= 22 ? 'ok' : 'warn',
    detail: s.node,
    hint: nodeMajor >= 22 ? undefined : 'CivicPress targets Node >= 22.',
  });

  checks.push({
    label: 'Signing secret',
    status: s.secret.configured ? 'ok' : s.productionPosture ? 'fail' : 'warn',
    detail: s.secret.configured
      ? `configured (${s.secret.source})`
      : 'not configured',
    hint: s.secret.configured
      ? undefined
      : 'Run `civic init` (it generates one), or set CIVICPRESS_SECRET (>=64 hex) / CIVICPRESS_SECRET_FILE.',
  });

  checks.push({
    label: 'Auth posture',
    status: s.simulatedAuth ? 'fail' : 'ok',
    detail: s.simulatedAuth
      ? 'SIMULATED AUTH ENABLED (dev backdoor)'
      : `${s.productionPosture ? 'production' : 'development'} — real auth`,
    hint: s.simulatedAuth
      ? 'Unset CIVIC_ALLOW_SIMULATED_AUTH before exposing this instance publicly.'
      : undefined,
  });

  checks.push({
    label: 'ffmpeg + ffprobe',
    status: s.ffmpeg && s.ffprobe ? 'ok' : mediaNeeded ? 'fail' : 'warn',
    detail: `ffmpeg ${s.ffmpeg ? '✓' : '✗'}  ffprobe ${s.ffprobe ? '✓' : '✗'}`,
    hint:
      s.ffmpeg && s.ffprobe
        ? undefined
        : 'Install ffmpeg — required by broadcast-box redaction and transcription.',
  });

  if (s.transcription.enabled) {
    checks.push({
      label: 'Transcription (whisper.cpp)',
      status: s.transcription.whisperReady ? 'ok' : 'warn',
      detail: s.transcription.whisperReady
        ? 'binary + model present'
        : 'enabled but binary/model missing (worker idles)',
      hint: s.transcription.whisperReady
        ? undefined
        : `Check transcription.whisper_cpp.binary (${s.transcription.binary || 'unset'}) and .model (${s.transcription.model || 'unset'}).`,
    });
  }

  checks.push({
    label: 'Modules',
    status: 'ok',
    detail: s.modules.length ? s.modules.join(', ') : '(none)',
  });

  return checks;
}
