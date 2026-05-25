/**
 * Per-endpoint response shapes for the civicApi client.
 *
 * Mirrors the named envelope types defined by `modules/api/src/services/
 * records-service/*` (ApiRecord, ApiDraft, DraftOrRecord) — the UI can't
 * import those directly without reaching into another workspace's internals,
 * so this module is the structural contract the two sides agree on.
 *
 * The wrapping `ApiResponse<T>` envelope is defined in `~/utils/api-response`;
 * each type here is the `T` parameter, not the full response. Use as:
 *   const res = await $civicApi<ApiResponse<RecordResponse>>(`/api/v1/records/${id}`);
 */

import type { ApiResponse } from '~/utils/api-response';

// -- Records ------------------------------------------------------------

/** Server record envelope (matches api/src ApiRecord; extra fields surface here for the editor flow). */
export interface RecordResponse {
  id: string;
  title: string;
  type: string;
  status?: string;
  workflowState?: string;
  content?: string;
  markdownBody?: string;
  metadata: Record<string, unknown>;
  authors?: Array<{
    name: string;
    username: string;
    role?: string;
    email?: string;
  }>;
  source?: {
    reference: string;
    original_title?: string;
    original_filename?: string;
    url?: string;
    type?: 'legacy' | 'import' | 'external';
    imported_at?: string;
    imported_by?: string;
  };
  geography?: unknown;
  attachedFiles: unknown[];
  linkedRecords: unknown[];
  linkedGeographyFiles: unknown[];
  path?: string;
  created_at?: string | null;
  updated_at?: string | null;
  last_draft_saved_at?: string | null;
  author?: string;
  created_by?: string;
  commit_ref?: string;
  commit_signature?: string;
  isDraft?: boolean;
  hasUnpublishedChanges?: boolean;
  /** Extra fields not modelled here (tags, description, etc.) — kept loose. */
  [key: string]: unknown;
}

/** Listing response: pagination envelope around RecordResponse[]. */
export interface RecordListResponse {
  records: RecordResponse[];
  totalCount: number;
  currentPage: number;
  totalPages: number;
  pageSize: number;
  sort?: string;
}

/** Search response: same as list, plus relevance scores in metadata. */
export type RecordSearchResponse = RecordListResponse;

/** Drafts list response. */
export interface DraftListResponse {
  drafts: RecordResponse[];
  total: number;
}

/** Export response: markdown body string. */
export interface RecordExportResponse {
  markdown: string;
}

/** Lock state response from /records/:id/lock. */
export interface RecordLockResponse {
  locked: boolean;
  lockedBy?: string | null;
  lockedAt?: string | null;
  expiresAt?: string | null;
}

// -- Auth / Users -------------------------------------------------------

/** AuthUser shape returned by the api's auth flows. */
export interface AuthUserResponse {
  id: number;
  username: string;
  role: string;
  email?: string;
  name?: string;
  avatar_url?: string;
  auth_provider?: string;
  email_verified?: boolean;
  pending_email?: string;
  /** Server-derived per-session permissions (login + me flows). */
  permissions?: string[];
  created_at?: string | Date;
  updated_at?: string | Date;
}

/** Session response from /auth/login + /auth/password. */
export interface SessionResponse {
  token: string;
  user: AuthUserResponse;
  expiresAt?: string | Date;
  session?: {
    expiresAt: string | Date;
  };
}

/** User list response. */
export interface UserListResponse {
  users: AuthUserResponse[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
  };
}

// -- Misc convenience aliases -------------------------------------------

export type RecordApiResponse = ApiResponse<RecordResponse>;
export type RecordListApiResponse = ApiResponse<RecordListResponse>;
export type DraftListApiResponse = ApiResponse<DraftListResponse>;
export type SessionApiResponse = ApiResponse<SessionResponse>;
export type UserListApiResponse = ApiResponse<UserListResponse>;
