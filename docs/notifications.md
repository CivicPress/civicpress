# Notification System

## Overview

The CivicPress notification system provides flexible email delivery through
multiple providers including SMTP and SendGrid. It supports both direct email
sending and template-based notifications for authentication workflows.

## Features

- **Multi-Provider Support**: SMTP, SendGrid, AWS SES, Nodemailer
- **Template System**: Pre-built templates for authentication workflows
- **SSL/TLS Support**: Secure email delivery with certificate handling
- **Debug Logging**: Comprehensive debugging for troubleshooting
- **Queue Management**: Email queue monitoring and retry logic
- **Rate Limiting**: Configurable rate limits per provider

## Configuration

### Location

Notification configuration is stored in `.system-data/notifications.yml`
(sensitive data, not in Git).

### Environment Variables (Preferred)

For a complete example of all available environment variables, see
[`notifications-credentials.example`](./notifications-credentials.example). Copy
the relevant variables to your `.env.local` file.

### Configuration Structure

```yaml
channels:
  email:
    enabled: true
    provider: 'smtp'  # or 'sendgrid', 'ses', 'nodemailer'

# SMTP Configuration
    smtp:
      host: 'mail.example.com'
      port: 587
      secure: false
      auth:
        user: 'smtp@example.com'
        pass: 'your-password'
      from: 'smtp@example.com'
      tls:
        rejectUnauthorized: false  # For SSL certificate issues

# SendGrid Configuration
    sendgrid:
      apiKey: 'SG.your-api-key'
      from: 'noreply@example.com'
      sandboxMode: true  # For testing without domain verification

# AWS SES Configuration
    ses:
      accessKeyId: 'your-access-key'
      secretAccessKey: 'your-secret-key'
      region: 'us-east-1'
      from: 'noreply@example.com'

auth_templates:
  email_verification:
    subject: 'Verify your CivicPress account'
    body: 'Please click the following link to verify your account: {{verification_url}}'
  password_reset:
    subject: 'Reset your CivicPress password'
    body: 'Click here to reset your password: {{reset_url}}'
  two_factor_auth:
    subject: 'Your CivicPress verification code'
    body: 'Your verification code is: {{code}}'
  security_alert:
    subject: 'Security alert for your account'
    body: 'Suspicious activity detected: {{details}}'

rules:
  rate_limits:
    email_per_hour: 100
    sms_per_hour: 50
    slack_per_hour: 200
  retry_attempts: 3
  retry_delay: 5000

security:
  encrypt_sensitive_data: true
  audit_all_notifications: true
  filter_pii: true
```

## CLI Commands

### Test Notification System

```bash
# Test with SMTP
civic notify:test --to user@example.com --subject "Test Email" --message "Test message" --provider smtp

# Test with SendGrid
civic notify:test --to user@example.com --subject "Test Email" --message "Test message" --provider sendgrid

# Test with template
civic notify:test --to user@example.com --template email_verification --variables '{"verification_url":"https://example.com/verify"}' --provider smtp

# JSON output
civic notify:test --to user@example.com --subject "Test" --message "Test" --provider smtp --json
```

### Monitor Notification Queue

```bash
# View notification queue
civic notify:queue

# JSON output
civic notify:queue --json
```

### Retry Failed Notifications

```bash
# Retry failed notifications
civic notify:retry

# Retry specific notification
civic notify:retry --id notification-id
```

## Providers

### SMTP

**Best for**: Self-hosted email servers, custom domains

**Configuration**:

```yaml
smtp:
  host: 'mail.example.com'
  port: 587
  secure: false
  auth:
    user: 'smtp@example.com'
    pass: 'your-password'
  from: 'smtp@example.com'
  tls:
    rejectUnauthorized: false  # For SSL certificate issues
```

**Common Providers**:

- Gmail: `smtp.gmail.com:587`
- Outlook: `smtp-mail.outlook.com:587`
- Yahoo: `smtp.mail.yahoo.com:587`
- Custom: `mail.yourdomain.com:587`

### SendGrid

**Best for**: High-volume email, marketing campaigns

**Configuration**:

```yaml
sendgrid:
  apiKey: 'SG.your-api-key'
  from: 'noreply@example.com'
  sandboxMode: true  # For testing
```

**Features**:

- Sandbox mode for testing without domain verification
- Template support
- Delivery tracking
- Rate limiting

### AWS SES

**Best for**: AWS infrastructure, high reliability

**Configuration**:

```yaml
ses:
  accessKeyId: 'your-access-key'
  secretAccessKey: 'your-secret-key'
  region: 'us-east-1'
  from: 'noreply@example.com'
```

## Templates

### Built-in Templates

- `email_verification`: Account verification emails
- `password_reset`: Password reset emails
- `two_factor_auth`: 2FA code emails
- `security_alert`: Security notification emails

### Custom Templates

Create custom templates by adding to the `auth_templates` section:

```yaml
auth_templates:
  welcome_email:
    subject: 'Welcome to CivicPress'
    body: 'Welcome {{name}}! Your account has been created successfully.'
  record_updated:
    subject: 'Record Updated'
    body: 'Record {{record_id}} has been updated by {{user}}.'
```

## Troubleshooting

### SSL Certificate Issues

If you get SSL certificate errors:

```yaml
tls:
  rejectUnauthorized: false
```

### Authentication Issues

1. Check credentials are correct
2. Verify SMTP server settings
3. Check if authentication is required
4. Test connection manually

### SendGrid Sandbox Mode

In sandbox mode, emails only deliver to verified recipients:

1. Go to SendGrid dashboard
2. Navigate to Settings > Sender Authentication
3. Add recipient email addresses
4. Verify via email link

### Debug Mode

Enable debug logging to troubleshoot:

```bash
# Verbose output
civic notify:test --to test@example.com --subject "Debug" --message "Test" --provider smtp --verbose

# Check queue for errors
civic notify:queue --json
```

## Security Considerations

- Store sensitive configuration in `.system-data/` (not in Git)
- Use environment variables for API keys in production
- Enable SSL/TLS for all email providers
- Implement rate limiting to prevent abuse
- Audit all notification activities
- Filter PII from notification content

## Integration

### Authentication Workflows

The notification system integrates with authentication workflows:

- Email verification for new accounts
- Password reset functionality (see below)
- Two-factor authentication
- Security alerts

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

### Hook System

Notifications can be triggered by system events:

```yaml
hooks:
  - event: 'user:registered'
    action: 'notify:email_verification'
  - event: 'record:created'
    action: 'notify:record_created'
```

## Best Practices

1. **Test thoroughly** before production use
2. **Monitor delivery rates** and bounce rates
3. **Use templates** for consistent messaging
4. **Implement retry logic** for failed deliveries
5. **Log all activities** for audit purposes
6. **Rate limit** to prevent abuse
7. **Secure credentials** properly
8. **Test with multiple providers** for redundancy
