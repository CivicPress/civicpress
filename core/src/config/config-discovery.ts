import * as fs from 'fs';
import * as path from 'path';

/**
 * Config Discovery Utility
 *
 * Finds the CivicPress config file in various locations:
 * 1. Current directory: .civic/config.yml
 * 2. Parent directories: ../.civic/config.yml, ../../.civic/config.yml
 * 3. Default: ./data/.civic/config.yml
 * 4. Environment variable: CIVIC_DATA_DIR/.civic/config.yml
 */
export class ConfigDiscovery {
  private static readonly CONFIG_FILENAME = 'config.yml';
  private static readonly CIVIC_DIR = '.civic';

  /**
   * Find the civic config file
   */
  static findConfig(startPath: string = process.cwd()): string | null {
    // Check environment variable first
    const envDataDir = process.env.CIVIC_DATA_DIR;
    if (envDataDir) {
      const envConfigPath = path.join(
        envDataDir,
        this.CIVIC_DIR,
        this.CONFIG_FILENAME
      );
      if (fs.existsSync(envConfigPath)) {
        return envConfigPath;
      }
    }

    // Check default data directory first (prioritize data directory)
    const defaultDataDir = path.join(startPath, 'data');
    const defaultConfigPath = path.join(
      defaultDataDir,
      this.CIVIC_DIR,
      this.CONFIG_FILENAME
    );
    if (fs.existsSync(defaultConfigPath)) {
      return defaultConfigPath;
    }

    // Check current directory and parent directories
    let currentPath = startPath;
    while (currentPath !== path.dirname(currentPath)) {
      const configPath = path.join(
        currentPath,
        this.CIVIC_DIR,
        this.CONFIG_FILENAME
      );
      if (fs.existsSync(configPath)) {
        return configPath;
      }
      currentPath = path.dirname(currentPath);
    }

    return null;
  }

  /**
   * Get the data directory from config path
   */
  static getDataDirFromConfig(configPath: string): string {
    return path.dirname(path.dirname(configPath));
  }

  /**
   * Get the civic directory from config path
   */
  static getCivicDirFromConfig(configPath: string): string {
    return path.dirname(configPath);
  }

  /**
   * Check if a directory is a civic data directory
   */
  static isCivicDataDir(dirPath: string): boolean {
    const configPath = path.join(dirPath, this.CIVIC_DIR, this.CONFIG_FILENAME);
    return fs.existsSync(configPath);
  }

  /**
   * Get the default data directory path
   */
  static getDefaultDataDir(startPath: string = process.cwd()): string {
    return path.join(startPath, 'data');
  }
}
