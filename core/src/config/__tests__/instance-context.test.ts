import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, existsSync } from 'fs';
import { realpathSync } from 'fs';
import { tmpdir } from 'os';
import { join, dirname } from 'path';
import {
  resolveInstanceContext,
  resolveCodeRoot,
  resolveModulesDir,
  findConfigFile,
  getInstanceContext,
  setInstanceContext,
  resetInstanceContext,
} from '../instance-context.js';

/**
 * The instance layout must be a function of the RESOLVED ROOT, never of the
 * directory the process happens to run from. These tests pin that: the same
 * root produces the same answers from any cwd, and a split code/data
 * deployment (Docker: code `/app`, data `/instance`) still finds `modules/`.
 */
describe('resolveInstanceContext', () => {
  let dir: string;
  const originalCwd = process.cwd();
  const originalDataDir = process.env.CIVIC_DATA_DIR;

  beforeEach(() => {
    // realpath: macOS/tmp is a symlink, and the resolver returns real paths.
    dir = realpathSync(mkdtempSync(join(tmpdir(), 'civic-instance-ctx-')));
    delete process.env.CIVIC_DATA_DIR;
  });

  afterEach(() => {
    process.chdir(originalCwd);
    if (originalDataDir === undefined) delete process.env.CIVIC_DATA_DIR;
    else process.env.CIVIC_DATA_DIR = originalDataDir;
    resetInstanceContext();
    rmSync(dir, { recursive: true, force: true });
  });

  function writeConfig(root: string, body: string): void {
    mkdirSync(root, { recursive: true });
    writeFileSync(join(root, '.civicrc'), body, 'utf8');
  }

  describe('root resolution', () => {
    it('uses an explicit root without consulting cwd', () => {
      writeConfig(dir, 'dataDir: data\n');
      const nested = join(dir, 'a', 'b');
      mkdirSync(nested, { recursive: true });
      process.chdir(nested);

      const ctx = resolveInstanceContext({ root: dir });

      expect(ctx.root).toBe(dir);
      expect(ctx.configPath).toBe(join(dir, '.civicrc'));
    });

    it('walks up from cwd to find .civicrc', () => {
      writeConfig(dir, 'dataDir: data\n');
      const nested = join(dir, 'deep', 'deeper');
      mkdirSync(nested, { recursive: true });

      expect(resolveInstanceContext({ cwd: nested }).root).toBe(dir);
    });

    it('derives the root from an explicit configPath', () => {
      writeConfig(dir, 'dataDir: data\n');
      const ctx = resolveInstanceContext({
        configPath: join(dir, '.civicrc'),
      });
      expect(ctx.root).toBe(dir);
    });

    it('falls back to the start directory when no .civicrc exists anywhere', () => {
      // A tmpdir has no .civicrc above it, so the walk-up reaches / and gives up.
      const ctx = resolveInstanceContext({ cwd: dir });
      expect(ctx.root).toBe(dir);
      expect(ctx.configPath).toBeNull();
    });

    it('reports configPath: null when an explicit root holds no .civicrc', () => {
      expect(resolveInstanceContext({ root: dir }).configPath).toBeNull();
    });

    it('findConfigFile walks up and returns null when nothing is found', () => {
      const nested = join(dir, 'p', 'q');
      mkdirSync(nested, { recursive: true });

      // Nothing yet — a tmpdir has no .civicrc above it.
      expect(findConfigFile(nested)).toBeNull();

      writeConfig(dir, 'dataDir: data\n');
      expect(findConfigFile(nested)).toBe(join(dir, '.civicrc'));
    });

    it('resolves identically from any cwd — the property the cwd fallbacks broke', () => {
      writeConfig(dir, 'dataDir: data\n');
      const nested = join(dir, 'x', 'y');
      mkdirSync(nested, { recursive: true });

      const fromRoot = resolveInstanceContext({ root: dir });
      const fromNested = resolveInstanceContext({ cwd: nested });
      const fromElsewhere = resolveInstanceContext({
        root: dir,
        cwd: tmpdir(),
      });

      expect(fromNested).toEqual(fromRoot);
      expect(fromElsewhere).toEqual(fromRoot);
    });
  });

  describe('derived data paths', () => {
    it('anchors dataDir and systemDataDir to the root', () => {
      writeConfig(dir, 'dataDir: data\n');
      const ctx = resolveInstanceContext({ root: dir });

      expect(ctx.dataDir).toBe(join(dir, 'data'));
      expect(ctx.systemDataDir).toBe(join(dir, '.system-data'));
    });

    it('defaults dataDir to <root>/data when the config declares none', () => {
      writeConfig(dir, 'database:\n  type: sqlite\n');
      expect(resolveInstanceContext({ root: dir }).dataDir).toBe(
        join(dir, 'data')
      );
    });

    it('keeps .system-data at the root even when dataDir points elsewhere', () => {
      // The bug this rule replaced: deriving system data from dirname(dataDir)
      // split the DB from the secrets/storage on any non-default layout.
      const elsewhere = join(dir, 'somewhere', 'else', 'records');
      writeConfig(dir, `dataDir: ${elsewhere}\n`);
      const ctx = resolveInstanceContext({ root: dir });

      expect(ctx.dataDir).toBe(elsewhere);
      expect(ctx.systemDataDir).toBe(join(dir, '.system-data'));
    });

    it('honors an absolute systemDataDir from config', () => {
      const sys = join(dir, 'custom-system');
      writeConfig(dir, `dataDir: data\nsystemDataDir: ${sys}\n`);
      expect(resolveInstanceContext({ root: dir }).systemDataDir).toBe(sys);
    });

    it('lets CIVIC_DATA_DIR override only dataDir, not the root anchor', () => {
      const envDir = join(dir, 'env-data');
      writeConfig(dir, 'dataDir: data\n');
      process.env.CIVIC_DATA_DIR = envDir;

      const ctx = resolveInstanceContext({ root: dir });

      expect(ctx.dataDir).toBe(envDir);
      expect(ctx.systemDataDir).toBe(join(dir, '.system-data'));
    });

    it('prefers a caller-supplied config over re-reading .civicrc', () => {
      writeConfig(dir, 'dataDir: on-disk\n');
      const ctx = resolveInstanceContext({
        root: dir,
        config: { dataDir: join(dir, 'from-caller') },
      });
      expect(ctx.dataDir).toBe(join(dir, 'from-caller'));
    });

    it('degrades to defaults on an unparseable .civicrc rather than throwing', () => {
      writeConfig(dir, 'dataDir: [unclosed\n');
      const ctx = resolveInstanceContext({ root: dir });
      expect(ctx.dataDir).toBe(join(dir, 'data'));
    });
  });

  describe('modulesDir — modules are code, not data', () => {
    it('prefers a modules/ tree beside the data root when one exists', () => {
      writeConfig(dir, 'dataDir: data\n');
      mkdirSync(join(dir, 'modules'), { recursive: true });

      expect(resolveInstanceContext({ root: dir }).modulesDir).toBe(
        join(dir, 'modules')
      );
    });

    it('falls back to <codeRoot>/modules for a split deployment', () => {
      // Docker ships code at /app and runs with WORKDIR /instance: the data
      // root has no modules/, so module discovery must follow the code.
      writeConfig(dir, 'dataDir: data\n');
      const ctx = resolveInstanceContext({ root: dir });

      expect(ctx.modulesDir).toBe(join(ctx.codeRoot, 'modules'));
      expect(ctx.modulesDir).not.toBe(join(dir, 'modules'));
    });

    it('honors an explicit modulesDir override from config', () => {
      writeConfig(dir, 'dataDir: data\nmodulesDir: custom-modules\n');
      expect(resolveInstanceContext({ root: dir }).modulesDir).toBe(
        join(dir, 'custom-modules')
      );
    });

    // resolveModulesDir is the shared rule: the DI container applies it to a
    // CONFIG-supplied root (possibly a test instance), while the
    // record-schema-builder fallback applies it to the process's own context.
    // Both must agree, or a schema-extension lookup silently sees a different
    // module set than the one that was validated against.
    describe('resolveModulesDir (the shared rule)', () => {
      it('returns the data-root modules/ when it exists', () => {
        mkdirSync(join(dir, 'modules'), { recursive: true });
        expect(resolveModulesDir(dir)).toBe(join(dir, 'modules'));
      });

      it('falls back to the code root when the data root has no modules/', () => {
        expect(resolveModulesDir(dir)).toBe(join(resolveCodeRoot(), 'modules'));
      });

      it('agrees with the context that resolveInstanceContext computes', () => {
        writeConfig(dir, 'dataDir: data\n');
        expect(resolveInstanceContext({ root: dir }).modulesDir).toBe(
          resolveModulesDir(dir)
        );
      });

      it('is independent of cwd', () => {
        const nested = join(dir, 'n', 'e', 's', 't');
        mkdirSync(nested, { recursive: true });
        const before = resolveModulesDir(dir);
        process.chdir(nested);
        expect(resolveModulesDir(dir)).toBe(before);
      });
    });
  });

  describe('storageRoot', () => {
    it('defaults to <systemDataDir>/storage', () => {
      writeConfig(dir, 'dataDir: data\n');
      expect(resolveInstanceContext({ root: dir }).storageRoot).toBe(
        join(dir, '.system-data', 'storage')
      );
    });

    it('honors a relative backend.path from storage.yml', () => {
      writeConfig(dir, 'dataDir: data\n');
      const sys = join(dir, '.system-data');
      mkdirSync(sys, { recursive: true });
      writeFileSync(
        join(sys, 'storage.yml'),
        'backend:\n  type: local\n  path: files\n',
        'utf8'
      );

      expect(resolveInstanceContext({ root: dir }).storageRoot).toBe(
        join(sys, 'files')
      );
    });

    it('honors an absolute backend.path from storage.yml', () => {
      writeConfig(dir, 'dataDir: data\n');
      const sys = join(dir, '.system-data');
      const absolute = join(dir, 'mnt', 'bulk');
      mkdirSync(sys, { recursive: true });
      writeFileSync(
        join(sys, 'storage.yml'),
        `backend:\n  type: local\n  path: ${absolute}\n`,
        'utf8'
      );

      expect(resolveInstanceContext({ root: dir }).storageRoot).toBe(absolute);
    });

    it('falls back to the default root on a malformed storage.yml', () => {
      writeConfig(dir, 'dataDir: data\n');
      const sys = join(dir, '.system-data');
      mkdirSync(sys, { recursive: true });
      writeFileSync(join(sys, 'storage.yml'), 'backend: [oops\n', 'utf8');

      expect(resolveInstanceContext({ root: dir }).storageRoot).toBe(
        join(sys, 'storage')
      );
    });
  });

  it('returns a frozen context', () => {
    writeConfig(dir, 'dataDir: data\n');
    const ctx = resolveInstanceContext({ root: dir });
    expect(Object.isFrozen(ctx)).toBe(true);
  });
});

