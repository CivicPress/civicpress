import { CivicCore } from './civic-core.js';
import { GitEngine } from './git/git-engine.js';
import { HookSystem } from './hooks/hook-system.js';
import { WorkflowEngine } from './workflows/workflow-engine.js';

/**
 * CivicPress Core Platform
 *
 * This is the main entry point for the CivicPress platform.
 * It initializes all core systems and provides the main API.
 */
export class CivicPress {
  private core: CivicCore;
  private git: GitEngine;
  private hooks: HookSystem;
  private workflows: WorkflowEngine;

  constructor(options?: { repoPath?: string; configPath?: string }) {
    this.core = new CivicCore();
    this.git = new GitEngine(options?.repoPath);
    this.hooks = new HookSystem();
    this.workflows = new WorkflowEngine();

    this.initialize();
  }

  private async initialize(): Promise<void> {
    try {
      // Initialize core first (loads config)
      await this.core.initialize();

      // Initialize Git engine
      await this.git.initialize();

      // Set up hook system
      this.hooks.initialize();

      // Initialize workflow engine
      this.workflows.initialize();

      // Emit initialization complete hook
      await this.hooks.emit('civic:initialized', {
        timestamp: new Date(),
        version: '1.0.0',
      });
    } catch (error) {
      throw new Error(`Failed to initialize CivicPress: ${error}`);
    }
  }

  /**
   * Get the Git engine for repository operations
   */
  getGitEngine(): GitEngine {
    return this.git;
  }

  /**
   * Get the hook system for event handling
   */
  getHookSystem(): HookSystem {
    return this.hooks;
  }

  /**
   * Get the workflow engine for process automation
   */
  getWorkflowEngine(): WorkflowEngine {
    return this.workflows;
  }

  /**
   * Get the core platform
   */
  getCore(): CivicCore {
    return this.core;
  }
}

// Export main classes for external use
export { CivicCore } from './civic-core.js';
export { GitEngine } from './git/git-engine.js';
export { HookSystem } from './hooks/hook-system.js';
export { WorkflowEngine } from './workflows/workflow-engine.js';
export { ConfigDiscovery } from './config/config-discovery.js';

// Export utility functions for CLI use
export async function loadConfig() {
  const { ConfigDiscovery } = await import('./config/config-discovery.js');
  const configPath = ConfigDiscovery.findConfig();
  if (!configPath) {
    return null;
  }

  const dataDir = ConfigDiscovery.getDataDirFromConfig(configPath);
  return { configPath, dataDir };
}
