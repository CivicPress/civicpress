import fs from 'fs-extra';
import path from 'path';
import yaml from 'yaml';
import { StorageConfig } from './types/storage.types.js';
import { Logger } from '@civicpress/core';

export class StorageConfigManager {
  private configPath: string;
  private logger: Logger;
  private defaultConfig: StorageConfig;

  constructor(basePath: string = '.system-data') {
    this.configPath = path.join(basePath, 'storage.yml');
    this.logger = new Logger();

    // Default storage configuration
    this.defaultConfig = {
      backend: {
        type: 'local',
        path: 'storage',
      },
      folders: {
        public: {
          path: 'public',
          access: 'public',
          allowed_types: ['jpg', 'jpeg', 'png', 'gif', 'pdf', 'txt', 'md'],
          max_size: '10MB',
          description: 'Public files accessible to everyone',
        },
        sessions: {
          path: 'sessions',
          access: 'public',
          allowed_types: ['mp4', 'webm', 'mp3', 'wav', 'pdf', 'md'],
          max_size: '100MB',
          description: 'Meeting recordings and session materials',
        },
        permits: {
          path: 'permits',
          access: 'authenticated',
          allowed_types: ['pdf', 'jpg', 'jpeg', 'png'],
          max_size: '5MB',
          description: 'Permit applications and documents',
        },
        private: {
          path: 'private',
          access: 'private',
          allowed_types: ['pdf', 'doc', 'docx', 'xls', 'xlsx'],
          max_size: '25MB',
          description: 'Private documents for authorized users only',
        },
      },
      metadata: {
        auto_generate_thumbnails: true,
        store_exif: false,
        compress_images: true,
        backup_included: true,
      },
    };
  }

  /**
   * Load storage configuration from file
   */
  async loadConfig(): Promise<StorageConfig> {
    try {
      if (await fs.pathExists(this.configPath)) {
        const configContent = await fs.readFile(this.configPath, 'utf8');
        const loadedConfig = yaml.parse(configContent) as StorageConfig;

        // Merge with defaults to ensure all required fields exist
        const mergedConfig = this.mergeWithDefaults(loadedConfig);

        this.logger.info('Storage configuration loaded from:', this.configPath);
        return mergedConfig;
      } else {
        // Create default configuration
        await this.saveConfig(this.defaultConfig);
        this.logger.info(
          'Created default storage configuration at:',
          this.configPath
        );
        return this.defaultConfig;
      }
    } catch (error) {
      this.logger.error('Failed to load storage configuration:', error);
      this.logger.warn('Using default storage configuration');
      return this.defaultConfig;
    }
  }

  /**
   * Save storage configuration to file
   */
  async saveConfig(config: StorageConfig): Promise<void> {
    try {
      // Ensure directory exists
      await fs.ensureDir(path.dirname(this.configPath));

      // Convert to YAML and save
      const configContent = yaml.stringify(config, {
        indent: 2,
        lineWidth: 80,
        minContentWidth: 20,
      });

      await fs.writeFile(this.configPath, configContent, 'utf8');
      this.logger.info('Storage configuration saved to:', this.configPath);
    } catch (error) {
      this.logger.error('Failed to save storage configuration:', error);
      throw new Error(`Failed to save storage configuration: ${error}`);
    }
  }

  /**
   * Update specific configuration values
   */
  async updateConfig(updates: Partial<StorageConfig>): Promise<StorageConfig> {
    const currentConfig = await this.loadConfig();
    const updatedConfig = this.mergeWithDefaults({
      ...currentConfig,
      ...updates,
    });

    await this.saveConfig(updatedConfig);
    return updatedConfig;
  }

  /**
   * Add a new storage folder
   */
  async addFolder(
    folderName: string,
    folderConfig: StorageConfig['folders'][string]
  ): Promise<StorageConfig> {
    const currentConfig = await this.loadConfig();

    if (currentConfig.folders[folderName]) {
      throw new Error(`Storage folder '${folderName}' already exists`);
    }

    currentConfig.folders[folderName] = folderConfig;
    await this.saveConfig(currentConfig);

    this.logger.info(`Added storage folder: ${folderName}`);
    return currentConfig;
  }

