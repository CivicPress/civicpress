/**
 * Contract: the structured transcript can NOT go in `media.transcript`.
 *
 * Core `session.media.transcript` is typed STRING (a path/URL to the transcript
 * artifact), so the validator the update saga runs rejects a structured object
 * there. The transcription worker (W2) therefore writes the structured
 * TranscriptResult to `media.transcript_data` (allowed by media's
 * additionalProperties), with `transcript_status` as the trust label.
 *
 * Pins the schema constraint the CoreRecordsGateway.writeTranscript shape rests
 * on. See docs/specs/2026-06-20-transcription-service-design.md §10.5 and
 * services/transcription/src/gateways/core-records-gateway.ts.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  mkdtempSync,
  writeFileSync,
  mkdirSync,
  rmSync,
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

const BASE = {
  id: 'pv-2026-06-09',
  title: 'Regular Council Meeting',
  type: 'session',
  status: 'published',
  author: 'admin',
  created: '2026-06-09T19:00:00.000Z',
  updated: '2026-06-09T19:00:00.000Z',
};

const STRUCTURED = {
  language: 'fr',
  text: 'Bonjour.',
  segments: [{ start: 0, end: 1.2, text: 'Bonjour.' }],
};

describe('session transcript write-back shape (broadcast-box enabled)', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'bb-shape-'));
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

  it('accepts media.transcript as a STRING path', () => {
    const r = RecordSchemaValidator.validate(
      {
        ...BASE,
        transcript_status: 'automated',
        media: { transcript: 'records/session/pv.transcript.vtt' },
      },
      'session'
    );
    expect(r.isValid).toBe(true);
  });

  it('REJECTS a structured object in media.transcript (string-typed)', () => {
    const r = RecordSchemaValidator.validate(
      { ...BASE, media: { transcript: STRUCTURED } },
      'session'
    );
    expect(r.isValid).toBe(false);
  });

  it('accepts the structured transcript under media.transcript_data', () => {
    const r = RecordSchemaValidator.validate(
      {
        ...BASE,
        transcript_status: 'automated',
        media: { transcript_data: STRUCTURED },
      },
      'session'
    );
    expect(r.isValid).toBe(true);
  });
});
