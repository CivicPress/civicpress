import { Request, Response, NextFunction } from 'express';
import { AuthConfigManager } from '@civicpress/core';

/**
 * Enforce `security.requireHttps` from the auth config.
 *
 * The flag was declared in AuthConfig, documented, and defaulted — but nothing
 * ever read it. An operator who set `requireHttps: true` got no enforcement at
 * all, which is worse than not offering the option: it reads as a control while
 * session tokens and API keys keep travelling in the clear.
 *
 * Defaults to OFF, so enabling it is a deliberate act and this middleware is a
 * no-op for every existing deployment.
 *
 * Scheme detection: behind a reverse proxy the real scheme arrives in
 * `x-forwarded-proto`, and Express only honours it (via `req.secure`) when
 * `trust proxy` is configured — which setupMiddleware does from the
 * TRUST_PROXY env var. We consult `req.secure` first and fall back to reading
 * the header directly, so a proxy deployment that has TRUST_PROXY set behaves
 * correctly and one that doesn't still isn't locked out by a false negative.
 *
 * Health checks are exempt: a load balancer probing over plain HTTP must not be
 * told the instance is unhealthy and pull it out of rotation.
 */
export function requireHttpsMiddleware(healthPath: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    let enabled = false;
    try {
      enabled =
        AuthConfigManager.getInstance().getConfig().security?.requireHttps ===
        true;
    } catch {
      // Config not loaded — fail OPEN. This is a transport hardening opt-in,
      // not an authentication control, and refusing every request because the
      // config hasn't loaded yet would be a self-inflicted outage.
      enabled = false;
    }

    if (!enabled) {
      next();
      return;
    }

    if (req.path.startsWith(healthPath)) {
      next();
      return;
    }

    const forwardedProto = String(
      req.headers['x-forwarded-proto'] ?? ''
    )
      .split(',')[0]
      .trim()
      .toLowerCase();
    const isSecure = req.secure || forwardedProto === 'https';

    if (isSecure) {
      next();
      return;
    }

    res.status(403).json({
      success: false,
      error: 'HTTPS is required',
    });
  };
}
