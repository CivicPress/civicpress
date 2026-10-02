import { NotificationChannel } from './notification-channel.js';
import {
  NotificationTemplate,
  type ProcessedTemplate,
} from './notification-template.js';
import { NotificationConfig } from './notification-config.js';
import { NotificationAudit } from './notification-audit.js';
import { NotificationSecurity } from './notification-security.js';
import { NotificationRateLimiter } from './notification-rate-limiter.js';
import { NotificationLogger } from './notification-logger.js';
import { coreDebug, coreError } from '../utils/core-output.js';
import { createHmac } from 'crypto';
import type { AuditChannel } from '../audit/audit-channel.js';

export interface NotificationRequest {
  userId?: string;
  email?: string;
  phone?: string;
  channels: string[];
  template: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: Record<string, any>;
  priority?: 'low' | 'normal' | 'high' | 'urgent';
  scheduledAt?: Date;
  expiresAt?: Date;
}

export interface NotificationResponse {
  success: boolean;
  notificationId: string;
  sentChannels: string[];
  failedChannels: string[];
  errors?: string[];
}

export class NotificationService {
  private channels: Map<string, NotificationChannel> = new Map();
  private templates: Map<string, NotificationTemplate> = new Map();
  private config: NotificationConfig;
  private audit: NotificationAudit;
  private security: NotificationSecurity;
  private rateLimiter: NotificationRateLimiter;
  private logger: NotificationLogger;
  /**
   * The unified audit trail (`audit_logs` + activity file). When
   * `security.audit_all_notifications` is on, every send attempt is recorded
   * there too — channels, template, outcome and a hash of the recipient,
   * never the message. Optional: a service built without one (the CLI test
   * send, a unit test) keeps the notification audit file only.
   */
  private auditChannel?: AuditChannel;
  /**
   * The key recipients are hashed with in the unified audit trail (HMAC, so
   * the trail is not an oracle for "was this address notified"). Resolved at
   * record time: the secrets manager is usually initialized after this
   * service is built. Without a key, no recipient is recorded.
   */
  private recipientKey?: () => Buffer | undefined;

  constructor(
    config: NotificationConfig,
    options: {
      auditChannel?: AuditChannel;
      recipientKey?: () => Buffer | undefined;
    } = {}
  ) {
    this.config = config;
    const security = config.getSecuritySettings();
    this.audit = new NotificationAudit(undefined, {
      redactPii: security.filter_pii === true,
    });
    this.security = new NotificationSecurity();
    this.rateLimiter = new NotificationRateLimiter(config.getRateLimits());
    this.logger = new NotificationLogger();
    this.auditChannel = options.auditChannel;
    this.recipientKey = options.recipientKey;
  }

  /**
   * The recipient as the audit trail may keep it: a truncated HMAC-SHA256 of
   * the address (or phone number, or user id), lower-cased, under the
   * instance's recipient-hash key — enough to tell "the same recipient
   * again", not enough to look an address up. Undefined without a key.
   */
  private hashRecipient(request: NotificationRequest): string | undefined {
    const key = this.recipientKey?.();
    if (!key) return undefined;
    const recipient = (request.email || request.phone || request.userId || '')
      .toString()
      .trim()
      .toLowerCase();
    if (!recipient) return undefined;
    return createHmac('sha256', key)
      .update(recipient)
      .digest('hex')
      .slice(0, 16);
  }

  /**
   * `security.audit_all_notifications`: mirror a send attempt into the
   * unified audit trail. Best effort — a trail that cannot be written must
   * not turn a delivered email into a reported failure.
   */
  private async recordInUnifiedAudit(event: {
    notificationId: string;
    request: NotificationRequest;
    outcome: 'success' | 'failure';
    message: string;
    details?: Record<string, unknown>;
  }): Promise<void> {
    if (!this.auditChannel) return;
    if (this.config.getSecuritySettings().audit_all_notifications !== true) {
      return;
    }
    const recipient = this.hashRecipient(event.request);
    try {
      await this.auditChannel.record({
        action: 'notification:send',
        resourceType: 'notification',
        resourceId: event.notificationId,
        source: 'core',
        outcome: event.outcome,
        message: event.message,
        details: {
          template: event.request.template,
          channels: event.request.channels,
          // Only under a key — never an unkeyed hash, and never an empty slot.
          ...(recipient ? { recipient } : {}),
          ...event.details,
        },
      });
    } catch (error) {
      coreError(
        'Failed to record notification in the audit trail',
        'NOTIFICATION_AUDIT_TRAIL_FAILED',
        {
          notificationId: event.notificationId,
          error: error instanceof Error ? error.message : String(error),
        },
        { operation: 'notification:send' }
      );
    }
  }

  /**
   * Register a notification channel
   */
  registerChannel(name: string, channel: NotificationChannel): void {
    this.channels.set(name, channel);
    // Bootstrap detail — `debug`, not `info`: this fires during core
    // initialization for every command, and at `info` it prints to stdout,
    // corrupting the `--json` machine contract (and any "stdout clean" path).
    this.logger.debug(`Registered notification channel: ${name}`);
  }

