/**
 * Unit tests for `resolveLocalStoragePath` — the path-containment guard used by
 * every local-provider filesystem access (upload/stream write + stat, sidecar
 * write/delete).
 *
 * The upload paths already sanitize the stored filename and validate the folder
 * against config, so a traversal cannot reach the guard in practice; this is
 * defense-in-depth. These tests pin the guard's behavior directly with hostile
 * inputs so a future refactor can't silently drop the containment check (and so
 * the js/path-injection barrier stays explicit).
 */

import { describe, it, expect } from 'vitest';
import { resolveLocalStoragePath } from '../cloud-uuid-storage/internals.js';
import type { StorageConfig } from '../types/storage.types.js';

// Minimal StorageHostLike with an absolute local storage root of
// `<basePath>/storage` (getLocalStoragePath resolves the relative provider path
// against basePath).
function host(basePath = '/srv/data') {
  return {
    basePath,
    logger: {} as never,
    config: {
      providers: { local: { type: 'local', enabled: true, path: 'storage' } },
    } as unknown as StorageConfig,
  };
}

describe('resolveLocalStoragePath (path containment)', () => {
  it('resolves a normal folder/file path under the storage root', () => {
    expect(resolveLocalStoragePath(host(), 'public/doc_abc123.txt')).toBe(
      '/srv/data/storage/public/doc_abc123.txt'
    );
  });

  it('allows in-root normalization (`..` that stays under the root)', () => {
    expect(resolveLocalStoragePath(host(), 'public/../uploads/f.txt')).toBe(
      '/srv/data/storage/uploads/f.txt'
    );
  });

  it('rejects a parent-directory traversal', () => {
    expect(() => resolveLocalStoragePath(host(), '../../etc/passwd')).toThrow(
      /escapes the storage root/
    );
  });

  it('rejects an embedded traversal that climbs out of the root', () => {
    expect(() =>
      resolveLocalStoragePath(host(), 'public/../../../etc/passwd')
    ).toThrow(/escapes the storage root/);
  });

  it('rejects an absolute path (path.resolve would otherwise ignore the root)', () => {
    expect(() => resolveLocalStoragePath(host(), '/etc/passwd')).toThrow(
      /escapes the storage root/
    );
  });
});
