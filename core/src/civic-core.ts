import { ConfigDiscovery } from './config/config-discovery.js';
import * as fs from 'fs';
import * as yaml from 'yaml';

/**
 * CivicCore - Main Platform Manager
 *
 * Handles core platform functionality, configuration,
 * and coordination between different systems.
 */
export class CivicCore {
  private config: any;
  private modules: Map<string, any>;
  private configPath: string | null = null;
  private dataDir: string | null = null;

  constructor() {
    this.config = {};
    this.modules = new Map();
  }

  /**
   * Initialize the core platform
   */
  async initialize(): Promise<void> {
    // Load configuration
    await this.loadConfig();

    // Initialize modules
    await this.initializeModules();
  }

  /**
   * Load platform configuration
   */
  private async loadConfig(): Promise<void> {
    // Find config file using discovery
    this.configPath = ConfigDiscovery.findConfig();

    if (!this.configPath) {
      throw new Error(
        'CivicPress config not found. Run "civic init" to initialize.'
      );
    }

    // Get data directory from config path
    this.dataDir = ConfigDiscovery.getDataDirFromConfig(this.configPath);

    // Load and parse config file
    const configContent = fs.readFileSync(this.configPath, 'utf8');
    this.config = yaml.parse(configContent);
  }

  /**
   * Initialize registered modules
   */
  private async initializeModules(): Promise<void> {
    // TODO: Load and initialize modules
    // This will be implemented when we add module loading
  }

  /**
   * Get platform configuration
   */
  getConfig(): any {
    return this.config;
  }

  /**
   * Get the data directory path
   */
  getDataDir(): string | null {
    return this.dataDir;
  }

  /**
   * Get the config file path
   */
  getConfigPath(): string | null {
    return this.configPath;
  }

  /**
   * Register a module
   */
  registerModule(name: string, module: any): void {
    this.modules.set(name, module);
  }

  /**
   * Get a registered module
   */
  getModule(name: string): any {
    return this.modules.get(name);
  }
}