  /**
   * Register a notification template
   */
  registerTemplate(name: string, template: NotificationTemplate): void {
    this.templates.set(name, template);
    // Bootstrap detail — `debug`, not `info` (see registerChannel).
    this.logger.debug(`Registered notification template: ${name}`);
  }

  /**
   * Send a notification
   */
  async sendNotification(
    request: NotificationRequest
  ): Promise<NotificationResponse> {
    const notificationId = this.generateNotificationId();
    // Set once the attempt has been written to the audit paths, so the catch
    // block below records the attempts that fail elsewhere (template missing,
    // rendering threw) without recording a rejected one twice.
    let audited = false;
    try {
      coreDebug(`Notification ID: ${notificationId}`, {
        operation: 'notification:send',
      });
      coreDebug(`Template: ${request.template}`, {
        operation: 'notification:send',
      });
      coreDebug(`Channels: ${request.channels.join(', ')}`, {
        operation: 'notification:send',
      });
      coreDebug(`Email: ${request.email}`, {
        operation: 'notification:send',
      });
      coreDebug('Notification data', request.data, {
        operation: 'notification:send',
      });

      // notifications-002 (Critical) — inspect validateRequest's return.
      // Previously the call was awaited but the result was discarded, so
      // requests with too many channels, oversized payloads, or missing
      // required fields proceeded anyway.
      const validation = await this.security.validateRequest(request);
      if (!validation.valid) {
        await this.audit.logNotification({
          id: notificationId,
          action: 'notification_rejected',
          details: {
            reason: 'validation_failed',
            errors: validation.errors,
            warnings: validation.warnings,
            template: request.template,
            channels: request.channels,
          },
        });
        await this.recordInUnifiedAudit({
          notificationId,
          request,
          outcome: 'failure',
          message: 'Notification rejected: invalid request',
          details: { reason: 'validation_failed' },
        });
        audited = true;
        throw new Error(
          `Notification request invalid: ${validation.errors.join(', ')}`
        );
      }

      // notifications-002 (Critical) — same for rate limiting. Previously
      // the rate limiter incremented its counter but never enforced it.
      const rateLimit = await this.rateLimiter.checkRateLimit(request);
      if (!rateLimit.allowed) {
        await this.audit.logNotification({
          id: notificationId,
          action: 'notification_rejected',
          details: {
            reason: 'rate_limited',
            resetTime: rateLimit.resetTime,
            remaining: rateLimit.remaining,
            template: request.template,
            channels: request.channels,
          },
        });
        await this.recordInUnifiedAudit({
          notificationId,
          request,
          outcome: 'failure',
          message: 'Notification rejected: rate-limited',
          details: { reason: 'rate_limited' },
        });
        audited = true;
        throw new Error(
          `Notification rate-limited. Retry after ${rateLimit.resetTime.toISOString()}.`
        );
      }

      // Get template
      const template = this.templates.get(request.template);

      if (!template) {
        throw new Error(`Template not found: ${request.template}`);
      }

      // Process template with data
      const processedContent = await template.process(request.data);

      // notifications-003 (Critical) — DO NOT sanitize PII out of the
      // template variable bag before rendering. Previously a user's
      // email used as a template variable became literal "[REDACTED]"
      // in the sent message body. PII protection belongs at the audit
      // log persistence path (where PII must not be stored), not at
      // the rendering path (where it's the actual content the
      // recipient needs to see).
      const channelData = request.data;

      // Send to each channel
      const results = await Promise.allSettled(
        request.channels.map((channelName) =>
          this.sendToChannel(channelName, {
            ...request,
            content: processedContent,
            data: channelData,
          })
        )
      );

      // Process results
      const sentChannels: string[] = [];
      const failedChannels: string[] = [];
      const errors: string[] = [];

      results.forEach((result, index) => {
        const channelName = request.channels[index];
        if (result.status === 'fulfilled') {
          sentChannels.push(channelName);
        } else {
          failedChannels.push(channelName);
          errors.push(`${channelName}: ${result.reason}`);
        }
      });

      // notifications-001 (Critical) — audit log now reflects ACTUAL
      // delivery. Previously success: true was hardcoded regardless of
      // outcome, producing a structurally dishonest log (5,156 entries
      // historically had 0 failures recorded; 89% had empty channels
      // arrays). Now: success = (≥1 channel succeeded AND 0 failed);
      // partial = (≥1 succeeded AND ≥1 failed). The audit row also
      // carries failedChannels and per-channel errors for accountability.
      const allSucceeded =
        sentChannels.length > 0 && failedChannels.length === 0;
      const partial = sentChannels.length > 0 && failedChannels.length > 0;

      await this.audit.logNotification({
        id: notificationId,
        action: allSucceeded
          ? 'notification_sent'
          : 'notification_partial_or_failed',
        details: {
          channels: sentChannels,
          failedChannels,
          success: allSucceeded,
          partial,
          errors: errors.length > 0 ? errors : undefined,
          template: request.template,
        },
      });

      await this.recordInUnifiedAudit({
        notificationId,
        request,
        outcome: allSucceeded ? 'success' : 'failure',
        message: allSucceeded
          ? `Notification sent (${request.template}) via ${sentChannels.join(', ')}`
          : `Notification ${partial ? 'partially ' : ''}failed (${request.template}): ${failedChannels.join(', ')}`,
        details: { sentChannels, failedChannels, partial },
      });
      audited = true;

      const response: NotificationResponse = {
        success: sentChannels.length > 0,
        notificationId,
        sentChannels,
        failedChannels,
        errors: errors.length > 0 ? errors : undefined,
      };

      coreDebug('Notification response', response, {
        operation: 'notification:send',
      });
      this.logger.info(`Notification sent: ${notificationId}`, response);
      return response;
    } catch (error) {
      if (!audited) {
        // Template not found, rendering threw, a channel map blew up: an
        // attempt that left no trail used to be invisible to both audits.
        const reason = error instanceof Error ? error.message : String(error);
        await this.audit.logNotification({
          id: notificationId,
          action: 'notification_failed',
          details: {
            success: false,
            template: request.template,
            channels: request.channels,
            errors: [reason],
          },
        });
        await this.recordInUnifiedAudit({
          notificationId,
          request,
          outcome: 'failure',
          message: 'Notification failed before delivery',
          details: { reason: 'send_failed' },
        });
      }
      coreError(
        `Notification failed: ${notificationId}`,
        'NOTIFICATION_FAILED',
        {
          error: error instanceof Error ? error.message : String(error),
          notificationId,
        },
        { operation: 'notification:send' }
      );
      this.logger.error(
        `Notification failed: ${notificationId}`,
        error as Error
      );
      throw error;
    }
  }

