import {
  readFileSync,
  writeFileSync,
  existsSync,
  readdirSync,
  statSync,
} from 'fs';
import { join, dirname, basename } from 'path';
import * as yaml from 'js-yaml';
import { CivicPress } from '../civic-core.js';
import { Logger } from '../utils/logger.js';
import { RecordParser } from '../records/record-parser.js';
import { coreWarn, coreError } from '../utils/core-output.js';

export interface CivicIndexEntry {
  file: string;
  title: string;
  type: string;
  status: string;
  module?: string;
  tags?: string[];
  authors?: Array<{ name: string; role: string }>;
  created?: string;
  updated?: string;
  source?: string;
  slug?: string;
  // Cached parsed record data to avoid re-parsing during sync
  _parsedRecord?: any; // RecordData - cached from index generation
}

export interface CivicIndex {
  entries: CivicIndexEntry[];
  metadata: {
    generated: string;
    totalRecords: number;
    modules: string[];
    types: string[];
    statuses: string[];
  };
}

export interface IndexingOptions {
  dataDir?: string;
  rebuild?: boolean;
  modules?: string[];
  types?: string[];
  statuses?: string[];
  syncDatabase?: boolean;
  conflictResolution?: 'file-wins' | 'database-wins' | 'manual' | 'timestamp';
}

/* global console */

export class IndexingService {
  private civicPress: CivicPress;
  private dataDir: string;

  constructor(civicPress: CivicPress, dataDir?: string) {
    this.civicPress = civicPress;
    this.dataDir = dataDir || 'data';
  }

  /**
   * Generate or update civic record indexes
   */
  async generateIndexes(options: IndexingOptions = {}): Promise<CivicIndex> {
    const recordsDir = join(this.dataDir, 'records');

    if (!existsSync(recordsDir)) {
      throw new Error(`Records directory not found: ${recordsDir}`);
    }

    const entries: CivicIndexEntry[] = [];
    const modules = new Set<string>();
    const types = new Set<string>();
    const statuses = new Set<string>();

    // Scan all record files
    await this.scanRecords(recordsDir, entries, modules, types, statuses);

    // Filter entries based on options
    const filteredEntries = this.filterEntries(entries, options);

    const index: CivicIndex = {
      entries: filteredEntries,
      metadata: {
        generated: new Date().toISOString(),
        totalRecords: filteredEntries.length,
        modules: Array.from(modules),
        types: Array.from(types),
        statuses: Array.from(statuses),
      },
    };

    // Write global index
    const globalIndexPath = join(recordsDir, 'index.yml');
    await this.writeIndex(globalIndexPath, index);

    // Generate module-specific indexes
    await this.generateModuleIndexes(recordsDir, entries);

    // Sync to database if requested
    if (options.syncDatabase) {
      await this.syncToDatabase(
        index,
        options.conflictResolution || 'file-wins'
      );
    }

    return index;
  }

  /**
   * Scan records directory and extract metadata
   */
  private async scanRecords(
    recordsDir: string,
    entries: CivicIndexEntry[],
    modules: Set<string>,
    types: Set<string>,
    statuses: Set<string>
  ): Promise<void> {
    const scanDirectory = (dir: string, relativePath: string = '') => {
      if (!existsSync(dir)) return;

      const items = readdirSync(dir);

      for (const item of items) {
        const fullPath = join(dir, item);
        const stat = statSync(fullPath);

        if (stat.isDirectory()) {
          // Recursively scan subdirectories
          const newRelativePath = relativePath
            ? `${relativePath}/${item}`
            : item;
          scanDirectory(fullPath, newRelativePath);
        } else if (item.endsWith('.md')) {
          // Process markdown files
          const entry = this.extractRecordMetadata(fullPath, relativePath);
          if (entry) {
            entries.push(entry);

            // Track metadata for filtering
            if (entry.module) modules.add(entry.module);
            if (entry.type) types.add(entry.type);
            if (entry.status) statuses.add(entry.status);
          }
        }
      }
    };

    scanDirectory(recordsDir);
  }

