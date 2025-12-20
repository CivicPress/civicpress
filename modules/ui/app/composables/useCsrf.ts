/**
 * CSRF Token Management Composable
 *
 * Manages CSRF tokens for API requests. Tokens are stored in localStorage
 * and automatically included in state-changing requests.
 *
 * Note: Bearer token requests bypass CSRF, but we still manage CSRF tokens
 * for consistency and future cookie-based session support.
 */
export const useCsrf = () => {
  const config = useRuntimeConfig();
  const apiUrl = config.public.civicApiUrl;
  const STORAGE_KEY = 'civic_csrf_token';

  /**
   * Fetch and store CSRF token from API
   */
  const fetchCsrfToken = async (): Promise<string | null> => {
    if (!process.client) {
      return null;
    }

    try {
      const response = await fetch(`${apiUrl}/api/v1/auth/csrf-token`);
      const data = await response.json();

      if (data?.success && data?.data?.token) {
        localStorage.setItem(STORAGE_KEY, data.data.token);
        return data.data.token;
      }
      return null;
    } catch (error) {
      console.error('Failed to fetch CSRF token:', error);
      return null;
    }
  };

  /**
   * Get CSRF token from localStorage
   */
  const getCsrfToken = (): string | null => {
    if (!process.client) {
      return null;
    }
    return localStorage.getItem(STORAGE_KEY);
  };

  /**
   * Clear CSRF token from localStorage
   */
  const clearCsrfToken = (): void => {
    if (process.client) {
      localStorage.removeItem(STORAGE_KEY);
    }
  };

  /**
   * Ensure CSRF token is available (fetch if missing)
   */
  const ensureCsrfToken = async (): Promise<string | null> => {
    let token = getCsrfToken();
    if (!token) {
      token = await fetchCsrfToken();
    }
    return token;
  };

  /**
   * Check if CSRF token is expired (tokens expire after 1 hour)
   * This is a simple check - we don't parse the token, just refresh periodically
   */
  const shouldRefreshToken = (): boolean => {
    // For simplicity, we'll refresh tokens on each page load
    // The backend validates token signatures, so expired tokens will be rejected
    // and we can fetch a new one
    return false; // Let backend handle expiration validation
  };

  return {
    fetchCsrfToken,
    getCsrfToken,
    clearCsrfToken,
    ensureCsrfToken,
    shouldRefreshToken,
    STORAGE_KEY, // Export for reference
  };
};
