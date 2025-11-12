#!/usr/bin/env node

/**
 * Backfill session record attachments based on embedded storage file links.
 *
 * This script scans session markdown files for Markdown image links that point
 * to the UUID storage API, looks up each referenced file in the storage
 * database, and populates the `attached_files` array in the record frontmatter.
 *
 * It preserves any existing attachments and skips duplicates. Inline Markdown
 * links remain untouched so that content continues to render as-is.
 */

import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const rootDir = process.cwd();
const systemDataDir = path.join(rootDir, '.system-data');
const recordsRoot = path.join(rootDir, 'data', 'records', 'session');

const { RecordParser, DatabaseService } = await import(
  new URL('../core/dist/index.js', import.meta.url)
);
const {
  CloudUuidStorageService,
  StorageConfigManager,
} = await import(new URL('../modules/storage/dist/index.js', import.meta.url));

/**
 * Recursively collect markdown files under a directory.
 */
async function collectMarkdownFiles(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectMarkdownFiles(entryPath)));
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      files.push(entryPath);
    }
  }

  return files;
}

/**
 * Try to extract a storage UUID from a Markdown URL.
 */
function extractStorageId(markdownUrl) {
  try {
    const url = new URL(markdownUrl);
    const match = url.pathname.match(
      /\/api\/v1\/storage\/files\/([0-9a-fA-F-]{36})/
    );
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

/**
 * Infer attachment category based on storage folder and mime type.
 */
function inferCategory(folder, mimeType) {
  if (folder === 'sessions') {
    return 'media';
  }
  if (mimeType && mimeType.startsWith('image/')) {
    return 'media';
  }
  return 'reference';
}

/**
 * Normalize description derived from Markdown alt text.
 */
function deriveDescription(altText) {
  const cleaned = altText.trim();
  if (!cleaned) return undefined;
  const lower = cleaned.toLowerCase();
  if (lower === 'image' || lower === 'photo') {
    return undefined;
  }
  return cleaned;
}

async function main() {
  const storageConfigManager = new StorageConfigManager(systemDataDir);
  const storageConfig = await storageConfigManager.loadConfig();

  const database = new DatabaseService({
    type: 'sqlite',
    sqlite: {
      file: path.join(systemDataDir, 'civic.db'),
    },
  });
  await database.initialize();

  const storageService = new CloudUuidStorageService(
    storageConfig,
    systemDataDir
  );
  storageService.setDatabaseService(database);
  await storageService.initialize();

  const sessionFiles = await collectMarkdownFiles(recordsRoot);
  const summary = [];

  for (const filePath of sessionFiles) {
    const raw = await fs.readFile(filePath, 'utf8');
    const relativePath = path.relative(
      path.join(rootDir, 'data', 'records'),
      filePath
    );

    const record = RecordParser.parseFromMarkdown(raw, relativePath);
    const existingAttachments = record.attachedFiles
      ? [...record.attachedFiles]
      : [];
    const existingIds = new Set(existingAttachments.map((file) => file.id));

    const markdownMatches = Array.from(
      raw.matchAll(/!\[([^\]]*)\]\(([^)]+)\)/g)
    );
    const newAttachments = [];

    for (const match of markdownMatches) {
      const altText = match[1] ?? '';
      const url = match[2]?.trim();
      if (!url) continue;

      const storageId = extractStorageId(url);
      if (!storageId || existingIds.has(storageId)) continue;

      const fileInfo = await storageService.getFileById(storageId);
      if (!fileInfo) {
        console.warn(
          `[WARN] Storage file ${storageId} referenced in ${relativePath} not found`
        );
        continue;
      }

      const attachment = {
        id: fileInfo.id,
        path: fileInfo.relative_path || fileInfo.provider_path || url,
        original_name: fileInfo.original_name || `file-${fileInfo.id}`,
        category: inferCategory(fileInfo.folder, fileInfo.mime_type),
      };

      const description = deriveDescription(altText);
      if (description) {
        attachment.description = description;
      }

      newAttachments.push(attachment);
      existingIds.add(storageId);
    }

    if (newAttachments.length === 0) {
      continue;
    }

    record.attachedFiles = existingAttachments.concat(newAttachments);
    const updatedContent = RecordParser.serializeToMarkdown(record);
    await fs.writeFile(filePath, `${updatedContent.trimEnd()}\n`, 'utf8');

    summary.push({
      file: relativePath.replace(/\\/g, '/'),
      added: newAttachments.length,
    });
  }

  await database.close();

  if (summary.length === 0) {
    console.log('No new attachments were added.');
    return;
  }

  console.log('Attachment backfill complete:');
  for (const entry of summary) {
    console.log(`  • ${entry.file}: added ${entry.added} attachment(s)`);
  }
}

main().catch((error) => {
  console.error('Failed to backfill attachments:', error);
  process.exit(1);
});


