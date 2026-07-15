/**
 * FA-API-005 — containment guard for caller-supplied record references.
 *
 * `POST /api/validation/record` and the diff routes accept a `recordId` that
 * may carry path separators (`type/year/id`). Joining it into the records
 * tree without a containment check let `../` escape `data/records` and read
 * arbitrary `.md` files (including closed-session minutes) with only
 * `records:view`. Every user-influenced join now goes through this resolver.
 */

import * as path from 'path';

/**
 * Resolve `relativeSegments` against `<dataDir>/records`, returning the
 * absolute path ONLY when the canonical result stays inside the records
 * root. `..`/absolute segments (or anything that resolves outside) → null.
 */
export function resolveInsideRecordsRoot(
  dataDir: string,
  segments: string[]
): string | null {
  if (
    segments.some(
      (segment) =>
        segment === '' ||
        segment === '.' ||
        segment === '..' ||
        path.isAbsolute(segment) ||
        segment.includes('\0')
    )
  ) {
    return null;
  }
  const recordsRoot = path.resolve(dataDir, 'records');
  const resolved = path.resolve(recordsRoot, ...segments);
  // Canonical containment — belt for anything the segment filter missed.
  if (!resolved.startsWith(recordsRoot + path.sep)) {
    return null;
  }
  return resolved;
}
