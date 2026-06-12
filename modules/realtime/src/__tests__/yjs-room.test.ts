/**
 * Unit Tests for YjsRoom
 */

import { describe, it, expect, vi } from 'vitest';
import * as Y from 'yjs';
import { YjsRoom } from '../rooms/yjs-room.js';
import type { Logger } from '@civicpress/core';
import type { RealtimeServer } from '../realtime-server.js';

// The serializeToMarkdown path exercises only the Yjs document; logger/server
// are stored by the constructor but unused by this method, so minimal stubs
// satisfy the YjsRoom contract.
const mockLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  isVerbose: () => false,
} as unknown as Logger;

const mockServer = {
  emitHook: vi.fn(),
} as unknown as RealtimeServer;

function makeRoom(roomId: string): YjsRoom {
  return new YjsRoom(
    roomId,
    { roomId, roomType: 'records' },
    mockLogger,
    mockServer
  );
}

describe('YjsRoom', () => {
  describe('serializeToMarkdown', () => {
    it('returns "" for an empty room', () => {
      const room = makeRoom('records:test1');
      expect(room.serializeToMarkdown().trim()).toBe('');
    });

    it('serializes a populated Yjs XmlFragment to Markdown', () => {
      const room = makeRoom('records:test2');
      const yDoc = room.getYjsDoc();
      const frag = yDoc.getXmlFragment('default');

      const para = new Y.XmlElement('paragraph');
      para.insert(0, [new Y.XmlText('Hello world.')]);
      frag.insert(0, [para]);

      expect(room.serializeToMarkdown().trim()).toBe('Hello world.');
    });

    it('serializes a civic-ref-bearing doc', () => {
      const room = makeRoom('records:test3');
      const yDoc = room.getYjsDoc();
      const frag = yDoc.getXmlFragment('default');

      const para = new Y.XmlElement('paragraph');
      const civicRef = new Y.XmlElement('civicRef');
      civicRef.setAttribute('refType', 'record');
      civicRef.setAttribute('id', 'rec-1');
      civicRef.setAttribute('label', 'Budget');
      para.insert(0, [new Y.XmlText('See '), civicRef, new Y.XmlText('.')]);
      frag.insert(0, [para]);

      expect(room.serializeToMarkdown().trim()).toBe(
        'See <!--civic-ref type="record" id="rec-1" label="Budget"-->.'
      );
    });
  });
});
