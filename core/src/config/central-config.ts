import * as fs from 'fs';
import * as path from 'path';
import yaml from 'yaml';
import { Logger, LoggerOptions } from '../utils/logger.js';

export interface CentralConfig {
  dataDir?: string;
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
   * Find the .civicrc file
   */
  private static findConfigFile(): string | null {
    let currentPath = process.cwd();

    // Check current directory and parent directories
    while (currentPath !== path.dirname(currentPath)) {
      const configPath = path.join(currentPath, this.CONFIG_FILENAME);
      if (fs.existsSync(configPath)) {
        return configPath;
      }
      currentPath = path.dirname(currentPath);
    }

    return null;
  }

  /**
   * Reset cached configuration (useful for testing)
   */
  static reset(): void {
    this.config = null;
  }
}
