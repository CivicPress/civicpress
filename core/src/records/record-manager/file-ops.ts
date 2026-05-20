/**
 * Record file operations — extracted from record-manager.ts in Phase 2d
 * W2-T6. Handles the filesystem + git side of records (write markdown
 * file to disk, commit to git, archive-move).
 *
 * Schema validation is performed before each write so invalid records
 * never reach disk.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import matter from 'gray-matter';
import type { GitEngine } from '../../git/git-engine.js';
import { RecordSchemaValidator } from '../record-schema-validator.js';
import { RecordValidationError } from '../../errors/domain-errors.js';
import {
  buildArchiveRelativePath,
  ensureDirectoryForRecordPath,
  parseRecordRelativePath,
} from '../../utils/record-paths.js';
import type { RecordData } from '../record-manager.js';
import {
  createMarkdownContent,
  normalizeFrontmatterForValidation,
} from './helpers.js';

export interface RecordFileOpsDeps {
  git: GitEngine;
  dataDir: string;
}

export class RecordFileOps {
  constructor(private deps: RecordFileOpsDeps) {}

  /**
   * Create record file in git repository.
   */
  async createRecordFile(record: RecordData): Promise<void> {
    const filePath = record.path;
    if (!filePath) return;

    const normalizedRecord = this.normalizeSource(record);
    const content = createMarkdownContent(normalizedRecord);

    this.validateBeforeWrite(content, record, 'saving');

    ensureDirectoryForRecordPath(this.deps.dataDir, filePath);
    const fullPath = path.join(this.deps.dataDir, filePath);
    await fs.writeFile(fullPath, content, 'utf8');

    await this.deps.git.commit(`Create record: ${record.title}`, [filePath]);
  }

  /**
   * Update record file in git repository.
   */
  async updateRecordFile(record: RecordData): Promise<void> {
    const filePath = record.path;
    if (!filePath) return;

    const normalizedRecord = this.normalizeSource(record);
    const content = createMarkdownContent(normalizedRecord);

    this.validateBeforeWrite(content, record, 'updating');

    ensureDirectoryForRecordPath(this.deps.dataDir, filePath);
    const fullPath = path.join(this.deps.dataDir, filePath);
    await fs.writeFile(fullPath, content, 'utf8');

    await this.deps.git.commit(`Update record: ${record.title}`, [filePath]);
  }

  /**
   * Archive record file by moving it under `archive/<type>/<year>/`.
   */
  async archiveRecordFile(record: RecordData): Promise<void> {
    const filePath = record.path;
    if (!filePath) return;

    const parsedPath = parseRecordRelativePath(filePath);
    const archivePath =
      parsedPath.year && parsedPath.type === record.type
        ? path
            .join('archive', record.type, parsedPath.year, `${record.id}.md`)
            .replace(/\\/g, '/')
        : buildArchiveRelativePath(record.type, record.id, record.created_at);

    const sourcePath = path.join(this.deps.dataDir, filePath);
    const targetPath = path.join(this.deps.dataDir, archivePath);

    ensureDirectoryForRecordPath(this.deps.dataDir, archivePath);
    await fs.rename(sourcePath, targetPath);

    await this.deps.git.commit(`Archive record: ${record.title}`, [archivePath]);
  }

  // ----- internal -----

  private normalizeSource(record: RecordData): RecordData {
    const normalized = { ...record };
    if (normalized.source && typeof normalized.source === 'string') {
      normalized.source = {
        reference: normalized.source as unknown as string,
      };
    }
    return normalized;
  }

  private validateBeforeWrite(
    content: string,
    record: RecordData,
    action: 'saving' | 'updating'
  ): void {
    const { data: frontmatter } = matter(content);
    const normalizedFrontmatter = normalizeFrontmatterForValidation(frontmatter);

    const schemaValidation = RecordSchemaValidator.validate(
      normalizedFrontmatter,
      record.type,
      {
        includeModuleExtensions: true,
        includeTypeExtensions: true,
        strict: false,
      }
    );

    if (!schemaValidation.isValid && schemaValidation.errors.length > 0) {
      const errorMessages = schemaValidation.errors
        .map((err) => `${err.field}: ${err.message}`)
        .join('; ');
      throw new RecordValidationError(
        `Schema validation failed before ${action} record ${record.id}: ${errorMessages}`,
        { recordId: record.id, validationErrors: schemaValidation.errors }
      );
    }
  }
}
