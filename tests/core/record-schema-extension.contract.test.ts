/**
 * Phase 4 — Record schema extension contract (session)
 *
 * Pins the seam BroadcastBox relies on: a module that declares
 * `capabilities.schemaExtensions: ["session"]` in its manifest and ships a
 * `schemas/record-schema-extension.json` fragment has that fragment merged
 * into the built `session` schema, and `session` records carrying the
 * extended fields validate against the result.
 *
 * Also pins the two core `session` fields added for BroadcastBox
 * (`visibility`, `minutes_status`) so the type extension stays present.
 *
 * Before this test the extension mechanism was implemented but unexercised
 * end-to-end (only module *discovery* was characterized).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  RecordSchemaBuilder,
  setModuleResolver,
} from '../../core/src/records/record-schema-builder.js';
import { RecordSchemaValidator } from '../../core/src/records/record-schema-validator.js';
import { ModuleResolver } from '../../core/src/modules/module-resolver.js';
import { CentralConfigManager } from '../../core/src/config/central-config.js';

const BASE_RECORD = {
  id: 'pv-2026-06-09',
  title: 'Regular Council Meeting',
  type: 'session',
  status: 'published',
  author: 'admin',
  created: '2026-06-09T19:00:00.000Z',
  updated: '2026-06-09T19:00:00.000Z',
};

function errorsMentioning(
  result: { errors: Array<{ field?: string; message?: string }> },
  needle: string
): number {
  const n = needle.toLowerCase();
  return result.errors.filter((e) =>
    `${e.field ?? ''} ${e.message ?? ''}`.toLowerCase().includes(n)
  ).length;
}

describe('RecordSchemaBuilder — session module-extension contract', () => {
  let root: string;

  beforeEach(() => {
    // A fixture module "meeting" that extends the core `session` type.
    root = mkdtempSync(join(tmpdir(), 'civicpress-bb-ext-'));
    const modDir = join(root, 'meeting');
    mkdirSync(join(modDir, 'schemas'), { recursive: true });
    writeFileSync(
      join(modDir, 'module.json'),
      JSON.stringify({
        name: 'meeting',
        version: '1.0.0',
        kind: 'schema-extension',
        capabilities: { schemaExtensions: ['session'] },
      })
    );
    writeFileSync(
      join(modDir, 'schemas', 'record-schema-extension.json'),
      JSON.stringify({
        type: 'object',
        properties: {
          capture: {
            type: 'object',
            required: ['device'],
            properties: {
              device: { type: 'string' },
              av_file: { type: 'string' },
            },
          },
        },
      })
    );

    setModuleResolver(new ModuleResolver(root));
    vi.spyOn(CentralConfigManager, 'getModules').mockReturnValue(['meeting']);
    RecordSchemaBuilder.clearCache();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    RecordSchemaBuilder.clearCache();
    rmSync(root, { recursive: true, force: true });
  });

  it('merges the module fragment AND the core session type-extension', () => {
    const schema = RecordSchemaBuilder.buildSchema('session', {
      includeTypeExtensions: true,
      includeModuleExtensions: true,
    });
    const branches = (schema.allOf ?? []) as Array<Record<string, any>>;
    // Module fragment (pushed unconditionally for the session build).
    expect(branches.some((b) => b?.properties?.capture)).toBe(true);
    // Core session type-extension (if/then) carries our new `visibility` field.
    expect(branches.some((b) => b?.then?.properties?.visibility)).toBe(true);
  });

  it('accepts a session record carrying valid capture + visibility fields', () => {
    const result = RecordSchemaValidator.validate(
      {
        ...BASE_RECORD,
        visibility: 'in_camera',
        minutes_status: 'draft',
        capture: { device: 'bb-001', av_file: 'uuid-1' },
      },
      'session'
    );
    // The extended fields must not be the source of any validation error
    // (isolates the contract from unrelated business-rule noise).
    expect(errorsMentioning(result, 'visibility')).toBe(0);
    expect(errorsMentioning(result, 'capture')).toBe(0);
    expect(errorsMentioning(result, 'device')).toBe(0);
    expect(errorsMentioning(result, 'minutes_status')).toBe(0);
  });

  it('rejects a value outside the core visibility enum', () => {
    const result = RecordSchemaValidator.validate(
      { ...BASE_RECORD, visibility: 'secret' },
      'session'
    );
    expect(result.isValid).toBe(false);
  });

  it('enforces the module fragment contract (capture requires device)', () => {
    const result = RecordSchemaValidator.validate(
      { ...BASE_RECORD, capture: { av_file: 'uuid-1' } },
      'session'
    );
    expect(result.isValid).toBe(false);
  });
});
