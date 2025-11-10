import * as fs from 'fs';
import * as path from 'path';
import {
  findRecordFileSync,
  listRecordFilesSync,
  parseRecordRelativePath,
} from '@civicpress/core';

export interface ResolveRecordOptions {
  type?: string;
  includeArchive?: boolean;
}

export interface ResolvedRecordPath {
  relativePath: string;
  absolutePath: string;
  parsed: ReturnType<typeof parseRecordRelativePath>;
}

function ensurePrefixed(candidate: string): string {
  if (candidate.startsWith('records/') || candidate.startsWith('archive/')) {
    return candidate;
  }
  return `records/${candidate}`.replace(/\\/g, '/');
}

export function resolveRecordReference(
  dataDir: string,
  reference: string,
  options: ResolveRecordOptions = {}
): ResolvedRecordPath | null {
  const normalized = reference.replace(/\.md$/, '');
  let relativePath: string | null = null;

  if (reference.includes('/')) {
    const candidate = reference.endsWith('.md') ? reference : `${reference}.md`;
    const prefixed = ensurePrefixed(candidate);
    const absoluteCandidate = path.join(
      dataDir,
      ...prefixed.split('/').filter(Boolean)
    );
    if (fs.existsSync(absoluteCandidate)) {
      relativePath = prefixed;
    }
  }

  if (!relativePath) {
    relativePath = findRecordFileSync(dataDir, normalized, options);
  }

  if (!relativePath) {
    return null;
  }

  const segments = relativePath.split('/').filter(Boolean);
  const absolutePath = path.join(dataDir, ...segments);
  const parsed = parseRecordRelativePath(relativePath);

  return {
    relativePath,
    absolutePath,
    parsed,
  };
}

export function getAvailableRecords(
  dataDir: string,
  options: ResolveRecordOptions = {}
): Record<string, string[]> {
  const files = listRecordFilesSync(dataDir, options);

  return files.reduce<Record<string, string[]>>((acc, relPath) => {
    const parsed = parseRecordRelativePath(relPath);
    if (!parsed.type) {
      return acc;
    }
    if (!acc[parsed.type]) {
      acc[parsed.type] = [];
    }
    const displayName = parsed.year ? `${parsed.year}/${parsed.id}` : parsed.id;
    acc[parsed.type].push(displayName);
    return acc;
  }, {});
}
