import { WorkflowConfigManager } from '@civicpress/core';
import { HttpError } from '../../utils/http-error.js';

/**
 * FA-API-008 (separation of duties). Enforce that `userRole` is allowed to land
 * a record of `type` at `toStatus` by moving FROM `fromStatus`. Only
 * workflow-CONTROLLED statuses (e.g. approved/archived) are gated; statuses
 * outside the transition graph (draft/published) pass through unchecked.
 *
 * Shared by every write path that can set a status directly — create, update,
 * AND the draft create/update paths (POST /api/records → createDraft, which
 * previously stored `status` verbatim, then publish-with-empty-body used it as
 * the final status, bypassing the review chain). Throws HttpError(403) on a
 * disallowed transition.
 */
export async function assertStatusWritableByRole(
  workflowManager: WorkflowConfigManager,
  params: {
    fromStatus: string;
    toStatus: string;
    type: string;
    userRole: string;
  }
): Promise<void> {
  const { fromStatus, toStatus, userRole } = params;
  if (fromStatus === toStatus) return;
  const controlled = await workflowManager.getControlledStatuses();
  if (!controlled.has(toStatus)) return;
  const check = await workflowManager.validateTransition(
    fromStatus,
    toStatus,
    userRole
  );
  if (!check.valid) {
    throw new HttpError(
      403,
      check.reason ||
        `Invalid status transition from '${fromStatus}' to '${toStatus}' for role '${userRole}'`,
      'INVALID_STATUS_TRANSITION'
    );
  }
}
