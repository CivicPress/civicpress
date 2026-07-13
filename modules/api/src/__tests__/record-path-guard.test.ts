/**
 * FA-API-005 — resolveInsideRecordsRoot containment matrix.
 */

import { describe, it, expect } from 'vitest';
import * as path from 'path';
import { resolveInsideRecordsRoot } from '../utils/record-path-guard.js';

const DATA_DIR = '/srv/civic/data';
const ROOT = path.resolve(DATA_DIR, 'records');

describe('resolveInsideRecordsRoot', () => {
  it('resolves well-formed record paths inside the root', () => {
    expect(
      resolveInsideRecordsRoot(DATA_DIR, ['bylaw', '2026', 'record-1.md'])
    ).toBe(path.join(ROOT, 'bylaw', '2026', 'record-1.md'));
    expect(resolveInsideRecordsRoot(DATA_DIR, ['session', 'r.md'])).toBe(
      path.join(ROOT, 'session', 'r.md')
    );
  });

  it('rejects .. segments (the audit exploit shape)', () => {
    expect(
      resolveInsideRecordsRoot(DATA_DIR, ['..', '..', '.civic', 'roles.yml'])
    ).toBeNull();
    expect(
      resolveInsideRecordsRoot(DATA_DIR, ['bylaw', '..', '..', 'secrets.yml'])
    ).toBeNull();
  });

  it('rejects absolute, empty, dot and NUL segments', () => {
    expect(resolveInsideRecordsRoot(DATA_DIR, ['/etc/passwd'])).toBeNull();
    expect(resolveInsideRecordsRoot(DATA_DIR, [''])).toBeNull();
    expect(resolveInsideRecordsRoot(DATA_DIR, ['.'])).toBeNull();
    expect(resolveInsideRecordsRoot(DATA_DIR, ['a\0b.md'])).toBeNull();
  });

  it('rejects a resolved path that lands exactly ON the root (no file)', () => {
    // A single benign-looking segment can't name the root itself.
    expect(resolveInsideRecordsRoot(DATA_DIR, ['..'])).toBeNull();
  });
});
