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

export interface CentralConfig {
  dataDir?: string;
  // System configuration (from .civicrc)
  modules?: string[];
  record_types?: string[];
  record_types_config?: RecordTypesConfig;
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
      }
    }

    // Return default values if org config doesn't exist
    return {
      name: 'Civic Records',
      city: 'Richmond',
      state: 'Quebec',
      country: 'Canada',
      timezone: 'America/Montreal',
      repo_url: null,
    };
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
   * Get organization name
   */
  static getOrganizationName(): string | undefined {
    return this.getOrgConfig().name;
  }

  /**
   * Get organization location (city, state, country)
   */
  static getOrganizationLocation(): {
    city?: string;
    state?: string;
    country?: string;
  } {
    const orgConfig = this.getOrgConfig();
    return {
      city: orgConfig.city,
      state: orgConfig.state,
      country: orgConfig.country,
    };
  }

  /**
   * Get record types configuration
   */
  static getRecordTypesConfig(): RecordTypesConfig {
    const config = this.getConfig();

    // Start with default record types
    let recordTypes = { ...DEFAULT_RECORD_TYPES };

    // Merge with config if present
    if (config.record_types_config) {
      recordTypes = mergeRecordTypes(recordTypes, config.record_types_config);
    }

    return recordTypes;
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
