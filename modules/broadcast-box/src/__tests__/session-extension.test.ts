/**
 * W2 Step 1 — broadcast-box is wired as a `session` schema-extension provider.
 *
 * This is a WIRING smoke test against the REAL module dir: it proves the actual
 * `modules/broadcast-box/module.json` is a valid manifest discovered by core's
 * ModuleResolver, declares the `session` extension, and ships the fragment file.
 *
 * The fragment's validation *semantics* (capture.device required, segment
 * visibility enum, transcript_status enum, in-camera segments) are pinned by
 * `tests/core/broadcast-box-session-extension.test.ts`, which merges the real
 * fragment onto core's `session` schema.
 */

import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'url';
import path from 'path';
import { ModuleResolver } from '@civicpress/core';

// __tests__ -> src -> broadcast-box -> modules  (the monorepo modules root)
const MODULES_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../..'
);

describe('broadcast-box module wiring (W2 Step 1)', () => {
  it('is discovered as a valid manifest declaring the session extension', () => {
    const loaded = new ModuleResolver(MODULES_ROOT).loadByName('broadcast-box');
    expect(loaded).not.toBeNull();
    expect(loaded?.manifest.capabilities.schemaExtensions).toContain('session');
  });

  it('ships the session record-schema-extension fragment', () => {
    const loaded = new ModuleResolver(MODULES_ROOT).loadByName('broadcast-box');
    expect(
      loaded?.schemaPath?.endsWith('schemas/record-schema-extension.json')
    ).toBe(true);
  });

  it('is returned by findBySchemaExtension("session")', () => {
    const providers = new ModuleResolver(MODULES_ROOT)
      .findBySchemaExtension('session')
      .map((m) => m.manifest.name);
    expect(providers).toContain('broadcast-box');
  });
});
