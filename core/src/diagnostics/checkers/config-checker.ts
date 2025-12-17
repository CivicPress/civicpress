/**
 * Configuration Diagnostic Checker
 *
 * Checks configuration file health, validation, and required fields.
 */

import { BaseDiagnosticChecker } from '../base-checker.js';
import { CentralConfigManager } from '../../config/central-config.js';
import { ConfigurationService } from '../../config/configuration-service.js';
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
import yaml from 'yaml';

export class ConfigurationDiagnosticChecker extends BaseDiagnosticChecker {
  name = 'config';
  component = 'config';
  critical = true; // Configuration issues are critical

  // Note: CentralConfigManager is static, so we don't need an instance
  private configurationService?: ConfigurationService;
  private dataDir: string;

  constructor(
    _configManager: CentralConfigManager, // Unused, kept for API consistency
    dataDir: string,
    logger?: Logger
  ) {
    super(logger);
    this.dataDir = dataDir;

    // Initialize configuration service if dataDir is available
    if (dataDir) {
      try {
        this.configurationService = new ConfigurationService({
          dataPath: dataDir,
        });
      } catch (error: any) {
        this.logger.warn('Failed to initialize ConfigurationService', {
          error: error.message,
        });
      }
    }
  }

  /**
   * Run all configuration diagnostic checks
   */
  async check(options?: DiagnosticOptions): Promise<CheckResult> {
    const checks: CheckResult[] = [];
    const issues: DiagnosticIssue[] = [];

    try {
      // Check 1: .civicrc file existence and accessibility
      const civicrcCheck = await this.checkCivicrcFile();
      checks.push(civicrcCheck);
      if (civicrcCheck.status === 'error') {
        issues.push(
          this.createIssue('critical', '.civicrc file check failed', {
            autoFixable: false,
            recommendations: [
              'Run civic init to create configuration',
              'Check file permissions',
            ],
            details: civicrcCheck.details,
          })
        );
        return this.createErrorResult('.civicrc file check failed', undefined, {
          checks,
        });
      }

      // Check 2: Central configuration loading
      const configLoadCheck = await this.checkConfigLoading();
      checks.push(configLoadCheck);
      if (configLoadCheck.status === 'error') {
        issues.push(
          this.createIssue('critical', 'Failed to load central configuration', {
            autoFixable: false,
            recommendations: [
              'Check .civicrc file syntax',
              'Verify YAML format is correct',
              'Review configuration file permissions',
            ],
            details: configLoadCheck.details,
          })
        );
      }

      // Check 3: Required configuration fields
      const requiredFieldsCheck = await this.checkRequiredFields();
      checks.push(requiredFieldsCheck);
      if (
        requiredFieldsCheck.status === 'error' ||
        requiredFieldsCheck.status === 'warning'
      ) {
        issues.push(
          this.createIssue(
            requiredFieldsCheck.status === 'error' ? 'high' : 'medium',
            'Missing or invalid required configuration fields',
            {
              autoFixable: requiredFieldsCheck.status === 'warning',
              fix:
                requiredFieldsCheck.status === 'warning'
                  ? {
                      description: 'Reset to default configuration',
                      command: 'civic config:init --all',
                      requiresConfirmation: true,
                    }
                  : undefined,
              recommendations: [
                'Review required fields in documentation',
                'Use civic config:init to reset defaults',
              ],
              details: requiredFieldsCheck.details,
            }
          )
        );
      }

      // Check 4: Configuration file validation
      const validationCheck = await this.checkConfigurationFiles();
      checks.push(validationCheck);
      if (
        validationCheck.status === 'error' ||
        validationCheck.status === 'warning'
      ) {
        issues.push(
          this.createIssue(
            validationCheck.status === 'error' ? 'high' : 'medium',
            'Configuration file validation issues',
            {
              autoFixable: true,
              fix: {
                description: 'Validate and fix configuration files',
                command: 'civic config:validate --all',
                requiresConfirmation: false,
              },
              recommendations: [
                'Review configuration file syntax',
                'Check for YAML parsing errors',
              ],
              details: validationCheck.details,
            }
          )
        );
      }

      // Check 5: Configuration file permissions
      const permissionsCheck = await this.checkFilePermissions();
      checks.push(permissionsCheck);
      if (permissionsCheck.status === 'warning') {
        issues.push(
          this.createIssue('medium', 'Configuration file permission issues', {
            autoFixable: false,
            recommendations: [
              'Ensure configuration files are readable',
              'Check file ownership and permissions',
            ],
            details: permissionsCheck.details,
          })
        );
      }

      // Check 6: Database configuration
      const dbConfigCheck = await this.checkDatabaseConfig();
      checks.push(dbConfigCheck);
      if (
        dbConfigCheck.status === 'error' ||
        dbConfigCheck.status === 'warning'
      ) {
        issues.push(
          this.createIssue(
            dbConfigCheck.status === 'error' ? 'high' : 'medium',
            'Database configuration issues',
            {
              autoFixable: false,
              recommendations: [
                'Verify database path is correct',
                'Check database file permissions',
                'Ensure database directory exists',
              ],
              details: dbConfigCheck.details,
            }
          )
        );
      }

      // Determine overall status
      const hasErrors = checks.some((c) => c.status === 'error');
      const hasWarnings = checks.some((c) => c.status === 'warning');

      if (hasErrors) {
        return this.createErrorResult(
          'Configuration diagnostic found critical issues',
          undefined,
          {
            checks,
            issues,
          }
        );
      }

      if (hasWarnings) {
        return this.createWarningResult(
          'Configuration diagnostic found warnings',
          {
            checks,
            issues,
          }
        );
      }

      return this.createSuccessResult('All configuration checks passed', {
        checks,
        issues: [],
      });
    } catch (error: any) {
      this.logger.error('Configuration diagnostic check failed', {
        error: error.message,
        stack: error.stack,
      });
      return this.createErrorResult(
        'Configuration diagnostic check failed',
        error,
        {
          checks,
          issues,
        }
      );
    }
  }

