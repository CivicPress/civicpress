import { CivicPress } from '@civicpress/core';
import { Logger } from '@civicpress/core';
import * as path from 'path';
import * as os from 'os';
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'fs';

/**
 * Authentication utilities for CLI commands
 */
export class AuthUtils {
  private static logger = new Logger();

  /** The file `resolveToken` reads and `login`/`logout` write. */
  static tokenFilePath(): string {
    return path.join(os.homedir(), '.civicpress', 'token');
  }

  /**
   * Persist a session token so subsequent commands resolve it without a
   * flag or env var. Written 0600 (owner-only) — the whole point of the
   * file (vs `--token`) is to keep the token OUT of shell history and
   * process listings, so it must not be world-readable either.
   */
  static saveToken(token: string): string {
    const file = this.tokenFilePath();
    mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
    writeFileSync(file, token, { encoding: 'utf-8', mode: 0o600 });
    return file;
  }

  /** Remove the persisted token (logout). Idempotent. */
  static clearToken(): void {
    try {
      rmSync(this.tokenFilePath(), { force: true });
    } catch {
      // best-effort — nothing to clear
    }
  }

  /** Public token resolution (flag → CIVIC_TOKEN → token file). */
  static getResolvedToken(flagToken?: string): string | undefined {
    return this.resolveToken(flagToken).token;
  }

  /**
   * FA-CLI-003: a token passed on the command line (`--token`) is visible in
   * shell history and to any local process via `ps`/`/proc`. Resolve the token
   * from safer sources in priority order:
   *   1. --token (explicit; warned as deprecated)
   *   2. CIVIC_TOKEN environment variable
   *   3. ~/.civicpress/token file
   */
  private static resolveToken(token: string | undefined): {
    token: string | undefined;
    fromFlag: boolean;
  } {
    if (token) {
      return { token, fromFlag: true };
    }
    if (process.env.CIVIC_TOKEN) {
      return { token: process.env.CIVIC_TOKEN, fromFlag: false };
    }
    try {
      const fileToken = readFileSync(
        path.join(os.homedir(), '.civicpress', 'token'),
        'utf-8'
      ).trim();
      if (fileToken) {
        return { token: fileToken, fromFlag: false };
      }
    } catch {
      // no token file — fall through
    }
    return { token: undefined, fromFlag: false };
  }

  /**
   * Validate authentication token and return user info
   * @param token Session token to validate
   * @param shouldOutputJson Whether to output JSON format
   * @returns User object if valid, null if invalid
   */
  static async validateAuth(
    token: string | undefined,
    shouldOutputJson: boolean = false
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ): Promise<any> {
    // FA-CLI-003: resolve from --token / CIVIC_TOKEN / ~/.civicpress/token.
    const { token: resolvedToken, fromFlag } = this.resolveToken(token);

    if (fromFlag && !shouldOutputJson) {
      this.logger.warn(
        '⚠️  --token is visible in shell history and process listings; ' +
          'prefer the CIVIC_TOKEN env var or a ~/.civicpress/token file'
      );
    }

    // Check if token is provided
    if (!resolvedToken) {
      if (shouldOutputJson) {
        console.log(
          JSON.stringify(
            {
              success: false,
              error: 'Authentication required',
              details:
                'Provide a token via CIVIC_TOKEN, ~/.civicpress/token, or --token',
            },
            null,
            2
          )
        );
      } else {
        this.logger.error('❌ Authentication required');
        this.logger.info(
          '💡 Set CIVIC_TOKEN or write ~/.civicpress/token (preferred), or use --token'
        );
        this.logger.info('💡 Run "civic auth:login" to get a session token');
      }
      process.exit(1);
    }

    token = resolvedToken;

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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ): Promise<{ user: any; civic: CivicPress }> {
    return await this.validateAuth(token, shouldOutputJson);
  }
}
