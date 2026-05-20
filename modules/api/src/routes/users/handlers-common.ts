import { AuditLogger } from '@civicpress/core';

export const audit = new AuditLogger();

export interface CreateUserRequest {
  username: string;
  email?: string;
  name?: string;
  role?: string;
  password?: string; // Optional for OAuth users
  avatar_url?: string;
}

export interface UpdateUserRequest {
  email?: string;
  name?: string;
  role?: string;
  password?: string;
  avatar_url?: string;
}

export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}

export interface RequestEmailChangeRequest {
  newEmail: string;
}

export interface VerifyEmailChangeRequest {
  token: string;
}

export interface PasswordAuthRequest {
  username: string;
  password: string;
}