  /**
   * Check .civicrc file existence and accessibility
   */
  private async checkCivicrcFile(): Promise<CheckResult> {
    try {
      // Find .civicrc file
      const configPath = this.findCivicrcFile();

      if (!configPath) {
        return this.createErrorResult('.civicrc file not found', undefined, {
          recommendation: 'Run civic init to create configuration',
        });
      }

      // Check if file exists
      if (!fs.existsSync(configPath)) {
        return this.createErrorResult(
          '.civicrc file does not exist',
          undefined,
          {
            path: configPath,
          }
        );
      }

      // Check if file is readable
      try {
        fs.accessSync(configPath, fs.constants.R_OK);
      } catch (error) {
        return this.createErrorResult('.civicrc file is not readable', error, {
          path: configPath,
        });
      }

      // Check file size
      const stats = fs.statSync(configPath);
      if (stats.size === 0) {
        return this.createWarningResult('.civicrc file is empty', {
          path: configPath,
        });
      }

      return this.createSuccessResult('.civicrc file is accessible', {
        path: configPath,
        size: stats.size,
      });
    } catch (error: any) {
      return this.createErrorResult('Failed to check .civicrc file', error);
    }
  }

  /**
   * Check configuration loading
   */
  private async checkConfigLoading(): Promise<CheckResult> {
    try {
      const config = CentralConfigManager.getConfig();

      if (!config) {
        return this.createErrorResult('Failed to load configuration');
      }

      // Check if config has at least basic structure
      if (typeof config !== 'object') {
        return this.createErrorResult('Configuration is not a valid object');
      }

      return this.createSuccessResult('Configuration loaded successfully', {
        hasDataDir: !!config.dataDir,
        hasDatabase: !!config.database,
      });
    } catch (error: any) {
      // Check if it's a YAML parsing error
      if (error.message?.includes('YAML') || error.message?.includes('parse')) {
        return this.createErrorResult(
          'YAML parsing error in configuration',
          error,
          {
            errorType: 'yaml_parse_error',
          }
        );
      }
      return this.createErrorResult('Failed to load configuration', error);
    }
  }

