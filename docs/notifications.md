# Notification System

## Overview

CivicPress sends email through one transport you choose — an SMTP relay or
SendGrid — and uses it for the authentication emails (account verification,
email-change verification, password reset) and for test sends. Everything else
that needs an operator's attention goes to the
[operator notification center](#operator-notification-center), which needs no
channel at all.

## What exists, and what does not

- **Email only.** The `sms` and `slack` blocks are in the file for shape, and
  nothing implements them (`docs/project-status.md` says the same).
- **Two transports: `smtp` and `sendgrid`.** Nothing else. A file that names
  another provider is refused with a message naming these two.
- **No queue, no retry.** A send either happens or is reported as a failure: the
  test endpoint answers `500`, account verification logs the failure and still
  returns the token, and password recovery falls back to an operator task.
  Nothing retries later.
- **No environment-variable credentials.** `notifications.yml` is the only place
  the transport is configured.

Until 2026-10-01 this page, the shipped file and the settings editor promised
more — AWS SES, a `nodemailer` provider, SendGrid sandbox mode, retry rules, a
two-factor template, a security-alert template, `SMTP_*`/`SENDGRID_*` variables
— and none of it was read by anything. Those settings are gone from the shipped
file; a file that still carries them keeps working (the extra keys are ignored,
and `provider: nodemailer` is read as `smtp`).

## Configuration

### Location

`.system-data/notifications.yml` — outside Git, created by `civic init` from the
shipped default, editable in **Settings → Configuration → Notifications** or by
hand.

The file `civic init` writes carries every value inside a
`{ value, type, description }` field so the settings editor can render a form
from it; a hand-written file in the plain shape below is read just the same.

### Structure

```yaml
channels:
  email:
    enabled: false # off by default — nothing is sent until you turn it on
    provider: 'smtp' # 'smtp' or 'sendgrid': the transport used for every email

    smtp:
      host: 'mail.example.com'
      port: 587
      secure: false # true for implicit TLS (usually port 465)
      auth:
        user: 'smtp@example.com' # leave empty for a relay that takes no credentials
        pass: 'your-password'
      from: 'clerk@example.com'
      tls:
        rejectUnauthorized: true # false only for a self-signed test relay

    sendgrid:
      apiKey: 'SG.your-api-key'
      from: 'noreply@example.com'

    replyTo: 'records@example.com' # optional — Reply-To on every email sent

auth_templates: # see "Templates" below
  email_verification:
    subject: 'Verify your CivicPress account'
    body: "Please click the following link to verify your account:\n{{verification_url}}"
  email_change_verification:
    subject: 'Verify your new CivicPress email address'
    body: "Please click the following link to verify your new email address:\n{{verification_url}}"
  password_reset:
    subject: 'Reset your CivicPress password'
    body: "A password reset was requested for your CivicPress account \"{{username}}\".\n\nReset your password here:\n{{reset_url}}\n\nThis link can be used once and expires in 1 hour. If you did not request this, you can safely ignore this message — your password will not change."

rules:
  rate_limits:
    email_per_hour: 100 # sends past this limit in an hour are refused

security:
  encrypt_sensitive_data: true
  audit_all_notifications: true
  filter_pii: true
```

The three `security` keys do the following, all on what the system **keeps**,
never on a message to its recipient:

- `filter_pii` — email addresses, phone numbers, card and SSN-shaped numbers are
  replaced by `[REDACTED]` in the notification audit log
  (`.system-data/notification-audit.jsonl`, where a delivery error quotes the
  recipient) and in the `body` and `data` of operator-inbox entries. The entry's
  title — which names the user by username — is stored as it is. A
  password-reset task therefore keeps the username and no longer carries the
  address in its data.
- `audit_all_notifications` — every send attempt, delivered or not, is also
  written to the unified audit trail: the activity log the Settings → Activity
  page shows carries channels, template, outcome and a keyed hash of the
  recipient; the `audit_logs` table carries the outcome message. Never the
  message sent, never the address.
- `encrypt_sensitive_data` — the `body` and `data` of operator-inbox entries are
  encrypted at rest (AES-256-GCM, key derived from the instance secret). Entries
  written before the key was switched on are sealed on the next start; switching
  it off leaves sealed entries readable as long as the instance secret is
  unchanged. An entry sealed under another secret shows as unreadable and can
  still be dismissed; the rest of the inbox is unaffected. A database file
  copied elsewhere does not reveal them. `civic backup` and
  `civic system:check-updates`, which write to the inbox without booting the
  instance, apply the same settings.

### Providers

**SMTP** — any relay: your own server, your hosting provider's, or a
transactional service's SMTP endpoint. `secure: true` means implicit TLS (port
465); `false` means STARTTLS is negotiated when the server offers it (port 587).
The server certificate is validated unless `tls.rejectUnauthorized` is `false`.
`provider: nodemailer` in an older file means the same thing and is read as
`smtp`.

**SendGrid** — through SendGrid's SMTP relay (`smtp.sendgrid.net`) with the API
key as the password. SendGrid's Web-API-only features (sandbox mode, dynamic
templates) are not available through this path.

Whichever transport is selected is the one every email uses — the authentication
emails and the test send alike. A test send can try the other transport for that
send only (`--provider` in the CLI, the selector on the settings page) without
changing the file.

### Templates

