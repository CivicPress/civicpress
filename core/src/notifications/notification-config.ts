import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';

export interface NotificationConfigData {
  channels: {
    email?: {
      enabled: boolean;
      provider: 'sendgrid' | 'ses' | 'smtp' | 'nodemailer';

      // SendGrid Configuration
      sendgrid?: {
        apiKey: string;
        from: string;
      };

      // AWS SES Configuration
      ses?: {
        accessKeyId: string;
        secretAccessKey: string;
        region: string;
        from: string;
      };

      // SMTP Configuration (Gmail, Outlook, etc.)
      smtp?: {
        host: string;
        port: number;
        secure: boolean;
        auth: {
          user: string;
          pass: string;
        };
        from: string;
      };

      // Nodemailer Configuration (Generic SMTP)
      nodemailer?: {
        host: string;
        port: number;
        secure: boolean;
        auth: {
          user: string;
          pass: string;
        };
        from: string;
      };

      replyTo?: string;
    };
    sms?: {
      enabled: boolean;
      provider: 'twilio' | 'sendgrid' | 'custom';
      credentials: {
        accountSid?: string;
        authToken?: string;
        apiKey?: string;
        phoneNumber?: string;
      };
    };
    slack?: {
      enabled: boolean;
      webhook_url: string;
      channel?: string;
      username?: string;
    };
  };
  auth_templates: {
    email_verification: {
      subject: string;
      body: string;
    };
    password_reset: {
      subject: string;
      body: string;
    };
    two_factor_auth: {
      subject: string;
      body: string;
    };
    security_alert: {
      subject: string;
      body: string;
    };
  };
  rules: {
    rate_limits: {
      email_per_hour: number;
      sms_per_hour: number;
      slack_per_hour: number;
    };
    retry_attempts: number;
    retry_delay: number;
  };
  security: {
    encrypt_sensitive_data: boolean;
    audit_all_notifications: boolean;
    filter_pii: boolean;
  };
}

export class NotificationConfig {
  private config: NotificationConfigData;
  private configPath: string;

  constructor(dataDir: string = '.system-data') {
    this.configPath = path.join(dataDir, 'notifications.yml');
    this.config = this.loadConfig();
  }

  /**
   * Load configuration from file
   */
  private loadConfig(): NotificationConfigData {
    try {
      if (!fs.existsSync(this.configPath)) {
        return this.getDefaultConfig();
      }

      const configFile = fs.readFileSync(this.configPath, 'utf8');
      const config = yaml.load(configFile) as NotificationConfigData;

      // Merge with defaults to ensure all required fields exist
      return this.mergeWithDefaults(config);
    } catch {
      // Silently fall back to default config
      return this.getDefaultConfig();
    }
  }

