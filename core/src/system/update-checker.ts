/**
 * UpdateChecker — the producer that feeds `update_available` into the operator
 * notification center. Compares the running version against a "latest" fetched
 * from an injectable source and, when newer, files a (deduped) operator
 * notification. The fetch is injected so the comparison/emit logic is unit-
 * testable offline; the CLI wires the real source (GitHub releases).
 */

import type { Logger } from '../utils/logger.js';

export interface UpdateCheckResult {
  currentVersion: string;
  latestVersion: string | null;
  updateAvailable: boolean;
}

/** The slice of OperatorNotifier this needs — kept structural for testability. */
export interface UpdateNotifierSink {
  updateAvailable(input: {
    version: string;
    current?: string;
    body?: string;
  }): Promise<number | null>;
}

interface ParsedVersion {
  core: [number, number, number];
  pre: string | null;
}

function parseVersion(v: string): ParsedVersion | null {
  const m = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/.exec(
    v.trim()
  );
  if (!m) return null;
  return {
    core: [Number(m[1]), Number(m[2]), Number(m[3])],
    pre: m[4] ?? null,
  };
}

/**
 * Is `candidate` a newer version than `current`? Minimal semver (no dep):
 * compares major.minor.patch numerically; on a tie a release outranks a
 * pre-release, and two pre-releases compare lexically. Unparseable input is
 * treated conservatively as "not newer" (never nags on garbage).
 */
export function isNewerVersion(candidate: string, current: string): boolean {
  const a = parseVersion(candidate);
  const b = parseVersion(current);
  if (!a || !b) return false;

  for (let i = 0; i < 3; i++) {
    if (a.core[i] > b.core[i]) return true;
    if (a.core[i] < b.core[i]) return false;
  }
  // Cores equal.
  if (a.pre === null && b.pre !== null) return true; // release > prerelease
  if (a.pre !== null && b.pre === null) return false; // prerelease < release
  if (a.pre !== null && b.pre !== null) return a.pre > b.pre;
  return false; // identical
}

export class UpdateChecker {
  constructor(
    private readonly notifier: UpdateNotifierSink,
    private readonly fetchLatest: () => Promise<string | null>,
    private readonly logger?: Logger
  ) {}

  /**
   * Check for a newer release. Best-effort: a fetch failure is logged and
   * reported as `latestVersion: null` (no notification), never thrown.
   */
  async check(currentVersion: string): Promise<UpdateCheckResult> {
    let latestVersion: string | null = null;
    try {
      latestVersion = await this.fetchLatest();
    } catch (error) {
      this.logger?.warn?.('Update check could not fetch the latest version', error);
    }

    const updateAvailable =
      latestVersion !== null && isNewerVersion(latestVersion, currentVersion);

    if (updateAvailable) {
      await this.notifier.updateAvailable({
        version: latestVersion as string,
        current: currentVersion,
      });
    }

    return { currentVersion, latestVersion, updateAvailable };
  }
}

/**
 * Default "latest version" source: the tag of the newest GitHub release for
 * `repo` (owner/name), with any leading `v` stripped. Returns null on any
 * non-OK response or missing tag. `fetch` is global (Node >= 18).
 */
export async function fetchLatestReleaseTag(
  repo: string,
  fetchImpl: typeof globalThis.fetch = globalThis.fetch
): Promise<string | null> {
  const res = await fetchImpl(
    `https://api.github.com/repos/${repo}/releases/latest`,
    {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'civicpress-update-check',
      },
    }
  );
  if (!res.ok) return null;
  const data = (await res.json()) as { tag_name?: string };
  return data.tag_name ? data.tag_name.replace(/^v/, '') : null;
}
