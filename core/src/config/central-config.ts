import * as fs from 'fs';
import * as path from 'path';
import yaml from 'yaml';
import { Logger, LoggerOptions } from '../utils/logger.js';
import {
  RecordTypesConfig,
  DEFAULT_RECORD_TYPES,
  validateRecordTypeConfig,
  mergeRecordTypes,
} from './record-types.js';
import {
  RecordStatusesConfig,
  DEFAULT_RECORD_STATUSES,
  validateRecordStatusConfig,
  mergeRecordStatuses,
  getRecordStatusesWithMetadata,
} from './record-statuses.js';

export interface OrgConfig {
  // Basic Organization Information
  name?: string;
  city?: string;
  state?: string;
  country?: string;
  timezone?: string;

  // Contact and Online Presence
  website?: string | null;
  repo_url?: string | null;
  email?: string | null;
  phone?: string | null;

  // Branding Assets
  logo?: string | null;
  favicon?: string | null;
  banner?: string | null;

  // Additional Branding Information
  description?: string | null;
  tagline?: string | null;
  mission?: string | null;

  // Social Media
  social?: {
    twitter?: string | null;
    facebook?: string | null;
    linkedin?: string | null;
    instagram?: string | null;
  };

  // Custom Branding Fields
  custom?: {
    primary_color?: string | null;
    secondary_color?: string | null;
    font_family?: string | null;
  };

  // Metadata
  version?: string;
  created?: string;
  updated?: string;
}

export interface DocumentNumberFormat {
  prefix: string;
  year_format: 'full' | 'short';
  separator: string;
  sequence_padding: number;
}

export interface DocumentNumberFormats {
  [recordType: string]: DocumentNumberFormat;
}

export interface CentralConfig {
  dataDir?: string;
  // System configuration (from .civicrc)
  modules?: string[];
  record_types?: string[];
  record_types_config?: RecordTypesConfig;
  record_statuses_config?: RecordStatusesConfig;
  document_number_formats?: DocumentNumberFormats;
  default_role?: string;
  hooks?: {
    enabled?: boolean;
  };
  workflows?: {
    enabled?: boolean;
  };
  audit?: {
    enabled?: boolean;
  };
  database?: {
    type: 'sqlite' | 'postgres';
    sqlite?: {
      file: string;
    };
    postgres?: {
      url: string;
    };
  };
  auth?: any; // Auth configuration from .civicrc
  version?: string;
  created?: string;
}

/**
 * Central Configuration Manager
 *
 * Provides a single source of truth for CivicPress configuration.
 * Reads from .civicrc file in the project root.
 */
export class CentralConfigManager {
  private static readonly CONFIG_FILENAME = '.civicrc';
  private static config: CentralConfig | null = null;
  private static loggerOptions: LoggerOptions = {};
  private static logger: Logger = new Logger();

  static setLoggerOptions(options: LoggerOptions) {
    this.loggerOptions = options;
    this.logger = new Logger(options);
  }

  /**
   * Get the central configuration
   */
  static getConfig(): CentralConfig {
    if (this.config) {
      return this.config;
    }

    // Check environment variable first
    const envDataDir = process.env.CIVIC_DATA_DIR;
    if (envDataDir) {
      this.config = {
        dataDir: envDataDir,
        database: {
          type: 'sqlite',
          sqlite: {
            file: path.join(envDataDir, 'civic.db'),
          },
        },
      };
      return this.config;
    }

    // Find .civicrc file
    const configPath = this.findConfigFile();
    const fallbackPath = configPath
      ? path.join(path.dirname(configPath), '.civicrc.default')
      : null;

    let mainConfig: CentralConfig = {};
    let fallbackConfig: CentralConfig = {};

    // Load main config
    if (configPath && fs.existsSync(configPath)) {
      try {
        const configContent = fs.readFileSync(configPath, 'utf8');
        mainConfig = yaml.parse(configContent) as CentralConfig;

        // Resolve relative paths
        const projectRoot = path.dirname(configPath);
        if (mainConfig.dataDir && !path.isAbsolute(mainConfig.dataDir)) {
          mainConfig.dataDir = path.resolve(projectRoot, mainConfig.dataDir);
        }
      } catch (error) {
        this.logger.warn(`Warning: Could not parse ${configPath}:`, error);
      }
    }

    // Load fallback config
    if (fallbackPath && fs.existsSync(fallbackPath)) {
      try {
        const fallbackContent = fs.readFileSync(fallbackPath, 'utf8');
        fallbackConfig = yaml.parse(fallbackContent) as CentralConfig;

        // Resolve relative paths for fallback config
        const projectRoot = path.dirname(fallbackPath);
        if (
          fallbackConfig.dataDir &&
          !path.isAbsolute(fallbackConfig.dataDir)
        ) {
          fallbackConfig.dataDir = path.resolve(
            projectRoot,
            fallbackConfig.dataDir
          );
        }
      } catch (error) {
        this.logger.warn(`Warning: Could not parse ${fallbackPath}:`, error);
      }
    }

    // Merge configs (fallback fills missing fields)
    const mergedConfig = { ...fallbackConfig, ...mainConfig };

    // Check for missing required fields and warn if fallback was used
    const requiredFields = ['dataDir', 'database'] as const;
    const missingFields = requiredFields.filter(
      (field) => !mergedConfig[field]
    );

    if (missingFields.length > 0) {
      // Suppress warnings in test mode
      if (process.env.NODE_ENV !== 'test') {
        this.logger.warn(
          `Warning: Missing required fields in .civicrc: ${missingFields.join(', ')}`
        );
        if (fallbackPath && fs.existsSync(fallbackPath)) {
          this.logger.warn(`Using fallback values from .civicrc.default`);
        }
      }
    }

    // Ensure we have a valid config
    if (!mergedConfig.dataDir) {
      mergedConfig.dataDir = 'data';
    }
    if (!mergedConfig.database) {
      mergedConfig.database = {
        type: 'sqlite',
        sqlite: {
          file: path.join(mergedConfig.dataDir, 'civic.db'),
        },
      };
    }

    // Deprecation notices for legacy fields
    const deprecated: Array<keyof CentralConfig> = [
      'modules',
      'record_types',
      'record_types_config',
      'record_statuses_config',
    ];
    for (const key of deprecated) {
      if ((mergedConfig as any)[key] && process.env.NODE_ENV !== 'test') {
        this.logger.warn(
          `Deprecated: '${String(
            key
          )}' in .civicrc is deprecated. Prefer data/.civic/config.yml.`
        );
      }
    }

    this.config = mergedConfig;
    return this.config;
  }

