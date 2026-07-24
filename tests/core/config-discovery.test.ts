import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestContext, cleanupTestContext } from '../utils/cli-test-utils';
import { existsSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import yaml from 'js-yaml';
import {
  CentralConfigManager,
  resolveSystemDataDir,
} from '@civicpress/core';

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

  /**
   * `.system-data/` (DB, secret, storage creds, realtime/BB data) is anchored
   * to the PROJECT ROOT — the directory holding `.civicrc` — not derived by
   * stripping a segment off `dataDir`. Those two rules only agreed when
   * `dataDir` was exactly `<root>/data`; on any other layout the DB and the
   * secrets/storage landed in different directories. These pin the one rule.
   */
  describe('.system-data anchoring (dataDir issue)', () => {
    it('anchors systemDataDir to .civicrc even when dataDir is nested elsewhere', async () => {
      const civicrcPath = join(context.testDir, '.civicrc');
      writeFileSync(
        civicrcPath,
        yaml.dump({
          // dataDir points TWO levels down — the old dirname(dataDir) rule
          // would have put .system-data at <root>/var, splitting it from the DB.
          dataDir: 'var/records',
        })
      );
      CentralConfigManager.reset();
      const originalCwd = process.cwd();
      process.chdir(context.testDir);

      try {
        const systemDataDir = CentralConfigManager.getSystemDataDir();
        // Anchored to the .civicrc dir, NOT to dirname(dataDir) (= <root>/var).
        expect(systemDataDir).toBe(join(context.testDir, '.system-data'));
        expect(systemDataDir).not.toContain(join('var', '.system-data'));

        // And the defaulted DB lands in that same .system-data, not inside the
        // (relocated) data dir.
        const dbFile = CentralConfigManager.getConfig().database?.sqlite?.file;
        expect(dbFile).toBe(
          join(context.testDir, '.system-data', 'civic.db')
        );
      } finally {
        process.chdir(originalCwd);
        CentralConfigManager.reset();
      }
    });

    it('resolveSystemDataDir prefers the anchored value; falls back to dirname(dataDir) only without one', () => {
      // Anchored config (came through CentralConfigManager): use it verbatim.
      expect(
        resolveSystemDataDir({
          dataDir: '/srv/civic/var/records',
          systemDataDir: '/srv/civic/.system-data',
        })
      ).toBe('/srv/civic/.system-data');

      // Raw config with no anchor (e.g. a directly-built test config): the
      // documented dirname(dataDir) fallback, preserving prior behavior.
      expect(resolveSystemDataDir({ dataDir: '/srv/civic/data' })).toBe(
        join('/srv/civic', '.system-data')
      );
    });

    it('CIVIC_DATA_DIR sets only the data dir — the DB resolves canonically, not inside it', async () => {
      // .civicrc with NO database block (so the default path is taken).
      writeFileSync(
        join(context.testDir, '.civicrc'),
        yaml.dump({ dataDir: 'data' })
      );
      CentralConfigManager.reset();
      const originalEnv = process.env.CIVIC_DATA_DIR;
      const originalCwd = process.cwd();
      process.env.CIVIC_DATA_DIR = '/external/civic-data';
      process.chdir(context.testDir);

      try {
        const config = CentralConfigManager.getConfig();
        expect(config.dataDir).toBe('/external/civic-data');
        // The DB is NOT `/external/civic-data/civic.db` (the old third
        // behavior) — it resolves to the canonical project-root .system-data.
        expect(config.database?.sqlite?.file).toBe(
          join(context.testDir, '.system-data', 'civic.db')
        );
      } finally {
        process.chdir(originalCwd);
        if (originalEnv) process.env.CIVIC_DATA_DIR = originalEnv;
        else delete process.env.CIVIC_DATA_DIR;
        CentralConfigManager.reset();
      }
    });
  });
});
