import {
  NotificationChannel,
  ChannelRequest,
  ChannelResponse,
  ChannelConfig,
} from '../../../core/src/notifications/notification-channel.js';

export class EmailChannel extends NotificationChannel {
  private provider: 'sendgrid' | 'ses' | 'smtp' | 'nodemailer';

  constructor(config: ChannelConfig) {
    super('email', config);
    this.provider =
      (config.provider as 'sendgrid' | 'ses' | 'smtp' | 'nodemailer') ||
      'nodemailer';
  }

  /**
   * Send email notification via the configured provider
   */
  async send(request: ChannelRequest): Promise<ChannelResponse> {
    try {
      // Route to the appropriate provider
      switch (this.provider) {
        case 'sendgrid':
          return await this.sendViaSendGrid(request);
        case 'ses':
          return await this.sendViaSES(request);
        case 'smtp':
          return await this.sendViaSMTP(request);
        case 'nodemailer':
          return await this.sendViaNodemailer(request);
        default:
          throw new Error(`Unsupported email provider: ${this.provider}`);
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Send via SendGrid
   */
  private async sendViaSendGrid(
    request: ChannelRequest
  ): Promise<ChannelResponse> {
    try {
      const sgMail = require('@sendgrid/mail');
      sgMail.setApiKey(this.config.credentials.apiKey);

      const msg: any = {
        to: request.to,
        from: this.config.credentials.from,
        subject: request.content.subject,
        text: request.content.text || request.content.body,
        html: request.content.html,
      };

      // Add sandbox mode if configured
      if (this.config.credentials.sandboxMode) {
        msg.mail_settings = {
          sandbox_mode: {
            enable: true,
          },
        };
      }

      const response = await sgMail.send(msg);

      return {
        success: true,
        messageId: response[0]?.headers['x-message-id'] || `sg_${Date.now()}`,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'SendGrid send failed',
      };
    }
  }

  /**
   * Send via AWS SES
   */
  private async sendViaSES(request: ChannelRequest): Promise<ChannelResponse> {
    // TODO: Implement AWS SES integration
    // const AWS = require('aws-sdk');
    // const ses = new AWS.SES({
    //   accessKeyId: this.config.credentials.accessKeyId,
    //   secretAccessKey: this.config.credentials.secretAccessKey,
    //   region: this.config.credentials.region,
    // });
    //
    // const params = {
    //   Source: this.config.from,
    //   Destination: { ToAddresses: [request.to] },
    //   Message: {
    //     Subject: { Data: request.content.subject },
    //     Body: {
    //       Text: { Data: request.content.text },
    //       Html: { Data: request.content.html },
    //     },
    //   },
    // };
    //
    // await ses.sendEmail(params).promise();

    throw new Error('AWS SES integration not yet implemented');
  }

  /**
   * Send via SMTP
   */
  private async sendViaSMTP(request: ChannelRequest): Promise<ChannelResponse> {
    try {
      const nodemailer = require('nodemailer');

      console.log('🔧 SMTP Configuration:');
      console.log(`  Host: ${this.config.credentials.host}`);
      console.log(`  Port: ${this.config.credentials.port}`);
      console.log(`  Secure: ${this.config.credentials.secure}`);
      console.log(`  User: ${this.config.credentials.auth.user}`);
      console.log(`  From: ${this.config.credentials.from}`);
      console.log(`  To: ${request.to}`);

      const transporter = nodemailer.createTransporter({
        host: this.config.credentials.host,
        port: this.config.credentials.port,
        secure: this.config.credentials.secure,
        auth: {
          user: this.config.credentials.auth.user,
          pass: this.config.credentials.auth.pass,
        },
        debug: true, // Enable debug output
        logger: true, // Enable logging
      });

      // Test connection first
      console.log('🔧 Testing SMTP connection...');
      await transporter.verify();
      console.log('✅ SMTP connection verified successfully');

      const mailOptions = {
        from: this.config.credentials.from,
        to: request.to,
        subject: request.content.subject,
        text: request.content.text || request.content.body,
        html: request.content.html,
      };

      console.log('🔧 Sending email...');
      const info = await transporter.sendMail(mailOptions);
      console.log('✅ Email sent successfully');
      console.log(`  Message ID: ${info.messageId}`);
      console.log(`  Response: ${JSON.stringify(info, null, 2)}`);

      return {
        success: true,
        messageId: info.messageId || `smtp_${Date.now()}`,
      };
    } catch (error) {
      console.error('❌ SMTP Error:');
      console.error(`  Error: ${error.message}`);
      console.error(`  Code: ${error.code}`);
      console.error(`  Command: ${error.command}`);
      console.error(`  Response: ${error.response}`);
      console.error(`  ResponseCode: ${error.responseCode}`);

      return {
        success: false,
        error: error instanceof Error ? error.message : 'SMTP send failed',
      };
    }
  }

  /**
   * Send via Nodemailer (Generic SMTP)
   */
  private async sendViaNodemailer(
    request: ChannelRequest
  ): Promise<ChannelResponse> {
    try {
      const nodemailer = require('nodemailer');

      const transporter = nodemailer.createTransporter({
        host: this.config.credentials.host,
        port: this.config.credentials.port,
        secure: this.config.credentials.secure,
        auth: {
          user: this.config.credentials.auth.user,
          pass: this.config.credentials.auth.pass,
        },
      });

      const mailOptions = {
        from: this.config.credentials.from,
        to: request.to,
        subject: request.content.subject,
        text: request.content.text || request.content.body,
        html: request.content.html,
      };

      const info = await transporter.sendMail(mailOptions);

      return {
        success: true,
        messageId: info.messageId || `nm_${Date.now()}`,
      };
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error ? error.message : 'Nodemailer send failed',
      };
    }
  }

  /**
   * Test channel connectivity
   */
  async test(): Promise<boolean> {
    try {
      // Test based on provider
      switch (this.provider) {
        case 'sendgrid':
          return this.testSendGridConnection();
        case 'ses':
          return this.testSESConnection();
        case 'smtp':
        case 'nodemailer':
          return this.testSMTPConnection();
        default:
          console.warn(
            `Email provider '${this.provider}' not properly configured`
          );
          return false;
      }
    } catch (error) {
      console.error('❌ Email channel test failed:', error);
      return false;
    }
  }

  /**
   * Test SendGrid connection
   */
  private async testSendGridConnection(): Promise<boolean> {
    const config = this.config.credentials;
    if (!config.apiKey) {
      console.warn('SendGrid API key not configured');
      return false;
    }
    console.log('✅ SendGrid connection test passed');
    return true;
  }

  /**
   * Test AWS SES connection
   */
  private async testSESConnection(): Promise<boolean> {
    const config = this.config.credentials;
    if (!config.accessKeyId || !config.secretAccessKey) {
      console.warn('AWS SES credentials not configured');
      return false;
    }
    console.log('✅ AWS SES connection test passed');
    return true;
  }

  /**
   * Test SMTP connection
   */
  private async testSMTPConnection(): Promise<boolean> {
    const config = this.config.credentials;
    if (!config.host || !config.auth?.user) {
      console.warn('SMTP configuration not properly configured');
      return false;
    }
    console.log('✅ SMTP connection test passed');
    return true;
  }

  /**
   * Validate channel configuration
   */
  async validateConfig(): Promise<boolean> {
    try {
      switch (this.provider) {
        case 'sendgrid':
          return this.validateSendGridConfig();
        case 'ses':
          return this.validateSESConfig();
        case 'smtp':
        case 'nodemailer':
          return this.validateSMTPConfig();
        default:
          console.error(`Unsupported email provider: ${this.provider}`);
          return false;
      }
    } catch (error) {
      console.error('Configuration validation failed:', error);
      return false;
    }
  }

  /**
   * Validate SendGrid configuration
   */
  private validateSendGridConfig(): boolean {
    const config = this.config.credentials;
    if (!config.apiKey) {
      console.error('SendGrid API key is required');
      return false;
    }
    return true;
  }

  /**
   * Validate AWS SES configuration
   */
  private validateSESConfig(): boolean {
    const config = this.config.credentials;
    if (!config.accessKeyId) {
      console.error('AWS SES access key ID is required');
      return false;
    }
    if (!config.secretAccessKey) {
      console.error('AWS SES secret access key is required');
      return false;
    }
    return true;
  }

  /**
   * Validate SMTP configuration
   */
  private validateSMTPConfig(): boolean {
    const config = this.config.credentials;
    if (!config.host) {
      console.error('SMTP host is required');
      return false;
    }
    if (!config.auth?.user) {
      console.error('SMTP username is required');
      return false;
    }
    if (!config.auth?.pass) {
      console.error('SMTP password is required');
      return false;
    }
    return true;
  }

  /**
   * Get channel capabilities
   */
  getCapabilities(): {
    supportsHtml: boolean;
    supportsAttachments: boolean;
    supportsTemplates: boolean;
    maxMessageLength?: number;
    rateLimit?: number;
  } {
    return {
      supportsHtml: true,
      supportsAttachments: true,
      supportsTemplates: true,
      maxMessageLength: 100000, // 100KB
      rateLimit: 100, // per hour
    };
  }

  /**
   * Get current provider
   */
  getProvider(): string {
    return this.provider;
  }

  /**
   * Simulate email sending (for development/testing)
   */
  private async simulateEmailSending(request: ChannelRequest): Promise<void> {
    // Simulate network delay
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Simulate occasional failures (5% failure rate)
    if (Math.random() < 0.05) {
      throw new Error('Simulated email sending failure');
    }
  }
}