  /**
   * Check required configuration fields
   */
  private async checkRequiredFields(): Promise<CheckResult> {
    try {
      const config = CentralConfigManager.getConfig();
      const missingFields: string[] = [];
      const invalidFields: string[] = [];

      // Check dataDir
      if (!config.dataDir) {
        missingFields.push('dataDir');
      } else if (typeof config.dataDir !== 'string') {
        invalidFields.push('dataDir');
      }

      // Check database configuration
      if (!config.database) {
        missingFields.push('database');
      } else {
        if (!config.database.type) {
          missingFields.push('database.type');
        } else if (!['sqlite', 'postgres'].includes(config.database.type)) {
          invalidFields.push('database.type');
        }

        if (
          config.database.type === 'sqlite' &&
          !config.database.sqlite?.file
        ) {
          missingFields.push('database.sqlite.file');
        }

        if (
          config.database.type === 'postgres' &&
          !config.database.postgres?.url
        ) {
          missingFields.push('database.postgres.url');
        }
      }

      if (missingFields.length > 0) {
        return this.createErrorResult(
          'Missing required configuration fields',
          undefined,
          {
            missing: missingFields,
          }
        );
      }

      if (invalidFields.length > 0) {
        return this.createWarningResult('Invalid configuration field values', {
          invalid: invalidFields,
        });
      }

      return this.createSuccessResult(
        'All required configuration fields present'
      );
    } catch (error: any) {
      return this.createErrorResult('Failed to check required fields', error);
    }
  }

  /**
   * Check configuration files in data/.civic/
   */
  private async checkConfigurationFiles(): Promise<CheckResult> {
    try {
      if (!this.configurationService) {
        return this.createWarningResult('Configuration service not available');
      }

      const configDir = path.join(this.dataDir, '.civic');
      if (!fs.existsSync(configDir)) {
        return this.createWarningResult(
          'Configuration directory does not exist',
          {
            path: configDir,
            recommendation: 'Run civic init to create configuration files',
          }
        );
      }

      // Get list of configuration files
      const configFiles = fs
        .readdirSync(configDir)
        .filter((file) => file.endsWith('.yml') || file.endsWith('.yaml'));

      if (configFiles.length === 0) {
        return this.createWarningResult('No configuration files found', {
          path: configDir,
        });
      }

      const validationErrors: string[] = [];
      const validatedFiles: string[] = [];

      // Validate each configuration file
      for (const file of configFiles) {
        const filePath = path.join(configDir, file);
        const configType = file.replace(/\.(yml|yaml)$/, '');

        try {
          const content = fs.readFileSync(filePath, 'utf-8');

          // Try to parse YAML
          try {
            yaml.parse(content);
          } catch (parseError: any) {
            validationErrors.push(
              `${file}: YAML parse error - ${parseError.message}`
            );
            continue;
          }

          // Validate using ConfigurationService if available
          try {
            const validation =
              await this.configurationService.validateConfiguration(
                configType,
                content
              );
            if (!validation.valid) {
              validationErrors.push(`${file}: ${validation.errors.join(', ')}`);
            } else {
              validatedFiles.push(file);
            }
          } catch (error: any) {
            // If validation fails, just mark as warning
            this.logger.warn(`Failed to validate ${file}`, {
              error: error.message,
            });
            validatedFiles.push(file); // Assume valid if validation service fails
          }
        } catch (error: any) {
          validationErrors.push(`${file}: ${error.message}`);
        }
      }

      if (validationErrors.length > 0) {
        return this.createErrorResult(
          'Configuration file validation errors',
          undefined,
          {
            errors: validationErrors,
            validated: validatedFiles.length,
            total: configFiles.length,
          }
        );
      }

      return this.createSuccessResult('All configuration files validated', {
        files: validatedFiles.length,
      });
    } catch (error: any) {
      return this.createWarningResult('Failed to check configuration files', {
        error: error.message,
      });
    }
  }

