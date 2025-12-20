/**
 * Lifecycle Manager
 *
 * Manages file lifecycle policies (retention, archival, deletion)
 */

import { Logger } from '@civicpress/core';
import type { StorageFile } from '../types/storage.types.js';

export interface LifecyclePolicy {
  name: string;
  folder?: string; // Apply to specific folder, or all if undefined
  retentionDays?: number; // Keep files for N days
  archiveAfterDays?: number; // Archive after N days
  deleteAfterDays?: number; // Delete after N days
  archiveProvider?: string; // Provider to archive to
  enabled: boolean;
}

export interface LifecycleAction {
  file: StorageFile;
  action: 'archive' | 'delete' | 'retain';
  reason: string;
  scheduledDate: Date;
}

export interface LifecycleResult {
  processed: number;
  archived: number;
  deleted: number;
  retained: number;
  errors: Array<{ file: string; error: string }>;
}

/**
 * Lifecycle manager for storage files
 */
export class LifecycleManager {
  private logger: Logger;
  private databaseService: any;
  private storageService: any; // CloudUuidStorageService
  private policies: LifecyclePolicy[];

  constructor(
    databaseService: any,
    storageService: any,
    policies: LifecyclePolicy[] = [],
    logger?: Logger
  ) {
    this.logger = logger || new Logger();
    this.databaseService = databaseService;
    this.storageService = storageService;
    this.policies = policies;
  }

  /**
   * Evaluate lifecycle policies and determine actions
   */
  async evaluateLifecycle(folder?: string): Promise<LifecycleAction[]> {
    const actions: LifecycleAction[] = [];

    // Get files to evaluate
    let files: StorageFile[];
    if (folder) {
      files = await this.storageService.listFiles(folder);
    } else {
      // Get all files (would need getAllFiles method or iterate folders)
      files = [];
      // For now, we'll need to get files from database directly
      const allFiles = await this.databaseService.getAllStorageFiles();
      files = allFiles.map((record: any) => this.dbRecordToStorageFile(record));
    }

    // Apply policies to each file
    for (const file of files) {
      const applicablePolicies = this.getApplicablePolicies(file.folder);

      for (const policy of applicablePolicies) {
        if (!policy.enabled) {
          continue;
        }

        const action = this.evaluatePolicy(file, policy);
        if (action) {
          actions.push(action);
          break; // Apply first matching policy
        }
      }
    }

    return actions;
  }

  /**
   * Execute lifecycle actions
   */
  async executeLifecycle(
    actions: LifecycleAction[],
    dryRun: boolean = false
  ): Promise<LifecycleResult> {
    const result: LifecycleResult = {
      processed: 0,
      archived: 0,
      deleted: 0,
      retained: 0,
      errors: [],
    };

    for (const action of actions) {
      try {
        if (dryRun) {
          this.logger.info(
            `[DRY RUN] Would ${action.action} file: ${action.file.id}`,
            {
              file: action.file.original_name,
              reason: action.reason,
            }
          );
          result.processed++;
          if (action.action === 'archive') result.archived++;
          else if (action.action === 'delete') result.deleted++;
          else result.retained++;
          continue;
        }

        switch (action.action) {
          case 'archive':
            await this.archiveFile(action.file, action.reason);
            result.archived++;
            break;
          case 'delete':
            await this.deleteFile(action.file, action.reason);
            result.deleted++;
            break;
          case 'retain':
            // No action needed, just log
            this.logger.debug(`Retaining file: ${action.file.id}`, {
              reason: action.reason,
            });
            result.retained++;
            break;
        }

        result.processed++;
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        result.errors.push({
          file: action.file.id,
          error: errorMessage,
        });
        this.logger.error(
          `Failed to execute lifecycle action for file ${action.file.id}:`,
          error
        );
      }
    }

    return result;
  }

  /**
   * Get applicable policies for a folder
   */
  private getApplicablePolicies(folder: string): LifecyclePolicy[] {
    return this.policies.filter(
      (policy) => !policy.folder || policy.folder === folder
    );
  }

  /**
   * Evaluate a policy for a file
   */
  private evaluatePolicy(
    file: StorageFile,
    policy: LifecyclePolicy
  ): LifecycleAction | null {
    const now = new Date();
    const fileAge = now.getTime() - file.created_at.getTime();
    const fileAgeDays = fileAge / (1000 * 60 * 60 * 24);

    // Check delete policy
    if (policy.deleteAfterDays && fileAgeDays >= policy.deleteAfterDays) {
      return {
        file,
        action: 'delete',
        reason: `File age (${Math.floor(fileAgeDays)} days) exceeds delete threshold (${policy.deleteAfterDays} days)`,
        scheduledDate: now,
      };
    }

    // Check archive policy
    if (policy.archiveAfterDays && fileAgeDays >= policy.archiveAfterDays) {
      // Check if already archived
      if (
        file.folder?.includes('archive') ||
        file.folder?.includes('archived')
      ) {
        return null; // Already archived
      }

      return {
        file,
        action: 'archive',
        reason: `File age (${Math.floor(fileAgeDays)} days) exceeds archive threshold (${policy.archiveAfterDays} days)`,
        scheduledDate: now,
      };
    }

    // Check retention policy
    if (policy.retentionDays && fileAgeDays < policy.retentionDays) {
      return {
        file,
        action: 'retain',
        reason: `File age (${Math.floor(fileAgeDays)} days) is within retention period (${policy.retentionDays} days)`,
        scheduledDate: now,
      };
    }

    return null; // No action needed
  }

  /**
   * Archive a file
   */
  private async archiveFile(file: StorageFile, reason: string): Promise<void> {
    // For now, we'll just move the file to an archive folder
    // In a full implementation, this might copy to a different provider
    const archiveFolder = 'archive';

    // Update file folder in database
    await this.databaseService.updateStorageFile(file.id, {
      folder: archiveFolder,
      updated_at: new Date(),
    });

    this.logger.info(`Archived file: ${file.id}`, {
      originalFolder: file.folder,
      archiveFolder,
      reason,
    });
  }

  /**
   * Delete a file
   */
  private async deleteFile(file: StorageFile, reason: string): Promise<void> {
    await this.storageService.deleteFile(file.id);
    this.logger.info(`Deleted file via lifecycle: ${file.id}`, {
      originalName: file.original_name,
      reason,
    });
  }

  /**
   * Add lifecycle policy
   */
  addPolicy(policy: LifecyclePolicy): void {
    this.policies.push(policy);
    this.logger.debug(`Added lifecycle policy: ${policy.name}`);
  }

  /**
   * Remove lifecycle policy
   */
  removePolicy(policyName: string): void {
    this.policies = this.policies.filter((p) => p.name !== policyName);
    this.logger.debug(`Removed lifecycle policy: ${policyName}`);
  }

  /**
   * Get all policies
   */
  getPolicies(): LifecyclePolicy[] {
    return [...this.policies];
  }

  /**
   * Convert database record to StorageFile
   */
  private dbRecordToStorageFile(record: any): StorageFile {
    return {
      id: record.id,
      original_name: record.original_name,
      stored_filename: record.stored_filename,
      folder: record.folder,
      relative_path: record.relative_path,
      provider_path: record.provider_path,
      size: record.size,
      mime_type: record.mime_type,
      description: record.description,
      uploaded_by: record.uploaded_by,
      created_at: new Date(record.created_at),
      updated_at: new Date(record.updated_at),
    };
  }
}
