// The audit writer an API handler uses: the unified AuditChannel of the
// request's core instance, which writes the activity file AND the
// `audit_logs` table. Until 2026-10-02 every API handler wrote through its own
// `new AuditLogger()` — the file only — so configuration, user, record and
// notification events never reached the table the Activity page now reads.
//
// The entry shape is the activity file's own (`ActivityLogEntry` minus id and
// timestamp), so call sites are unchanged: `auditFor(req).log({...})`.
import type { Request } from 'express';
import { AuditLogger, type AuditChannel } from '@civicpress/core';

export type AuditWriter = Pick<AuditChannel, 'log'>;

/** File-only fallback for a request that reaches a handler without a core instance (tests that mount a router bare). */
const fileOnly = new AuditLogger();
let warnedOnce = false;

export function auditFor(req: Request): AuditWriter {
  const civicPress = req.civicPress;
  if (civicPress) {
    try {
      return civicPress.getContainer().resolve<AuditChannel>('auditChannel');
    } catch {
      // fall through
    }
  }
  if (!warnedOnce) {
    warnedOnce = true;
    console.warn(
      '[audit] no core instance on the request; audit entries go to the activity file only'
    );
  }
  return fileOnly;
}

/** The request's user as an audit actor, or undefined for an anonymous request. */
export function actorOf(
  req: Request
): { id?: number | string; username?: string; role?: string } | undefined {
  const user = req.user as
    | { id?: number | string; username?: string; role?: string }
    | undefined;
  if (!user) return undefined;
  return { id: user.id, username: user.username, role: user.role };
}
