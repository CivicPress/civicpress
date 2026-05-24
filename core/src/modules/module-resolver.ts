/**
 * CivicPress ModuleResolver
 *
 * Discovers modules in a configured root directory by reading their
 * `module.json` manifests. Replaces the prior `process.cwd()`-based
 * traversal (see civic-core-services.ts:289 and record-schema-builder.ts:188
 * in pre-W1-T2 state) — see docs/specs/module-contract.md §6 for the
 * discovery contract.
 *
 * Design notes:
 * - Discovery is scoped to TWO levels under `modulesRoot`:
 *   - `<root>/<name>/module.json` (existing convention for full modules)
 *   - `<root>/<group>/<name>/module.json` (new convention, e.g.
 *     `modules/schema-extensions/legal/module.json`)
 * - Loaded modules are cached by name. Re-discovery is a no-op after the
 *   first scan unless `clearCache()` is called.
 * - Manifest validation uses Ajv against `module.schema.json` (same
 *   directory). Invalid manifests throw `ModuleManifestInvalid`.
 */

import { readdirSync, readFileSync, statSync, existsSync } from 'fs';
import { join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import AjvModule from 'ajv';
import {
  ModuleManifest,
  LoadedModule,
  ModuleKind,
} from './module-manifest.js';
import { ModuleManifestInvalid } from '../errors/domain-errors.js';

// Handle default export for ajv (matches record-schema-validator.ts pattern).
// Older ajv builds ship as a CJS default-export under `.default`; newer ESM
// builds expose the constructor directly. Probe both via a structural cast.
const AjvCtor =
  (AjvModule as unknown as { default?: typeof AjvModule.default })
    .default || (AjvModule as unknown as typeof AjvModule.default);

// Locate module.schema.json relative to this file at runtime
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const MODULE_SCHEMA_PATH = join(__dirname, 'module.schema.json');

type ManifestValidator = ((data: unknown) => boolean) & {
  errors?: unknown[];
};
let cachedValidator: ManifestValidator | null = null;

function getManifestValidator(): ManifestValidator {
  if (!cachedValidator) {
    const ajv = new AjvCtor({ allErrors: true, strict: false });
    const schemaJson = JSON.parse(readFileSync(MODULE_SCHEMA_PATH, 'utf-8'));
    cachedValidator = ajv.compile(schemaJson) as ManifestValidator;
  }
  return cachedValidator;
}

export class ModuleResolver {
  private readonly modulesRoot: string;
  private cache: Map<string, LoadedModule> = new Map();
  private scanned = false;

  constructor(modulesRoot: string) {
    this.modulesRoot = resolve(modulesRoot);
  }

  getModulesRoot(): string {
    return this.modulesRoot;
  }

  clearCache(): void {
    this.cache.clear();
    this.scanned = false;
  }

  /**
   * Walk modulesRoot and load every module that has a valid manifest.
   * Returns the same set in subsequent calls (cached).
   */
  discoverAll(): LoadedModule[] {
    if (this.scanned) {
      return Array.from(this.cache.values());
    }

    if (!existsSync(this.modulesRoot)) {
      this.scanned = true;
      return [];
    }

    for (const entry of this.safeReadDir(this.modulesRoot)) {
      const entryPath = join(this.modulesRoot, entry);
      if (!this.isDirectory(entryPath)) continue;

      // Try this directory directly first.
      const directManifest = this.tryLoadFromDir(entryPath);
      if (directManifest) {
        this.cache.set(directManifest.manifest.name, directManifest);
        continue;
      }

      // Treat as a group (e.g. modules/schema-extensions/) and descend
      // one more level.
      for (const sub of this.safeReadDir(entryPath)) {
        const subPath = join(entryPath, sub);
        if (!this.isDirectory(subPath)) continue;
        const nested = this.tryLoadFromDir(subPath);
        if (nested) {
          this.cache.set(nested.manifest.name, nested);
        }
      }
    }

    this.scanned = true;
    return Array.from(this.cache.values());
  }

  /**
   * Load a single module by its declared name (manifest.name). Triggers a
   * full scan if not already done.
   */
  loadByName(name: string): LoadedModule | null {
    this.discoverAll();
    return this.cache.get(name) ?? null;
  }

  /**
   * Return modules whose manifest declares the given record type in
   * `capabilities.schemaExtensions`. Used by RecordSchemaBuilder.
   */
  findBySchemaExtension(recordType: string): LoadedModule[] {
    this.discoverAll();
    const matches: LoadedModule[] = [];
    for (const loaded of this.cache.values()) {
      const types = loaded.manifest.capabilities.schemaExtensions ?? [];
      if (types.includes(recordType)) {
        matches.push(loaded);
      }
    }
    return matches;
  }

  // ----- internal helpers -----

  private tryLoadFromDir(dir: string): LoadedModule | null {
    const manifestPath = join(dir, 'module.json');
    if (!existsSync(manifestPath)) return null;

    let raw: string;
    try {
      raw = readFileSync(manifestPath, 'utf-8');
    } catch {
      return null;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      throw new ModuleManifestInvalid(
        `Invalid JSON in ${manifestPath}: ${(err as Error).message}`,
        manifestPath
      );
    }

    const validate = getManifestValidator();
    if (!validate(parsed)) {
      throw new ModuleManifestInvalid(
        `Manifest ${manifestPath} failed schema validation`,
        manifestPath,
        validate.errors
      );
    }

    const manifest = parsed as ModuleManifest;

    // Resolve schema-extension fragment path (if declared + present).
    let schemaPath: string | undefined;
    if (
      manifest.capabilities?.schemaExtensions?.length &&
      existsSync(join(dir, 'schemas', 'record-schema-extension.json'))
    ) {
      schemaPath = join(dir, 'schemas', 'record-schema-extension.json');
    }

    return { manifest, path: dir, schemaPath };
  }

  private safeReadDir(dir: string): string[] {
    try {
      return readdirSync(dir);
    } catch {
      return [];
    }
  }

  private isDirectory(p: string): boolean {
    try {
      return statSync(p).isDirectory();
    } catch {
      return false;
    }
  }
}

// Re-export for convenience.
export { ModuleManifest, LoadedModule, ModuleKind };
