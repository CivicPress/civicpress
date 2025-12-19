/**
 * Storage Health Checker
 *
 * Monitors health of storage providers
 */

import { Logger } from '@civicpress/core';
import type { StorageConfig } from '../types/storage.types.js';
import { ProviderUnavailableError } from '../errors/storage-errors.js';

export interface HealthCheckResult {
  provider: string;
  healthy: boolean;
  latency?: number; // milliseconds
  error?: string;
  timestamp: Date;
  details?: Record<string, any>;
}

export interface HealthCheckConfig {
  enabled: boolean;
  interval: number; // milliseconds
  timeout: number; // milliseconds
  checkOperations: ('read' | 'write' | 'list')[];
}

/**
 * Health checker for storage providers
 */
export class StorageHealthChecker {
  private logger: Logger;
  private config: StorageConfig;
  private healthCheckConfig: HealthCheckConfig;
  private healthStatus: Map<string, HealthCheckResult> = new Map();
  private checkIntervals: Map<string, NodeJS.Timeout> = new Map();
  private checkOperations: Map<string, (provider: string) => Promise<void>> =
    new Map();

  constructor(
    config: StorageConfig,
    checkOperations: Map<string, (provider: string) => Promise<void>>,
    logger?: Logger
  ) {
    this.logger = logger || new Logger();
    this.config = config;
    this.checkOperations = checkOperations;

    // Initialize health check config
    const globalConfig = config.global;
    this.healthCheckConfig = {
      enabled: globalConfig?.health_checks || false,
      interval: globalConfig?.health_check_interval || 60000, // 1 minute default
      timeout: globalConfig?.health_check_timeout || 5000, // 5 seconds default
      checkOperations: ['read'], // Default to read-only check
    };

    // Initialize health status for all providers
    const allProviders = [
      config.active_provider || 'local',
      ...(config.failover_providers || []),
    ];
    allProviders.forEach((provider) => {
      this.healthStatus.set(provider, {
        provider,
        healthy: true, // Assume healthy until proven otherwise
        timestamp: new Date(),
      });
    });

    // Start health checks if enabled
    if (this.healthCheckConfig.enabled) {
      this.startHealthChecks();
    }
  }

  /**
   * Start periodic health checks for all providers
   */
  private startHealthChecks(): void {
    const allProviders = [
      this.config.active_provider || 'local',
      ...(this.config.failover_providers || []),
    ];

    allProviders.forEach((provider) => {
      // Perform initial check
      this.checkProviderHealth(provider).catch((error) => {
        this.logger.error(
          `Initial health check failed for ${provider}:`,
          error
        );
      });

      // Set up interval
      const interval = setInterval(() => {
        this.checkProviderHealth(provider).catch((error) => {
          this.logger.error(
            `Periodic health check failed for ${provider}:`,
            error
          );
        });
      }, this.healthCheckConfig.interval);

      this.checkIntervals.set(provider, interval);
    });

    this.logger.debug('Started health checks for storage providers', {
      providers: allProviders,
      interval: this.healthCheckConfig.interval,
    });
  }

  /**
   * Check health of a specific provider
   */
  async checkProviderHealth(provider: string): Promise<HealthCheckResult> {
    const startTime = Date.now();
    const checkOperation = this.checkOperations.get(provider);

    if (!checkOperation) {
      const result: HealthCheckResult = {
        provider,
        healthy: false,
        error: `No health check operation defined for provider '${provider}'`,
        timestamp: new Date(),
      };
      this.healthStatus.set(provider, result);
      return result;
    }

    try {
      // Execute health check with timeout
      await Promise.race([
        checkOperation(provider),
        this.createTimeout(this.healthCheckConfig.timeout),
      ]);

      const latency = Date.now() - startTime;
      const result: HealthCheckResult = {
        provider,
        healthy: true,
        latency,
        timestamp: new Date(),
      };

      this.healthStatus.set(provider, result);
      return result;
    } catch (error) {
      const latency = Date.now() - startTime;
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      const result: HealthCheckResult = {
        provider,
        healthy: false,
        latency,
        error: errorMessage,
        timestamp: new Date(),
      };

      this.healthStatus.set(provider, result);
      this.logger.warn(`Health check failed for provider '${provider}'`, {
        provider,
        error: errorMessage,
        latency,
      });

      return result;
    }
  }

  /**
   * Get health status for a provider
   */
  getProviderHealth(provider: string): HealthCheckResult | undefined {
    return this.healthStatus.get(provider);
  }

  /**
   * Get health status for all providers
   */
  getAllProviderHealth(): Map<string, HealthCheckResult> {
    return new Map(this.healthStatus);
  }

  /**
   * Check if provider is healthy
   */
  isProviderHealthy(provider: string): boolean {
    const health = this.healthStatus.get(provider);
    return health?.healthy ?? false;
  }

  /**
   * Get unhealthy providers
   */
  getUnhealthyProviders(): string[] {
    const unhealthy: string[] = [];
    for (const [provider, health] of this.healthStatus.entries()) {
      if (!health.healthy) {
        unhealthy.push(provider);
      }
    }
    return unhealthy;
  }

  /**
   * Create timeout promise
   */
  private createTimeout(ms: number): Promise<never> {
    return new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Health check timed out after ${ms}ms`));
      }, ms);
    });
  }

  /**
   * Stop health checks
   */
  stopHealthChecks(): void {
    for (const interval of this.checkIntervals.values()) {
      clearInterval(interval);
    }
    this.checkIntervals.clear();
    this.logger.debug('Stopped health checks for storage providers');
  }

  /**
   * Shutdown health checker
   */
  shutdown(): void {
    this.stopHealthChecks();
  }
}
