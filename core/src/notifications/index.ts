// Core notification system
export { NotificationService } from './notification-service.js';
export { NotificationChannel } from './notification-channel.js';
export { NotificationTemplate } from './notification-template.js';
export { NotificationConfig } from './notification-config.js';
export { AuthTemplate } from './templates/auth-template.js';

// Channels (canonical implementations)
export { EmailChannel } from './channels/email-channel.js';
export {
  ConsoleChannel,
  isConsoleChannelEnabled,
} from './channels/console-channel.js';

// Operator notification center (the "inbox") + password recovery orchestration
export { OperatorNotifier } from './operator-notifier.js';
export {
  PasswordRecoveryService,
  defaultOutboxDir,
} from './password-recovery-service.js';

// Supporting classes
export { NotificationAudit } from './notification-audit.js';
export { NotificationQueue } from './notification-queue.js';
export { NotificationSecurity } from './notification-security.js';
export { NotificationRateLimiter } from './notification-rate-limiter.js';
export { NotificationLogger, LogLevel } from './notification-logger.js';

// Types and interfaces
export type {
  NotificationRequest,
  NotificationResponse,
} from './notification-service.js';

export type {
  ChannelRequest,
  ChannelResponse,
  ChannelConfig,
} from './notification-channel.js';

export type {
  TemplateData,
  ProcessedTemplate,
} from './notification-template.js';

export type { AuditEntry } from './notification-audit.js';

export type { QueuedNotification } from './notification-queue.js';

export type {
  RateLimitConfig,
  RateLimitResult,
} from './notification-rate-limiter.js';

export type { SecurityValidationResult } from './notification-security.js';

export type { LogEntry } from './notification-logger.js';

export type {
  OperatorNotificationType,
  OperatorNotificationView,
} from './operator-notifier.js';

export type {
  ConsoleChannelOptions,
} from './channels/console-channel.js';

export type {
  ResetTokenIssuer,
  PasswordResetOutcome,
  PasswordResetChannel,
  PasswordRecoveryDeps,
} from './password-recovery-service.js';

export type {
  EmailMessage,
  EmailChannelOptions,
  EmailSendResult,
  SmtpOptions,
  SendGridOptions,
} from './channels/email-channel.js';
