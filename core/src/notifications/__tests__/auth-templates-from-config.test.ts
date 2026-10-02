import { describe, it, expect, vi } from 'vitest';
import {
  authTemplateFromConfig,
  resolveAuthTemplateText,
  AUTH_TEMPLATE_CONTRACTS,
  AUTH_TEMPLATE_NAMES,
  type AuthTemplateName,
  type AuthTemplateText,
} from '../templates/auth-templates-from-config.js';

// The authentication emails take subject and body from `auth_templates`.
// They did not until 2026-10-01: the file shipped them, the editor offered
// them, and the text was a constant beside each send.

function source(
  templates: Partial<Record<AuthTemplateName, Partial<AuthTemplateText>>>
) {
  return {
    getAuthTemplate: (name: AuthTemplateName) => templates[name],
  };
}

describe('resolveAuthTemplateText', () => {
  it('uses the configured subject and body when they honour the contract', () => {
    const warn = vi.fn();
    const text = resolveAuthTemplateText(
      source({
        password_reset: {
          subject: 'Réinitialisation du mot de passe — {{username}}',
          body: 'Bonjour {{username}},\n\nRéinitialisez ici : {{reset_url}}',
        },
      }),
      'password_reset',
      warn
    );
    expect(text.subject).toBe(
      'Réinitialisation du mot de passe — {{username}}'
    );
    expect(text.body).toContain('{{reset_url}}');
    expect(warn).not.toHaveBeenCalled();
  });

  it('falls back to the built-in text when nothing is configured', () => {
    for (const name of AUTH_TEMPLATE_NAMES) {
      expect(resolveAuthTemplateText(source({}), name)).toEqual(
        AUTH_TEMPLATE_CONTRACTS[name].fallback
      );
    }
  });

  it('refuses a body that drops the link the email exists to deliver, and says so', () => {
    const warn = vi.fn();
    const text = resolveAuthTemplateText(
      source({
        password_reset: {
          subject: 'Your password',
          body: 'Someone asked to reset your password. Contact the clerk.',
        },
      }),
      'password_reset',
      warn
    );
    // The subject was fine on its own; only the body is replaced.
    expect(text.subject).toBe('Your password');
    expect(text.body).toBe(
      AUTH_TEMPLATE_CONTRACTS.password_reset.fallback.body
    );
    expect(warn).toHaveBeenCalledWith(
      expect.stringMatching(/password_reset\.body is missing \{\{reset_url\}\}/)
    );
  });

  it('refuses a placeholder the email does not provide — it would throw at send time', () => {
    const warn = vi.fn();
    const text = resolveAuthTemplateText(
      source({
        email_verification: {
          subject: 'Welcome {{first_name}}',
          body: 'Verify here: {{verification_url}} ({{code}})',
        },
      }),
      'email_verification',
      warn
    );
    expect(text).toEqual(AUTH_TEMPLATE_CONTRACTS.email_verification.fallback);
    expect(warn).toHaveBeenCalledTimes(2);
    expect(warn.mock.calls.map(([m]) => m).join('\n')).toMatch(/first_name/);
    expect(warn.mock.calls.map(([m]) => m).join('\n')).toMatch(/code/);
  });

  it('treats an empty configured value as not configured', () => {
    const text = resolveAuthTemplateText(
      source({ email_change_verification: { subject: '  ', body: '' } }),
      'email_change_verification'
    );
    expect(text).toEqual(
      AUTH_TEMPLATE_CONTRACTS.email_change_verification.fallback
    );
  });
});

describe('authTemplateFromConfig', () => {
  it('renders the configured text with the data the flow supplies', async () => {
    const template = authTemplateFromConfig(
      source({
        email_verification: {
          subject: 'Confirm your account',
          body: 'Link: {{verification_url}} (expires {{expires_at}})',
        },
      }),
      'email_verification'
    );
    const out = await template.process({
      verification_url: 'https://town.example/verify?token=t',
      token: 't',
      expires_at: '2026-10-02',
    });
    expect(out.subject).toBe('Confirm your account');
    expect(out.body).toBe(
      'Link: https://town.example/verify?token=t (expires 2026-10-02)'
    );
  });
});
