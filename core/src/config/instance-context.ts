/**
 * InstanceContext — the single answer to "where is this instance?"
 *
 * Before this module, "where is X?" was answered independently in at least four
 * places (central-config, record-schema-builder's module resolver,
 * civic-core-services' storage-module lookup, `getSystemDataDir`), and every one
 * of them fell back to `process.cwd()`. That made resolution depend on the
 * directory a process happened to be launched from: the BroadcastBox redaction
 * pipeline resolved `modules/` against the wrong root, found no `session` schema
 * extension, and silently mis-nested `capture` (see
 * docs/plans/2026-08-08-contributor-devx-and-hardening.md).
 *
 * The fix is structural rather than piecemeal: resolve the instance **root**
 * exactly ONCE — from an explicit argument or a single `.civicrc` walk-up — and
 * derive every other path from it. `process.cwd()` is consulted in exactly one
 * place in this file (the walk-up start), and nowhere else in the resolution
 * chain.
 *
 * ## Two roots, not one
 *
 * `root` is the instance's DATA root (the directory holding `.civicrc`).
 * `codeRoot` is where the installed CivicPress CODE lives. They coincide in dev
 * and in a plain checkout, but a split deployment separates them — the Docker
 * image ships code at `/app` and runs with WORKDIR `/instance`:
 *
 *     /app/modules/…      ← code (codeRoot)
 *     /instance/.civicrc  ← data (root)
 *
 * Modules are CODE, so `modulesDir` keys off `codeRoot`. Anchoring it to the
 * data root only works because dev and the image happen to colocate the two.
 *
 * Nothing here mutates global state; `resolveInstanceContext()` is a pure
 * function of its inputs plus the filesystem. `getInstanceContext()` memoizes
 * the no-argument call for the common startup path.
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import yaml from 'yaml';

const CONFIG_FILENAME = '.civicrc';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * An immutable, fully-resolved view of one CivicPress instance's layout.
 * Every path is absolute. Construct via `resolveInstanceContext()`.
 */
export interface InstanceContext {
  /**
   * The instance DATA root: the directory containing `.civicrc`. Resolved once
   * (explicit argument, or a single walk-up from the starting directory) and
   * used as the anchor for every other data path. Falls back to the starting
   * directory when no `.civicrc` exists anywhere above it.
   */
  root: string;

  /** Absolute path to `.civicrc`, or `null` when no config file was found. */
  configPath: string | null;

  /**
   * The installed-CODE root — the directory holding `modules/` alongside a
   * `package.json`, discovered by walking up from this file's own location.
   * Distinct from `root` in split deployments (code `/app`, data `/instance`).
   */
  codeRoot: string;

  /** Civic records directory — `config.dataDir`, else `<root>/data`. */
  dataDir: string;

  /**
   * `.system-data/` — the SQLite DB, CIVICPRESS_SECRET, storage credentials,
   * realtime snapshots and BroadcastBox state. Anchored to `root`, NEVER
   * derived by stripping a segment off `dataDir`.
   */
  systemDataDir: string;

  /**
   * Where `module.json` manifests are discovered. Prefers a `modules/` beside
   * the data root when one exists (dev, single-tree installs), otherwise
   * `<codeRoot>/modules` (split deployments).
   */
  modulesDir: string;

  /**
   * Root of the local storage backend, honoring `storage.yml`'s
   * `backend.path` (resolved against `systemDataDir` when relative).
   * Defaults to `<systemDataDir>/storage`.
   */
  storageRoot: string;
}

/**
 * The `.civicrc` fields that influence layout. Callers that have already parsed
 * and merged the config (CentralConfigManager) pass it in so this module does
 * not re-read the file; everyone else lets `resolveInstanceContext` read it.
 */
export interface InstanceConfigInput {
  dataDir?: string;
  systemDataDir?: string;
  /** Optional explicit override; relative paths resolve against `root`. */
  modulesDir?: string;
}

