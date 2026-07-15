/**
 * Phase 4 #3 — BroadcastBox `session` schema-extension fragment
 *
 * Validates the REAL fragment the broadcast-box module contributes to `session`
 * records (modules/broadcast-box/schemas/record-schema-extension.json, wired by
 * modules/broadcast-box/module.json — relocated from the docs/specs staging
 * draft in Phase 5, W2 Step 1). Loads the actual file, merges it onto core's
 * `session` via the module-extension seam, and checks representative records
 * validate / fail as intended.
 *
 * Complements record-schema-extension.contract.test.ts (which pins the seam
 * with a toy fragment); this pins the real capture/schedule/transcript fields.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  mkdtempSync,
  writeFileSync,
  mkdirSync,
  rmSync,
  readFileSync,
  copyFileSync,
} from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  RecordSchemaBuilder,
  setModuleResolver,
} from '../../core/src/records/record-schema-builder.js';
import { RecordSchemaValidator } from '../../core/src/records/record-schema-validator.js';
import { ModuleResolver } from '../../core/src/modules/module-resolver.js';
import { CentralConfigManager } from '../../core/src/config/central-config.js';

const FRAGMENT_PATH = join(
  process.cwd(),
  'modules/broadcast-box/schemas/record-schema-extension.json'
);

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

describe('BroadcastBox session schema-extension fragment', () => {
  let root: string;

  it('the module fragment is valid JSON with the expected top-level fields', () => {
    const fragment = JSON.parse(readFileSync(FRAGMENT_PATH, 'utf-8'));
    expect(Object.keys(fragment.properties)).toEqual(
      expect.arrayContaining(['capture', 'schedule', 'transcript_status'])
    );
    // visibility/minutes_status are CORE fields, not in the module fragment.
    expect(fragment.properties.visibility).toBeUndefined();
    expect(fragment.properties.minutes_status).toBeUndefined();
  });

  describe('merged onto core `session`', () => {
    beforeEach(() => {
      root = mkdtempSync(join(tmpdir(), 'civicpress-bb-frag-'));
      const modDir = join(root, 'broadcast-box');
      mkdirSync(join(modDir, 'schemas'), { recursive: true });
      writeFileSync(
        join(modDir, 'module.json'),
        JSON.stringify({
          name: 'broadcast-box',
          version: '0.1.0',
          kind: 'schema-extension',
          capabilities: { schemaExtensions: ['session'] },
        })
      );
      // Use the REAL staged fragment as the module's extension.
      copyFileSync(
        FRAGMENT_PATH,
        join(modDir, 'schemas', 'record-schema-extension.json')
      );

      setModuleResolver(new ModuleResolver(root));
      vi.spyOn(CentralConfigManager, 'getModules').mockReturnValue([
        'broadcast-box',
      ]);
      RecordSchemaBuilder.clearCache();
    });

    afterEach(() => {
      vi.restoreAllMocks();
      RecordSchemaBuilder.clearCache();
      rmSync(root, { recursive: true, force: true });
    });

    it('accepts a fully-populated recorded session', () => {
      const result = RecordSchemaValidator.validate(
        {
          ...BASE_RECORD,
          visibility: 'public',
          minutes_status: 'draft',
          transcript_status: 'automated',
          schedule: {
            scheduled_start: '2026-06-09T19:00:00.000Z',
            scheduled_end: '2026-06-09T21:00:00.000Z',
            assigned_device: 'bb-001',
          },
          capture: {
            device: 'bb-001',
            av_file: 'b7c1-uuid',
            started_at: '2026-06-09T19:01:00.000Z',
            ended_at: '2026-06-09T21:05:00.000Z',
            duration_s: 7440,
            segments: [
              { start: 0, end: 7000, visibility: 'public' },
              { start: 7000, end: 7440, visibility: 'in_camera' },
            ],
          },
        },
        'session'
      );
      // None of the BroadcastBox fields should be a source of error.
      for (const f of [
        'capture',
        'schedule',
        'transcript',
        'segment',
        'device',
      ]) {
        expect(errorsMentioning(result, f)).toBe(0);
      }
    });

    it('rejects capture without the required device', () => {
      const result = RecordSchemaValidator.validate(
        { ...BASE_RECORD, capture: { av_file: 'x' } },
        'session'
      );
      expect(result.isValid).toBe(false);
    });

    it('rejects a segment missing visibility', () => {
      const result = RecordSchemaValidator.validate(
        { ...BASE_RECORD, capture: { device: 'bb-001', segments: [{ start: 0, end: 10 }] } },
        'session'
      );
      expect(result.isValid).toBe(false);
    });

    it('rejects an out-of-enum transcript_status', () => {
      const result = RecordSchemaValidator.validate(
        { ...BASE_RECORD, transcript_status: 'bogus' },
        'session'
      );
      expect(result.isValid).toBe(false);
    });
  });
});
