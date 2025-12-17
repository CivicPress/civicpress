/**
 * Template Cache
 *
 * In-memory cache for templates with file system watching for invalidation
 */

import * as fs from 'fs';
import * as path from 'path';
import { Logger } from '../utils/logger.js';
import type { TemplateResponse, TemplateId } from './types.js';

export interface TemplateCacheOptions {
  dataDir: string;
  logger?: Logger;
  enableWatching?: boolean;
}

export class TemplateCache {
  private cache: Map<TemplateId, TemplateResponse> = new Map();
  private listCache: Map<string, TemplateResponse[]> = new Map();
  private dataDir: string;
  private customTemplatePath: string;
  private partialsPath: string;
  private logger: Logger;
  private watchers: Map<string, fs.FSWatcher> = new Map();
  private enableWatching: boolean;
  private debounceTimers: Map<string, NodeJS.Timeout> = new Map();

  constructor(options: TemplateCacheOptions) {
    this.dataDir = options.dataDir;
    this.customTemplatePath = path.join(options.dataDir, '.civic', 'templates');
    this.partialsPath = path.join(options.dataDir, '.civic', 'partials');
    this.logger = options.logger || new Logger();
    this.enableWatching = options.enableWatching ?? true;

    if (this.enableWatching) {
      this.startWatching();
    }
  }

  /**
   * Get template from cache
   */
  get(id: TemplateId): TemplateResponse | null {
    return this.cache.get(id) || null;
  }

  /**
   * Set template in cache
   */
  set(id: TemplateId, template: TemplateResponse): void {
    this.cache.set(id, template);
    // Invalidate list cache
    this.listCache.clear();
  }

  /**
   * Delete template from cache
   */
  delete(id: TemplateId): void {
    this.cache.delete(id);
    // Invalidate list cache
    this.listCache.clear();
  }

  /**
   * Clear all cache
   */
  clear(): void {
    this.cache.clear();
    this.listCache.clear();
  }

  /**
   * Get cached template list
   */
  getList(key: string): TemplateResponse[] | null {
    return this.listCache.get(key) || null;
  }

  /**
   * Set cached template list
   */
  setList(key: string, templates: TemplateResponse[]): void {
    this.listCache.set(key, templates);
  }

  /**
   * Check if template is cached
   */
  has(id: TemplateId): boolean {
    return this.cache.has(id);
  }

  /**
   * Get cache size
   */
  size(): number {
    return this.cache.size;
  }

  /**
   * Start watching template directories for changes
   */
  private startWatching(): void {
    try {
      // Watch custom templates directory
      if (fs.existsSync(this.customTemplatePath)) {
        this.watchDirectory(this.customTemplatePath, (filePath) => {
          this.handleFileChange(filePath);
        });
      }

      // Watch partials directory
      if (fs.existsSync(this.partialsPath)) {
        this.watchDirectory(this.partialsPath, (filePath) => {
          // Invalidate all templates when partials change
          this.clear();
        });
      }
    } catch (error) {
      this.logger.warn(
        `Failed to start template file watchers: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Watch a directory for changes
   */
  private watchDirectory(
    dirPath: string,
    onChange: (filePath: string) => void
  ): void {
    try {
      const watcher = fs.watch(
        dirPath,
        { recursive: true },
        (eventType, filename) => {
          if (filename) {
            const filePath = path.join(dirPath, filename);
            onChange(filePath);
          }
        }
      );

      this.watchers.set(dirPath, watcher);
      this.logger.debug(`Started watching template directory: ${dirPath}`);
    } catch (error) {
      this.logger.warn(
        `Failed to watch directory ${dirPath}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Handle file change with debouncing
   */
  private handleFileChange(filePath: string): void {
    // Debounce file changes (wait 500ms for multiple events)
    const existingTimer = this.debounceTimers.get(filePath);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    const timer = setTimeout(() => {
      this.invalidateFile(filePath);
      this.debounceTimers.delete(filePath);
    }, 500);

    this.debounceTimers.set(filePath, timer);
  }

  /**
   * Invalidate cache for a specific file
   */
  private invalidateFile(filePath: string): void {
    // Extract template ID from file path
    const relativePath = path.relative(this.customTemplatePath, filePath);
    if (relativePath && !relativePath.startsWith('..')) {
      // Path format: {type}/{name}.md
      const parts = relativePath.split(path.sep);
      if (parts.length === 2 && parts[1].endsWith('.md')) {
        const type = parts[0];
        const name = parts[1].replace('.md', '');
        const templateId: TemplateId = `${type}/${name}`;
        this.delete(templateId);
        this.logger.debug(`Invalidated cache for template: ${templateId}`);
      }
    }

    // Always clear list cache on any file change
    this.listCache.clear();
  }

  /**
   * Manually invalidate cache for a template
   */
  invalidate(id?: TemplateId): void {
    if (id) {
      this.delete(id);
    } else {
      this.clear();
    }
  }

  /**
   * Stop all file watchers
   */
  stopWatching(): void {
    for (const [path, watcher] of this.watchers) {
      watcher.close();
      this.logger.debug(`Stopped watching directory: ${path}`);
    }
    this.watchers.clear();

    // Clear debounce timers
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();
  }

  /**
   * Get cache statistics
   */
  getStats(): {
    templateCount: number;
    listCacheCount: number;
    watchedDirectories: number;
  } {
    return {
      templateCount: this.cache.size,
      listCacheCount: this.listCache.size,
      watchedDirectories: this.watchers.size,
    };
  }
}
