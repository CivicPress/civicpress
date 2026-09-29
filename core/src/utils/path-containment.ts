/**
 * Keeping a caller-supplied name inside the directory it belongs to.
 *
 * A record type, a template name, a geography category: each is a NAME, and
 * the code joins it onto a root to get a path. Nothing about `path.join`
 * stops the name from being `../../etc`, so every such join needs to be told
 * that the result must stay under the root.
 *
 * The routes validate these names, and most did before this file existed. The
 * point of doing it again here is where it is done: next to the filesystem
 * call, in the function that owns the root, so the guarantee does not depend
 * on every caller — present and future, HTTP and CLI — having remembered.
 */
import * as path from 'path';

/**
 * Is `value` ONE path segment — a name, not a path?
 *
 * Refuses the empty string, `.` and `..`, anything containing a separator of
 * either flavour (a backslash is a separator on Windows and should not be in a
 * name anywhere), and anything containing a NUL.
 */
export function isSafeSegment(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value !== '.' &&
    value !== '..' &&
    !value.includes('/') &&
    !value.includes('\\') &&
    !value.includes('\0')
  );
}

/**
 * Resolve `segments` under `root` and return the absolute path — or `null` if
 * the result is not strictly inside `root`.
 *
 * The check is made on the RESOLVED path, so it holds whatever the segments
 * contain: `..`, an absolute path (which `path.resolve` would otherwise let
 * replace the root entirely), or a name that only looks like a sibling of the
 * root (`templates-evil` beside `templates` — the case a bare
 * `startsWith(root)` gets wrong).
 *
 * Lexical only: it does not follow symlinks. Nothing the API writes creates
 * one.
 */
export function resolveInside(
  root: string,
  ...segments: string[]
): string | null {
  if (segments.some((segment) => typeof segment !== 'string')) return null;
  if (segments.some((segment) => segment.includes('\0'))) return null;

  const base = path.resolve(root);
  const resolved = path.resolve(base, ...segments);
  const relative = path.relative(base, resolved);

  if (
    relative === '' ||
    relative === '..' ||
    relative.startsWith('..' + path.sep) ||
    path.isAbsolute(relative)
  ) {
    return null;
  }
  return resolved;
}

/**
 * Resolve the directory for a caller-supplied NAME directly under `root`:
 * `<root>/<name>`, or `null` if `name` is not a single safe segment.
 */
export function resolveChild(root: string, name: unknown): string | null {
  if (!isSafeSegment(name)) return null;
  return resolveInside(root, name);
}
