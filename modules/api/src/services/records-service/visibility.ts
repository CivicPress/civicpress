import { CentralConfigManager, userCan } from '@civicpress/core';
import type { AuthUser } from '@civicpress/core';

/**
 * The permission that grants sight of records in a non-public status.
 *
 * Until 2026-09-30 the published-only gate asked one question — "is there a
 * user?" — and `POST /users/register` hands anyone a `public` account with no
 * verification and no switch. Measured: a self-registered account listed every
 * status, read a draft's full body where anonymous got a 404, and got the same
 * from search. Logging in was the whole gate, and logging in was free.
 *
 * The line is now a permission, deliberately separate from `records:view`
 * (which `public` holds). The shipped roles grant it to admin and clerk; an
 * instance with its own `roles.yml` adds the line to the roles that review.
 */
export const VIEW_UNPUBLISHED = 'records:view_unpublished';

/** May this caller see records whose status is not public? */
export async function canSeeUnpublished(
  user: AuthUser | undefined
): Promise<boolean> {
  if (!user) return false;
  return userCan(user, VIEW_UNPUBLISHED);
}

export type StatusGate = {
  visible: 'all' | 'some' | 'nothing';
  status: string | undefined;
};

/**
 * THE published-only gate. Every read of the `records` table that a caller
 * without `records:view_unpublished` can reach goes through this one function
 * — list, search and summary all did their own thing before, and that is
 * precisely how the hole stayed open.
 *
 * The read paths used to apply no status filter at all, on the stated grounds
 * that location implies publication: "table location (records table) determines
 * published state". Nothing enforced it. `RecordStore.createRecord` inserts
 * `status || 'draft'`, and `IndexingService.syncToDatabase` copies every on-disk
 * index entry in whatever status it carries — a sync the API runs at startup.
 *
 * Fail-closed: only statuses whose config says `public: true` are visible, and
 * naming a non-public status yields NOTHING rather than falling through to an
 * unfiltered query. Callers holding the permission are untouched here;
 * per-record permissions still apply above.
 */
export async function visibleStatusesFor(
  user: AuthUser | undefined,
  requestedStatus: string | undefined
): Promise<StatusGate> {
  if (await canSeeUnpublished(user)) {
    return { visible: 'all', status: requestedStatus };
  }

  const publicStatuses = CentralConfigManager.getPublicRecordStatuses();
  const requested = requestedStatus
    ? requestedStatus
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    : null;
  const allowed = requested
    ? requested.filter((s) => publicStatuses.includes(s))
    : publicStatuses;

  if (allowed.length === 0) return { visible: 'nothing', status: undefined };
  return { visible: 'some', status: allowed.join(',') };
}

/** Is a single record in a status this caller may see? */
export async function canSeeStatus(
  user: AuthUser | undefined,
  status: unknown
): Promise<boolean> {
  if (CentralConfigManager.getPublicRecordStatuses().includes(String(status))) {
    return true;
  }
  return canSeeUnpublished(user);
}
