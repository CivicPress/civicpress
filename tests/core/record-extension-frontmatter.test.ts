/**
 * Module schema-extension fields round-trip as TOP-LEVEL frontmatter.
 *
 * Fix: `RecordParser.buildFrontmatter` used to NEST any non-core metadata field
 * under `metadata:`, so a module-extension's top-level fields (broadcast-box's
 * `capture` / `schedule` / `transcript_status`) couldn't be written to where the
 * schema + readers expect them. It now consults the same enabled-module
 * extensions used for validation and writes those fields top-level.
 *
 * This unblocks the Phase-5 uploads/sessions flow (write the `capture` block) and
 * W2's `transcript_status` write-back. The change is a no-op unless a schema-
 * extension module is enabled (so existing records are unaffected).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import path from 'path';
import { RecordParser } from '../../core/src/records/record-parser.js';
import {
  RecordSchemaBuilder,
  setModuleResolver,
} from '../../core/src/records/record-schema-builder.js';
import { ModuleResolver } from '../../core/src/modules/module-resolver.js';
import { CentralConfigManager } from '../../core/src/config/central-config.js';

const MODULES_ROOT = path.resolve(process.cwd(), 'modules');

const CAPTURE = {
  device: 'bb-001',
  av_file: 'uuid-av-1',
  segments: [
    { start: 0, end: 7000, visibility: 'public' },
    { start: 7000, end: 7440, visibility: 'in_camera' },
  ],
};

function sessionRecord(): any {
  return {
    id: 'pv-test',
    title: 'Test session',
    type: 'session',
    status: 'published',
    author: 'admin',
    created_at: '2026-06-23T19:00:00.000Z',
    updated_at: '2026-06-23T19:00:00.000Z',
    content: '',
    metadata: {
      session_type: 'regular',
      media: { recording: 'rec-1' }, // known field — always top-level
      capture: CAPTURE,
      transcript_status: 'automated',
    },
  };
}

function enableModules(modules: string[]) {
  setModuleResolver(new ModuleResolver(MODULES_ROOT));
  vi.spyOn(CentralConfigManager, 'getModules').mockReturnValue(modules);
  RecordSchemaBuilder.clearCache();
}

describe('record serializer — module schema-extension fields round-trip', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    RecordSchemaBuilder.clearCache();
  });

  describe('with broadcast-box enabled', () => {
    beforeEach(() => enableModules(['broadcast-box']));

    it('writes capture + transcript_status to TOP-LEVEL frontmatter, not nested', () => {
      const fm: any = RecordParser.buildFrontmatter(sessionRecord());
      expect(fm.capture).toEqual(CAPTURE);
      expect(fm.transcript_status).toBe('automated');
      expect(fm.media).toEqual({ recording: 'rec-1' });
      // Crucially NOT nested under metadata:
      expect(fm.metadata?.capture).toBeUndefined();
      expect(fm.metadata?.transcript_status).toBeUndefined();
    });

    it('round-trips: serialize -> parse -> serialize keeps capture top-level', () => {
      const md = RecordParser.serializeToMarkdown(sessionRecord());
      const parsed: any = RecordParser.parseFromMarkdown(
        md,
        'records/session/pv-test.md'
      );
      const reserialized: any = RecordParser.buildFrontmatter(parsed);
      expect(reserialized.capture).toEqual(CAPTURE);
      expect(reserialized.transcript_status).toBe('automated');
      expect(reserialized.metadata?.capture).toBeUndefined();
    });
  });

  describe('with no extension module enabled (unchanged behaviour)', () => {
    beforeEach(() => enableModules([]));

    it('nests capture/transcript_status under metadata: (as before)', () => {
      const fm: any = RecordParser.buildFrontmatter(sessionRecord());
      expect(fm.capture).toBeUndefined();
      expect(fm.metadata?.capture).toEqual(CAPTURE);
      expect(fm.metadata?.transcript_status).toBe('automated');
    });
  });
});
