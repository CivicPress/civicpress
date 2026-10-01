/**
 * Running a diagnostic check against a deadline.
 */

/** The longest any check may be given, whoever asks. */
export const MAX_CHECK_TIMEOUT_MS = 300_000;

/**
 * A usable timeout: `requested` if it is a positive, finite number, capped at
 * the maximum; otherwise `fallback`.
 *
 * The HTTP route validates this value (1 s to 5 min), but the route is not the
 * only caller — the CLI passes `parseInt(option)` straight through — and a
 * timer's delay is not something to take on trust. Node turns a delay above
 * 2^31-1, below 1, or NaN into 1 ms, so without this an absurd timeout made
 * every check report that it had timed out.
 */
export function boundedTimeout(requested: unknown, fallback: number): number {
  if (typeof requested !== 'number' || !Number.isFinite(requested)) {
    return fallback;
  }
  if (requested <= 0) return fallback;
  // A comparison rather than Math.min: CodeQL's resource-exhaustion query
  // recognises the former as an upper bound and treats the latter as a
  // pass-through, so this shape is what keeps the timer below off its list.
  if (requested > MAX_CHECK_TIMEOUT_MS) return MAX_CHECK_TIMEOUT_MS;
  return requested;
}

/**
 * Settle with `work`, or reject with `onTimeout()` if it takes longer than
 * `ms`. The timer is CLEARED when `work` settles first.
 *
 * The code this replaces raced `work` against a timer and then let the timer
 * run: a check that finished in 5 ms left a 30-second timer behind it, holding
 * its closure and keeping the process alive.
 */
export async function withDeadline<T>(
  work: Promise<T>,
  ms: number,
  onTimeout: () => unknown
): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(onTimeout()), ms);
  });

  try {
    return await Promise.race([work, deadline]);
  } finally {
    clearTimeout(timer);
  }
}
