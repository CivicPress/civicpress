export interface NotificationContent {
  subject?: string;
  body: string;
  html?: string;
  text?: string;
}

export interface ChannelRequest {
  to: string;
  content: NotificationContent;
  data: Record<string, any>;
  priority: 'low' | 'normal' | 'high' | 'urgent';
}

export interface ChannelResponse {
  success: boolean;
  messageId?: string;
  error?: string;
}

export interface ChannelConfig {
  enabled: boolean;
  provider?: string;
  credentials: Record<string, any>;
  settings: Record<string, any>;
}

export abstract class NotificationChannel {
  protected config: ChannelConfig;
  protected name: string;

  constructor(name: string, config: ChannelConfig) {
    this.name = name;
    this.config = config;
  }

  /**
   * Send notification via this channel
   */
  abstract send(request: ChannelRequest): Promise<ChannelResponse>;

  /**
   * Test channel connectivity
   */
  abstract test(): Promise<boolean>;

  /**
   * Get channel name
   */
  getName(): string {
    return this.name;
  }

  /**
   * Check if channel is enabled
   */
  isEnabled(): boolean {
    return this.config.enabled;
  }

  /**
   * Get channel configuration
   */
  getConfig(): ChannelConfig {
    return this.config;
  }

  /**
   * Update channel configuration
   */
  updateConfig(config: Partial<ChannelConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Validate channel configuration
   */
  abstract validateConfig(): Promise<boolean>;

  /**
   * Get channel capabilities
   */
  abstract getCapabilities(): {
    supportsHtml: boolean;
    supportsAttachments: boolean;
    supportsTemplates: boolean;
    maxMessageLength?: number;
    rateLimit?: number;
  };
}
