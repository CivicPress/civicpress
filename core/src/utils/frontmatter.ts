/**
 * Front matter — the ONLY place in the codebase that may call `gray-matter`.
 *
 * ## Why this file exists
 *
 * `gray-matter` ships three front-matter engines — YAML, JSON and JavaScript —
 * and picks one from the text that follows the opening delimiter. A file that
 * begins `---js` or `---javascript` is passed to `eval`:
 *
 *     matter('---js\n{ probe: 6 * 7 }\n---')   // → { probe: 42 }, `process` in scope
 *
 * So with a bare `matter(content)`, a record file is not data; it is a program
 * that runs with the server's privileges whenever something parses it — the
 * indexer does at API startup. Every writer the API owns emits a header it
 * builds itself, so a request body cannot choose the engine, but a file can
 * reach the data directory without passing through those writers: `civic
 * import`, a restored backup, a data repository edited or merged through Git.
 * A civic record has to be inert no matter how it arrived.
 *
 * Both functions below refuse the JavaScript engine instead of running it. The
 * `language` option cannot do this — an inline tag overrides it — so the engine
 * itself is replaced.
 *
 * ## The second reason
 *
 * Called WITHOUT options, `matter()` stores every distinct input in a
 * process-wide cache keyed by the entire file content, never evicts it, and
 * returns the cached `data` object by reference. In a long-running API that is
 * unbounded growth, and it means a caller that mutates the front matter it got
 * back changes what the next caller receives for the same text. Passing options
 * bypasses the cache, so going through this module fixes that as well.
 *
 * ## Enforcement
 *
 * Importing `gray-matter` anywhere else is an ESLint error
 * (`no-restricted-imports` in the core, cli and api configs).
 */
import matter from 'gray-matter';
import { ValidationError } from '../errors/index.js';

export type ParsedFrontmatter = matter.GrayMatterFile<string>;

/**
 * Stands in for gray-matter's JavaScript engine. Reached only when a file
 * declares `---js` / `---javascript`; never evaluates anything.
 */
function refuseExecutableFrontmatter(): never {
  throw new ValidationError(
    'Front matter declared as JavaScript is not accepted: front matter must be YAML or JSON',
    { reason: 'executable-front-matter' }
  );
}

/**
 * Parse a Markdown document's front matter. Drop-in for `matter(content)`.
 *
 * Accepts YAML (the default, and what CivicPress writes) and JSON. Throws
 * `ValidationError` for front matter declared as JavaScript, and — as
 * gray-matter always has — throws for malformed YAML or an unregistered
 * language, so callers need no new error handling.
 */
export function parseFrontmatter(content: string): ParsedFrontmatter {
  // The options object is written inline, with BOTH keys, on purpose: `js` is
  // an alias gray-matter resolves to `javascript`, and naming each one keeps
  // the guarantee readable here and recognisable to static analysis.
  return matter(content, {
    engines: {
      js: refuseExecutableFrontmatter,
      javascript: refuseExecutableFrontmatter,
    },
  });
}

/**
 * Serialize `body` under a YAML front-matter block built from `data`. Drop-in
 * for `matter.stringify(body, data)`.
 *
 * `matter.stringify` PARSES a string first argument before serializing it, which
 * makes it a parse site in its own right — and means a body that happens to
 * begin with `---` is read as front matter and folded into the metadata. The
 * body is opaque here: it is never parsed, and is written back verbatim.
 */
export function stringifyFrontmatter(
  body: string,
  data: Record<string, unknown>
): string {
  return matter.stringify({ content: body }, data, {
    engines: {
      js: refuseExecutableFrontmatter,
      javascript: refuseExecutableFrontmatter,
    },
  });
}
