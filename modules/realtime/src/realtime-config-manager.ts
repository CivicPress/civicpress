/**
 * Realtime Configuration Manager
 *
 * Manages configuration loading and validation for the realtime module.
 * Follows the StorageConfigManager pattern.
 */

import fs from 'fs-extra';
import path from 'path';
import yaml from 'yaml';
import {
  Logger,
  coreInfo,
  coreError,
  isCivicPressError,
} from '@civicpress/core';
import type { RealtimeConfig } from './types/realtime.types.js';

export class RealtimeConfigManager {
  private configPath: string;
  private logger: Logger;
  private defaultConfig: RealtimeConfig;

  constructor(basePath: string = '.system-data') {
    this.configPath = path.join(basePath, 'realtime.yml');
    this.logger = new Logger();

    // Default realtime configuration
    this.defaultConfig = {
      enabled: true,
      port: 3001,
      host: '0.0.0.0',
      path: '/realtime',
      rooms: {
        max_rooms: 100,
        cleanup_timeout: 3600, // 1 hour
      },
      snapshots: {
        enabled: true,
        interval: 300, // 5 minutes
        max_updates: 100,
        storage: 'database',
      },
      rate_limiting: {
        messages_per_second: 10,
        connections_per_ip: 100,
        connections_per_user: 10,
      },
    };
  }

  /**
   * Load realtime configuration from file
   */
  async loadConfig(): Promise<RealtimeConfig> {
    try {
      if (await fs.pathExists(this.configPath)) {
        const configContent = await fs.readFile(this.configPath, 'utf8');
        const parsed = yaml.parse(configContent) as {
          realtime?: Partial<RealtimeConfig>;
        };

        // Extract realtime config from nested structure
        const loadedConfig =
          parsed.realtime || (parsed as Partial<RealtimeConfig>);

        // Merge with defaults to ensure all required fields exist
        const mergedConfig = this.mergeWithDefaults(loadedConfig);

        coreInfo('Realtime configuration loaded', {
          operation: 'realtime:config:loaded',
          path: this.configPath,
        });
        return mergedConfig;
      } else {
        // Don't auto-create config files - let the CLI init handle this
        throw new Error(
          `Realtime configuration not found at: ${this.configPath}. Please run 'civic init' to create the configuration.`
        );
      }
    } catch (error) {
      coreError(
        error instanceof Error && isCivicPressError(error)
          ? error
          : error instanceof Error
            ? error
            : new Error(String(error)),
        isCivicPressError(error) ? undefined : 'REALTIME_CONFIG_LOAD_ERROR',
        { error: error instanceof Error ? error.message : String(error) },
        {
          operation: 'realtime:config:load:error',
          path: this.configPath,
        }
      );
      throw error;
    }
  }

  /**
   * Get default configuration
   */
  getDefaultConfig(): RealtimeConfig {
    return this.defaultConfig;
  }

  /**
   * Merge loaded config with defaults
   */
  private mergeWithDefaults(
    loadedConfig: Partial<RealtimeConfig>
  ): RealtimeConfig {
    // Handle YAML parsing - convert string booleans to actual booleans
    let enabled = this.defaultConfig.enabled;
    if (loadedConfig.enabled !== undefined) {
      enabled =
        typeof loadedConfig.enabled === 'string'
          ? loadedConfig.enabled === 'true' || loadedConfig.enabled === 'True'
          : Boolean(loadedConfig.enabled);
    }

    return {
      enabled,
      port: loadedConfig.port ?? this.defaultConfig.port,
      host: loadedConfig.host ?? this.defaultConfig.host,
      path: loadedConfig.path ?? this.defaultConfig.path,
      rooms: {
        max_rooms:
          loadedConfig.rooms?.max_rooms ?? this.defaultConfig.rooms.max_rooms,
        cleanup_timeout:
          loadedConfig.rooms?.cleanup_timeout ??
          this.defaultConfig.rooms.cleanup_timeout,
      },
      snapshots: {
        enabled:
          loadedConfig.snapshots?.enabled ??
          this.defaultConfig.snapshots.enabled,
        interval:
          loadedConfig.snapshots?.interval ??
          this.defaultConfig.snapshots.interval,
        max_updates:
          loadedConfig.snapshots?.max_updates ??
          this.defaultConfig.snapshots.max_updates,
        storage:
          loadedConfig.snapshots?.storage ??
          this.defaultConfig.snapshots.storage,
      },
      rate_limiting: {
        messages_per_second:
          loadedConfig.rate_limiting?.messages_per_second ??
          this.defaultConfig.rate_limiting.messages_per_second,
        connections_per_ip:
          loadedConfig.rate_limiting?.connections_per_ip ??
          this.defaultConfig.rate_limiting.connections_per_ip,
        connections_per_user:
          loadedConfig.rate_limiting?.connections_per_user ??
          this.defaultConfig.rate_limiting.connections_per_user,
      },
    };
  }

  /**
   * Validate configuration
   */
  validateConfig(config: RealtimeConfig): void {
    if (config.port < 1 || config.port > 65535) {
      throw new Error('Invalid port number. Must be between 1 and 65535.');
    }

    if (config.rooms.max_rooms < 1) {
      throw new Error('max_rooms must be at least 1');
    }

    if (config.rate_limiting.messages_per_second < 1) {
      throw new Error('messages_per_second must be at least 1');
    }

    if (config.rate_limiting.connections_per_ip < 1) {
      throw new Error('connections_per_ip must be at least 1');
    }

    if (config.rate_limiting.connections_per_user < 1) {
      throw new Error('connections_per_user must be at least 1');
    }

    if (config.snapshots.interval < 0) {
      throw new Error('snapshot interval must be non-negative');
    }

    if (!['database', 'filesystem'].includes(config.snapshots.storage)) {
      throw new Error('snapshot storage must be "database" or "filesystem"');
    }
  }
}
