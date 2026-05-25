/**
 * HttpError — typed HTTP-error class.
 *
 * Phase 2d W3-T2: replaces the prior `(error as any).statusCode = N;
 * (error as any).code = 'X'; throw error;` mutation idiom that appeared
 * ~157 times across modules/api/src/routes/*.ts and middleware. The
 * mutation pattern silently typed `error` as `Error & { statusCode?: any;
 * code?: any }`, which is exactly what the augmentation was trying to
 * fix; throwing a proper `HttpError` instead gives the catch sites a
 * typed narrowing path via `err instanceof HttpError`.
 *
 * Usage:
 *   throw new HttpError(404, 'Record not found', 'RECORD_NOT_FOUND');
 *   throw new HttpError(503, 'Git engine unavailable', 'GIT_ENGINE_UNAVAILABLE');
 *   throw new HttpError(400, 'Invalid input');                 // code optional
 *
 * In catch sites:
 *   try { ... } catch (err: unknown) {
 *     if (err instanceof HttpError) {
 *       res.status(err.statusCode).json({ code: err.code, message: err.message });
 *       return;
 *     }
 *     // ... handle other error shapes
 *   }
 *
 * Or via the `handleApiError` helper in api-logger.ts, which now branches
 * on `err instanceof HttpError` (was `'statusCode' in error` with
 * `(error as any).statusCode` access).
 */

export class HttpError extends Error {
  readonly statusCode: number;
  readonly code?: string;
  readonly details?: Record<string, unknown>;

  constructor(
    statusCode: number,
    message: string,
    code?: string,
    options?: { cause?: unknown; details?: Record<string, unknown> }
  ) {
    super(message, options);
    this.name = 'HttpError';
    this.statusCode = statusCode;
    if (code !== undefined) this.code = code;
    if (options?.details !== undefined) this.details = options.details;

    // Preserve prototype chain across CommonJS / ES-module boundaries so
    // `instanceof HttpError` works in catch sites that received the error
    // through different module-resolution paths.
    Object.setPrototypeOf(this, HttpError.prototype);
  }
}

/**
 * Type guard for HttpError. Useful in places where `instanceof` doesn't
 * work due to multiple-module-instance issues (rare; mostly defensive).
 */
export function isHttpError(err: unknown): err is HttpError {
  return (
    err instanceof HttpError ||
    (err instanceof Error &&
      err.name === 'HttpError' &&
      typeof (err as { statusCode?: unknown }).statusCode === 'number')
  );
}
