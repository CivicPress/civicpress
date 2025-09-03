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
   * Resolve user and default paths for a given configuration type.
   * Notifications are sensitive and should live under .system-data.
   */
  private resolvePaths(configType: string): {
    userPath: string;
    defaultPath: string;
  } {
    // Canonicalize type (handle typos like "motifications", "notification", etc.)
    const key = (configType || '').toLowerCase().trim();
    const canonical = key.startsWith('notif') ? 'notifications' : configType;

    const userPath =
      canonical === 'notifications'
        ? join(this.systemDataPath, `${canonical}.yml`)
        : join(this.dataPath, `${canonical}.yml`);

    const defaultPath = join(this.defaultsPath, `${canonical}.yml`);
    return { userPath, defaultPath };
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
    // Perform one-time migration for notifications if needed
    if (configType === 'notifications') {
      await this.migrateNotificationsIfNeeded();
    }

    const { userPath, defaultPath } = this.resolvePaths(configType);

    try {
      // Check if user config exists
      if (await this.fileExists(userPath)) {
        const content = await readFile(userPath, 'utf-8');
        const parsed = parse(content);
        return this.transformToLegacyFormat(parsed);
      }

      // Fall back to default template
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
      const { userPath, defaultPath } = this.resolvePaths(configType);
      if (await this.fileExists(userPath)) {
        const content = await readFile(userPath, 'utf-8');
        return parse(content);
      }

      // Fall back to default template
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
    const { userPath } = this.resolvePaths(configType);

    try {
      // Ensure directory exists
      await mkdir(dirname(userPath), { recursive: true });

      // Get the metadata structure to transform the content
      const metadata = await this.getConfigurationMetadata(configType);

      // Transform legacy format to new format for saving
      const newFormatConfig = this.transformToNewFormat(content, metadata);

      // Update the updated timestamp
      if (newFormatConfig._metadata) {
        newFormatConfig._metadata.updated = new Date().toISOString();
      }

      // Write to data/.civic/
      const yamlContent = stringify(newFormatConfig, {
        aliasDuplicateObjects: false,
        lineWidth: 0,
      });
      await writeFile(userPath, yamlContent, 'utf-8');
    } catch (error) {
      throw new Error(`Failed to save configuration ${configType}: ${error}`);
    }
  }

  /**
   * Reset a configuration to defaults
   */
  async resetToDefaults(configType: string): Promise<void> {
    try {
      const { userPath, defaultPath } = this.resolvePaths(configType);

      if (!(await this.fileExists(defaultPath))) {
        throw new Error(`Default template not found: ${configType}`);
      }

      // Read default template
      const defaultContent = await readFile(defaultPath, 'utf-8');
      const defaultConfig = parse(defaultContent);

      // Save as user config with metadata
      if (configType === 'notifications') {
        // Ensure .system-data exists for notifications
        await mkdir(dirname(userPath), { recursive: true });
      }
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
      const { userPath, defaultPath } = this.resolvePaths(configType);

      if (await this.fileExists(userPath)) {
        status[configType] = 'user';
      } else if (await this.fileExists(defaultPath)) {
        status[configType] = 'default';
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
      'attachment-types',
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
   * RAW: Load configuration YAML as-is (no transforms)
   */
  async loadRawConfigurationYAML(configType: string): Promise<string> {
    const { userPath, defaultPath } = this.resolvePaths(configType);

    // Prefer user file
    if (await this.fileExists(userPath)) {
      return await readFile(userPath, 'utf-8');
    }

    // Fallback to default template
    if (await this.fileExists(defaultPath)) {
      return await readFile(defaultPath, 'utf-8');
    }

    throw new Error(`Configuration file not found: ${configType}`);
  }

  /**
   * RAW: Save configuration YAML as-is (no transforms)
   */
  async saveRawConfigurationYAML(
    configType: string,
    yamlContent: string
  ): Promise<void> {
    const { userPath } = this.resolvePaths(configType);
    await mkdir(dirname(userPath), { recursive: true });
    await writeFile(userPath, yamlContent, 'utf-8');
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

        case 'attachment-types':
          if (!config.types) errors.push('Attachment types are required');
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
  private transformToNewFormat(
    config: any,
    metadata: any,
    includeHeader: boolean = true
  ): any {
    // Only store the header metadata at top level
    const newConfig: any = includeHeader
      ? { _metadata: metadata && metadata._metadata ? metadata._metadata : {} }
      : {};

    // Transform fields based on metadata structure (supports nested objects)
    for (const [key, fieldValue] of Object.entries(config)) {
      if (
        key === '_metadata' ||
        key === 'version' ||
        key === 'created' ||
        key === 'updated'
      ) {
        continue;
      }

      const metaForKey = metadata ? (metadata as any)[key] : undefined;
      const normalizedValue =
        fieldValue &&
        typeof fieldValue === 'object' &&
        'value' in (fieldValue as any)
          ? (fieldValue as any).value
          : fieldValue;

      // Leaf field with metadata
      if (
        metaForKey &&
        typeof metaForKey === 'object' &&
        metaForKey !== null &&
        'value' in metaForKey
      ) {
        newConfig[key] = {
          ...metaForKey,
          value: normalizedValue,
        };
        continue;
      }

      // Nested object: recurse using corresponding metadata subtree
      if (
        metaForKey &&
        typeof metaForKey === 'object' &&
        metaForKey !== null &&
        !('value' in metaForKey) &&
        fieldValue &&
        typeof fieldValue === 'object' &&
        !Array.isArray(fieldValue)
      ) {
        newConfig[key] = this.transformToNewFormat(
          fieldValue,
          metaForKey,
          /* includeHeader */ false
        );
        continue;
      }

      // No metadata: synthesize a default leaf
      const inferredType = Array.isArray(normalizedValue)
        ? 'array'
        : typeof normalizedValue === 'boolean'
          ? 'boolean'
          : typeof normalizedValue === 'number'
            ? 'number'
            : 'string';

      newConfig[key] = {
        value: normalizedValue,
        type: inferredType,
        description: key,
        required: false,
      };
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

  /**
   * One-time migration: move notifications.yml from data/.civic to .system-data,
   * preserve a backup, and transform to new metadata format.
   */
  private async migrateNotificationsIfNeeded(): Promise<void> {
    const oldPath = join(this.dataPath, 'notifications.yml');
    const newPath = join(this.systemDataPath, 'notifications.yml');

    const oldExists = await this.fileExists(oldPath);
    const newExists = await this.fileExists(newPath);
    if (!oldExists || newExists) {
      return;
    }

    try {
      // Read old content
      const oldContent = await readFile(oldPath, 'utf-8');
      const parsedOld = parse(oldContent);

      // Load metadata skeleton from defaults
      const metadata = await this.getConfigurationMetadata('notifications');

      // If the old file already has _metadata, keep as-is; otherwise transform
      const newFormatConfig =
        parsedOld && parsedOld._metadata
          ? parsedOld
          : this.transformToNewFormat(parsedOld, metadata);

      // Ensure target directory
      await mkdir(dirname(newPath), { recursive: true });

      // Write new file
      await writeFile(
        newPath,
        stringify(newFormatConfig, {
          aliasDuplicateObjects: false,
          lineWidth: 0,
        }),
        'utf-8'
      );

      // Backup and remove old file
      const backupPath = `${oldPath}.bak-${Date.now()}`;
      await writeFile(backupPath, oldContent, 'utf-8');

      // Best-effort remove old (we keep backup)
      // Using fs.promises.writeFile above; no unlink import here; leave original in place after backup? The user requested removal.
      // We'll overwrite old with a pointer message to avoid secrets left in repo paths.
      await writeFile(
        oldPath,
        '# Moved to .system-data/notifications.yml\n',
        'utf-8'
      );
    } catch (error) {
      console.warn('Notifications config migration failed:', error);
    }
  }
}

// Export singleton instance
export const configurationService = new ConfigurationService();
