/**
 * Error narrowing helpers for `catch (e: unknown)` sites.
 *
 * Phase 2d W3-T3: introduced when the `catch (X: any)` sweep across
 * core/src converted to `catch (X: unknown)` and surfaced ~70 accesses
 * to `.message` / `.stack` / `.code` / `.name` on `unknown`. Using these
 * helpers keeps catch sites readable without inlining the
 * `error instanceof Error ? ... : ...` check at every site, and
 * makes the post-W3 lint rule (`no-explicit-any: error`) work without
 * regressions.
 *
 * Usage:
 *   try { ... } catch (error: unknown) {
 *     logger.warn('failed', { message: errorMessage(error), code: errorCode(error) });
 *   }
 */

/**
 * Return `.message` if `error` is an Error or carries a `message` field
 * (some modules reject with structured payloads instead of Error
 * instances); otherwise `String(error)`.
 */
export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  if (error === null || error === undefined) return '';
  if (
    typeof error === 'object' &&
    'message' in error &&
    typeof (error as { message?: unknown }).message === 'string'
  ) {
    return (error as { message: string }).message;
  }
  return String(error);
}

/** Return `.stack` if `error` is an Error; otherwise `undefined`. */
export function errorStack(error: unknown): string | undefined {
  return error instanceof Error ? error.stack : undefined;
}

/**
 * Return `.code` if present on the error. Many libraries (sqlite3, fs,
 * AWS SDK, etc.) tack a `code` field onto Error instances; some
 * internal modules also reject with structured error objects that
 * aren't `Error` subclasses (e.g. `DiagnosticError` in
 * core/src/diagnostics/). This helper handles both shapes without
 * re-introducing `as any`.
 */
export function errorCode(error: unknown): string | undefined {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = (error as { code?: unknown }).code;
    return typeof code === 'string' ? code : undefined;
  }
  return undefined;
}

/** Return `.name` if `error` is an Error; otherwise `'UnknownError'`. */
export function errorName(error: unknown): string {
  if (error instanceof Error) return error.name;
  return 'UnknownError';
}

/**
 * Pull a `statusCode` field off an arbitrary error (some HTTP libraries
 * attach this; structured non-Error rejection payloads also use it).
 * Returns `undefined` if not present or not a number.
 */
export function errorStatusCode(error: unknown): number | undefined {
  if (typeof error === 'object' && error !== null && 'statusCode' in error) {
    const sc = (error as { statusCode?: unknown }).statusCode;
    return typeof sc === 'number' ? sc : undefined;
  }
  return undefined;
}

/**
 * Convenience: return the error as-is when it's an Error, or wrap it
 * in a new Error preserving the string form. Useful at boundaries
 * that expect `Error` but receive `unknown`.
 */
export function toError(error: unknown): Error {
  if (error instanceof Error) return error;
  return new Error(typeof error === 'string' ? error : String(error));
}