  /**
   * Extract metadata from a civic record file
   * Uses RecordParser for consistent parsing
   */
  private extractRecordMetadata(
    filePath: string,
    relativePath: string
  ): CivicIndexEntry | null {
    try {
      const content = readFileSync(filePath, 'utf-8');

      // Use RecordParser for consistent parsing
      const record = RecordParser.parseFromMarkdown(content, filePath);

      const fileName = basename(filePath, '.md');
      const fileRelativePath = relativePath
        ? `${relativePath}/${fileName}.md`
        : `${fileName}.md`;

      // Extract metadata from RecordData
      const entry: CivicIndexEntry = {
        file: fileRelativePath,
        title: record.title || fileName,
        type: record.type || 'unknown',
        status: record.status || 'draft',
        module: record.metadata?.module,
        tags: record.metadata?.tags || [],
        // Map authors to expected format
        authors: record.authors
          ? record.authors.map((author) => ({
              name: author.name,
              role: author.role || 'unknown',
            }))
          : [],
        // Cache the parsed record to avoid re-parsing during sync
        _parsedRecord: record,
        created: record.created_at, // Use internal format
        updated: record.updated_at, // Use internal format
        // Map source object to string (use reference if available)
        source: record.source?.reference || record.source?.url || undefined,
        slug: record.metadata?.slug || fileName,
      };

      return entry;
    } catch (error) {
      coreWarn(`Failed to extract metadata from ${filePath}`, {
        operation: 'indexing:extract-metadata',
        filePath,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Filter entries based on indexing options
   */
  private filterEntries(
    entries: CivicIndexEntry[],
    options: IndexingOptions
  ): CivicIndexEntry[] {
    let filtered = entries;

    if (options.modules && options.modules.length > 0) {
      filtered = filtered.filter(
        (entry) => entry.module && options.modules!.includes(entry.module)
      );
    }

    if (options.types && options.types.length > 0) {
      filtered = filtered.filter((entry) =>
        options.types!.includes(entry.type)
      );
    }

    if (options.statuses && options.statuses.length > 0) {
      filtered = filtered.filter((entry) =>
        options.statuses!.includes(entry.status)
      );
    }

    return filtered;
  }

  /**
   * Generate module-specific indexes
   */
  private async generateModuleIndexes(
    recordsDir: string,
    entries: CivicIndexEntry[]
  ): Promise<void> {
    const moduleGroups = new Map<string, CivicIndexEntry[]>();

    // Group entries by module
    for (const entry of entries) {
      if (entry.module) {
        if (!moduleGroups.has(entry.module)) {
          moduleGroups.set(entry.module, []);
        }
        moduleGroups.get(entry.module)!.push(entry);
      }
    }

    // Generate module-specific indexes
    for (const [module, moduleEntries] of moduleGroups) {
      const moduleDir = join(recordsDir, module);
      if (!existsSync(moduleDir)) {
        continue;
      }

      const moduleIndex: CivicIndex = {
        entries: moduleEntries,
        metadata: {
          generated: new Date().toISOString(),
          totalRecords: moduleEntries.length,
          modules: [module],
          types: [...new Set(moduleEntries.map((e) => e.type))],
          statuses: [...new Set(moduleEntries.map((e) => e.status))],
        },
      };

      const moduleIndexPath = join(moduleDir, 'index.yml');
      await this.writeIndex(moduleIndexPath, moduleIndex);
    }
  }

  /**
   * Write index to file
   */
  private async writeIndex(filePath: string, index: CivicIndex): Promise<void> {
    try {
      const yamlContent = yaml.dump(index, {
        indent: 2,
        lineWidth: 80,
        noRefs: true,
      });

      // Ensure directory exists
      const dir = dirname(filePath);
      if (!existsSync(dir)) {
        const { mkdirSync } = await import('fs');
        mkdirSync(dir, { recursive: true });
      }

      writeFileSync(filePath, yamlContent, 'utf-8');
    } catch (error) {
      throw new Error(`Failed to write index to ${filePath}: ${error}`);
    }
  }

  /**
   * Load an existing index
   */
  loadIndex(indexPath: string): CivicIndex | null {
    try {
      if (!existsSync(indexPath)) {
        return null;
      }

      const content = readFileSync(indexPath, 'utf-8');
      return yaml.load(content) as CivicIndex;
    } catch (error) {
      coreWarn(`Failed to load index from ${indexPath}`, {
        operation: 'indexing:load-index',
        indexPath,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Search within an index
   */
  searchIndex(
    index: CivicIndex,
    query: string,
    options: {
      type?: string;
      status?: string;
      module?: string;
      tags?: string[];
    } = {}
  ): CivicIndexEntry[] {
    let results = index.entries;

    // Filter by options
    if (options.type) {
      results = results.filter((entry) => entry.type === options.type);
    }

    if (options.status) {
      results = results.filter((entry) => entry.status === options.status);
    }

    if (options.module) {
      results = results.filter((entry) => entry.module === options.module);
    }

    if (options.tags && options.tags.length > 0) {
      results = results.filter(
        (entry) =>
          entry.tags && options.tags!.some((tag) => entry.tags!.includes(tag))
      );
    }

    // Search by query
    if (query) {
      const lowerQuery = query.toLowerCase();
      results = results.filter(
        (entry) =>
          entry.title.toLowerCase().includes(lowerQuery) ||
          entry.slug?.toLowerCase().includes(lowerQuery) ||
          entry.tags?.some((tag) => tag.toLowerCase().includes(lowerQuery)) ||
          entry.authors?.some((author) =>
            author.name.toLowerCase().includes(lowerQuery)
          )
      );
    }

    return results;
  }

  /**
   * Sync indexed records to database
   */
  private async syncToDatabase(
    index: CivicIndex,
    conflictResolution: 'file-wins' | 'database-wins' | 'manual' | 'timestamp'
  ): Promise<void> {
    const recordManager = this.civicPress.getRecordManager();
    const logger = new Logger();

    logger.info('Syncing indexed records to database...');
    logger.info(`Found ${index.entries.length} records to sync`);

    let syncedCount = 0;
    let skippedCount = 0;
    let conflictCount = 0;

    for (const entry of index.entries) {
      try {
        // Generate record ID from slug or filename
        const recordId = entry.slug || entry.file.replace('.md', '');

        // Check if record exists in database (use DB directly to avoid file reads)
        // We already have file content from index, so no need to read it again
        const db = this.civicPress.getDatabaseService();
        const dbRecord = await db.getRecord(recordId);

        // Convert DB record to RecordData format if it exists
        const existingRecord = dbRecord
          ? {
              id: dbRecord.id,
              title: dbRecord.title,
              type: dbRecord.type,
              status: dbRecord.status || 'draft',
              workflowState: dbRecord.workflow_state || 'draft',
              content: dbRecord.content || '',
              path: dbRecord.path,
              author: dbRecord.author || 'unknown',
              created_at: dbRecord.created_at || new Date().toISOString(),
              updated_at: dbRecord.updated_at || new Date().toISOString(),
              metadata: dbRecord.metadata ? JSON.parse(dbRecord.metadata) : {},
              geography: dbRecord.geography
                ? JSON.parse(dbRecord.geography)
                : undefined,
              attachedFiles: dbRecord.attached_files
                ? JSON.parse(dbRecord.attached_files)
                : [],
              linkedRecords: dbRecord.linked_records
                ? JSON.parse(dbRecord.linked_records)
                : [],
              linkedGeographyFiles: dbRecord.linked_geography_files
                ? JSON.parse(dbRecord.linked_geography_files)
                : [],
            }
          : null;

        if (!existingRecord) {
          // Record doesn't exist - create it
          await this.createRecordFromFile(entry, recordManager, recordId);
          syncedCount++;
          logger.info(`Created record: ${entry.title}`);
        } else {
          // Record exists - handle conflict
          const shouldUpdate = await this.shouldUpdateRecord(
            entry,
            existingRecord,
            conflictResolution
          );

          if (shouldUpdate) {
            // Update record
            await this.updateRecordFromFile(
              entry,
              existingRecord,
              recordManager
            );
            syncedCount++;
            logger.info(`Updated record: ${entry.title}`);
          } else {
            skippedCount++;
            logger.info(`Skipped record: ${entry.title}`);
          }
        }
      } catch (error) {
        conflictCount++;
        logger.warn(`❌ Failed to sync ${entry.title}: ${error}`);
        coreError(
          `Detailed error for ${entry.title}`,
          'SYNC_ERROR',
          {
            entry: entry.title,
            error: error instanceof Error ? error.message : String(error),
          },
          { operation: 'indexing:sync' }
        );
      }
    }

    logger.info(
      `Sync complete: ${syncedCount} synced, ${skippedCount} skipped, ${conflictCount} conflicts`
    );
  }

  /**
   * Create a new record from file
   * Uses RecordParser for consistent parsing
   */
  private async createRecordFromFile(
    entry: CivicIndexEntry,
    recordManager: any,
    recordId: string
  ): Promise<void> {
    // Use cached parsed record if available (from index generation) to avoid re-parsing
    let record = entry._parsedRecord;

    if (!record) {
      // Fallback: parse if not cached (shouldn't happen in normal flow)
      const filePath = join(this.dataDir, 'records', entry.file);
      const fileContent = readFileSync(filePath, 'utf-8');
      record = RecordParser.parseFromMarkdown(fileContent, filePath);
    }

    // Create record with the specified ID instead of generating a new one
    await recordManager.createRecordWithId(
      recordId,
      {
        title: record.title,
        type: record.type,
        content: record.content,
        metadata: {
          ...record.metadata,
          source: 'file-sync',
          file_path: entry.file,
        },
        authors: record.authors,
        source: record.source,
        geography: record.geography,
        attachedFiles: record.attachedFiles,
        linkedRecords: record.linkedRecords,
        linkedGeographyFiles: record.linkedGeographyFiles,
        status: record.status,
        createdAt: record.created_at,
        updatedAt: record.updated_at,
        relativePath: ['records', entry.file].join('/'),
        skipFileGeneration: true,
        skipAudit: true, // Skip audit logging during sync
        skipHooks: true, // Skip hooks during sync
      },
      {
        id: 'admin',
        username: record.author || 'admin',
        name: record.authors?.[0]?.name || 'admin',
        email: record.authors?.[0]?.email,
        role: record.authors?.[0]?.role || 'admin',
      }
    );
  }

  /**
   * Update existing record from file
   * Uses RecordParser for consistent parsing
   */
  private async updateRecordFromFile(
    entry: CivicIndexEntry,
    existingRecord: any,
    recordManager: any
  ): Promise<void> {
    // Use cached parsed record if available (from index generation) to avoid re-parsing
    let record = entry._parsedRecord;

    if (!record) {
      // Fallback: parse if not cached (shouldn't happen in normal flow)
      const filePath = join(this.dataDir, 'records', entry.file);
      const fileContent = readFileSync(filePath, 'utf-8');
      record = RecordParser.parseFromMarkdown(fileContent, filePath);
    }

    await recordManager.updateRecord(
      existingRecord.id,
      {
        title: record.title,
        content: record.content,
        status: record.status,
        skipSaga: true, // Skip saga during sync - we're syncing FROM files TO DB
        skipFileGeneration: true, // Don't update files during sync
        skipAudit: true, // Skip audit logging during sync
        skipHooks: true, // Skip hooks during sync
        metadata: {
          ...existingRecord.metadata,
          ...record.metadata,
          source: 'file-sync',
          file_path: entry.file,
        },
        authors: record.authors,
        source: record.source,
        geography: record.geography,
        attachedFiles: record.attachedFiles,
        linkedRecords: record.linkedRecords,
        linkedGeographyFiles: record.linkedGeographyFiles,
        relativePath: ['records', entry.file].join('/'),
      },
      {
        id: 'admin',
        username: record.author || 'admin',
        name: record.authors?.[0]?.name || 'admin',
        email: record.authors?.[0]?.email,
        role: record.authors?.[0]?.role || 'admin',
      }
    );
  }

  /**
   * Determine if record should be updated based on conflict resolution strategy
   */
  private async shouldUpdateRecord(
    entry: CivicIndexEntry,
    existingRecord: any,
    strategy: 'file-wins' | 'database-wins' | 'manual' | 'timestamp'
  ): Promise<boolean> {
    switch (strategy) {
      case 'file-wins':
        return true;

      case 'database-wins':
        return false;

      case 'timestamp': {
        const fileTime = entry.updated ? new Date(entry.updated).getTime() : 0;
        const dbTime = existingRecord.updated_at
          ? new Date(existingRecord.updated_at).getTime()
          : 0;
        return fileTime > dbTime;
      }

      case 'manual':
        // For manual resolution, we'll skip for now and log
        coreWarn(`Manual resolution needed for: ${entry.title}`, {
          operation: 'indexing:conflict-resolution',
          entry: entry.title,
        });
        return false;

      default:
        return true;
    }
  }

  /**
   * Get indexing statistics
   */
  async getIndexingStats(): Promise<{
    totalRecords: number;
    modules: string[];
    types: string[];
    statuses: string[];
    lastGenerated?: string;
    indexFiles: string[];
  }> {
    const recordsDir = join(this.dataDir, 'records');
    const globalIndexPath = join(recordsDir, 'index.yml');

    const globalIndex = this.loadIndex(globalIndexPath);

    if (!globalIndex) {
      return {
        totalRecords: 0,
        modules: [],
        types: [],
        statuses: [],
        indexFiles: [],
      };
    }

    // Find all index files
    const indexFiles: string[] = [];
    if (existsSync(recordsDir)) {
      const scanForIndexes = (dir: string) => {
        const items = readdirSync(dir);
        for (const item of items) {
          const fullPath = join(dir, item);
          const stat = statSync(fullPath);

          if (stat.isDirectory()) {
            scanForIndexes(fullPath);
          } else if (item === 'index.yml') {
            indexFiles.push(fullPath.replace(recordsDir + '/', ''));
          }
        }
      };
      scanForIndexes(recordsDir);
    }

    return {
      totalRecords: globalIndex.metadata.totalRecords,
      modules: globalIndex.metadata.modules,
      types: globalIndex.metadata.types,
      statuses: globalIndex.metadata.statuses,
      lastGenerated: globalIndex.metadata.generated,
      indexFiles,
    };
  }

  /**
   * Validate all indexes
   */
  async validateIndexes(): Promise<{
    valid: boolean;
    errors: string[];
    warnings: string[];
    stats: {
      totalIndexes: number;
      totalRecords: number;
      orphanedFiles: number;
      invalidEntries: number;
    };
  }> {
    const errors: string[] = [];
    const warnings: string[] = [];
    let totalIndexes = 0;
    let totalRecords = 0;
    let orphanedFiles = 0;
    let invalidEntries = 0;

    const recordsDir = join(this.dataDir, 'records');

    if (!existsSync(recordsDir)) {
      return {
        valid: false,
        errors: ['Records directory not found'],
        warnings: [],
        stats: {
          totalIndexes: 0,
          totalRecords: 0,
          orphanedFiles: 0,
          invalidEntries: 0,
        },
      };
    }

    // Validate global index
    const globalIndexPath = join(recordsDir, 'index.yml');
    const globalIndex = this.loadIndex(globalIndexPath);

    if (globalIndex) {
      totalIndexes++;
      totalRecords += globalIndex.entries.length;

      // Check each entry
      for (const entry of globalIndex.entries) {
        const filePath = join(recordsDir, entry.file);

        if (!existsSync(filePath)) {
          errors.push(
            `Index entry references non-existent file: ${entry.file}`
          );
          orphanedFiles++;
        }

        if (!entry.title || !entry.type || !entry.status) {
          warnings.push(`Index entry missing required fields: ${entry.file}`);
          invalidEntries++;
        }
      }
    } else {
      warnings.push('Global index not found');
    }

    // Validate module indexes
    const scanForModuleIndexes = (dir: string) => {
      const items = readdirSync(dir);
      for (const item of items) {
        const fullPath = join(dir, item);
        const stat = statSync(fullPath);

        if (stat.isDirectory()) {
          const moduleIndexPath = join(fullPath, 'index.yml');
          if (existsSync(moduleIndexPath)) {
            const moduleIndex = this.loadIndex(moduleIndexPath);
            if (moduleIndex) {
              totalIndexes++;
              totalRecords += moduleIndex.entries.length;

              // Check each entry
              for (const entry of moduleIndex.entries) {
                const filePath = join(recordsDir, entry.file);

                if (!existsSync(filePath)) {
                  errors.push(
                    `Module index entry references non-existent file: ${entry.file}`
                  );
                  orphanedFiles++;
                }
              }
            }
          }
          scanForModuleIndexes(fullPath);
        }
      }
    };

    scanForModuleIndexes(recordsDir);

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      stats: { totalIndexes, totalRecords, orphanedFiles, invalidEntries },
    };
  }
}
