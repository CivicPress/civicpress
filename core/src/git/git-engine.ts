import { simpleGit, SimpleGit } from 'simple-git';
import { cwd } from 'process';

/**
 * GitEngine - Git Integration with Role-Aware Commits
 *
 * Handles all Git operations for CivicPress, including
 * role-based commit messages and audit trail management.
 */
export class GitEngine {
  private git: SimpleGit;
  private repoPath: string;
  private currentRole: string | null = null;

  constructor(repoPath?: string) {
    this.repoPath = repoPath || cwd();
    this.git = simpleGit(this.repoPath);
  }

  /**
   * Initialize the Git engine
   */
  async initialize(): Promise<void> {
    try {
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
    try {
      // Stage files if provided
      if (files && files.length > 0) {
        await this.git.add(files);
      } else {
        await this.git.add('.');
      }

      // Create role-based commit message
      const rolePrefix = this.currentRole ? `feat(${this.currentRole}): ` : '';
      const commitMessage = `${rolePrefix}${message}`;

      // Create commit
      const result = await this.git.commit(commitMessage);

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
      const options = limit ? ['-n', limit.toString()] : [];
      const log = await this.git.log(options);
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
      const diff = await this.git.diff([commitHash]);
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
      return await this.git.status();
    } catch (error) {
      throw new Error(`Failed to get status: ${error}`);
    }
  }
}
