/**
 * Policy gate for simulated (passwordless) authentication.
 *
 * FA-API-001 / FA-CLI-001 — this MUST fail closed. The previous guards only
 * rejected `NODE_ENV === 'production'`, so a *missing* `NODE_ENV` (the realistic
 * default on a plain `node` / systemd / PM2 deployment) left passwordless
 * admin-token minting wide open to any anonymous caller. The rule here treats
 * anything that is not an explicit dev/test environment as production:
 *
 *   - `NODE_ENV === 'test'`        → allowed (only ever set by the test runner)
 *   - `NODE_ENV === 'development'` → allowed ONLY with `CIVIC_ALLOW_SIMULATED_AUTH=true`
 *   - everything else (incl. unset or `'production'`) → denied
 *
 * The explicit opt-in flag for development stops a dev server that happens to be
 * reachable on a LAN from shipping the passwordless backdoor by default.
 *
 * `env` is injectable so the policy can be unit-tested without mutating the real
 * process environment.
 */
export function isSimulatedAuthEnabled(
  env: NodeJS.ProcessEnv = process.env
): boolean {
  if (env.NODE_ENV === 'test') return true;
  if (env.NODE_ENV === 'development') {
    return env.CIVIC_ALLOW_SIMULATED_AUTH === 'true';
  }
  return false;
}

/** Human-readable reason simulated auth is refused (for logs / API errors). */
export const SIMULATED_AUTH_DISABLED_MESSAGE =
  'Simulated authentication is disabled in this environment ' +
  '(enable only in development with CIVIC_ALLOW_SIMULATED_AUTH=true)';
