import { CentralConfigManager } from '../config/central-config.js';
import { Logger } from '../utils/logger.js';

const logger = new Logger();

export interface AuthConfig {
  jwt: {
    secret: string;
    expiresIn: string;
  };
  password: {
    minLength: number;
    requireUppercase: boolean;
    requireLowercase: boolean;
    requireNumbers: boolean;
    requireSpecialChars: boolean;
    maxLoginAttempts: number;
    lockoutDuration: string;
  };
  rateLimit: {
    loginAttempts: number;
    passwordReset: number;
  };
  providers: {
    github: OAuthProviderConfig;
    google: OAuthProviderConfig;
    microsoft: OAuthProviderConfig;
  };
  email: {
    enabled: boolean;
    requireEmailVerification: boolean;
    allowedDomains: string[];
  };
  security: {
    bcryptRounds: number;
    sessionTimeout: string;
    maxConcurrentSessions: number;
    requireHttps: boolean;
  };
}

export interface OAuthProviderConfig {
  enabled: boolean;
  clientId: string;
  clientSecret: string;
  allowedDomains: string[];
}

export class AuthConfigManager {
  private static instance: AuthConfigManager;
  private config: AuthConfig | null = null;

  private constructor() {}

  static getInstance(): AuthConfigManager {
    if (!AuthConfigManager.instance) {
      AuthConfigManager.instance = new AuthConfigManager();
    }
    return AuthConfigManager.instance;
  }

  async loadConfig(): Promise<AuthConfig> {
    if (this.config) {
      return this.config;
    }

    try {
      const centralConfig = await CentralConfigManager.getConfig();
      const authConfig = centralConfig?.auth as AuthConfig;

      if (!authConfig) {
        logger.warn('No auth configuration found, using defaults');
        this.config = this.getDefaultConfig();
        return this.config;
      }

      // Validate and merge with defaults
      this.config = this.mergeWithDefaults(authConfig);

      // Validate security settings
      this.validateConfig(this.config);

      logger.info('Authentication configuration loaded successfully');
      return this.config;
    } catch (error) {
      logger.error('Failed to load auth configuration:', error);
      this.config = this.getDefaultConfig();
      return this.config;
    }
  }

  getConfig(): AuthConfig {
    if (!this.config) {
      throw new Error(
        'Auth configuration not loaded. Call loadConfig() first.'
      );
    }
    return this.config;
  }

  private getDefaultConfig(): AuthConfig {
    return {
      jwt: {
        secret:
          (globalThis as any).process?.env?.JWT_SECRET ||
          'default-jwt-secret-change-in-production',
        expiresIn: '24h',
      },
      password: {
        minLength: 8,
        requireUppercase: true,
        requireLowercase: true,
        requireNumbers: true,
        requireSpecialChars: true,
        maxLoginAttempts: 5,
        lockoutDuration: '15m',
      },
      rateLimit: {
        loginAttempts: 10,
        passwordReset: 3,
      },
      providers: {
        github: {
          enabled: false,
          clientId: '',
          clientSecret: '',
          allowedDomains: [],
        },
        google: {
          enabled: false,
          clientId: '',
          clientSecret: '',
          allowedDomains: [],
        },
        microsoft: {
          enabled: false,
          clientId: '',
          clientSecret: '',
          allowedDomains: [],
        },
      },
      email: {
        enabled: true,
        requireEmailVerification: false,
        allowedDomains: [],
      },
      security: {
        bcryptRounds: 12,
        sessionTimeout: '24h',
        maxConcurrentSessions: 5,
        requireHttps: false,
      },
    };
  }

  private mergeWithDefaults(userConfig: any): AuthConfig {
    const defaults = this.getDefaultConfig();

    return {
      jwt: { ...defaults.jwt, ...userConfig.jwt },
      password: { ...defaults.password, ...userConfig.password },
      rateLimit: { ...defaults.rateLimit, ...userConfig.rateLimit },
      providers: {
        github: {
          ...defaults.providers.github,
          ...userConfig.providers?.github,
        },
        google: {
          ...defaults.providers.google,
          ...userConfig.providers?.google,
        },
        microsoft: {
          ...defaults.providers.microsoft,
          ...userConfig.providers?.microsoft,
        },
      },
      email: { ...defaults.email, ...userConfig.email },
      security: { ...defaults.security, ...userConfig.security },
    };
  }

  private validateConfig(config: AuthConfig): void {
    // Validate JWT secret
    if (
      !config.jwt.secret ||
      config.jwt.secret === 'default-jwt-secret-change-in-production'
    ) {
      logger.warn('Using default JWT secret. Change this in production!');
    }

    // Validate password settings
    if (config.password.minLength < 6) {
      throw new Error('Password minimum length must be at least 6 characters');
    }

    if (config.password.maxLoginAttempts < 1) {
      throw new Error('Max login attempts must be at least 1');
    }

    // Validate security settings
    if (config.security.bcryptRounds < 10) {
      logger.warn('Bcrypt rounds should be at least 10 for security');
    }

    // Check for enabled providers
    const enabledProviders = Object.entries(config.providers)
      .filter(([, provider]) => provider.enabled)
      .map(([name]) => name);

    if (enabledProviders.length === 0 && !config.email.enabled) {
      logger.warn('No authentication providers are enabled');
    }

    logger.info(
      `Enabled authentication providers: ${enabledProviders.join(', ')}`
    );
  }

  // Helper methods for common config access
  isProviderEnabled(provider: 'github' | 'google' | 'microsoft'): boolean {
    return this.getConfig().providers[provider].enabled;
  }

  getProviderConfig(
    provider: 'github' | 'google' | 'microsoft'
  ): OAuthProviderConfig {
    return this.getConfig().providers[provider];
  }

  isEmailAuthEnabled(): boolean {
    return this.getConfig().email.enabled;
  }

  getPasswordRequirements() {
    return this.getConfig().password;
  }

  getSecuritySettings() {
    return this.getConfig().security;
  }

  validateEmailDomain(email: string): boolean {
    const config = this.getConfig();
    const allowedDomains = config.email.allowedDomains;

    // If no domains are specified, allow all
    if (allowedDomains.length === 0) {
      return true;
    }

    return allowedDomains.some((domain) =>
      email.toLowerCase().endsWith(domain.toLowerCase())
    );
  }

  validatePassword(password: string): { valid: boolean; errors: string[] } {
    const requirements = this.getPasswordRequirements();
    const errors: string[] = [];

    if (password.length < requirements.minLength) {
      errors.push(
        `Password must be at least ${requirements.minLength} characters long`
      );
    }

    if (requirements.requireUppercase && !/[A-Z]/.test(password)) {
      errors.push('Password must contain at least one uppercase letter');
    }

    if (requirements.requireLowercase && !/[a-z]/.test(password)) {
      errors.push('Password must contain at least one lowercase letter');
    }

    if (requirements.requireNumbers && !/\d/.test(password)) {
      errors.push('Password must contain at least one number');
    }

    if (
      requirements.requireSpecialChars &&
      !/[!@#$%^&*(),.?":{}|<>]/.test(password)
    ) {
      errors.push('Password must contain at least one special character');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}
