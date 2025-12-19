/**
 * Storage Failover Manager
 *
 * Manages automatic failover between storage providers
 */

import { Logger } from '@civicpress/core';
import { RetryManager } from '../retry/retry-manager.js';
import type { StorageConfig } from '../types/storage.types.js';
import { ProviderUnavailableError } from '../errors/storage-errors.js';

export interface FailoverConfig {
  enabled: boolean;
  failoverProviders: string[];
  autoRecovery: boolean;
  recoveryCheckInterval: number; // milliseconds
}

/**
 * Manages failover between storage providers
 */
export class StorageFailoverManager {
  private logger: Logger;
  private retryManager: RetryManager;
  private config: StorageConfig;
  private failoverConfig: FailoverConfig;
  private currentProvider: string;
  private providerHealth: Map<
    string,
    { healthy: boolean; lastFailure?: Date }
  > = new Map();
  private recoveryCheckInterval?: NodeJS.Timeout;

  constructor(
    retryManager: RetryManager,
    config: StorageConfig,
    logger?: Logger
  ) {
    this.logger = logger || new Logger();
    this.retryManager = retryManager;
    this.config = config;
    this.currentProvider = config.active_provider || 'local';

    // Initialize failover config
    this.failoverConfig = {
      enabled: (config.failover_providers?.length ?? 0) > 0,
      failoverProviders: config.failover_providers || [],
      autoRecovery: true,
      recoveryCheckInterval: 60000, // 1 minute default
    };

    // Initialize provider health tracking
    const allProviders = [
      this.currentProvider,
      ...this.failoverConfig.failoverProviders,
    ];
    allProviders.forEach((provider) => {
      this.providerHealth.set(provider, { healthy: true });
    });

    // Start recovery check if enabled
    if (this.failoverConfig.autoRecovery && this.failoverConfig.enabled) {
      this.startRecoveryCheck();
    }
  }

  /**
   * Execute operation with failover support
   */
  async executeWithFailover<T>(
    operation: (provider: string) => Promise<T>,
    operationName: string
  ): Promise<T> {
    if (!this.failoverConfig.enabled) {
      // Failover disabled - just try current provider
      return this.retryManager.withRetry(() => operation(this.currentProvider));
    }

    const providersToTry = [
      this.currentProvider,
      ...this.failoverConfig.failoverProviders,
    ];

    let lastError: Error | null = null;

    for (const provider of providersToTry) {
      // Skip unhealthy providers (unless it's the only one left)
      const health = this.providerHealth.get(provider);
      if (health && !health.healthy && providersToTry.length > 1) {
        this.logger.debug(`Skipping unhealthy provider: ${provider}`);
        continue;
      }

      try {
        const result = await this.retryManager.withRetry(() =>
          operation(provider)
        );

        // Success - mark provider as healthy
        this.markProviderHealthy(provider);

        // If we used a failover provider, log it
        if (provider !== this.currentProvider) {
          this.logger.info(
            `Operation '${operationName}' succeeded on failover provider: ${provider}`,
            {
              originalProvider: this.currentProvider,
              failoverProvider: provider,
            }
          );
        }

        return result;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Mark provider as unhealthy
        this.markProviderUnhealthy(provider, lastError);

        // Log failover attempt
        this.logger.warn(
          `Provider '${provider}' failed for operation '${operationName}', trying next provider`,
          {
            provider,
            operation: operationName,
            error: lastError.message,
          }
        );

        // Continue to next provider
        continue;
      }
    }

    // All providers failed
    this.logger.error(`All providers failed for operation '${operationName}'`, {
      operation: operationName,
      providers: providersToTry,
      lastError: lastError?.message,
    });

    throw new ProviderUnavailableError(
      this.currentProvider,
      `All providers failed: ${lastError?.message}`,
      { operation: operationName }
    );
  }

  /**
   * Get current active provider
   */
  getCurrentProvider(): string {
    return this.currentProvider;
  }

  /**
   * Get provider health status
   */
  getProviderHealth(
    provider: string
  ): { healthy: boolean; lastFailure?: Date } | undefined {
    return this.providerHealth.get(provider);
  }

  /**
   * Get all provider health statuses
   */
  getAllProviderHealth(): Map<
    string,
    { healthy: boolean; lastFailure?: Date }
  > {
    return new Map(this.providerHealth);
  }

  /**
   * Mark provider as healthy
   */
  private markProviderHealthy(provider: string): void {
    const health = this.providerHealth.get(provider);
    if (health && !health.healthy) {
      this.logger.info(`Provider '${provider}' recovered and is now healthy`);
    }
    this.providerHealth.set(provider, { healthy: true });
  }

  /**
   * Mark provider as unhealthy
   */
  private markProviderUnhealthy(provider: string, error: Error): void {
    const health = this.providerHealth.get(provider);
    this.providerHealth.set(provider, {
      healthy: false,
      lastFailure: new Date(),
    });

    if (!health || health.healthy) {
      this.logger.warn(`Provider '${provider}' marked as unhealthy`, {
        provider,
        error: error.message,
      });
    }
  }

  /**
   * Start recovery check interval
   */
  private startRecoveryCheck(): void {
    if (this.recoveryCheckInterval) {
      clearInterval(this.recoveryCheckInterval);
    }

    this.recoveryCheckInterval = setInterval(() => {
      this.checkProviderRecovery();
    }, this.failoverConfig.recoveryCheckInterval);

    this.logger.debug('Started provider recovery check interval', {
      interval: this.failoverConfig.recoveryCheckInterval,
    });
  }

  /**
   * Check if unhealthy providers have recovered
   */
  private async checkProviderRecovery(): Promise<void> {
    for (const [provider, health] of this.providerHealth.entries()) {
      if (!health.healthy && health.lastFailure) {
        // Check if enough time has passed since last failure
        const timeSinceFailure = Date.now() - health.lastFailure.getTime();
        if (timeSinceFailure >= this.failoverConfig.recoveryCheckInterval) {
          // Try a simple health check operation
          // For now, we'll just mark it as potentially recoverable
          // Actual health check will happen on next operation attempt
          this.logger.debug(`Checking recovery for provider: ${provider}`);
        }
      }
    }
  }

  /**
   * Shutdown failover manager
   */
  shutdown(): void {
    if (this.recoveryCheckInterval) {
      clearInterval(this.recoveryCheckInterval);
      this.recoveryCheckInterval = undefined;
    }
    this.logger.debug('Storage failover manager shut down');
  }
}
