/**
 * Filesystem Diagnostic Checker
 *
 * Checks filesystem health, directory structure, disk space, and permissions.
 */

import { BaseDiagnosticChecker } from '../base-checker.js';
import { Logger } from '../../utils/logger.js';
import {
  CheckResult,
  DiagnosticIssue,
  FixResult,
  FixOptions,
  DiagnosticOptions,
} from '../types.js';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export class FilesystemDiagnosticChecker extends BaseDiagnosticChecker {
  name = 'filesystem';
  component = 'filesystem';
  critical = true; // Filesystem issues are critical

  private dataDir: string;
  private projectRoot: string;

  constructor(dataDir: string, logger?: Logger, projectRoot?: string) {
    super(logger);
    this.dataDir = dataDir;
    this.projectRoot = projectRoot || process.cwd();
  }

  /**
   * Run all filesystem diagnostic checks
   */
  async check(options?: DiagnosticOptions): Promise<CheckResult> {
    const checks: CheckResult[] = [];
    const issues: DiagnosticIssue[] = [];

    try {
      // Check 1: Data directory existence and accessibility
      const dataDirCheck = await this.checkDataDirectory();
      checks.push(dataDirCheck);
      if (dataDirCheck.status === 'error') {
        issues.push(
          this.createIssue('critical', 'Data directory check failed', {
            autoFixable: false,
            recommendations: [
              'Create data directory manually',
              'Check directory permissions',
              'Verify dataDir path in configuration',
            ],
            details: dataDirCheck.details,
          })
        );
        return this.createErrorResult(
          'Data directory check failed',
          undefined,
          {
            checks,
          }
        );
      }

      // Check 2: Required directory structure
      const structureCheck = await this.checkDirectoryStructure();
      checks.push(structureCheck);
      if (
        structureCheck.status === 'error' ||
        structureCheck.status === 'warning'
      ) {
        const details = structureCheck.details as any;
        const missingDirs = details?.missing || [];
        const issueMessage =
          missingDirs.length > 0
            ? `Directory structure issues: Missing ${missingDirs.length} directory/directories`
            : 'Directory structure issues';

        issues.push(
          this.createIssue(
            structureCheck.status === 'error' ? 'high' : 'medium',
            issueMessage,
            {
              autoFixable: true,
              fix: {
                description: 'Create missing directories',
                command: 'civic diagnose:filesystem --fix',
                requiresConfirmation: false,
              },
              recommendations: [
                'Create missing directories to restore functionality',
              ],
              details: {
                ...structureCheck.details,
                missingDirectories: missingDirs, // Make it explicit
              },
            }
          )
        );

        // Also store the issue in the check's details so extractIssues can find it
        if (!structureCheck.details) {
          structureCheck.details = {};
        }
        if (!Array.isArray(structureCheck.details.issues)) {
          structureCheck.details.issues = [];
        }
        structureCheck.details.issues.push(issues[issues.length - 1]);
      }

      // Check 3: Disk space availability
      const diskSpaceCheck = await this.checkDiskSpace();
      checks.push(diskSpaceCheck);
      if (
        diskSpaceCheck.status === 'error' ||
        diskSpaceCheck.status === 'warning'
      ) {
        issues.push(
          this.createIssue(
            diskSpaceCheck.status === 'error' ? 'critical' : 'high',
            'Disk space issues',
            {
              autoFixable: false,
              recommendations: [
                'Free up disk space',
                'Clean up old backups',
                'Archive old records',
              ],
              details: diskSpaceCheck.details,
            }
          )
        );
      }

      // Check 4: File and directory permissions
      const permissionsCheck = await this.checkPermissions();
      checks.push(permissionsCheck);
      if (
        permissionsCheck.status === 'error' ||
        permissionsCheck.status === 'warning'
      ) {
        issues.push(
          this.createIssue(
            permissionsCheck.status === 'error' ? 'high' : 'medium',
            'File permission issues',
            {
              autoFixable: true,
              fix: {
                description: 'Fix directory permissions',
                command: 'civic diagnose:filesystem --fix',
                requiresConfirmation: true,
              },
              recommendations: ['Fix permissions to allow read/write access'],
              details: permissionsCheck.details,
            }
          )
        );
      }

      // Check 5: Data directory integrity
      const integrityCheck = await this.checkDataIntegrity();
      checks.push(integrityCheck);
      if (integrityCheck.status === 'warning') {
        issues.push(
          this.createIssue('low', 'Data directory integrity warnings', {
            autoFixable: false,
            recommendations: [
              'Review data directory contents',
              'Check for orphaned files',
            ],
            details: integrityCheck.details,
          })
        );
      }

      // Check 6: Storage directory health
      const storageCheck = await this.checkStorageHealth();
      checks.push(storageCheck);
      if (storageCheck.status === 'warning') {
        issues.push(
          this.createIssue('low', 'Storage directory health warnings', {
            autoFixable: false,
            recommendations: [
              'Review storage directory',
              'Check for storage configuration issues',
            ],
            details: storageCheck.details,
          })
        );
      }

      // Determine overall status
      const hasErrors = checks.some((c) => c.status === 'error');
      const hasWarnings = checks.some((c) => c.status === 'warning');

      if (hasErrors) {
        return this.createErrorResult(
          'Filesystem diagnostic found critical issues',
          undefined,
          {
            checks,
            issues,
          }
        );
      }

      if (hasWarnings) {
        return this.createWarningResult(
          'Filesystem diagnostic found warnings',
          {
            checks,
            issues,
          }
        );
      }

      return this.createSuccessResult('All filesystem checks passed', {
        checks,
        issues: [],
      });
    } catch (error: any) {
      this.logger.error('Filesystem diagnostic check failed', {
        error: error.message,
        stack: error.stack,
      });
      return this.createErrorResult(
        'Filesystem diagnostic check failed',
        error,
        {
          checks,
          issues,
        }
      );
    }
  }

  /**
   * Check data directory existence and accessibility
   */
  private async checkDataDirectory(): Promise<CheckResult> {
    try {
      if (!this.dataDir) {
        return this.createErrorResult('Data directory path not configured');
      }

      // Check if directory exists
      if (!fs.existsSync(this.dataDir)) {
        return this.createErrorResult(
          'Data directory does not exist',
          undefined,
          {
            path: this.dataDir,
            recommendation:
              'Create directory or update dataDir in configuration',
          }
        );
      }

      // Check if it's actually a directory
      const stats = fs.statSync(this.dataDir);
      if (!stats.isDirectory()) {
        return this.createErrorResult(
          'Data directory path is not a directory',
          undefined,
          {
            path: this.dataDir,
          }
        );
      }

      // Check read permission
      try {
        fs.accessSync(this.dataDir, fs.constants.R_OK);
      } catch (error) {
        return this.createErrorResult('Data directory is not readable', error, {
          path: this.dataDir,
        });
      }

      // Check write permission
      try {
        fs.accessSync(this.dataDir, fs.constants.W_OK);
      } catch (error) {
        return this.createErrorResult('Data directory is not writable', error, {
          path: this.dataDir,
        });
      }

      return this.createSuccessResult('Data directory is accessible', {
        path: this.dataDir,
      });
    } catch (error: any) {
      return this.createErrorResult('Failed to check data directory', error);
    }
  }

  /**
   * Check required directory structure
   */
  private async checkDirectoryStructure(): Promise<CheckResult> {
    try {
      const requiredDirs = [
        'records', // Record files
        '.civic', // Configuration files
      ];

      const optionalDirs = [
        'exports', // Export outputs
        'exports/backups', // Backup files
      ];

      const missingRequired: string[] = [];
      const missingOptional: string[] = [];

      for (const dir of requiredDirs) {
        const dirPath = path.join(this.dataDir, dir);
        if (!fs.existsSync(dirPath)) {
          missingRequired.push(dir);
        } else if (!fs.statSync(dirPath).isDirectory()) {
          missingRequired.push(dir + ' (exists but is not a directory)');
        }
      }

      for (const dir of optionalDirs) {
        const dirPath = path.join(this.dataDir, dir);
        if (!fs.existsSync(dirPath)) {
          missingOptional.push(dir);
        } else if (!fs.statSync(dirPath).isDirectory()) {
          missingOptional.push(dir + ' (exists but is not a directory)');
        }
      }

      // Check .system-data at project root (not under dataDir)
      const systemDataPath = path.join(this.projectRoot, '.system-data');
      if (!fs.existsSync(systemDataPath)) {
        missingOptional.push('.system-data (at project root)');
      } else if (!fs.statSync(systemDataPath).isDirectory()) {
        missingOptional.push(
          '.system-data (exists but is not a directory at project root)'
        );
      }

      if (missingRequired.length > 0) {
        return this.createErrorResult(
          'Missing required directories',
          undefined,
          {
            missing: missingRequired,
            path: this.dataDir,
          }
        );
      }

      if (missingOptional.length > 0) {
        return this.createWarningResult('Missing optional directories', {
          missing: missingOptional,
          recommendation: 'These directories will be created when needed',
        });
      }

      return this.createSuccessResult('Directory structure is complete', {
        required: requiredDirs.length,
        optional: optionalDirs.length,
      });
    } catch (error: any) {
      return this.createErrorResult(
        'Failed to check directory structure',
        error
      );
    }
  }

  /**
   * Check disk space availability
   */
  private async checkDiskSpace(): Promise<CheckResult> {
    try {
      // Try to use Node.js 18.11.0+ statfs if available
      let totalBytes = 0;
      let freeBytes = 0;
      let freePercentage = 100;

      try {
        // Check if statfs is available (Node 18.11.0+)
        const fsPromises = await import('fs/promises');
        if ('statfs' in fsPromises) {
          const fsStats = await (fsPromises as any).statfs(this.dataDir);
          totalBytes = fsStats.blocks * fsStats.bsize;
          freeBytes = fsStats.bavail * fsStats.bsize;
          freePercentage =
            totalBytes > 0 ? (freeBytes / totalBytes) * 100 : 100;
        } else {
          // statfs not available, skip check
          return this.createWarningResult(
            'Disk space check not available on this Node.js version',
            {
              recommendation:
                'Upgrade to Node.js 18.11.0+ for disk space monitoring',
            }
          );
        }
      } catch (error: any) {
        // If statfs fails, return warning
        return this.createWarningResult('Failed to check disk space', {
          error: error.message,
          recommendation: 'Check disk space manually using system tools',
        });
      }

      return this.analyzeDiskSpace(freeBytes, totalBytes, freePercentage);
    } catch (error: any) {
      // If disk space check fails, return warning (not error)
      return this.createWarningResult('Failed to check disk space', {
        error: error.message,
        recommendation: 'Check disk space manually',
      });
    }
  }

  /**
   * Analyze disk space and return appropriate result
   */
  private analyzeDiskSpace(
    freeBytes: number,
    totalBytes: number,
    freePercentage: number
  ): CheckResult {
    const freeGB = freeBytes / (1024 * 1024 * 1024);
    const totalGB = totalBytes / (1024 * 1024 * 1024);
    const usedGB = totalGB - freeGB;

    // Thresholds: <5% = critical, <10% = warning, <20% = low warning
    if (freePercentage < 5) {
      return this.createErrorResult('Critical disk space shortage', undefined, {
        freeGB: freeGB.toFixed(2),
        totalGB: totalGB.toFixed(2),
        usedGB: usedGB.toFixed(2),
        freePercentage: freePercentage.toFixed(1) + '%',
        recommendation: 'Free up disk space immediately',
      });
    }

    if (freePercentage < 10) {
      return this.createErrorResult('Low disk space', undefined, {
        freeGB: freeGB.toFixed(2),
        totalGB: totalGB.toFixed(2),
        usedGB: usedGB.toFixed(2),
        freePercentage: freePercentage.toFixed(1) + '%',
        recommendation: 'Free up disk space soon',
      });
    }

    if (freePercentage < 20) {
      return this.createWarningResult('Disk space is getting low', {
        freeGB: freeGB.toFixed(2),
        totalGB: totalGB.toFixed(2),
        usedGB: usedGB.toFixed(2),
        freePercentage: freePercentage.toFixed(1) + '%',
        recommendation: 'Consider freeing up disk space',
      });
    }

    return this.createSuccessResult('Disk space is sufficient', {
      freeGB: freeGB.toFixed(2),
      totalGB: totalGB.toFixed(2),
      usedGB: usedGB.toFixed(2),
      freePercentage: freePercentage.toFixed(1) + '%',
    });
  }

  /**
   * Check file and directory permissions
   */
  private async checkPermissions(): Promise<CheckResult> {
    try {
      const permissionIssues: string[] = [];

      // Check data directory permissions
      try {
        fs.accessSync(this.dataDir, fs.constants.R_OK | fs.constants.W_OK);
      } catch (error) {
        permissionIssues.push(
          `Data directory: ${error instanceof Error ? error.message : String(error)}`
        );
      }

      // Check key subdirectories
      const keyDirs = ['records', '.civic'];
      for (const dir of keyDirs) {
        const dirPath = path.join(this.dataDir, dir);
        if (fs.existsSync(dirPath)) {
          try {
            fs.accessSync(dirPath, fs.constants.R_OK | fs.constants.W_OK);
          } catch (error) {
            permissionIssues.push(
              `${dir}: ${error instanceof Error ? error.message : String(error)}`
            );
          }
        }
      }

      if (permissionIssues.length > 0) {
        return this.createErrorResult('Permission issues found', undefined, {
          issues: permissionIssues,
        });
      }

      return this.createSuccessResult('File permissions are correct');
    } catch (error: any) {
      return this.createWarningResult('Failed to check permissions', {
        error: error.message,
      });
    }
  }

  /**
   * Check data directory integrity
   */
  private async checkDataIntegrity(): Promise<CheckResult> {
    try {
      const recordsDir = path.join(this.dataDir, 'records');
      if (!fs.existsSync(recordsDir)) {
        return this.createSuccessResult(
          'Data integrity check skipped: records directory not found'
        );
      }

      // Count files in records directory
      const files = fs.readdirSync(recordsDir, {
        encoding: 'utf8',
        recursive: false,
      });
      const recordFiles = files.filter((file: string) => {
        const filePath = path.join(recordsDir, file);
        return (
          fs.statSync(filePath).isFile() &&
          (file.endsWith('.md') ||
            file.endsWith('.yaml') ||
            file.endsWith('.yml'))
        );
      });

      if (recordFiles.length === 0) {
        return this.createWarningResult(
          'No record files found in records directory',
          {
            path: recordsDir,
          }
        );
      }

      return this.createSuccessResult('Data directory integrity is good', {
        recordFiles: recordFiles.length,
      });
    } catch (error: any) {
      return this.createWarningResult('Failed to check data integrity', {
        error: error.message,
      });
    }
  }

  /**
   * Check storage directory health
   */
  private async checkStorageHealth(): Promise<CheckResult> {
    try {
      // Check if storage directory exists (may be configured elsewhere)
      const storageDir = path.join(this.dataDir, 'storage');
      if (!fs.existsSync(storageDir)) {
        return this.createSuccessResult(
          'Storage directory check skipped: not found (may be configured elsewhere)'
        );
      }

      // Check storage directory permissions
      try {
        fs.accessSync(storageDir, fs.constants.R_OK | fs.constants.W_OK);
      } catch (error) {
        return this.createWarningResult(
          'Storage directory has permission issues',
          {
            path: storageDir,
            error: error instanceof Error ? error.message : String(error),
          }
        );
      }

      return this.createSuccessResult('Storage directory is healthy', {
        path: storageDir,
      });
    } catch (error: any) {
      return this.createWarningResult('Failed to check storage health', {
        error: error.message,
      });
    }
  }

  /**
   * Auto-fix filesystem issues
   */
  async autoFix(
    issues: DiagnosticIssue[],
    options?: FixOptions
  ): Promise<FixResult[]> {
    const results: FixResult[] = [];

    for (const issue of issues) {
      const startTime = Date.now();

      try {
        if (
          issue.message.includes('directory structure') ||
          issue.message.includes('Missing')
        ) {
          await this.fixDirectoryStructure();
          results.push(
            this.createFixResult(issue.id, true, 'Directory structure fixed', {
              duration: Date.now() - startTime,
            })
          );
        } else if (issue.message.includes('permission')) {
          await this.fixPermissions();
          results.push(
            this.createFixResult(issue.id, true, 'Permissions fixed', {
              duration: Date.now() - startTime,
            })
          );
        } else {
          results.push(
            this.createFixResult(
              issue.id,
              false,
              'Auto-fix not available for this issue',
              {
                duration: Date.now() - startTime,
              }
            )
          );
        }
      } catch (error: any) {
        results.push(
          this.createFixResult(
            issue.id,
            false,
            `Auto-fix failed: ${error.message}`,
            {
              error,
              duration: Date.now() - startTime,
            }
          )
        );
      }
    }

    return results;
  }

  /**
   * Fix directory structure by creating missing directories
   */
  private async fixDirectoryStructure(): Promise<void> {
    const requiredDirs = ['records', '.civic', 'exports', 'exports/backups'];

    for (const dir of requiredDirs) {
      const dirPath = path.join(this.dataDir, dir);
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
        this.logger.info(`Created directory: ${dirPath}`);
      }
    }
  }

  /**
   * Fix permissions (limited - can only create directories with proper permissions)
   */
  private async fixPermissions(): Promise<void> {
    // On Unix systems, we can try to set permissions
    // On Windows, this is more limited
    if (process.platform !== 'win32') {
      const dirs = [
        this.dataDir,
        path.join(this.dataDir, 'records'),
        path.join(this.dataDir, '.civic'),
      ];

      for (const dir of dirs) {
        if (fs.existsSync(dir)) {
          try {
            // Set permissions to 755 (rwxr-xr-x)
            fs.chmodSync(dir, 0o755);
            this.logger.info(`Fixed permissions for: ${dir}`);
          } catch (error: any) {
            this.logger.warn(`Failed to fix permissions for ${dir}`, {
              error: error.message,
            });
          }
        }
      }
    } else {
      this.logger.warn('Permission fixing on Windows is limited');
    }
  }
}
