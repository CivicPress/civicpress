/**
 * Error narrowing helpers for UI composables / stores / components.
 *
 * The `catch (err: unknown)` + `err.message` pattern was scattered across ~40
 * UI files; this module centralizes the narrow so consumers can do
 * `catch (err: unknown) { errorMessage(err) }` and stay typed.
 *
 * Errors thrown from `civicApi` (the ofetch-based plugin) are shaped like
 * `{ status, statusText, data, message, correlationId, errorCode }` —
 * `apiErrorMessage` extracts the most user-facing field. For raw `Error`
 * instances, `errorMessage` returns `.message`. For everything else it
 * falls back to `String(err)`.
 */

/** Shape thrown by `civicApi`'s onResponseError handler. */
export interface ApiErrorLike {
  status?: number;
  statusText?: string;
  data?: unknown;
  message?: string;
  correlationId?: string;
  errorCode?: string;
  requestId?: string;
}

/** Extract a user-facing message from any thrown value. */
export function errorMessage(err: unknown, fallback = 'Unknown error'): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  if (err && typeof err === 'object') {
    const e = err as ApiErrorLike;
    if (typeof e.message === 'string' && e.message) return e.message;
  }
  return fallback;
}

/** Type guard for the api-error shape thrown by civicApi. */
export function isApiError(err: unknown): err is ApiErrorLike {
  return (
    !!err &&
    typeof err === 'object' &&
    ('status' in err || 'data' in err || 'message' in err)
  );
}

/** Extract HTTP status code from a thrown api-error, if present. */
export function errorStatus(err: unknown): number | undefined {
  if (isApiError(err) && typeof err.status === 'number') return err.status;
  return undefined;
}