describe('resolveCodeRoot', () => {
  it('finds the tree that actually holds modules/, not a build artifact dir', () => {
    // core's build emits core/dist/modules/ for the manifest schema. Anchoring
    // on "first ancestor with a modules/ dir" would stop there; the real code
    // root is the workspace above core/.
    //
    // Assert against TRACKED marker files only. An earlier version of this test
    // checked for a `.civicrc` above the code root — but `.civicrc` is
    // gitignored, so it exists only on a machine where someone has run
    // `civic init`. That passed locally and would have failed on every clean
    // clone and in CI.
    const codeRoot = resolveCodeRoot();
    expect(existsSync(join(codeRoot, 'modules'))).toBe(true);
    expect(existsSync(join(codeRoot, 'package.json'))).toBe(true);
    expect(existsSync(join(codeRoot, 'pnpm-workspace.yaml'))).toBe(true);
    expect(codeRoot.endsWith(join('core', 'dist'))).toBe(false);
    expect(codeRoot.endsWith('core')).toBe(false);
  });

  it('discovers the code root from this file location, independent of cwd', () => {
    const here = dirname(new URL(import.meta.url).pathname);
    expect(resolveCodeRoot(here)).toBe(resolveCodeRoot());
  });
});

describe('getInstanceContext memoization', () => {
  afterEach(() => resetInstanceContext());

  it('resolves once and returns the same instance thereafter', () => {
    const first = getInstanceContext();
    expect(getInstanceContext()).toBe(first);
  });

  it('lets startup install an explicitly-resolved context', () => {
    const explicit = resolveInstanceContext({ root: tmpdir() });
    setInstanceContext(explicit);
    expect(getInstanceContext()).toBe(explicit);
  });

  it('re-resolves after a reset', () => {
    const explicit = resolveInstanceContext({ root: tmpdir() });
    setInstanceContext(explicit);
    resetInstanceContext();
    expect(getInstanceContext()).not.toBe(explicit);
  });
});
