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
   */
  private extractRecordMetadata(
    filePath: string,
    relativePath: string
  ): CivicIndexEntry | null {
    try {
      const content = readFileSync(filePath, 'utf-8');
      const frontmatter = this.extractFrontmatter(content);

      if (!frontmatter) return null;

      const fileName = basename(filePath, '.md');
      const fileRelativePath = relativePath
        ? `${relativePath}/${fileName}.md`
        : `${fileName}.md`;

      const entry: CivicIndexEntry = {
        file: fileRelativePath,
        title: frontmatter.title || fileName,
        type: frontmatter.type || 'unknown',
        status: frontmatter.status || 'draft',
        module: frontmatter.module,
        tags: frontmatter.tags || [],
        authors: frontmatter.authors || [],
        created: frontmatter.created,
        updated: frontmatter.updated,
        source: frontmatter.source,
        slug: frontmatter.slug || fileName,
      };

      return entry;
    } catch (error) {
      console.warn(`Failed to extract metadata from ${filePath}:`, error);
      return null;
    }
  }

  /**
   * Extract YAML frontmatter from markdown content
   */
  private extractFrontmatter(content: string): any {
    const frontmatterMatch = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n/);
    if (!frontmatterMatch) return null;

    try {
      return yaml.load(frontmatterMatch[1]) as any;
    } catch (error) {
      console.warn('Failed to parse frontmatter:', error);
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
      console.warn(`Failed to load index from ${indexPath}:`, error);
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
}
