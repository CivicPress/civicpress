/**
 * The address a request came from.
 *
 * `req.ip` is Express's answer, and it honours the application's
 * `trust proxy` setting: behind a proxy that is trusted it is the address the
 * proxy reported, and otherwise it is the address of the socket.
 *
 * This replaces three copies of a function that read the FIRST entry of
 * `X-Forwarded-For` itself. A proxy appends to that header; it does not replace
 * it. The first entry is whatever the client chose to send, so:
 *
 *  - the registration rate limiter, which keys on this address, gave a fresh
 *    allowance to every request that named a fresh one; and
 *  - the `registrationIp` stored with a device, and the address written to the
 *    log beside a refused attempt, were whatever the client said they were.
 */
export function clientIp(req: {
  ip?: string;
  socket?: { remoteAddress?: string };
}): string {
  return req.ip || req.socket?.remoteAddress || 'unknown';
}
