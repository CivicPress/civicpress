import type { ApiResponse } from '~/utils/api-response';

/**
 * Broadcast-box operator API client.
 *
 * ⚠️ The broadcast-box endpoints return their payload TOP-LEVEL
 * (`{ success, devices }`, `{ success, enrollment }`, …) — NOT the core
 * `{ success, data }` envelope. Redaction status is the exception: it lives on
 * the CivicPress `session` record, read via the records API (which DOES use
 * `{ success, data }`).
 */

export interface BroadcastDevice {
  id: string; // DB id (a UUID) — the identifier used by device + session routes
  deviceUuid: string; // the appliance's own UUID (NOT for session start)
  name: string;
  roomLocation?: string;
  status: 'enrolled' | 'active' | 'suspended' | 'revoked' | 'decommissioned';
  lastSeenAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface EnrollmentResult {
  deviceUuid: string;
  enrollmentCode: string;
  expiresAt: string;
}

export interface BroadcastSession {
  id: string;
  deviceId: string;
  civicpressSessionId: string;
  status:
    | 'pending'
    | 'recording'
    | 'stopping'
    | 'encoding'
    | 'uploading'
    | 'complete'
    | 'failed';
  startedAt?: string;
  stoppedAt?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export function useBroadcastBox() {
  const { $civicApi } = useNuxtApp();
  const base = '/api/v1/broadcast-box';

  async function listDevices(): Promise<BroadcastDevice[]> {
    const res = (await $civicApi(`${base}/devices`)) as {
      success: boolean;
      devices?: BroadcastDevice[];
    };
    return res.devices ?? [];
  }

  async function enrollDevice(body: {
    name: string;
    roomLocation?: string;
  }): Promise<EnrollmentResult> {
    const res = (await $civicApi(`${base}/devices/enroll`, {
      method: 'POST',
      body,
    })) as { success: boolean; enrollment: EnrollmentResult };
    return res.enrollment;
  }

  async function listSessions(): Promise<BroadcastSession[]> {
    const res = (await $civicApi(`${base}/sessions`)) as {
      success: boolean;
      sessions?: BroadcastSession[];
    };
    return res.sessions ?? [];
  }

  async function quickStartSession(body: {
    deviceId: string;
    title?: string;
    meetingId?: string;
  }): Promise<{ session: BroadcastSession; civicpressSessionId: string }> {
    const res = (await $civicApi(`${base}/sessions/quick-start`, {
      method: 'POST',
      body,
    })) as {
      success: boolean;
      session: BroadcastSession;
      civicpressSessionId: string;
    };
    return { session: res.session, civicpressSessionId: res.civicpressSessionId };
  }

  async function stopSession(id: string): Promise<BroadcastSession> {
    const res = (await $civicApi(`${base}/sessions/${id}/stop`, {
      method: 'POST',
    })) as { success: boolean; session: BroadcastSession };
    return res.session;
  }

  /**
   * Redaction status lives on the CivicPress `session` record at
   * metadata.capture.redaction_status (pending | awaiting_visibility |
   * complete). Undefined = no capture yet. Swallows errors so a missing record
   * never breaks the sessions list.
   */
  async function getRedactionStatus(
    civicpressSessionId: string
  ): Promise<string | undefined> {
    try {
      const res = (await $civicApi(
        `/api/v1/records/${civicpressSessionId}`
      )) as ApiResponse<{
        metadata?: { capture?: { redaction_status?: string } };
      }>;
      return res?.data?.metadata?.capture?.redaction_status;
    } catch {
      return undefined;
    }
  }

  return {
    listDevices,
    enrollDevice,
    listSessions,
    quickStartSession,
    stopSession,
    getRedactionStatus,
  };
}
