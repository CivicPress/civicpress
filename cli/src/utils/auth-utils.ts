import { CivicPress } from '@civicpress/core';
import { Logger } from '@civicpress/core';
import * as path from 'path';

/**
 * Authentication utilities for CLI commands
 */
export class AuthUtils {
  private static logger = new Logger();

  /**
   * Validate authentication token and return user info
   * @param token Session token to validate
   * @param shouldOutputJson Whether to output JSON format
   * @returns User object if valid, null if invalid
   */
  static async validateAuth(
    token: string | undefined,
    shouldOutputJson: boolean = false
  ): Promise<any> {
    // Check if token is provided
    if (!token) {
      if (shouldOutputJson) {
        console.log(
          JSON.stringify(
            {
              success: false,
              error: 'Authentication required',
              details: 'Use --token to provide a session token',
            },
            null,
            2
          )
        );
      } else {
        this.logger.error('❌ Authentication required');
        this.logger.info('💡 Use --token to provide a session token');
        this.logger.info('💡 Run "civic auth:login" to get a session token');
      }
      process.exit(1);
    }

    try {
      // Initialize CivicPress
      const { loadConfig, CentralConfigManager } = await import(
        '@civicpress/core'
      );
      const config = await loadConfig();
      if (!config) {
        throw new Error('CivicPress not initialized. Run "civic init" first.');
      }

      const dataDir = config.dataDir;
      if (!dataDir) {
        throw new Error('dataDir is not configured');
      }

      // Get database configuration from CentralConfigManager
      const dbConfig = CentralConfigManager.getDatabaseConfig() || {
        type: 'sqlite' as const,
        sqlite: {
          file: path.join(dataDir, 'civic.db'),
        },
      };

      const civic = new CivicPress({
        dataDir,
        database: dbConfig,
        logger: { json: shouldOutputJson },
      });
      await civic.initialize();

      // Validate session token
      const authService = civic.getAuthService();
      const user = await authService.validateSession(token);

      if (!user) {
        if (shouldOutputJson) {
          console.log(
            JSON.stringify(
              {
                success: false,
                error: 'Invalid session token',
                details: 'The provided session token is invalid or expired',
              },
              null,
              2
            )
          );
        } else {
          this.logger.error('❌ Invalid session token');
          this.logger.info(
            '💡 Run "civic auth:login" to get a new session token'
          );
        }
        process.exit(1);
      }

      // Show authentication success (non-JSON only)
      if (!shouldOutputJson) {
        this.logger.info(
          `🔐 Authenticated as: ${user.username} (${user.role})`
        );
      }

      return { user, civic };
    } catch (error) {
      if (shouldOutputJson) {
        console.log(
          JSON.stringify(
            {
              success: false,
              error: 'Authentication failed',
              details: error instanceof Error ? error.message : String(error),
            },
            null,
            2
          )
        );
      } else {
        this.logger.error('❌ Authentication failed:', error);
      }
      process.exit(1);
    }
  }

  /**
   * Validate authentication and return user info (for commands that need user data)
   * @param token Session token to validate
   * @param shouldOutputJson Whether to output JSON format
   * @returns User object if valid, exits if invalid
   */
  static async requireAuth(
    token: string | undefined,
    shouldOutputJson: boolean = false
  ): Promise<any> {
    const { user } = await this.validateAuth(token, shouldOutputJson);
    return user;
  }

  /**
   * Validate authentication and return CivicPress instance (for commands that need CivicPress)
   * @param token Session token to validate
   * @param shouldOutputJson Whether to output JSON format
   * @returns Object with user and civic instance
   */
  static async requireAuthWithCivic(
    token: string | undefined,
    shouldOutputJson: boolean = false
  ): Promise<{ user: any; civic: CivicPress }> {
    return await this.validateAuth(token, shouldOutputJson);
  }
}