The authentication emails take their subject and body from `auth_templates`.
Placeholders are written `{{name}}`; each email provides the ones listed below,
and the body must keep the link placeholder:

| Template                    | Provides                                              | Body must contain      |
| --------------------------- | ----------------------------------------------------- | ---------------------- |
| `email_verification`        | `{{verification_url}}`, `{{token}}`, `{{expires_at}}` | `{{verification_url}}` |
| `email_change_verification` | `{{verification_url}}`, `{{token}}`, `{{expires_at}}` | `{{verification_url}}` |
| `password_reset`            | `{{reset_url}}`, `{{username}}`                       | `{{reset_url}}`        |

A configured template that drops the required placeholder, or uses one the email
does not provide, is not sent: the built-in text is used instead and a warning
naming the template is written to the server log. Use a test send to see exactly
what a user would receive:

```bash
civic notify:test --to you@example.com --template password_reset \
  --variables '{"reset_url":"https://example.com/reset?token=x","username":"you"}'
```

## CLI Commands

```bash
# A direct message through the configured transport
civic notify:test --to user@example.com --subject "Test Email" --message "Test message"

# The same, forcing the other transport for this send only
civic notify:test --to user@example.com --subject "Test" --message "Test" --provider sendgrid

# One of the authentication templates, as configured
civic notify:test --to user@example.com --template email_verification \
  --variables '{"verification_url":"https://example.com/verify"}'

# What the file says (API key masked)
civic notify:config

# Send history and statistics from the notification audit log
civic notify:queue --json
```

`notify:queue` reads the audit log; there is no queue behind it, and the name is
kept for compatibility.

## Troubleshooting

### Certificate errors

`rejectUnauthorized: false` under `smtp.tls` accepts a self-signed certificate.
Use it for a test relay, not for a server on the internet.

### Nothing is sent

1. `channels.email.enabled` must be `true` — the shipped file says `false`.
2. `provider` must be `smtp` or `sendgrid`, and that block must be filled in.
3. Run `civic notify:test --to you@example.com --subject t --message t`; a
   failure is reported as one, with the transport's error.
4. Past `rules.rate_limits.email_per_hour` sends in an hour, further sends are
   refused until the hour turns.

## Security Considerations

- `.system-data/notifications.yml` holds credentials; it is outside Git and
  readable by the settings editor. Keep file permissions tight.
- Leave `tls.rejectUnauthorized` at `true` for any server on the internet.
- Every send attempt is recorded in the notification audit log without the
  message body; a failed test send never returns the transport's raw error to
  the browser (it may carry hosts and credential hints).
- The `security` keys above decide what the audit log and the operator inbox
  keep; the instance secret (`CIVICPRESS_SECRET_FILE` in the deploy) is what
  unseals encrypted inbox entries, so losing it means losing their text.

## Integration

### Authentication Workflows

- Email verification for new accounts and for email changes
  (`email_verification`, `email_change_verification`)
- Password reset (`password_reset`) — see below
- Security alerts go to the operator notification center, not to email

## Password recovery (forgot-password)

CivicPress ships with **no** communication channel enabled by default, so
password recovery is designed to work out of the box regardless of what is
configured. A reset is delivered by **audience**:

1. **A user-facing channel can reach the account owner** → a single-use, hashed,
   1-hour reset token is minted and a self-service link is delivered:
   - `email`, when the email channel is configured, **or**
   - `console` (below), the development sink.
2. **No user-facing channel** (the default production posture) → **no token is
   minted**. Instead an actionable task is filed in the operator notification
   center, and an administrator fulfills it with
   `civic users:set-password <username>` (relaying the new credential
   out-of-band). OAuth-only accounts are ineligible (no local password).

The request endpoint (`POST /api/v1/auth/forgot-password`) is anti-enumeration —
it responds identically whether or not an account matched — and is rate-limited
by the `/auth` window. Setting a new password revokes every existing session.

The reset link points at the UI's `/auth/reset-password` page. Its base comes
from `BASE_URL` (default `http://localhost:3030`).

### Console channel (development sink)

The `console` channel makes the email-shaped flows runnable without SMTP: it
prints the rendered message (including any reset link) to the server console and
writes a file outbox under `.system-data/outbox/`.

- **On by default** in `development` and `test`.
- **Off in production** unless `CIVIC_CONSOLE_NOTIFICATIONS=true` — printing a
  reset link to server stdout is a credential-in-logs hazard, so production
  falls through to the operator notification center instead.

## Operator notification center

A durable, admin-only, channel-free feed for signal that needs an operator's
attention — undeliverable password-reset requests, backup failures,
account-lockout security alerts, and available updates. It is stored in the
database (not Git) and is the zero-config fallback sink.

- **API:** `GET /api/v1/admin/notifications` (+ `/unread-count`, `/:id/read`,
  `/:id/dismiss`, `/read-all`), gated by `system:admin`.
- **CLI:** `civic notifications:list|read|dismiss|read-all`,
  `civic users:reset-requests`.
- **UI:** `/settings/alerts`, with a live unread badge in the sidebar.

**Producers** (what writes to it): undeliverable password resets; a failed
`civic backup`; a fresh account lockout; and `civic system:check-updates`
(compares the running version to the newest GitHub release and files a deduped
`update_available` entry — local/cron-friendly, `--latest` for offline). To emit
your own, call
`civicPress.getOperatorNotifier().notify|systemError|securityAlert|updateAvailable(...)`.
