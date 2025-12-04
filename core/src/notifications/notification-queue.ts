import { coreError } from '../utils/core-output.js';

export interface QueuedNotification {
  id: string;
  request: any;
  attempts: number;
  nextAttempt: Date;
  maxAttempts: number;
  delay: number;
}

export class NotificationQueue {
  private queue: QueuedNotification[] = [];
  private processing: boolean = false;

  /**
   * Add notification to queue
   */
  async enqueue(
    notification: Omit<QueuedNotification, 'id' | 'attempts'>
  ): Promise<string> {
    const id = this.generateQueueId();
    const queuedNotification: QueuedNotification = {
      ...notification,
      id,
      attempts: 0,
    };

    this.queue.push(queuedNotification);
    return id;
  }

  /**
   * Process queue
   */
  async processQueue(
    processor: (notification: any) => Promise<boolean>
  ): Promise<void> {
    if (this.processing) {
      return;
    }

    this.processing = true;

    try {
      const now = new Date();
      const readyNotifications = this.queue.filter(
        (notification) => notification.nextAttempt <= now
      );

      for (const notification of readyNotifications) {
        try {
          const success = await processor(notification.request);

          if (success) {
            // Remove from queue on success
            this.removeFromQueue(notification.id);
          } else {
            // Increment attempts and reschedule
            await this.handleRetry(notification);
          }
        } catch (error) {
          coreError(
            `Failed to process queued notification ${notification.id}`,
            'QUEUE_PROCESS_ERROR',
            {
              notificationId: notification.id,
              error: error instanceof Error ? error.message : String(error),
            },
            { operation: 'notification:queue' }
          );
          await this.handleRetry(notification);
        }
      }
    } finally {
      this.processing = false;
    }
  }

  /**
   * Handle retry logic
   */
  private async handleRetry(notification: QueuedNotification): Promise<void> {
    notification.attempts++;

    if (notification.attempts >= notification.maxAttempts) {
      // Remove from queue after max attempts
      this.removeFromQueue(notification.id);
      coreError(
        `Notification ${notification.id} failed after ${notification.attempts} attempts`,
        'QUEUE_MAX_ATTEMPTS',
        {
          notificationId: notification.id,
          attempts: notification.attempts,
        },
        { operation: 'notification:queue' }
      );
      return;
    }

    // Calculate next attempt time with exponential backoff
    const backoffDelay =
      notification.delay * Math.pow(2, notification.attempts - 1);
    notification.nextAttempt = new Date(Date.now() + backoffDelay);
  }

  /**
   * Remove notification from queue
   */
  private removeFromQueue(id: string): void {
    const index = this.queue.findIndex((n) => n.id === id);
    if (index !== -1) {
      this.queue.splice(index, 1);
    }
  }

  /**
   * Get queue statistics
   */
  getQueueStats(): {
    total: number;
    processing: number;
    failed: number;
  } {
    const now = new Date();
    const processing = this.queue.filter((n) => n.nextAttempt <= now).length;
    const failed = this.queue.filter((n) => n.attempts >= n.maxAttempts).length;

    return {
      total: this.queue.length,
      processing,
      failed,
    };
  }

  /**
   * Clear queue
   */
  clearQueue(): void {
    this.queue = [];
  }

  /**
   * Generate unique queue ID
   */
  private generateQueueId(): string {
    return `queue_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}