  /**
   * Get just the data directory
   */
  static getDataDir(): string {
    const config = this.getConfig();
    if (!config.dataDir) {
      throw new Error('dataDir is not configured');
    }
    return config.dataDir;
  }

  /**
   * Load YAML if it exists; otherwise return null
   */
  private static loadYamlIfExists(filePath: string): any | null {
    try {
      if (fs.existsSync(filePath)) {
        const txt = fs.readFileSync(filePath, 'utf8');
        return yaml.parse(txt);
      }
    } catch (err) {
      this.logger.warn(`Warning: Could not parse ${filePath}:`, err);
    }
    return null;
  }

  /**
   * Get database configuration
   */
  static getDatabaseConfig(): CentralConfig['database'] {
    return this.getConfig().database;
  }

  /**
   * Get organization configuration
   */
  static getOrgConfig(): OrgConfig {
    const dataDir = this.getDataDir();
    const orgConfigPath = path.join(dataDir, '.civic', 'org-config.yml');

    if (fs.existsSync(orgConfigPath)) {
      try {
        const configContent = fs.readFileSync(orgConfigPath, 'utf8');
        return yaml.parse(configContent) as OrgConfig;
      } catch (error) {
        this.logger.warn(`Warning: Could not parse ${orgConfigPath}:`, error);
        throw new Error(
          `Invalid org-config.yml. Fix ${orgConfigPath} or copy from core/src/defaults/org-config.yml`
        );
      }
    }

    // Do not run from defaults silently; require explicit user config
    const msg =
      `Organization config not found at ${orgConfigPath}. ` +
      `Please create it (e.g., copy core/src/defaults/org-config.yml to data/.civic/org-config.yml).`;
    this.logger.warn(msg);
    throw new Error(msg);
  }

  /**
   * Get organization branding information
   */
  static getOrganizationInfo(): {
    name?: string;
    city?: string;
    state?: string;
    country?: string;
    timezone?: string;
    repo_url?: string | null;
  } {
    const orgConfig = this.getOrgConfig();
    return {
      name: orgConfig.name,
      city: orgConfig.city,
      state: orgConfig.state,
      country: orgConfig.country,
      timezone: orgConfig.timezone,
      repo_url: orgConfig.repo_url,
    };
  }

  /**
   * Get record types configuration (prefers data/.civic/config.yml, then defaults, then deprecated .civicrc)
   */
  static getRecordTypesConfig(): RecordTypesConfig {
    const config = this.getConfig();
    const dataDir = this.getDataDir();

    // Prefer user data/.civic/config.yml
    const userConfigPath = path.join(dataDir, '.civic', 'config.yml');
    const userConfig = this.loadYamlIfExists(userConfigPath);

    // If user config present, use it
    if (userConfig && userConfig.record_types_config) {
      return mergeRecordTypes(
        { ...DEFAULT_RECORD_TYPES },
        userConfig.record_types_config as RecordTypesConfig
      );
    }

    // Accept deprecated .civicrc fields as last resort (with prior warning)
    if (config.record_types_config) {
      return mergeRecordTypes(
        { ...DEFAULT_RECORD_TYPES },
        config.record_types_config
      );
    }

    // If no config found, return defaults (don't throw in test environment)
    if (process.env.NODE_ENV === 'test' || process.env.VITEST) {
      this.logger.warn(
        `Record types config not found at ${userConfigPath}, using defaults`
      );
      return { ...DEFAULT_RECORD_TYPES };
    }

    const msg =
      `Record types config not found at ${userConfigPath}. ` +
      `Please create it (copy from core/src/defaults/config.yml → record_types_config) or migrate from .civicrc.`;
    this.logger.warn(msg);
    throw new Error(msg);
  }

