import * as fs from 'fs';
import path from 'path';

export interface RecordPathInfo {
  kind: 'records' | 'archive' | 'unknown';
  type: string;
  year?: string;
  id: string;
  filename: string;
  relativePath: string;
}

const RECORDS_DIR = 'records';
const ARCHIVE_DIR = 'archive';

function normalizeDateInput(
  input?: string | Date,
  fallback: Date = new Date()
): Date {
  if (!input) {
    return fallback;
  }

  if (input instanceof Date) {
    return input;
  }

  const parsed = new Date(input);
  if (Number.isNaN(parsed.getTime())) {
    return fallback;
  }

  return parsed;
}

export function getRecordYear(input?: string | Date): string {
  const date = normalizeDateInput(input);
  return String(date.getUTCFullYear());
}

export function buildRecordRelativePath(
  type: string,
  recordId: string,
  createdAt?: string | Date
): string {
  const year = getRecordYear(createdAt);
  return path
    .join(RECORDS_DIR, type, year, `${recordId}.md`)
    .replace(/\\/g, '/');
}

export function buildArchiveRelativePath(
  type: string,
  recordId: string,
  createdAt?: string | Date
): string {
  const year = getRecordYear(createdAt);
  return path
    .join(ARCHIVE_DIR, type, year, `${recordId}.md`)
    .replace(/\\/g, '/');
}

export function parseRecordRelativePath(recordPath: string): RecordPathInfo {
  const cleaned = recordPath.replace(/\\/g, '/').replace(/^\/+/, '');
  const segments = cleaned.split('/').filter(Boolean);

  if (segments.length < 2) {
    return {
      kind: 'unknown',
      type: '',
      id: segments[0]?.replace(/\.md$/, '') ?? '',
      filename: segments[0] ?? '',
      relativePath: cleaned,
    };
  }

  const [kindSegment, typeSegment, maybeYearSegment, ...rest] = segments;
  const filename =
    rest.length > 0 ? rest[rest.length - 1] : (maybeYearSegment ?? '');
  const id = filename.replace(/\.md$/, '');

  if (kindSegment === RECORDS_DIR || kindSegment === ARCHIVE_DIR) {
    if (segments.length >= 4) {
      const year = maybeYearSegment;
      return {
        kind: kindSegment === RECORDS_DIR ? 'records' : 'archive',
        type: typeSegment,
        year,
        id,
        filename,
        relativePath: cleaned,
      };
    }

    // Legacy layout without year folder
    return {
      kind: kindSegment === RECORDS_DIR ? 'records' : 'archive',
      type: typeSegment,
      id,
      filename,
      relativePath: cleaned,
    };
  }

  // Path without explicit records/archive prefix
  if (segments.length >= 3) {
    const [type, year, file] = segments;
    return {
      kind: 'unknown',
      type,
      year,
      id: file.replace(/\.md$/, ''),
      filename: file,
      relativePath: cleaned,
    };
  }

  if (segments.length === 2) {
    const [type, file] = segments;
    return {
      kind: 'unknown',
      type,
      id: file.replace(/\.md$/, ''),
      filename: file,
      relativePath: cleaned,
    };
  }

  return {
    kind: 'unknown',
    type: '',
    id,
    filename,
    relativePath: cleaned,
  };
}

function listMarkdownFilesRecursive(
  baseDir: string,
  relative: string[] = []
): string[] {
  if (!fs.existsSync(baseDir)) {
    return [];
  }

  const entries = fs.readdirSync(baseDir, { withFileTypes: true });
  const results: string[] = [];

  for (const entry of entries) {
    if (entry.name.startsWith('.')) {
      continue;
    }

    const entryPath = path.join(baseDir, entry.name);
    const nextRelative = [...relative, entry.name];

    if (entry.isDirectory()) {
      results.push(...listMarkdownFilesRecursive(entryPath, nextRelative));
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      const relativePath = path.join(...nextRelative).replace(/\\/g, '/');
      results.push(relativePath);
    }
  }

  return results;
}

