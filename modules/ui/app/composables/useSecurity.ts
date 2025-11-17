import type { User } from '~/stores/auth';

export interface SecurityInfo {
  userId: number;
  username: string;
  email: string;
  authProvider: string;
  emailVerified: boolean;
  canSetPassword: boolean;
  isExternalAuth: boolean;
  pendingEmailChange: {
    email: string | null;
    expiresAt: string | null;
  };
}

export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}

export interface RequestEmailChangeRequest {
  newEmail: string;
}

export interface SecurityResponse {
  success: boolean;
  message: string;
  requiresVerification?: boolean;
}

export const useSecurity = () => {
  const { $civicApi } = useNuxtApp();

  /**
   * Get security information for a user
   */
  const getSecurityInfo = async (userId: number): Promise<SecurityInfo> => {
    const response = (await $civicApi(
      `/api/v1/users/${userId}/security-info`
    )) as any;
    return response.data.securityInfo;
  };

  /**
   * Change user password
   */
  const changePassword = async (
    userId: number,
    passwordData: ChangePasswordRequest
  ): Promise<SecurityResponse> => {
    const response = (await $civicApi(
      `/api/v1/users/${userId}/change-password`,
      {
        method: 'POST',
        body: passwordData,
      }
    )) as any;
    return response.data;
  };

  /**
   * Set password for user (admin only)
   */
  const setUserPassword = async (
    userId: number,
    newPassword: string
  ): Promise<SecurityResponse> => {
    const response = (await $civicApi(`/api/v1/users/${userId}/set-password`, {
      method: 'POST',
      body: { newPassword },
    })) as any;
    return response.data;
  };

  /**
   * Request email change
   */
  const requestEmailChange = async (
    userId: number,
    emailData: RequestEmailChangeRequest
  ): Promise<SecurityResponse> => {
    const response = (await $civicApi(
      `/api/v1/users/${userId}/request-email-change`,
      {
        method: 'POST',
        body: emailData,
      }
    )) as any;
    return response.data;
  };

  /**
   * Verify email change with token
   */
  const verifyEmailChange = async (
    token: string
  ): Promise<SecurityResponse> => {
    const response = (await $civicApi('/api/v1/users/verify-email-change', {
      method: 'POST',
      body: { token },
    })) as any;
    return response.data;
  };

  /**
   * Cancel pending email change
   */
  const cancelEmailChange = async (
    userId: number
  ): Promise<SecurityResponse> => {
    const response = (await $civicApi(
      `/api/v1/users/${userId}/cancel-email-change`,
      {
        method: 'POST',
      }
    )) as any;
    return response.data;
  };

  /**
   * Check if user can set password based on auth provider
   */
  const canUserSetPassword = (user: User | SecurityInfo | null): boolean => {
    if (!user) return false;
    if ('canSetPassword' in user) {
      return user.canSetPassword ?? true;
    }
    return user.authProvider === 'password' || !user.authProvider;
  };

  /**
   * Get user's authentication provider display name
   */
  const getAuthProviderDisplayName = (provider?: string): string => {
    switch (provider) {
      case 'github':
        return 'GitHub';
      case 'google':
        return 'Google';
      case 'microsoft':
        return 'Microsoft';
      case 'password':
      default:
        return 'Password';
    }
  };

  /**
   * Check if email verification is required
   */
  const isEmailVerificationRequired = (
    user: User | SecurityInfo | null
  ): boolean => {
    if (!user) return false;
    return !user.emailVerified;
  };

  /**
   * Check if user has pending email change
   */
  const hasPendingEmailChange = (user: User | SecurityInfo | null): boolean => {
    if (!user) return false;
    if ('pendingEmailChange' in user) {
      return !!user.pendingEmailChange?.email;
    }
    return !!user.pendingEmail;
  };

  /**
   * Send email verification for current email address
   */
  const sendEmailVerification = async (
    userId: number
  ): Promise<SecurityResponse> => {
    const response = (await $civicApi(
      `/api/v1/users/${userId}/send-email-verification`,
      {
        method: 'POST',
      }
    )) as any;
    return response.data;
  };

  /**
   * Verify current email address with token
   */
  const verifyCurrentEmail = async (
    token: string
  ): Promise<SecurityResponse> => {
    const response = (await $civicApi('/api/v1/users/verify-current-email', {
      method: 'POST',
      body: { token },
    })) as any;
    return response.data;
  };

  return {
    getSecurityInfo,
    changePassword,
    setUserPassword,
    requestEmailChange,
    verifyEmailChange,
    cancelEmailChange,
    sendEmailVerification,
    verifyCurrentEmail,
    canUserSetPassword,
    getAuthProviderDisplayName,
    isEmailVerificationRequired,
    hasPendingEmailChange,
  };
};
