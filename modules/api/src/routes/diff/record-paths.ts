import {
  findRecordFileSync,
  listRecordFilesSync,
  parseRecordRelativePath,
} from '@civicpress/core';
import { HttpError } from '../../utils/http-error.js';
import * as fs from 'fs';
import * as path from 'path';

export function resolveRecordPath(
  dataDir: string,
  recordRef: string,
  type?: string
): string | null {
  const normalizedInput = recordRef.replace(/\.md$/, '');
  let recordRelativePath: string | null = null;

  if (recordRef.includes('/')) {
    const candidate = recordRef.endsWith('.md') ? recordRef : `${recordRef}.md`;
    const relativeCandidate = candidate.startsWith('records/')
      ? candidate
      : `records/${candidate}`.replace(/\\/g, '/');
    const candidateSegments = relativeCandidate
      .replace(/^records\//, '')
      .split('/');
    const fullCandidate = path.join(dataDir, 'records', ...candidateSegments);
    if (fs.existsSync(fullCandidate)) {
      recordRelativePath = relativeCandidate;
    }
  }

  if (!recordRelativePath) {
    const id = normalizedInput.split('/').pop() ?? normalizedInput;
    recordRelativePath = findRecordFileSync(dataDir, id, {
      type,
    });
  }

  return recordRelativePath;
}

export function getAvailableRecords(
  dataDir: string
): Record<string, string[]> {
  return listRecordFilesSync(dataDir).reduce(
    (acc, relPath) => {
      const parsed = parseRecordRelativePath(relPath);
      if (!parsed.type) {
        return acc;
      }
      if (!acc[parsed.type]) {
        acc[parsed.type] = [];
      }
      const displayName = parsed.year
        ? `${parsed.year}/${parsed.id}`
        : parsed.id;
      acc[parsed.type].push(displayName);
      return acc;
    },
    {} as Record<string, string[]>
  );
}

export function requireRecordPath(
  dataDir: string,
  recordRef: string,
  type?: string
): string {
  const resolved = resolveRecordPath(dataDir, recordRef, type);
  if (resolved) {
    return resolved;
  }

  const availableRecords = getAvailableRecords(dataDir);
  throw new HttpError(
    404,
    `Record not found: ${recordRef}`,
    'RECORD_NOT_FOUND',
    { details: { availableRecords } }
  );
}

export function parseRecordMetadata(content: string): Record<string, any> {
  const metadataMatch = content.match(/^---\n([\s\S]*?)\n---\n/);
  if (!metadataMatch) {
    return {};
  }

  const metadataLines = metadataMatch[1].split('\n');
  const metadata: Record<string, any> = {};

  for (const line of metadataLines) {
    const colonIndex = line.indexOf(':');
    if (colonIndex > 0) {
      const key = line.substring(0, colonIndex).trim();
      const value = line.substring(colonIndex + 1).trim();
      metadata[key] = value;
    }
  }

  return metadata;
}
