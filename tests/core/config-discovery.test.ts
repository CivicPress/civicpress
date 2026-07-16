import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestContext, cleanupTestContext } from '../utils/cli-test-utils';
import { existsSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import yaml from 'js-yaml';
import { CentralConfigManager } from '@civicpress/core';

describe('Config Discovery with Database Configuration', () => {
  let context: ReturnType<typeof createTestContext>;

  beforeEach(() => {
    context = createTestContext();
  });

  afterEach(() => {
    cleanupTestContext(context);
  });

  describe('.civicrc parsing', () => {
    it('should parse SQLite configuration from .civicrc', async () => {
      const civicrcPath = join(context.testDir, '.civicrc');
      const civicrc = {
        dataDir: 'data',
        database: {
          type: 'sqlite',
          sqlite: {
            file: 'data/.civic/civic.db',
          },
        },
      };

      writeFileSync(civicrcPath, yaml.dump(civicrc));

      // Reset the config manager to ensure fresh state
      CentralConfigManager.reset();

      // Change to test directory so config manager finds the .civicrc file
      const originalCwd = process.cwd();
      process.chdir(context.testDir);

      try {
        const config = CentralConfigManager.getConfig();

        expect(config).toBeDefined();
        expect(config.database).toBeDefined();
        expect(config.database?.type).toBe('sqlite');
        expect(config.database?.sqlite).toBeDefined();
        expect(config.database?.sqlite?.file).toContain('data/.civic/civic.db');
        // dataDir should be resolved to absolute path
        expect(config.dataDir).toContain('data');
      } finally {
        process.chdir(originalCwd);
      }
    });

    it('should parse PostgreSQL configuration from .civicrc', async () => {
      const civicrcPath = join(context.testDir, '.civicrc');
      const civicrc = {
        dataDir: 'data',
        database: {
          type: 'postgres',
          postgres: {
            url: 'postgres://user:password@localhost:5432/civicpress',
          },
        },
      };

      writeFileSync(civicrcPath, yaml.dump(civicrc));

      // Reset the config manager to ensure fresh state
      CentralConfigManager.reset();

      // Change to test directory so config manager finds the .civicrc file
      const originalCwd = process.cwd();
      process.chdir(context.testDir);

      try {
        const config = CentralConfigManager.getConfig();

        expect(config).toBeDefined();
        expect(config.database).toBeDefined();
        expect(config.database?.type).toBe('postgres');
        expect(config.database?.postgres).toBeDefined();
        expect(config.database?.postgres?.url).toBe(
          'postgres://user:password@localhost:5432/civicpress'
        );
        // dataDir should be resolved to absolute path
        expect(config.dataDir).toContain('data');
      } finally {
        process.chdir(originalCwd);
      }
    });

    it('should handle missing database configuration gracefully', async () => {
      const civicrcPath = join(context.testDir, '.civicrc');
      const civicrc = {
        dataDir: 'data',
        // No database configuration
      };

      writeFileSync(civicrcPath, yaml.dump(civicrc));

      // Reset the config manager to ensure fresh state
      CentralConfigManager.reset();

      // Change to test directory so config manager finds the .civicrc file
      const originalCwd = process.cwd();
      process.chdir(context.testDir);

      try {
        const config = CentralConfigManager.getConfig();

        expect(config).toBeDefined();
        // dataDir should be resolved to absolute path
        expect(config.dataDir).toContain('data');
        // Should provide default database configuration when not present in .civicrc
        expect(config.database).toBeDefined();
        expect(config.database?.type).toBe('sqlite');
      } finally {
        process.chdir(originalCwd);
      }
    });

    it('should validate database configuration structure', async () => {
      const civicrcPath = join(context.testDir, '.civicrc');
      const civicrc = {
        dataDir: 'data',
        database: {
          type: 'sqlite',
          // Missing sqlite configuration
        },
      };

      writeFileSync(civicrcPath, yaml.dump(civicrc));

      // Reset the config manager to ensure fresh state
      CentralConfigManager.reset();

      // Change to test directory so config manager finds the .civicrc file
      const originalCwd = process.cwd();
      process.chdir(context.testDir);

      try {
        const config = CentralConfigManager.getConfig();

        // Should handle gracefully and provide default config
        expect(config).toBeDefined();
        expect(config.database).toBeDefined();
      } finally {
        process.chdir(originalCwd);
      }
    });

    it('should handle invalid database type gracefully', async () => {
      const civicrcPath = join(context.testDir, '.civicrc');
      const civicrc = {
        dataDir: 'data',
        database: {
          type: 'invalid_type',
          sqlite: {
            file: 'data/.civic/civic.db',
          },
        },
      };

      writeFileSync(civicrcPath, yaml.dump(civicrc));

      // Reset the config manager to ensure fresh state
      CentralConfigManager.reset();

      // Change to test directory so config manager finds the .civicrc file
      const originalCwd = process.cwd();
      process.chdir(context.testDir);

      try {
        const config = CentralConfigManager.getConfig();

        // Should handle gracefully and provide default config
        expect(config).toBeDefined();
        expect(config.database).toBeDefined();
      } finally {
        process.chdir(originalCwd);
      }
    });
  });

  describe('Configuration file precedence', () => {
    it('CIVIC_DATA_DIR overrides dataDir but does not discard the .civicrc database block', async () => {
      const civicrcPath = join(context.testDir, '.civicrc');
      const civicrc = {
        dataDir: 'data',
        database: {
          type: 'sqlite',
          sqlite: {
            file: 'data/.civic/civic.db',
          },
        },
      };

      writeFileSync(civicrcPath, yaml.dump(civicrc));

      // Reset the config manager to ensure fresh state
      CentralConfigManager.reset();

      // Set environment variable
      const originalEnv = process.env.CIVIC_DATA_DIR;
      process.env.CIVIC_DATA_DIR = '/different/path';

      // Change to test directory so config manager finds the .civicrc file
      const originalCwd = process.cwd();
      process.chdir(context.testDir);

      try {
        const config = CentralConfigManager.getConfig();

        // CIVIC_DATA_DIR overrides the data directory...
        expect(config.dataDir).toBe('/different/path');
        // ...but the .civicrc database block is still honored (post-audit
        // Tier-C: the env var used to early-return a minimal config and drop
        // the entire .civicrc, hardcoding the DB to <env>/civic.db).
        expect(config.database?.type).toBe('sqlite');
        expect(config.database?.sqlite?.file).toContain(
          'data/.civic/civic.db'
        );
      } finally {
        process.chdir(originalCwd);
        if (originalEnv) {
          process.env.CIVIC_DATA_DIR = originalEnv;
        } else {
          delete process.env.CIVIC_DATA_DIR;
        }
      }
    });

    it('preserves non-database .civicrc fields (e.g. auth) when CIVIC_DATA_DIR is set', async () => {
      const civicrcPath = join(context.testDir, '.civicrc');
      const civicrc = {
        dataDir: 'data',
        database: { type: 'sqlite', sqlite: { file: 'data/.civic/civic.db' } },
        auth: { providers: ['password'], defaultRole: 'public' },
      };
      writeFileSync(civicrcPath, yaml.dump(civicrc));
      CentralConfigManager.reset();

      const originalEnv = process.env.CIVIC_DATA_DIR;
      process.env.CIVIC_DATA_DIR = '/different/path';
      const originalCwd = process.cwd();
      process.chdir(context.testDir);

      try {
        const config = CentralConfigManager.getConfig() as {
          dataDir?: string;
          auth?: { providers?: string[]; defaultRole?: string };
        };
        expect(config.dataDir).toBe('/different/path');
        // auth was silently discarded by the old early-return.
        expect(config.auth?.providers).toEqual(['password']);
        expect(config.auth?.defaultRole).toBe('public');
      } finally {
        process.chdir(originalCwd);
        if (originalEnv) {
          process.env.CIVIC_DATA_DIR = originalEnv;
        } else {
          delete process.env.CIVIC_DATA_DIR;
        }
      }
    });
  });

  describe('Database configuration access', () => {
    it('should provide database config through dedicated method', async () => {
      const civicrcPath = join(context.testDir, '.civicrc');
      const civicrc = {
        dataDir: 'data',
        database: {
          type: 'postgres',
          postgres: {
            url: 'postgres://user:password@localhost:5432/civicpress',
          },
        },
      };

      writeFileSync(civicrcPath, yaml.dump(civicrc));

      // Reset the config manager to ensure fresh state
      CentralConfigManager.reset();

      // Change to test directory so config manager finds the .civicrc file
      const originalCwd = process.cwd();
      process.chdir(context.testDir);

      try {
        const dbConfig = CentralConfigManager.getDatabaseConfig();

        expect(dbConfig).toBeDefined();
        expect(dbConfig?.type).toBe('postgres');
        expect(dbConfig?.postgres?.url).toBe(
          'postgres://user:password@localhost:5432/civicpress'
        );
      } finally {
        process.chdir(originalCwd);
      }
    });

    it('should provide data directory through dedicated method', async () => {
      const civicrcPath = join(context.testDir, '.civicrc');
      const civicrc = {
        dataDir: 'custom_data',
        database: {
          type: 'sqlite',
          sqlite: {
            file: 'custom_data/.civic/civic.db',
          },
        },
      };

      writeFileSync(civicrcPath, yaml.dump(civicrc));

      // Reset the config manager to ensure fresh state
      CentralConfigManager.reset();

      // Change to test directory so config manager finds the .civicrc file
      const originalCwd = process.cwd();
      process.chdir(context.testDir);

      try {
        const dataDir = CentralConfigManager.getDataDir();

        // dataDir should be resolved to absolute path
        expect(dataDir).toContain('custom_data');
      } finally {
        process.chdir(originalCwd);
      }
    });
  });
});