  /**
   * Remove a storage folder
   */
  async removeFolder(folderName: string): Promise<StorageConfig> {
    const currentConfig = await this.loadConfig();

    if (!currentConfig.folders[folderName]) {
      throw new Error(`Storage folder '${folderName}' not found`);
    }

    // Don't allow removal of system folders
    if (['public', 'sessions', 'permits', 'private'].includes(folderName)) {
      throw new Error(`Cannot remove system folder '${folderName}'`);
    }

    delete currentConfig.folders[folderName];
    await this.saveConfig(currentConfig);

    this.logger.info(`Removed storage folder: ${folderName}`);
    return currentConfig;
  }

  /**
   * Update folder configuration
   */
  async updateFolder(
    folderName: string,
    updates: Partial<StorageConfig['folders'][string]>
  ): Promise<StorageConfig> {
    const currentConfig = await this.loadConfig();

    if (!currentConfig.folders[folderName]) {
      throw new Error(`Storage folder '${folderName}' not found`);
    }

    currentConfig.folders[folderName] = {
      ...currentConfig.folders[folderName],
      ...updates,
    };

    await this.saveConfig(currentConfig);

    this.logger.info(`Updated storage folder: ${folderName}`);
    return currentConfig;
  }

  /**
   * Validate storage configuration
   */
  validateConfig(config: StorageConfig): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Validate backend
    if (!config.backend) {
      errors.push('Backend configuration is required');
    } else {
      if (!config.backend.type) {
        errors.push('Backend type is required');
      }
      if (config.backend.type === 'local' && !config.backend.path) {
        errors.push('Local backend requires a path');
      }
    }

    // Validate folders
    if (!config.folders || Object.keys(config.folders).length === 0) {
      errors.push('At least one storage folder must be configured');
    } else {
      for (const [folderName, folder] of Object.entries(config.folders)) {
        if (!folder.path) {
          errors.push(`Folder '${folderName}' must have a path`);
        }
        if (!folder.access) {
          errors.push(`Folder '${folderName}' must have access level`);
        }
        if (!folder.allowed_types || folder.allowed_types.length === 0) {
          errors.push(`Folder '${folderName}' must have allowed file types`);
        }
        if (!folder.max_size) {
          errors.push(`Folder '${folderName}' must have max file size`);
        }
      }
    }

    // Validate metadata
    if (!config.metadata) {
      errors.push('Metadata configuration is required');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Get configuration file path
   */
  getConfigPath(): string {
    return this.configPath;
  }

  /**
   * Check if configuration file exists
   */
  async configExists(): Promise<boolean> {
    return fs.pathExists(this.configPath);
  }

  /**
   * Reset to default configuration
   */
  async resetToDefaults(): Promise<StorageConfig> {
    await this.saveConfig(this.defaultConfig);
    this.logger.info('Storage configuration reset to defaults');
    return this.defaultConfig;
  }

  /**
   * Merge configuration with defaults
   */
  private mergeWithDefaults(config: Partial<StorageConfig>): StorageConfig {
    return {
      // Legacy backend (for backward compatibility)
      backend: { ...this.defaultConfig.backend, ...config.backend },

      // New multi-provider configuration
      providers: config.providers || undefined,
      active_provider: config.active_provider || undefined,
      failover_providers: config.failover_providers || undefined,
      global: config.global || undefined,

      // Existing fields
      folders: { ...this.defaultConfig.folders, ...config.folders },
      metadata: { ...this.defaultConfig.metadata, ...config.metadata },
    };
  }

  /**
   * Get default configuration
   */
  getDefaultConfig(): StorageConfig {
    return { ...this.defaultConfig };
  }
}