  /**
   * Validate record types configuration
   */
  static validateRecordTypes(): string[] {
    const recordTypes = this.getRecordTypesConfig();
    return validateRecordTypeConfig(recordTypes);
  }

  /**
   * Get available record type keys
   */
  static getRecordTypeKeys(): string[] {
    const recordTypes = this.getRecordTypesConfig();
    return Object.keys(recordTypes);
  }

  /**
   * Get record statuses configuration (prefers data/.civic/config.yml, then defaults, then deprecated .civicrc)
   */
  static getRecordStatusesConfig(): RecordStatusesConfig {
    const config = this.getConfig();
    const dataDir = this.getDataDir();

    const userConfigPath = path.join(dataDir, '.civic', 'config.yml');
    const userConfig = this.loadYamlIfExists(userConfigPath);

    if (userConfig && userConfig.record_statuses_config) {
      return mergeRecordStatuses(
        { ...DEFAULT_RECORD_STATUSES },
        userConfig.record_statuses_config as RecordStatusesConfig
      );
    }

    if (config.record_statuses_config) {
      return mergeRecordStatuses(
        { ...DEFAULT_RECORD_STATUSES },
        config.record_statuses_config
      );
    }

    // If no config found, return defaults (don't throw in test environment)
    if (process.env.NODE_ENV === 'test' || process.env.VITEST) {
      this.logger.warn(
        `Record statuses config not found at ${userConfigPath}, using defaults`
      );
      return { ...DEFAULT_RECORD_STATUSES };
    }

    const msg =
      `Record statuses config not found at ${userConfigPath}. ` +
      `Please create it (copy from core/src/defaults/config.yml → record_statuses_config) or migrate from .civicrc.`;
    this.logger.warn(msg);
    throw new Error(msg);
  }

  /**
   * Validate record statuses configuration
   */
  static validateRecordStatuses(): string[] {
    const recordStatuses = this.getRecordStatusesConfig();
    return validateRecordStatusConfig(recordStatuses);
  }

  /**
   * Get document number formats configuration
   * Returns formats from config.yml (prefers data/.civic/config.yml, then defaults)
   */
  static getDocumentNumberFormats(): DocumentNumberFormats {
    const config = this.getConfig();
    const dataDir = this.getDataDir();

    const userConfigPath = path.join(dataDir, '.civic', 'config.yml');
    const userConfig = this.loadYamlIfExists(userConfigPath);

    if (userConfig && userConfig.document_number_formats) {
      return userConfig.document_number_formats as DocumentNumberFormats;
    }

    if (config.document_number_formats) {
      return config.document_number_formats;
    }

    // Return empty object if not configured (will use defaults in DocumentNumberGenerator)
    return {};
  }

  /**
   * Validate document number formats configuration
   */
  static validateDocumentNumberFormats(): string[] {
    const formats = this.getDocumentNumberFormats();
    const errors: string[] = [];

    for (const [recordType, format] of Object.entries(formats)) {
      if (!format.prefix || typeof format.prefix !== 'string') {
        errors.push(
          `Document number format for ${recordType}: missing or invalid prefix`
        );
      }
      if (
        format.year_format &&
        !['full', 'short'].includes(format.year_format)
      ) {
        errors.push(
          `Document number format for ${recordType}: year_format must be 'full' or 'short'`
        );
      }
      if (
        format.sequence_padding &&
        (typeof format.sequence_padding !== 'number' ||
          format.sequence_padding < 1)
      ) {
        errors.push(
          `Document number format for ${recordType}: sequence_padding must be a positive number`
        );
      }
    }

    return errors;
  }

  /**
   * Get available record status keys
   */
  static getRecordStatusKeys(): string[] {
    const recordStatuses = this.getRecordStatusesConfig();
    return Object.keys(recordStatuses);
  }

  /**
   * Find the .civicrc file
   */
  private static findConfigFile(): string | null {
    let currentPath = process.cwd();
    const rootPath = path.parse(currentPath).root;

    // Check current directory and parent directories until we reach the filesystem root
    while (currentPath !== rootPath) {
      const configPath = path.join(currentPath, this.CONFIG_FILENAME);
      if (fs.existsSync(configPath)) {
        this.logger.debug(`Found .civicrc at: ${configPath}`);
        return configPath;
      }
      const parentPath = path.dirname(currentPath);
      // Prevent infinite loop if we can't go up further
      if (parentPath === currentPath) {
        break;
      }
      currentPath = parentPath;
    }

    this.logger.debug(`No .civicrc found, searched from: ${process.cwd()}`);
    return null;
  }

  /**
   * Reset cached configuration (useful for testing)
   */
  static reset(): void {
    this.config = null;
  }
}
