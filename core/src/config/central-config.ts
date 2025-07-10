import * as fs from 'fs';
import * as path from 'path';
import yaml from 'yaml';
import { Logger } from '../utils/logger.js';

export interface CentralConfig {
  dataDir: string;
  database?: {
    type: 'sqlite' | 'postgres';
    sqlite?: {
      file: string;
    };
    postgres?: {
      url: string;
    };
  };
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
  private static logger = new Logger();

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
    if (!configPath) {
      // Default configuration
      this.config = {
        dataDir: 'data',
        database: {
          type: 'sqlite',
          sqlite: {
            file: '.system-data/civic.db',
          },
        },
      };
      return this.config;
    }

    // Read and parse config file
    try {
      const configContent = fs.readFileSync(configPath, 'utf8');
      const parsedConfig = yaml.parse(configContent) as CentralConfig;

      // Resolve relative paths
      const projectRoot = path.dirname(configPath);
      if (parsedConfig.dataDir && !path.isAbsolute(parsedConfig.dataDir)) {
        parsedConfig.dataDir = path.resolve(projectRoot, parsedConfig.dataDir);
      }

      this.config = parsedConfig;
      return this.config;
    } catch (error) {
      this.logger.warn(`Warning: Could not parse ${configPath}:`, error);

      // Fallback to default
      this.config = {
        dataDir: 'data',
        database: {
          type: 'sqlite',
          sqlite: {
            file: '.system-data/civic.db',
          },
        },
      };
      return this.config;
    }
  }

  /**
   * Get just the data directory
   */
  static getDataDir(): string {
    return this.getConfig().dataDir;
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
