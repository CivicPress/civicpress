// The authentication emails — account verification, email-change
// verification, password reset — take their subject and body from
// `auth_templates` in `notifications.yml`.
//
// They did not until 2026-10-01: the file shipped the four templates, the
// settings editor rendered them, `NotificationConfig.getAuthTemplate()` read
// them, and no caller asked. The text lived as constants beside each send, so
// an operator who translated the reset email in the editor changed nothing.
//
// A configured template is used only when it is safe to: it must keep the
// placeholder the flow depends on (a reset email without `{{reset_url}}` is
// not a reset email) and may use only placeholders the flow supplies (an
// unknown one would throw at send time, and the user would get nothing).
// Otherwise the built-in text is used and the operator is warned.
import { AuthTemplate } from './auth-template.js';

export type AuthTemplateName =
  | 'email_verification'
  | 'email_change_verification'
  | 'password_reset';

export interface AuthTemplateText {
  subject: string;
  body: string;
}

interface AuthTemplateContract {
  /** Placeholders the body must contain. */
  required: readonly string[];
  /** Placeholders the flow supplies; anything else is unknown. */
  allowed: readonly string[];
  /** The built-in text, used when nothing (valid) is configured. */
  fallback: AuthTemplateText;
}

export const AUTH_TEMPLATE_CONTRACTS: Record<
  AuthTemplateName,
  AuthTemplateContract
> = {
  email_verification: {
    required: ['verification_url'],
    allowed: ['verification_url', 'token', 'expires_at'],
    fallback: {
      subject: 'Verify your CivicPress account',
      body: 'Please click the following link to verify your account:\n{{verification_url}}',
    },
  },
  email_change_verification: {
    required: ['verification_url'],
    allowed: ['verification_url', 'token', 'expires_at'],
    fallback: {
      subject: 'Verify your new CivicPress email address',
      body: 'Please click the following link to verify your new email address:\n{{verification_url}}',
    },
  },
  password_reset: {
    required: ['reset_url'],
    allowed: ['reset_url', 'username'],
    fallback: {
      subject: 'Reset your CivicPress password',
      body:
        'A password reset was requested for your CivicPress account "{{username}}".\n\n' +
        'Reset your password here:\n{{reset_url}}\n\n' +
        'This link can be used once and expires in 1 hour. If you did not request ' +
        'this, you can safely ignore this message — your password will not change.',
    },
  },
};

export const AUTH_TEMPLATE_NAMES = Object.keys(
  AUTH_TEMPLATE_CONTRACTS
) as AuthTemplateName[];

/** The default `auth_templates` block, as the inline configuration carries it. */
export function defaultAuthTemplates(): Record<
  AuthTemplateName,
  AuthTemplateText
> {
  return {
    email_verification: {
      ...AUTH_TEMPLATE_CONTRACTS.email_verification.fallback,
    },
    email_change_verification: {
      ...AUTH_TEMPLATE_CONTRACTS.email_change_verification.fallback,
    },
    password_reset: { ...AUTH_TEMPLATE_CONTRACTS.password_reset.fallback },
  };
}

/** Same scan as NotificationTemplate: `{{name}}`, braces never inside. */
function placeholdersIn(text: string): string[] {
  const found = new Set<string>();
  const regex = /\{\{([^{}]+)\}\}/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    found.add(match[1].trim());
  }
  return Array.from(found);
}

export interface AuthTemplateSource {
  getAuthTemplate(
    name: AuthTemplateName
  ): Partial<AuthTemplateText> | undefined;
}

/**
 * The template to send for `name`: the configured text when it honours the
 * contract, the built-in text otherwise. `warn` hears why a configured text
 * was not used.
 */
export function authTemplateFromConfig(
  config: AuthTemplateSource,
  name: AuthTemplateName,
  warn: (message: string) => void = () => {}
): AuthTemplate {
  const text = resolveAuthTemplateText(config, name, warn);
  return new AuthTemplate(name, text.body, text.subject);
}

/** The subject and body `authTemplateFromConfig` would send, for inspection. */
export function resolveAuthTemplateText(
  config: AuthTemplateSource,
  name: AuthTemplateName,
  warn: (message: string) => void = () => {}
): AuthTemplateText {
  const contract = AUTH_TEMPLATE_CONTRACTS[name];
  const configured = config.getAuthTemplate(name);
  const allowed = new Set(contract.allowed);

  let subject = contract.fallback.subject;
  if (typeof configured?.subject === 'string' && configured.subject.trim()) {
    const unknown = placeholdersIn(configured.subject).filter(
      (v) => !allowed.has(v)
    );
    if (unknown.length === 0) {
      subject = configured.subject;
    } else {
      warn(
        `auth_templates.${name}.subject uses placeholders this email does not provide (${unknown.join(', ')}); using the built-in subject`
      );
    }
  }

  let body = contract.fallback.body;
  if (typeof configured?.body === 'string' && configured.body.trim()) {
    const present = placeholdersIn(configured.body);
    const missing = contract.required.filter((v) => !present.includes(v));
    const unknown = present.filter((v) => !allowed.has(v));
    if (missing.length === 0 && unknown.length === 0) {
      body = configured.body;
    } else if (missing.length > 0) {
      warn(
        `auth_templates.${name}.body is missing {{${missing.join('}}, {{')}}}; using the built-in text`
      );
    } else {
      warn(
        `auth_templates.${name}.body uses placeholders this email does not provide (${unknown.join(', ')}); using the built-in text`
      );
    }
  }

  return { subject, body };
}