export function listRecordFilesSync(
  dataDir: string,
  options: {
    type?: string;
    includeArchive?: boolean;
  } = {}
): string[] {
  const recordsDir = path.join(dataDir, RECORDS_DIR);
  const archiveDir = path.join(dataDir, ARCHIVE_DIR);
  const results: string[] = [];

  if (fs.existsSync(recordsDir)) {
    const types = options.type
      ? [options.type]
      : fs
          .readdirSync(recordsDir, { withFileTypes: true })
          .filter((dirent) => dirent.isDirectory())
          .map((dirent) => dirent.name);

    for (const type of types) {
      const typeDir = path.join(recordsDir, type);
      if (!fs.existsSync(typeDir)) continue;

      const files = listMarkdownFilesRecursive(typeDir);
      for (const file of files) {
        results.push(path.join(RECORDS_DIR, type, file).replace(/\\/g, '/'));
      }
    }
  }

  if (options.includeArchive && fs.existsSync(archiveDir)) {
    const types = options.type
      ? [options.type]
      : fs
          .readdirSync(archiveDir, { withFileTypes: true })
          .filter((dirent) => dirent.isDirectory())
          .map((dirent) => dirent.name);

    for (const type of types) {
      const typeDir = path.join(archiveDir, type);
      if (!fs.existsSync(typeDir)) continue;

      const files = listMarkdownFilesRecursive(typeDir);
      for (const file of files) {
        results.push(path.join(ARCHIVE_DIR, type, file).replace(/\\/g, '/'));
      }
    }
  }

  return results;
}

export function findRecordFileSync(
  dataDir: string,
  recordId: string,
  options: {
    type?: string;
    includeArchive?: boolean;
  } = {}
): string | null {
  const normalizedId = recordId.replace(/\.md$/, '');
  const targetFileName = `${normalizedId}.md`;
  const searchTypes = (baseDir: string): string[] => {
    if (!fs.existsSync(baseDir)) return [];
    return options.type
      ? [options.type]
      : fs
          .readdirSync(baseDir, { withFileTypes: true })
          .filter((dirent) => dirent.isDirectory())
          .map((dirent) => dirent.name);
  };

  const searchDirectories = (
    baseDir: string,
    prefix: string
  ): string | null => {
    const types = searchTypes(baseDir);
    for (const type of types) {
      const typeDir = path.join(baseDir, type);
      if (!fs.existsSync(typeDir)) continue;

      const stack: Array<{ dir: string; relative: string[] }> = [
        { dir: typeDir, relative: [type] },
      ];

      while (stack.length > 0) {
        const current = stack.pop()!;
        const entries = fs.readdirSync(current.dir, {
          withFileTypes: true,
        });

        for (const entry of entries) {
          if (entry.name.startsWith('.')) continue;

          const entryPath = path.join(current.dir, entry.name);
          const relative = [...current.relative, entry.name];

          if (entry.isDirectory()) {
            stack.push({ dir: entryPath, relative });
          } else if (entry.isFile() && entry.name === targetFileName) {
            return path.join(prefix, ...relative).replace(/\\/g, '/');
          }
        }

        // Legacy flat files inside type directory
        const legacyFilePath = path.join(current.dir, targetFileName);
        if (fs.existsSync(legacyFilePath)) {
          return path
            .join(prefix, ...current.relative, targetFileName)
            .replace(/\\/g, '/');
        }
      }
    }
    return null;
  };

  const recordPath = searchDirectories(
    path.join(dataDir, RECORDS_DIR),
    RECORDS_DIR
  );
  if (recordPath) {
    return recordPath;
  }

  if (options.includeArchive) {
    return searchDirectories(path.join(dataDir, ARCHIVE_DIR), ARCHIVE_DIR);
  }

  return null;
}

export function ensureDirectoryForRecordPath(
  dataDir: string,
  recordPath: string
): void {
  const fullPath = path.join(dataDir, recordPath);
  const dir = path.dirname(fullPath);
  fs.mkdirSync(dir, { recursive: true });
}