  /**
   * Save configuration to file
   */
  async saveConfig(): Promise<void> {
    try {
      // Ensure directory exists
      const dir = path.dirname(this.configPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      // Save config
      const configYaml = yaml.dump(this.config);
      fs.writeFileSync(this.configPath, configYaml, 'utf8');
    } catch (error) {
      throw new Error(`Failed to save notification config: ${error}`);
    }
  }

  /**
   * Get default configuration
   */
  private getDefaultConfig(): NotificationConfigData {
    return {
      channels: {
        email: {
          enabled: false,
          provider: 'nodemailer',
          smtp: {
            host: 'localhost',
            port: 587,
            secure: false,
            auth: {
              user: '',
              pass: '',
            },
            from: 'noreply@civicpress.local',
          },
          ses: {
            accessKeyId: '',
            secretAccessKey: '',
            region: 'us-east-1',
            from: 'noreply@civicpress.local',
          },
          sendgrid: {
            apiKey: '',
            from: 'noreply@civicpress.local',
          },
          nodemailer: {
            host: 'localhost',
            port: 587,
            secure: false,
            auth: {
              user: '',
              pass: '',
            },
            from: 'noreply@civicpress.local',
          },
          replyTo: undefined,
        },
        sms: {
          enabled: false,
          provider: 'twilio',
          credentials: {},
        },
        slack: {
          enabled: false,
          webhook_url: '',
          channel: undefined,
          username: undefined,
        },
      },
      auth_templates: {
        email_verification: {
          subject: 'Verify your CivicPress account',
          body: 'Please click the following link to verify your account: {{verification_url}}',
        },
        password_reset: {
          subject: 'Reset your CivicPress password',
          body: 'Click here to reset your password: {{reset_url}}',
        },
        two_factor_auth: {
          subject: 'Your CivicPress verification code',
          body: 'Your verification code is: {{code}}',
        },
        security_alert: {
          subject: 'Security alert for your account',
          body: 'Suspicious activity detected: {{details}}',
        },
      },
      rules: {
        rate_limits: {
          email_per_hour: 100,
          sms_per_hour: 50,
          slack_per_hour: 200,
        },
        retry_attempts: 3,
        retry_delay: 5000,
      },
      security: {
        encrypt_sensitive_data: true,
        audit_all_notifications: true,
        filter_pii: true,
      },
    };
  }

  /**
   * Merge config with defaults
   */
  private mergeWithDefaults(
    config: Partial<NotificationConfigData>
  ): NotificationConfigData {
    const defaults = this.getDefaultConfig();
    return {
      channels: { ...defaults.channels, ...config.channels },
      auth_templates: { ...defaults.auth_templates, ...config.auth_templates },
      rules: { ...defaults.rules, ...config.rules },
      security: { ...defaults.security, ...config.security },
    };
  }

  /**
   * Check if channel is enabled
   */
  isChannelEnabled(channelName: string): boolean {
    const channel =
      this.config.channels[channelName as keyof typeof this.config.channels];
    return channel?.enabled || false;
  }

  /**
   * Get channel configuration
   */
  getChannelConfig(channelName: string): any {
    return this.config.channels[
      channelName as keyof typeof this.config.channels
    ];
  }

  /**
   * Get email provider configuration
   */
  getEmailProviderConfig(): {
    provider: 'sendgrid' | 'ses' | 'smtp' | 'nodemailer';
    config: any;
  } {
    const emailConfig = this.config.channels.email;
    if (!emailConfig) {
      throw new Error('Email channel not configured');
    }

    const provider = emailConfig.provider;
    let config: any;

    switch (provider) {
      case 'sendgrid':
        config = emailConfig.sendgrid;
        break;
      case 'ses':
        config = emailConfig.ses;
        break;
      case 'smtp':
        config = emailConfig.smtp;
        break;
      case 'nodemailer':
        config = emailConfig.nodemailer;
        break;
      default:
        throw new Error(`Unsupported email provider: ${provider}`);
    }

    if (!config) {
      throw new Error(`Configuration for provider '${provider}' not found`);
    }

    return { provider, config };
  }

  /**
   * Validate email provider configuration
   */
  validateEmailProviderConfig(): boolean {
    try {
      const { provider, config } = this.getEmailProviderConfig();

      switch (provider) {
        case 'sendgrid':
          return !!(config.apiKey && config.from);
        case 'ses':
          return !!(
            config.accessKeyId &&
            config.secretAccessKey &&
            config.region &&
            config.from
          );
        case 'smtp':
        case 'nodemailer':
          return !!(
            config.host &&
            config.auth?.user &&
            config.auth?.pass &&
            config.from
          );
        default:
          return false;
      }
    } catch {
      return false;
    }
  }

  /**
   * Get auth template
   */
  getAuthTemplate(templateName: string): any {
    return this.config.auth_templates[
      templateName as keyof typeof this.config.auth_templates
    ];
  }

  /**
   * Get rate limits
   */
  getRateLimits(): Record<string, number> {
    return this.config.rules.rate_limits;
  }

  /**
   * Get retry settings
   */
  getRetrySettings(): { attempts: number; delay: number } {
    return {
      attempts: this.config.rules.retry_attempts,
      delay: this.config.rules.retry_delay,
    };
  }

  /**
   * Get security settings
   */
  getSecuritySettings(): Record<string, boolean> {
    return this.config.security;
  }

  /**
   * Update channel configuration
   */
  updateChannelConfig(channelName: string, config: any): void {
    this.config.channels[channelName as keyof typeof this.config.channels] =
      config;
  }

  /**
   * Update auth template
   */
  updateAuthTemplate(templateName: string, template: any): void {
    this.config.auth_templates[
      templateName as keyof typeof this.config.auth_templates
    ] = template;
  }

  /**
   * Get full configuration
   */
  getConfig(): NotificationConfigData {
    return this.config;
  }
}
