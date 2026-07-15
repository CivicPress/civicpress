/**
 * Phase 2d W1-T2 — ModuleResolver discovery characterization tests
 *
 * Pins the behavior of `ModuleResolver` against fixture module trees so a
 * future refactor (e.g. W2-T18 cloud-uuid-storage decomposition that
 * touches manifest authoring) can't silently change discovery semantics.
 *
 * What this pins:
 * 1. discoverAll() finds top-level modules with module.json
 * 2. discoverAll() also descends one level for grouped modules
 *    (e.g. modules/schema-extensions/legal/)
 * 3. Directories without module.json are ignored
 * 4. Invalid manifests throw ModuleManifestInvalid
 * 5. findBySchemaExtension returns only modules that declare the type
 * 6. loadByName returns null for unknown modules
 * 7. The schemaPath field is set only when fragment file exists
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { ModuleResolver } from '../../../core/src/modules/module-resolver.js';
import { ModuleManifestInvalid } from '../../../core/src/errors/domain-errors.js';

function setupFixtureRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'civicpress-modulereslver-'));
  return root;
}

function writeManifest(dir: string, manifest: Record<string, unknown>): void {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'module.json'), JSON.stringify(manifest, null, 2));
}

function writeSchemaFragment(dir: string, fragment: unknown): void {
  const schemasDir = join(dir, 'schemas');
  mkdirSync(schemasDir, { recursive: true });
  writeFileSync(
    join(schemasDir, 'record-schema-extension.json'),
    JSON.stringify(fragment)
  );
}

describe('ModuleResolver — discovery characterization (Phase 2d W1-T2)', () => {
  let root: string;

  beforeEach(() => {
    root = setupFixtureRoot();
  });

  it('finds top-level modules with module.json (legacy layout)', () => {
    writeManifest(join(root, 'alpha'), {
      name: 'alpha',
      version: '1.0.0',
      kind: 'schema-extension',
      capabilities: { schemaExtensions: ['bylaw'] },
    });

    const resolver = new ModuleResolver(root);
    const found = resolver.discoverAll();

    expect(found).toHaveLength(1);
    expect(found[0].manifest.name).toBe('alpha');
    expect(found[0].path.endsWith('/alpha')).toBe(true);
  });

  it('descends one level for grouped modules (schema-extensions layout)', () => {
    writeManifest(join(root, 'schema-extensions', 'legal'), {
      name: 'schema-extensions/legal',
      version: '0.3.0',
      kind: 'schema-extension',
      capabilities: { schemaExtensions: ['bylaw', 'ordinance'] },
    });

    const resolver = new ModuleResolver(root);
    const found = resolver.discoverAll();

    expect(found).toHaveLength(1);
    expect(found[0].manifest.name).toBe('schema-extensions/legal');
    expect(found[0].path.endsWith('/schema-extensions/legal')).toBe(true);
  });

  it('finds both legacy and grouped modules in a mixed tree', () => {
    writeManifest(join(root, 'alpha'), {
      name: 'alpha',
      version: '1.0.0',
      kind: 'schema-extension',
      capabilities: {},
    });
    writeManifest(join(root, 'schema-extensions', 'legal'), {
      name: 'schema-extensions/legal',
      version: '0.3.0',
      kind: 'schema-extension',
      capabilities: {},
    });

    const resolver = new ModuleResolver(root);
    const found = resolver.discoverAll();

    const names = found.map((m) => m.manifest.name).sort();
    expect(names).toEqual(['alpha', 'schema-extensions/legal']);
  });

  it('ignores directories without module.json', () => {
    mkdirSync(join(root, 'no-manifest'), { recursive: true });
    writeManifest(join(root, 'with-manifest'), {
      name: 'with-manifest',
      version: '1.0.0',
      kind: 'schema-extension',
      capabilities: {},
    });

    const resolver = new ModuleResolver(root);
    const found = resolver.discoverAll();

    expect(found).toHaveLength(1);
    expect(found[0].manifest.name).toBe('with-manifest');
  });

  it('throws ModuleManifestInvalid for malformed JSON', () => {
    mkdirSync(join(root, 'bad'), { recursive: true });
    writeFileSync(join(root, 'bad', 'module.json'), '{ this is not json');

    const resolver = new ModuleResolver(root);
    expect(() => resolver.discoverAll()).toThrow(ModuleManifestInvalid);
  });

  it('throws ModuleManifestInvalid when required fields are missing', () => {
    mkdirSync(join(root, 'incomplete'), { recursive: true });
    writeFileSync(
      join(root, 'incomplete', 'module.json'),
      JSON.stringify({ name: 'incomplete' }) // missing version, kind, capabilities
    );

    const resolver = new ModuleResolver(root);
    expect(() => resolver.discoverAll()).toThrow(ModuleManifestInvalid);
  });

  it('throws ModuleManifestInvalid when kind=module but entry is missing', () => {
    writeManifest(join(root, 'no-entry'), {
      name: 'no-entry',
      version: '1.0.0',
      kind: 'module',
      capabilities: {},
      // entry field missing — the if/then schema rule requires it for kind=module
    });

    const resolver = new ModuleResolver(root);
    expect(() => resolver.discoverAll()).toThrow(ModuleManifestInvalid);
  });

  it('sets schemaPath only when the fragment file exists', () => {
    writeManifest(join(root, 'with-fragment'), {
      name: 'with-fragment',
      version: '1.0.0',
      kind: 'schema-extension',
      capabilities: { schemaExtensions: ['bylaw'] },
    });
    writeSchemaFragment(join(root, 'with-fragment'), {
      type: 'object',
      properties: {},
    });

    writeManifest(join(root, 'declared-no-file'), {
      name: 'declared-no-file',
      version: '1.0.0',
      kind: 'schema-extension',
      capabilities: { schemaExtensions: ['policy'] },
      // declares schemaExtensions but has no schemas/record-schema-extension.json
    });

    const resolver = new ModuleResolver(root);
    const found = resolver.discoverAll();

    const withFile = found.find((m) => m.manifest.name === 'with-fragment');
    const withoutFile = found.find(
      (m) => m.manifest.name === 'declared-no-file'
    );

    expect(withFile?.schemaPath).toBeDefined();
    expect(withFile?.schemaPath?.endsWith('record-schema-extension.json')).toBe(
      true
    );
    expect(withoutFile?.schemaPath).toBeUndefined();
  });

  it('findBySchemaExtension returns matching modules in load order', () => {
    writeManifest(join(root, 'legal'), {
      name: 'legal',
      version: '1.0.0',
      kind: 'schema-extension',
      capabilities: { schemaExtensions: ['bylaw', 'ordinance', 'policy'] },
    });
    writeManifest(join(root, 'meeting'), {
      name: 'meeting',
      version: '1.0.0',
      kind: 'schema-extension',
      capabilities: { schemaExtensions: ['minutes', 'agenda'] },
    });

    const resolver = new ModuleResolver(root);

    expect(
      resolver.findBySchemaExtension('bylaw').map((m) => m.manifest.name)
    ).toEqual(['legal']);
    expect(
      resolver.findBySchemaExtension('minutes').map((m) => m.manifest.name)
    ).toEqual(['meeting']);
    expect(resolver.findBySchemaExtension('unknown-type')).toEqual([]);
  });

  it('loadByName returns null for unknown module', () => {
    writeManifest(join(root, 'alpha'), {
      name: 'alpha',
      version: '1.0.0',
      kind: 'schema-extension',
      capabilities: {},
    });

    const resolver = new ModuleResolver(root);
    expect(resolver.loadByName('alpha')?.manifest.name).toBe('alpha');
    expect(resolver.loadByName('does-not-exist')).toBeNull();
  });

  it('caches results — repeat discoverAll calls return identical Set', () => {
    writeManifest(join(root, 'alpha'), {
      name: 'alpha',
      version: '1.0.0',
      kind: 'schema-extension',
      capabilities: {},
    });

    const resolver = new ModuleResolver(root);
    const first = resolver.discoverAll();
    const second = resolver.discoverAll();

    expect(first).toHaveLength(1);
    expect(second).toHaveLength(1);
    // Same loaded module instances
    expect(first[0]).toBe(second[0]);
  });

  it('clearCache forces a re-scan', () => {
    writeManifest(join(root, 'alpha'), {
      name: 'alpha',
      version: '1.0.0',
      kind: 'schema-extension',
      capabilities: {},
    });

    const resolver = new ModuleResolver(root);
    const before = resolver.discoverAll();
    expect(before).toHaveLength(1);

    // Add a new module on disk
    writeManifest(join(root, 'beta'), {
      name: 'beta',
      version: '1.0.0',
      kind: 'schema-extension',
      capabilities: {},
    });

    // Still cached
    expect(resolver.discoverAll()).toHaveLength(1);

    // Clear + re-scan
    resolver.clearCache();
    expect(resolver.discoverAll()).toHaveLength(2);
  });

  it('returns empty list when modulesRoot does not exist', () => {
    rmSync(root, { recursive: true });
    const resolver = new ModuleResolver(root);
    expect(resolver.discoverAll()).toEqual([]);
  });
});
