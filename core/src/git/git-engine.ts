import { simpleGit, SimpleGit } from 'simple-git';
import { cwd } from 'process';
import { coreDebug } from '../utils/core-output.js';

/**
 * GitEngine - Git Integration with Role-Aware Commits
 *
 * Handles all Git operations for CivicPress, including
 * role-based commit messages and audit trail management.
 */
export class GitEngine {
  private git: SimpleGit | null = null;
  private repoPath: string;
  private currentRole: string | null = null;

  constructor(repoPath?: string) {
    this.repoPath = repoPath || cwd();
    // Don't initialize simpleGit immediately - wait until initialize() is called
  }

  /**
   * Initialize the Git engine
   */
  async initialize(): Promise<void> {
    try {
      // Initialize simpleGit only when needed
      this.git = simpleGit(this.repoPath);

      // Check if we're in a Git repository
      const isRepo = await this.git.checkIsRepo();
      if (!isRepo) {
        throw new Error('Not a Git repository. Please run "git init" first.');
      }
    } catch (error) {
      throw new Error(`Failed to initialize Git engine: ${error}`);
    }
  }

  /**
   * Get the Git instance, initializing if needed
   */
  private getGit(): SimpleGit {
    if (!this.git) {
      throw new Error('Git engine not initialized. Call initialize() first.');
    }
    return this.git;
  }

  /**
   * Set the current role for commits
   */
  setRole(role: string): void {
    this.currentRole = role;
  }

  /**
   * Get the current role
   */
  getCurrentRole(): string | null {
    return this.currentRole;
  }

  /**
   * Create a role-based commit
   */
  async commit(message: string, files?: string[]): Promise<string> {
    // Skip Git commits if DISABLE_GIT_COMMITS is set (for development)
    if (process.env.DISABLE_GIT_COMMITS === 'true') {
      coreDebug(
        `[DEV] Skipping Git commit: ${message}`,
        {
          message,
        },
        { operation: 'git:commit' }
      );
      return 'dev-skip-commit';
    }

    try {
      const git = this.getGit();

      // Stage files if provided
      if (files && files.length > 0) {
        await git.add(files);
      } else {
        await git.add('.');
      }

      // Create role-based commit message
      const rolePrefix = this.currentRole ? `feat(${this.currentRole}): ` : '';
      const commitMessage = `${rolePrefix}${message}`;

      // Create commit
      const result = await git.commit(commitMessage);

      return result.commit;
    } catch (error) {
      throw new Error(`Failed to create commit: ${error}`);
    }
  }

  /**
   * Get commit history
   */
  async getHistory(limit?: number): Promise<any[]> {
    try {
      const git = this.getGit();
      const options = limit ? ['-n', limit.toString()] : [];
      const log = await git.log(options);
      return Array.from(log.all);
    } catch (error) {
      throw new Error(`Failed to get history: ${error}`);
    }
  }

  /**
   * Get diff for a specific commit
   */
  async getDiff(commitHash: string): Promise<string> {
    try {
      const git = this.getGit();
      const diff = await git.diff([commitHash]);
      return diff;
    } catch (error) {
      throw new Error(`Failed to get diff: ${error}`);
    }
  }

  /**
   * Initialize a new Git repository
   */
  async init(): Promise<void> {
    try {
      // Initialize simpleGit if not already done
      if (!this.git) {
        this.git = simpleGit(this.repoPath);
      }

      // Initialize the repository
      await this.git.init();
    } catch (error) {
      throw new Error(`Failed to initialize Git repository: ${error}`);
    }
  }

  /**
   * Get current status
   */
  async status(): Promise<any> {
    try {
      const git = this.getGit();
      return await git.status();
    } catch (error) {
      throw new Error(`Failed to get status: ${error}`);
    }
  }
}
