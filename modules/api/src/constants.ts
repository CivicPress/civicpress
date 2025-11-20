/**
 * API Constants
 *
 * Centralized constants for API routing and versioning.
 * This ensures consistency across all API endpoints and makes
 * future API versioning easier to manage.
 */

export const API_BASE_PATH = '/api';
export const API_VERSION = 'v1';
export const API_PREFIX = `${API_BASE_PATH}/${API_VERSION}`; // '/api/v1'

/**
 * Full API path helper
 * @param path - Endpoint path (e.g., '/records' or 'records')
 * @returns Full API path (e.g., '/api/v1/records')
 */
export function apiPath(path: string): string {
  // Remove leading slash if present to avoid double slashes
  const cleanPath = path.startsWith('/') ? path.slice(1) : path;
  return `${API_PREFIX}/${cleanPath}`;
}
