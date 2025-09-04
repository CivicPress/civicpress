import { NotificationChannel } from './notification-channel.js';
import { NotificationTemplate } from './notification-template.js';
import { NotificationConfig } from './notification-config.js';
import { NotificationAudit } from './notification-audit.js';
import { NotificationQueue } from './notification-queue.js';
import { NotificationSecurity } from './notification-security.js';
import { NotificationRateLimiter } from './notification-rate-limiter.js';
import { NotificationLogger } from './notification-logger.js';

export interface NotificationRequest {
  userId?: string;
  email?: string;
  phone?: string;
  channels: string[];
  template: string;
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
  private queue: NotificationQueue;
  private security: NotificationSecurity;
  private rateLimiter: NotificationRateLimiter;
  private logger: NotificationLogger;

  constructor(config: NotificationConfig) {
    this.config = config;
    this.audit = new NotificationAudit();
    this.queue = new NotificationQueue();
    this.security = new NotificationSecurity();
    this.rateLimiter = new NotificationRateLimiter(
      config.getRateLimits() as any
    );
    this.logger = new NotificationLogger();
  }

  /**
   * Register a notification channel
   */
  registerChannel(name: string, channel: NotificationChannel): void {
    this.channels.set(name, channel);
    this.logger.info(`Registered notification channel: ${name}`);
  }

  /**
   * Register a notification template
   */
  registerTemplate(name: string, template: NotificationTemplate): void {
    this.templates.set(name, template);
    this.logger.info(`Registered notification template: ${name}`);
  }

  /**
   * Send a notification
   */
  async sendNotification(
    request: NotificationRequest
  ): Promise<NotificationResponse> {
    const notificationId = this.generateNotificationId();

    try {
      console.log(`🔧 [DEBUG] NotificationService.sendNotification called:`);
      console.log(`  - Notification ID: ${notificationId}`);
      console.log(`  - Template: ${request.template}`);
      console.log(`  - Channels: ${request.channels.join(', ')}`);
      console.log(`  - Email: ${request.email}`);
      console.log(`  - Data:`, request.data);

      // Security checks
      await this.security.validateRequest(request);

      // Rate limiting
      await this.rateLimiter.checkRateLimit(request);

      // Get template
      const template = this.templates.get(request.template);

      if (!template) {
        throw new Error(`Template not found: ${request.template}`);
      }

      // Process template with data
      const processedContent = await template.process(request.data);

      // Filter sensitive data
      const sanitizedData = this.security.sanitizeContent(request.data);

      // Send to each channel
      const results = await Promise.allSettled(
        request.channels.map((channelName) =>
          this.sendToChannel(channelName, {
            ...request,
            content: processedContent,
            data: sanitizedData,
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

      // Audit the notification
      await this.audit.logNotification({
        id: notificationId,
        action: 'notification_sent',
        details: {
          channels: sentChannels,
          success: true,
        },
      });

      const response: NotificationResponse = {
        success: sentChannels.length > 0,
        notificationId,
        sentChannels,
        failedChannels,
        errors: errors.length > 0 ? errors : undefined,
      };

      console.log(`✅ [DEBUG] Notification response:`, response);
      this.logger.info(`Notification sent: ${notificationId}`, response);
      return response;
    } catch (error) {
      console.log(`❌ [DEBUG] Notification failed:`, error);
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
    request: NotificationRequest & { content: any; data: Record<string, any> }
  ): Promise<void> {
    const channel = this.channels.get(channelName);

    if (!channel) {
      throw new Error(`Channel not found: ${channelName}`);
    }

    // Check if channel is enabled
    const isEnabled = this.config.isChannelEnabled(channelName);
    console.log(`🔧 [DEBUG] Channel ${channelName} enabled: ${isEnabled}`);
    if (!isEnabled) {
      throw new Error(`Channel disabled: ${channelName}`);
    }

    const recipient = this.getChannelRecipient(request, channelName);
    console.log(`🔧 [DEBUG] Channel recipient: ${recipient}`);

    console.log(`🔧 [DEBUG] About to call channel.send with:`, {
      to: recipient,
      content: request.content,
      data: request.data,
      priority: request.priority || 'normal',
    });

    // Send via channel
    await channel.send({
      to: recipient,
      content: request.content,
      data: request.data,
      priority: request.priority || 'normal',
    });

    console.log(`✅ [DEBUG] Channel ${channelName} sent successfully`);
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
  async getHistory(limit: number = 100): Promise<any[]> {
    return this.audit.getHistory(limit);
  }
}