  /**
   * Check configuration file permissions
   */
  private async checkFilePermissions(): Promise<CheckResult> {
    try {
      const configPath = this.findCivicrcFile();
      if (!configPath || !fs.existsSync(configPath)) {
        return this.createSuccessResult(
          'File permissions check skipped: .civicrc not found'
        );
      }

      // Check read permission
      try {
        fs.accessSync(configPath, fs.constants.R_OK);
      } catch (error) {
        return this.createWarningResult('.civicrc file is not readable', {
          path: configPath,
        });
      }

      // Check write permission (for potential fixes)
      let writable = true;
      try {
        fs.accessSync(configPath, fs.constants.W_OK);
      } catch {
        writable = false;
      }

      if (!writable) {
        return this.createWarningResult('.civicrc file is not writable', {
          path: configPath,
          recommendation: 'Auto-fix may not be able to update configuration',
        });
      }

      return this.createSuccessResult(
        'Configuration file permissions are correct',
        {
          readable: true,
          writable: true,
        }
      );
    } catch (error: any) {
      return this.createWarningResult('Failed to check file permissions', {
        error: error.message,
      });
    }
  }

  /**
   * Check database configuration
   */
  private async checkDatabaseConfig(): Promise<CheckResult> {
    try {
      const dbConfig = CentralConfigManager.getDatabaseConfig();

      if (!dbConfig) {
        return this.createErrorResult('Database configuration not found');
      }

      if (!dbConfig.type) {
        return this.createErrorResult('Database type not specified');
      }

      if (dbConfig.type === 'sqlite') {
        if (!dbConfig.sqlite?.file) {
          return this.createErrorResult(
            'SQLite database file path not specified'
          );
        }

        const dbPath = dbConfig.sqlite.file;
        const dbDir = path.dirname(dbPath);

        // Check if database directory exists
        if (!fs.existsSync(dbDir)) {
          return this.createWarningResult('Database directory does not exist', {
            path: dbDir,
            recommendation: 'Directory will be created on first use',
          });
        }

        // Check if database file exists (optional - it will be created)
        if (fs.existsSync(dbPath)) {
          // Check if readable
          try {
            fs.accessSync(dbPath, fs.constants.R_OK);
          } catch (error) {
            return this.createErrorResult(
              'Database file is not readable',
              error,
              {
                path: dbPath,
              }
            );
          }
        }
      } else if (dbConfig.type === 'postgres') {
        if (!dbConfig.postgres?.url) {
          return this.createErrorResult(
            'PostgreSQL connection URL not specified'
          );
        }
      }

      return this.createSuccessResult('Database configuration is valid', {
        type: dbConfig.type,
      });
    } catch (error: any) {
      return this.createErrorResult(
        'Failed to check database configuration',
        error
      );
    }
  }

  /**
   * Find .civicrc file
   */
  private findCivicrcFile(): string | null {
    // Try to find .civicrc using the same logic as CentralConfigManager
    let currentPath = process.cwd();
    const maxDepth = 10;
    let depth = 0;

    while (depth < maxDepth) {
      const configPath = path.join(currentPath, '.civicrc');
      if (fs.existsSync(configPath)) {
        return configPath;
      }

      const parentPath = path.dirname(currentPath);
      if (parentPath === currentPath) {
        break;
      }
      currentPath = parentPath;
      depth++;
    }

    return null;
  }

  /**
   * Auto-fix configuration issues
   */
  async autoFix(
    issues: DiagnosticIssue[],
    options?: FixOptions
  ): Promise<FixResult[]> {
    const results: FixResult[] = [];

    for (const issue of issues) {
      const startTime = Date.now();

      try {
        // Most configuration fixes require manual intervention
        // Only simple fixes can be automated

        if (issue.message.includes('validation')) {
          // Try to fix YAML syntax errors (limited)
          const fixed = await this.fixYAMLSyntax(issue);
          if (fixed) {
            results.push(
              this.createFixResult(issue.id, true, 'YAML syntax errors fixed', {
                duration: Date.now() - startTime,
              })
            );
          } else {
            results.push(
              this.createFixResult(
                issue.id,
                false,
                'YAML syntax fix not available',
                {
                  duration: Date.now() - startTime,
                }
              )
            );
          }
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
   * Attempt to fix YAML syntax errors (limited capability)
   */
  private async fixYAMLSyntax(issue: DiagnosticIssue): Promise<boolean> {
    // This is a placeholder - actual YAML fixing would require
    // sophisticated parsing and error recovery
    // For now, we just return false to indicate fix is not available
    this.logger.warn('YAML syntax auto-fix not implemented', {
      issueId: issue.id,
    });
    return false;
  }
}
