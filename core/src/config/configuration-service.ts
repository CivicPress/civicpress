import { readFile, writeFile, access, mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import { existsSync } from 'fs';
import { parse, stringify } from 'yaml';

export interface ConfigurationServiceOptions {
  dataPath?: string;
  defaultsPath?: string;
  systemDataPath?: string;
}

export interface ConfigurationMetadata {
  version: string;
  created: string;
  updated: string;
  source: 'default' | 'user' | 'system';
}

export interface ConfigurationFile {
  path: string;
  content: any;
  metadata: ConfigurationMetadata;
  exists: boolean;
  lastModified: Date;
}

export class ConfigurationService {
  private dataPath: string;
  private defaultsPath: string;
  private systemDataPath: string;

  constructor(options: ConfigurationServiceOptions = {}) {
    this.dataPath = options.dataPath || 'data/.civic';
    this.defaultsPath = options.defaultsPath || 'core/src/defaults';
    this.systemDataPath = options.systemDataPath || '.system-data';
  }

  /**
   * Discover all available configuration files
   */
  async discoverConfigurations(): Promise<ConfigurationFile[]> {
    const configs: ConfigurationFile[] = [];

    // Check for configuration files in data/.civic/
    const dataConfigs = await this.scanConfigurationDirectory(this.dataPath);
    configs.push(...dataConfigs);

    // Check for default templates in core/src/defaults/
    const defaultConfigs = await this.scanConfigurationDirectory(
      this.defaultsPath
    );
    configs.push(...defaultConfigs);

    return configs;
  }

  /**
   * Load a specific configuration file
   */
  async loadConfiguration(configType: string): Promise<any> {
    const configPath = join(this.dataPath, `${configType}.yml`);

    try {
      // Check if user config exists
      if (await this.fileExists(configPath)) {
        const content = await readFile(configPath, 'utf-8');
        const parsed = parse(content);
        return this.transformToLegacyFormat(parsed);
      }

      // Fall back to default template
      const defaultPath = join(this.defaultsPath, `${configType}.yml`);
      if (await this.fileExists(defaultPath)) {
        const content = await readFile(defaultPath, 'utf-8');
        const parsed = parse(content);
        return this.transformToLegacyFormat(parsed);
      }

      throw new Error(`Configuration file not found: ${configType}`);
    } catch (error) {
      throw new Error(`Failed to load configuration ${configType}: ${error}`);
    }
  }

  /**
   * Get configuration metadata for form generation
   */
  async getConfigurationMetadata(configType: string): Promise<any> {
    try {
      // Try user config first
      const configPath = join(this.dataPath, `${configType}.yml`);
      if (await this.fileExists(configPath)) {
        const content = await readFile(configPath, 'utf-8');
        return parse(content);
      }

      // Fall back to default template
      const defaultPath = join(this.defaultsPath, `${configType}.yml`);
      if (await this.fileExists(defaultPath)) {
        const content = await readFile(defaultPath, 'utf-8');
        return parse(content);
      }

      throw new Error(`Configuration file not found: ${configType}`);
    } catch (error) {
      throw new Error(
        `Failed to load configuration metadata ${configType}: ${error}`
      );
    }
  }

  /**
   * Save a configuration file
   */
  async saveConfiguration(configType: string, content: any): Promise<void> {
    const configPath = join(this.dataPath, `${configType}.yml`);

    try {
      // Ensure directory exists
      await mkdir(dirname(configPath), { recursive: true });

      // Get the metadata structure to transform the content
      const metadata = await this.getConfigurationMetadata(configType);

      // Transform legacy format to new format for saving
      const newFormatConfig = this.transformToNewFormat(content, metadata);

      // Update the updated timestamp
      if (newFormatConfig._metadata) {
        newFormatConfig._metadata.updated = new Date().toISOString();
      }

      // Write to data/.civic/
      const yamlContent = stringify(newFormatConfig);
      await writeFile(configPath, yamlContent, 'utf-8');
    } catch (error) {
      throw new Error(`Failed to save configuration ${configType}: ${error}`);
    }
  }

  /**
   * Reset a configuration to defaults
   */
  async resetToDefaults(configType: string): Promise<void> {
    try {
      const defaultPath = join(this.defaultsPath, `${configType}.yml`);
      const configPath = join(this.dataPath, `${configType}.yml`);

      if (!(await this.fileExists(defaultPath))) {
        throw new Error(`Default template not found: ${configType}`);
      }

      // Read default template
      const defaultContent = await readFile(defaultPath, 'utf-8');
      const defaultConfig = parse(defaultContent);

      // Save as user config with metadata
      await this.saveConfiguration(configType, defaultConfig);
    } catch (error) {
      throw new Error(`Failed to reset configuration ${configType}: ${error}`);
    }
  }

  /**
   * Get configuration status
   */
  async getConfigurationStatus(): Promise<
    Record<string, 'default' | 'user' | 'missing'>
  > {
    const status: Record<string, 'default' | 'user' | 'missing'> = {};

    const configTypes = [
      'org-config',
      'roles',
      'workflows',
      'hooks',
      'notifications',
    ];

    for (const configType of configTypes) {
      const userPath = join(this.dataPath, `${configType}.yml`);
      const defaultPath = join(this.defaultsPath, `${configType}.yml`);

      if (await this.fileExists(userPath)) {
        status[configType] = 'user';
      } else if (await this.fileExists(defaultPath)) {
        status[configType] = 'missing';
      } else {
        status[configType] = 'missing';
      }
    }

    return status;
  }

  /**
   * Get list of available configurations with metadata
   */
  async getConfigurationList(): Promise<any[]> {
    const configTypes = [
      'org-config',
      'roles',
      'workflows',
      'hooks',
      'notifications',
    ];

    const configs = [];

    for (const configType of configTypes) {
      try {
        const metadata = await this.getConfigurationMetadata(configType);
        const status = await this.getConfigurationStatus();

        configs.push({
          file: configType,
          name: metadata._metadata?.name || configType,
          description:
            metadata._metadata?.description ||
            `Configuration for ${configType}`,
          status: status[configType] || 'missing',
          editable: metadata._metadata?.editable !== false,
          version: metadata._metadata?.version || '1.0.0',
        });
      } catch (error) {
        // Skip configs that can't be loaded
        console.warn(`Failed to load metadata for ${configType}:`, error);
      }
    }

    return configs;
  }

  /**
   * Validate configuration structure
   */
  async validateConfiguration(
    configType: string
  ): Promise<{ valid: boolean; errors: string[] }> {
    try {
      const config = await this.loadConfiguration(configType);
      const errors: string[] = [];

      // Basic validation - ensure required fields exist
      switch (configType) {
        case 'org-config':
          if (!config.name) errors.push('Organization name is required');
          if (!config.city) errors.push('City is required');
          if (!config.state) errors.push('State/Province is required');
          if (!config.country) errors.push('Country is required');
          break;

        case 'roles':
          if (!config.roles) errors.push('Roles definition is required');
          if (!config.default_role) errors.push('Default role is required');
          break;

        case 'workflows':
          if (!config.statuses) errors.push('Status definitions are required');
          if (!config.transitions)
            errors.push('Status transitions are required');
          break;

        case 'hooks':
          if (!config.hooks) errors.push('Hooks definition is required');
          if (!config.settings) errors.push('Hook settings are required');
          break;

        case 'notifications':
          if (!config.channels)
            errors.push('Notification channels are required');
          if (!config.auth_templates)
            errors.push('Authentication templates are required');
          break;
      }

      return {
        valid: errors.length === 0,
        errors,
      };
    } catch (error) {
      return {
        valid: false,
        errors: [`Failed to validate configuration: ${error}`],
      };
    }
  }

  /**
   * Transform new metadata format to legacy format for backward compatibility
   */
  private transformToLegacyFormat(config: any): any {
    if (!config._metadata) {
      // Already in legacy format
      return config;
    }

    const legacyConfig: any = {};

    // Extract metadata
    if (config._metadata.version) {
      legacyConfig.version = config._metadata.version;
    }

    // Transform fields
    for (const [key, field] of Object.entries(config)) {
      if (key === '_metadata') continue;

      if (field && typeof field === 'object' && 'value' in field) {
        // New format field
        legacyConfig[key] = field.value;
      } else if (field && typeof field === 'object') {
        // Nested object - recursively transform
        legacyConfig[key] = this.transformToLegacyFormat(field);
      } else {
        // Direct value
        legacyConfig[key] = field;
      }
    }

    return legacyConfig;
  }

  /**
   * Transform legacy format to new metadata format
   */
  private transformToNewFormat(config: any, metadata: any): any {
    const newConfig: any = {
      _metadata: metadata,
    };

    // Transform fields based on metadata structure
    for (const [key, field] of Object.entries(config)) {
      if (
        key === '_metadata' ||
        key === 'version' ||
        key === 'created' ||
        key === 'updated'
      )
        continue;

      if (metadata[key]) {
        // Field has metadata - use it
        newConfig[key] = {
          ...metadata[key],
          value: field,
        };
      } else {
        // Field has no metadata - create default
        newConfig[key] = {
          value: field,
          type: 'string',
          description: key,
          required: false,
        };
      }
    }

    return newConfig;
  }

  /**
   * Scan a directory for configuration files
   */
  private async scanConfigurationDirectory(
    dirPath: string
  ): Promise<ConfigurationFile[]> {
    const configs: ConfigurationFile[] = [];

    if (!existsSync(dirPath)) {
      return configs;
    }

    // This is a simplified scan - in a real implementation you'd use readdir
    // For now, we'll return an empty array and let the specific methods handle file discovery
    return configs;
  }

  /**
   * Check if a file exists
   */
  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await access(filePath);
      return true;
    } catch {
      return false;
    }
  }
}

// Export singleton instance
export const configurationService = new ConfigurationService();
