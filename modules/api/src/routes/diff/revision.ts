/**
 * What the diff routes will hand to git as a revision.
 *
 * `commit1` / `commit2` used to be validated only as non-empty strings and
 * were then passed to git as arguments. Git takes an argument that begins with
 * `-` as an OPTION, and `git show --output=<path>` writes its output to
 * <path> — so any caller with `records:view` (the `public` role has it, and
 * registration is open) could make the server create or overwrite a file
 * anywhere the process can write. Measured, not inferred: the request
 * `?commit1=--output=<path>` created the file.
 *
 * A revision here is one name for one commit: a full or abbreviated hash, or a
 * ref with optional `~` / `^` ancestry (`HEAD~1`, `main`, `v1.0.0`,
 * `refs/heads/main`). It must start with a letter or digit, which is what rules
 * out an option, and it may not contain:
 *
 *   `:`        — `<rev>:<path>` names a file in a tree, not a commit
 *   `..`       — a range is two revisions
 *   `@`, `{}`  — reflog and peel syntax, which the routes have no use for
 *   whitespace — nothing after a space belongs to the same argument
 */
import { HttpError } from '../../utils/http-error.js';

const REVISION = /^[A-Za-z0-9][A-Za-z0-9._/~^-]{0,199}$/;

export function isRevision(value: unknown): value is string {
  return (
    typeof value === 'string' && REVISION.test(value) && !value.includes('..')
  );
}

/**
 * Return `value` if it is a revision; otherwise refuse with a 400.
 *
 * The routes validate before they get here. This is for the functions that
 * actually build the git command line, so that the guarantee is next to the
 * call that needs it and does not depend on every caller having checked.
 */
export function assertRevision(value: unknown): string {
  if (!isRevision(value)) {
    throw new HttpError(400, 'Invalid commit reference', 'INVALID_COMMIT');
  }
  return value;
}