export interface ResolveInstanceContextOptions {
  /**
   * Explicit instance root. When given, no walk-up happens and `process.cwd()`
   * is never consulted — this is how tests and embedders get full determinism.
   */
  root?: string;
  /** Explicit `.civicrc` path; its directory becomes `root`. */
  configPath?: string;
  /** Where the `.civicrc` walk-up starts. Defaults to `process.cwd()`. */
  cwd?: string;
  /** Pre-parsed config, to avoid re-reading `.civicrc`. */
  config?: InstanceConfigInput;
}

function isDirectory(candidate: string): boolean {
  try {
    return fs.statSync(candidate).isDirectory();
  } catch {
    return false;
  }
}

function isFile(candidate: string): boolean {
  try {
    return fs.statSync(candidate).isFile();
  } catch {
    return false;
  }
}

/**
 * Walk from `startDir` toward the filesystem root, returning the first
 * directory for which `predicate` holds. Returns `null` if none matches.
 */
function findUp(
  startDir: string,
  predicate: (dir: string) => boolean
): string | null {
  let current = path.resolve(startDir);
  for (;;) {
    if (predicate(current)) return current;
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

/**
 * Locate `.civicrc` by walking up from `startDir`. This is the ONLY walk-up in
 * the resolution chain — everything else derives from the root it establishes.
 */
export function findConfigFile(startDir: string): string | null {
  const dir = findUp(startDir, (d) => isFile(path.join(d, CONFIG_FILENAME)));
  return dir ? path.join(dir, CONFIG_FILENAME) : null;
}

/**
 * The installed-code root, derived from this module's own location rather than
 * from cwd or the data root — so it stays correct when code and data are split
 * across directories.
 *
 * Two hops: first the package root that contains this file (the nearest
 * ancestor with a `package.json`, e.g. `<repo>/core`), then the nearest
 * ancestor of THAT which holds both a `modules/` directory and a
 * `package.json` (the monorepo root, or `/app` in the Docker image). Starting
 * from the package root rather than this file's directory matters: the build
 * emits `core/dist/modules/` for the manifest schema, which would otherwise
 * make `core/dist` look like the code root.
 */
export function resolveCodeRoot(fromDir: string = __dirname): string {
  const packageRoot =
    findUp(fromDir, (d) => isFile(path.join(d, 'package.json'))) ??
    path.resolve(fromDir);

  const withModules = findUp(
    packageRoot,
    (d) =>
      isDirectory(path.join(d, 'modules')) &&
      isFile(path.join(d, 'package.json'))
  );

  return withModules ?? packageRoot;
}

/**
 * Where `module.json` manifests live for an instance rooted at `root`.
 *
 * Modules are CODE, so the authoritative location is `<codeRoot>/modules`. A
 * `modules/` tree beside the data root still wins when one exists: that is the
 * dev / single-tree / Docker-image layout, and honoring it keeps an instance
 * able to ship its own modules. Split deployments — where the data root holds
 * no modules/ — fall through to the installed code.
 *
 * Exported so the DI container can apply the identical rule to a
 * config-supplied root (which may be a test instance, not the process's own).
 */
export function resolveModulesDir(root: string): string {
  const beside = path.join(path.resolve(root), 'modules');
  return isDirectory(beside) ? beside : path.join(resolveCodeRoot(), 'modules');
}

/**
 * Read the layout-relevant fields out of a `.civicrc`. Parse failures are
 * non-fatal — a malformed config degrades to defaults here and is reported by
 * CentralConfigManager, which owns validation and warnings.
 */
function readConfigFile(configPath: string): InstanceConfigInput {
  try {
    const parsed = yaml.parse(fs.readFileSync(configPath, 'utf8')) as
      | InstanceConfigInput
      | null
      | undefined;
    return parsed ?? {};
  } catch {
    return {};
  }
}

/**
 * Storage backend root from `storage.yml`, when present. Mirrors the
 * StorageConfigManager default (`backend.path: 'storage'`), resolved against
 * `systemDataDir`. This is what makes a configured `backend.path` actually
 * take effect for consumers that previously hardcoded a default root.
 */
function resolveStorageRoot(systemDataDir: string): string {
  const storageConfigPath = path.join(systemDataDir, 'storage.yml');
  let backendPath = 'storage';
  if (isFile(storageConfigPath)) {
    try {
      const parsed = yaml.parse(fs.readFileSync(storageConfigPath, 'utf8')) as
        | { backend?: { path?: string } }
        | null
        | undefined;
      const configured = parsed?.backend?.path;
      if (typeof configured === 'string' && configured.trim() !== '') {
        backendPath = configured;
      }
    } catch {
      // Malformed storage.yml — fall back to the default root. The storage
      // module surfaces the parse error when it loads the file for real.
    }
  }
  return path.resolve(systemDataDir, backendPath);
}

/**
 * Resolve an instance's complete layout. Pure with respect to process state
 * except for the filesystem and — only when neither `root` nor `configPath`
 * nor `cwd` is supplied — `process.cwd()`.
 */
export function resolveInstanceContext(
  options: ResolveInstanceContextOptions = {}
): InstanceContext {
  // 1. The root, resolved ONCE. Everything below derives from it.
  const startDir = path.resolve(options.cwd ?? process.cwd());
  let configPath: string | null;
  let root: string;

  if (options.root) {
    root = path.resolve(options.root);
    const candidate = path.join(root, CONFIG_FILENAME);
    configPath = isFile(candidate) ? candidate : null;
  } else if (options.configPath) {
    configPath = path.resolve(options.configPath);
    root = path.dirname(configPath);
  } else {
    configPath = findConfigFile(startDir);
    root = configPath ? path.dirname(configPath) : startDir;
  }

  // 2. Config: caller-supplied wins (already parsed and merged); otherwise read
  //    the file we just located.
  const config =
    options.config ?? (configPath ? readConfigFile(configPath) : {});

  // 3. Derived data paths — all anchored to `root`, never to cwd.
  //    CIVIC_DATA_DIR overrides ONLY the data directory, matching
  //    CentralConfigManager: system data stays anchored to the root.
  const envDataDir = process.env.CIVIC_DATA_DIR;
  const dataDir = envDataDir
    ? path.resolve(envDataDir)
    : config.dataDir
      ? path.resolve(root, config.dataDir)
      : path.join(root, 'data');

  const systemDataDir = config.systemDataDir
    ? path.resolve(root, config.systemDataDir)
    : path.join(root, '.system-data');

  // 4. Modules are CODE. Prefer a modules/ tree beside the data root when one
  //    exists (dev + single-tree installs, and the historical behavior), else
  //    fall back to the installed-code location (split deployments).
  const codeRoot = resolveCodeRoot();
  const modulesDir = config.modulesDir
    ? path.resolve(root, config.modulesDir)
    : resolveModulesDir(root);

  return Object.freeze({
    root,
    configPath,
    codeRoot,
    dataDir,
    systemDataDir,
    modulesDir,
    storageRoot: resolveStorageRoot(systemDataDir),
  });
}

let cachedContext: InstanceContext | null = null;

/**
 * The process-wide instance context, resolved on first use. Startup code that
 * knows the root explicitly should call `setInstanceContext()` first so no
 * walk-up ever happens.
 */
export function getInstanceContext(): InstanceContext {
  if (!cachedContext) {
    cachedContext = resolveInstanceContext();
  }
  return cachedContext;
}

/** Install an explicitly-resolved context as the process-wide one. */
export function setInstanceContext(context: InstanceContext): InstanceContext {
  cachedContext = context;
  return cachedContext;
}

/** Drop the memoized context (tests, and CentralConfigManager.reset()). */
export function resetInstanceContext(): void {
  cachedContext = null;
}