  /**
   * Send notification to a specific channel
   */
  private async sendToChannel(
    channelName: string,
    request: NotificationRequest & {
      content: ProcessedTemplate;
      data: Record<string, unknown>;
    }
  ): Promise<void> {
    const channel = this.channels.get(channelName);

    if (!channel) {
      // sms/slack are declared in the config schema (with defaults + rate
      // limits) but no channel implementation was ever built — only email
      // exists. Say so plainly rather than a generic "not found", so an
      // operator who enables them isn't left guessing.
      if (channelName === 'sms' || channelName === 'slack') {
        throw new Error(
          `Channel '${channelName}' is configurable but not implemented (only 'email' is available)`
        );
      }
      throw new Error(`Channel not found: ${channelName}`);
    }

    // Check if channel is enabled
    const isEnabled = this.config.isChannelEnabled(channelName);
    if (!isEnabled) {
      throw new Error(`Channel disabled: ${channelName}`);
    }

    const recipient = this.getChannelRecipient(request, channelName);

    // A blank recipient used to be dispatched anyway (getChannelRecipient
    // returns '' for a missing address) and logged as "sent successfully".
    // Fail loudly instead — a notification to nobody is never a success.
    if (!recipient || !recipient.trim()) {
      throw new Error(
        `No recipient for channel '${channelName}' (missing ${
          channelName === 'sms'
            ? 'phone'
            : channelName === 'slack'
              ? 'userId'
              : 'email'
        })`
      );
    }

    // Send via channel. Per the NotificationChannel contract, send() reports a
    // delivery failure by RETURNING { success:false } (the auth email adapter
    // catches SMTP errors this way) rather than throwing. An unchecked await
    // therefore counted a failed send as delivered — Promise.allSettled saw it
    // "fulfilled", so the row was audited success:true (a notifications-001
    // regression on the actual auth path). Honor the contract: a success:false
    // response is a failure, so throw and let it land in failedChannels.
    const response = await channel.send({
      to: recipient,
      content: request.content,
      data: request.data,
      priority: request.priority || 'normal',
    });
    if (response && response.success === false) {
      throw new Error(
        response.error || `Channel '${channelName}' reported a delivery failure`
      );
    }

    coreDebug(`Channel ${channelName} sent successfully`, {
      operation: 'notification:send',
      channel: channelName,
    });
  }

  /**
   * Get recipient for specific channel
   */
  private getChannelRecipient(
    request: NotificationRequest,
    channelName: string
  ): string {
    switch (channelName) {
      case 'email':
        return request.email || '';
      case 'sms':
        return request.phone || '';
      case 'slack':
        return request.userId || '';
      default:
        return request.userId || request.email || '';
    }
  }

  /**
   * Generate unique notification ID
   */
  private generateNotificationId(): string {
    return `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get notification statistics
   */
  async getStatistics(): Promise<{
    totalSent: number;
    totalFailed: number;
    channels: Record<string, { sent: number; failed: number }>;
  }> {
    return this.audit.getStatistics();
  }

  /**
   * Get notification history
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async getHistory(limit: number = 100): Promise<any[]> {
    return this.audit.getHistory(limit);
  }
}
