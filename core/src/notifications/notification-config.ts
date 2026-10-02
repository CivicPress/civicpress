import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { getInstanceContext } from '../config/instance-context.js';
import { unwrapConfigValues } from '../config/config-values.js';
import {
  AUTH_TEMPLATE_CONTRACTS,
  defaultAuthTemplates,
  type AuthTemplateName,
  type AuthTemplateText,
} from './templates/auth-templates-from-config.js';

export interface NotificationConfigData {
  channels: {
    email?: {
      enabled: boolean;
      // The two transports that exist. Files written before 2026-10-01 may
      // still say `nodemailer` (an alias of `smtp`) or `ses` (never
      // implemented); the loader maps the first and the channel refuses the
      // second with a clear error.
      provider: 'smtp' | 'sendgrid';

      // SendGrid Configuration
      sendgrid?: {
        apiKey: string;
        from: string;
      };

      // SMTP Configuration (any SMTP relay: a provider's, or your own)
      smtp?: {
        host: string;
        port: number;
        secure: boolean;
        auth: {
          user: string;
          pass: string;
        };
        from: string;
        tls?: {
          rejectUnauthorized?: boolean;
        };
      };

      // Reply-To on every outgoing email, when set.
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
  // Subject and body of the authentication emails. Placeholders are checked
  // against what each email provides (`auth-templates-from-config.ts`).
  auth_templates: Record<AuthTemplateName, AuthTemplateText>;
  rules: {
    rate_limits: {
      email_per_hour: number;
      sms_per_hour: number;
      slack_per_hour: number;
    };
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

  /**
   * @param dataDir Directory holding `notifications.yml`. Defaults to the
   * instance's `.system-data` — the canonical location the configuration
   * service migrates this file INTO (see `migrateNotificationsIfNeeded`).
   *
   * The default used to be the RELATIVE string `.system-data`, resolved against
   * `process.cwd()`, so a process running outside the instance root read (and
   * created) a stray config in whatever directory it happened to start in.
   */
  constructor(dataDir: string = getInstanceContext().systemDataDir) {
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

      // Unwrap BEFORE the cast. Every writer the project owns — `civic init`,
      // the config editor, reset-to-defaults, the migration — produces the
      // field shape (`enabled: { value: false, type: 'boolean', … }`), and this
      // loader used to cast that straight to the typed plain shape. Nothing
      // failed; it was simply wrong everywhere a scalar was declared:
      //
      //   - `isChannelEnabled()` returned the field object, which is truthy, so
      //     a channel switched OFF read as on;
      //   - the hourly limit was an object, `limit - count` was NaN, and
      //     `NaN > 0` is false — so every send was refused as rate-limited.
      //
      // Together: on an instance created by `civic init`, no notification could
      // be sent, whatever the file said. The test fixture is written in the
      // plain shape, so the suite never saw it.
      const config = unwrapConfigValues<NotificationConfigData>(
        yaml.load(configFile)
      );

      // Merge with defaults to ensure all required fields exist
      return this.mergeWithDefaults(normaliseLegacyShape(config));
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
      const configYaml = yaml.dump(this.config, { noRefs: true, lineWidth: 0 });
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
          provider: 'smtp',
          smtp: {
            host: 'localhost',
            port: 587,
            secure: false,
            auth: {
              user: '',
              pass: '',
            },
            from: 'noreply@civicpress.local',
            tls: {
              rejectUnauthorized: true,
            },
          },
          sendgrid: {
            apiKey: '',
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
      auth_templates: defaultAuthTemplates(),
      rules: {
        rate_limits: {
          email_per_hour: 100,
          sms_per_hour: 50,
          slack_per_hour: 200,
        },
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
  getChannelConfig<K extends keyof NotificationConfigData['channels']>(
    channelName: K
  ): NotificationConfigData['channels'][K];
  getChannelConfig(
    channelName: string
  ): NotificationConfigData['channels'][keyof NotificationConfigData['channels']];
  getChannelConfig(channelName: string) {
    return this.config.channels[
      channelName as keyof typeof this.config.channels
    ];
  }

  /**
   * Get auth template
   */
  getAuthTemplate<K extends keyof NotificationConfigData['auth_templates']>(
    templateName: K
  ): NotificationConfigData['auth_templates'][K];
  getAuthTemplate(
    templateName: string
  ):
    | NotificationConfigData['auth_templates'][keyof NotificationConfigData['auth_templates']]
    | undefined;
  getAuthTemplate(templateName: string) {
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
   * Get security settings
   */
  getSecuritySettings(): Record<string, boolean> {
    return this.config.security;
  }

  /**
   * Update channel configuration
   */
  updateChannelConfig<K extends keyof NotificationConfigData['channels']>(
    channelName: K,
    config: NonNullable<NotificationConfigData['channels'][K]>
  ): void {
    this.config.channels[channelName] = config;
  }

  /**
   * Update auth template
   */
  updateAuthTemplate<K extends keyof NotificationConfigData['auth_templates']>(
    templateName: K,
    template: NotificationConfigData['auth_templates'][K]
  ): void {
    this.config.auth_templates[templateName] = template;
  }

  /**
   * Get full configuration
   */
  getConfig(): NotificationConfigData {
    return this.config;
  }
}

/**
 * Bodies the shipped file carried before 2026-10-01, as js-yaml reads them.
 * Nothing read the templates then, so an instance that still has one of
 * these has not customised it; it gets the current built-in text, which
 * says more (the reset email names the account and the expiry).
 */
const LEGACY_DEFAULT_BODIES = new Set<string>([
  'Please click the following link to verify your account:\n{{verification_url}}',
  'Click here to reset your password: {{reset_url}}',
]);

/**
 * Files written before 2026-10-01 carry shapes the type no longer has. Map
 * them so an existing instance sends what its operator configured:
 *
 * - `provider: nodemailer` — the SMTP transport under another key, with its
 *   own `nodemailer:` block beside `smtp:`. Both blocks shipped filled with
 *   the same `localhost` placeholder, so the one the operator edited wins:
 *   the `nodemailer` block if it was touched (a host other than `localhost`,
 *   or a user), else `smtp`.
 * - `replyTo: null` — the shipped default; means "none".
 * - Template bodies written single-quoted, where `\n` is two characters.
 *   Nothing read them then; now that the emails do, the sequence becomes a
 *   line break. A body that is still the old shipped default is replaced by
 *   the current built-in text.
 */
function normaliseLegacyShape(
  config: Partial<NotificationConfigData>
): Partial<NotificationConfigData> {
  type EmailBlock = NonNullable<NotificationConfigData['channels']['email']>;
  const email = config.channels?.email as
    | (EmailBlock & { nodemailer?: EmailBlock['smtp'] })
    | undefined;
  if (email) {
    const provider = String(email.provider ?? '').toLowerCase();
    if (provider === 'nodemailer') {
      email.provider = 'smtp';
      const touched = (block: EmailBlock['smtp']): boolean =>
        !!block &&
        ((!!block.host && block.host !== 'localhost') || !!block.auth?.user);
      if (email.nodemailer && (!email.smtp || touched(email.nodemailer))) {
        email.smtp = email.nodemailer;
      }
    }
    delete email.nodemailer;
    if (email.replyTo === null) {
      email.replyTo = undefined;
    }
  }

  const templates = config.auth_templates as
    | Partial<Record<string, Partial<AuthTemplateText>>>
    | undefined;
  if (templates) {
    for (const [name, template] of Object.entries(templates)) {
      if (!template || typeof template.body !== 'string') continue;
      const body = template.body.replace(/\\n/g, '\n');
      const current =
        AUTH_TEMPLATE_CONTRACTS[name as AuthTemplateName]?.fallback.body;
      template.body =
        LEGACY_DEFAULT_BODIES.has(body) && current ? current : body;
    }
  }
  return config;
}
