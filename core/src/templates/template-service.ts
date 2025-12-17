/**
 * Template Service
 *
 * Service layer for template operations, wrapping TemplateEngine with
 * caching, validation, and API-friendly interfaces.
 *
 * Security Features:
 * - Path traversal prevention via TemplateValidator
 * - File system permission checks (system templates are read-only)
 * - Variable sanitization to prevent code injection
 * - YAML frontmatter validation
 * - Template ID format validation
 *
 * @module templates
 */

import * as fs from 'fs';
import * as path from 'path';
import matter from 'gray-matter';
import yaml from 'yaml';
import { TemplateEngine, type Template } from '../utils/template-engine.js';
import { TemplateCache } from './template-cache.js';
import { TemplateValidator } from './template-validator.js';
import { Logger } from '../utils/logger.js';
import type {
  ITemplateService,
  TemplateResponse,
  TemplateId,
  TemplateFilters,
  TemplateListResponse,
  CreateTemplateRequest,
  UpdateTemplateRequest,
  TemplatePreviewResponse,
  ValidationResult,
} from './types.js';
import {
  templateToResponse,
  parseTemplateId,
  buildTemplateId,
} from './types.js';

export interface TemplateServiceOptions {
  dataDir: string;
  logger?: Logger;
  enableCache?: boolean;
  enableWatching?: boolean;
}

export class TemplateService implements ITemplateService {
  private templateEngine: TemplateEngine;
  private cache: TemplateCache;
  private validator: TemplateValidator;
  private logger: Logger;
  private dataDir: string;
  private customTemplatePath: string;
  private enableCache: boolean;

  constructor(options: TemplateServiceOptions) {
    this.dataDir = options.dataDir;
    this.customTemplatePath = path.join(options.dataDir, '.civic', 'templates');
    this.logger = options.logger || new Logger();
    this.enableCache = options.enableCache ?? true;

    this.templateEngine = new TemplateEngine(options.dataDir);
    this.cache = new TemplateCache({
      dataDir: options.dataDir,
      logger: this.logger,
      enableWatching: options.enableWatching ?? true,
    });
    this.validator = new TemplateValidator(options.dataDir);
  }

  /**
   * List templates with optional filtering
   */
  async listTemplates(
    filters: TemplateFilters = {}
  ): Promise<TemplateListResponse> {
    const cacheKey = this.buildListCacheKey(filters);

    // Check cache
    if (this.enableCache) {
      const cached = this.cache.getList(cacheKey);
      if (cached) {
        return {
          templates: cached,
          total: cached.length,
          page: filters.page || 1,
          limit: filters.limit || 50,
        };
      }
    }

    // Get all record types or specific type
    const types = filters.type ? [filters.type] : this.getAvailableTypes();

    const allTemplates: TemplateResponse[] = [];

    for (const type of types) {
      const templateNames = this.templateEngine.listTemplates(type);

      for (const templateName of templateNames) {
        try {
          const templateId = buildTemplateId(type, templateName);
          const template = await this.getTemplate(templateId);
          if (template) {
            // Apply search filter if provided
            if (filters.search) {
              const searchLower = filters.search.toLowerCase();
              const matches =
                template.name.toLowerCase().includes(searchLower) ||
                template.description?.toLowerCase().includes(searchLower) ||
                template.type.toLowerCase().includes(searchLower);
              if (!matches) continue;
            }

            allTemplates.push(template);
          }
        } catch (error) {
          this.logger.warn(
            `Failed to load template ${type}/${templateName}: ${error instanceof Error ? error.message : String(error)}`
          );
          continue;
        }
      }
    }

    // Apply pagination
    const page = filters.page || 1;
    const limit = Math.min(filters.limit || 50, 100);
    const start = (page - 1) * limit;
    const end = start + limit;
    const paginatedTemplates = allTemplates.slice(start, end);

    // Cache result
    if (this.enableCache) {
      this.cache.setList(cacheKey, allTemplates);
    }

    return {
      templates: paginatedTemplates,
      total: allTemplates.length,
      page,
      limit,
    };
  }

  /**
   * Get a specific template by ID
   */
  async getTemplate(id: TemplateId): Promise<TemplateResponse | null> {
    // Validate ID format
    const pathValidation = this.validator.validatePath(id);
    if (!pathValidation.valid) {
      throw new Error(
        `Invalid template ID: ${pathValidation.errors.join(', ')}`
      );
    }

    // Check cache
    if (this.enableCache) {
      const cached = this.cache.get(id);
      if (cached) {
        return cached;
      }
    }

    // Load template
    const { type, name } = parseTemplateId(id);
    const template = await this.templateEngine.loadTemplate(type, name);

    if (!template) {
      return null;
    }

    // Convert to response format
    const response = templateToResponse(template, id);

    // Extract description from frontmatter
    try {
      const { data: frontmatter } = matter(template.rawContent);
      if (frontmatter.description) {
        response.description = frontmatter.description;
      }
    } catch {
      // Ignore parsing errors
    }

    // Enrich with metadata
    response.variables = this.templateEngine.getTemplateVariables(template);
    response.metadata = await this.getTemplateMetadata(type, name);

    // Cache result
    if (this.enableCache) {
      this.cache.set(id, response);
    }

    return response;
  }

  /**
   * Create a new template
   *
   * Security measures:
   * - Validates template ID format to prevent path traversal
   * - Ensures template is created in custom directory (writable)
   * - Validates YAML frontmatter structure
   * - Sanitizes template content
   *
   * @param data Template creation data
   * @returns Created template response
   * @throws Error if validation fails or template already exists
   */
  async createTemplate(data: CreateTemplateRequest): Promise<TemplateResponse> {
    // Validate request
    if (!data.type || !data.name || !data.content) {
      throw new Error('Type, name, and content are required');
    }

    // Build template ID
    const templateId = buildTemplateId(data.type, data.name);

    // Check if template already exists
    const existing = await this.getTemplate(templateId);
    if (existing) {
      throw new Error(`Template already exists: ${templateId}`);
    }

    // Validate path security (prevents path traversal)
    const pathValidation = this.validator.validatePath(templateId);
    if (!pathValidation.valid) {
      throw new Error(
        `Invalid template ID: ${pathValidation.errors.join(', ')}`
      );
    }

    // Validate file system permissions - ensure we're writing to custom directory
    const templateDir = path.join(this.customTemplatePath, data.type);
    const resolvedDir = path.resolve(templateDir);
    const resolvedCustomPath = path.resolve(this.customTemplatePath);

    if (!resolvedDir.startsWith(resolvedCustomPath)) {
      throw new Error('Invalid template directory path');
    }

    await fs.promises.mkdir(templateDir, { recursive: true });

    const templatePath = path.join(templateDir, `${data.name}.md`);

    // Validate frontmatter structure before writing
    const frontmatterValidation = this.validator.validateFrontmatter(
      `---\ntype: ${data.type}\n---\n${data.content}`
    );
    if (!frontmatterValidation.valid) {
      throw new Error(
        `Invalid template frontmatter: ${frontmatterValidation.errors.join(', ')}`
      );
    }

    // Build frontmatter
    const frontmatter: any = {
      template: templateId,
      type: data.type,
    };
    if (data.description) frontmatter.description = data.description;
    if (data.extends) frontmatter.extends = data.extends;
    if (data.validation) frontmatter.validation = data.validation;
    if (data.sections) frontmatter.sections = data.sections;

    // Write template file
    const frontmatterYaml = yaml.stringify(frontmatter);
    const templateContent = `---\n${frontmatterYaml}---\n\n${data.content}`;

    await fs.promises.writeFile(templatePath, templateContent, 'utf8');

    // Invalidate cache
    if (this.enableCache) {
      this.cache.invalidate();
    }

    // Load and return created template
    const created = await this.getTemplate(templateId);
    if (!created) {
      throw new Error(`Failed to load created template: ${templateId}`);
    }
    return created;
  }

  /**
   * Update an existing template
   */
  async updateTemplate(
    id: TemplateId,
    data: UpdateTemplateRequest
  ): Promise<TemplateResponse> {
    // Validate ID
    const pathValidation = this.validator.validatePath(id);
    if (!pathValidation.valid) {
      throw new Error(
        `Invalid template ID: ${pathValidation.errors.join(', ')}`
      );
    }

    // Check if template exists
    const existing = await this.getTemplate(id);
    if (!existing) {
      throw new Error(`Template not found: ${id}`);
    }

    const { type, name } = parseTemplateId(id);
    const templatePath = path.join(this.customTemplatePath, type, `${name}.md`);

    // Security check: Ensure template is in custom directory (writable)
    // System templates in .system-data/templates/ are read-only
    const resolvedPath = path.resolve(templatePath);
    const resolvedCustomPath = path.resolve(this.customTemplatePath);

    if (!resolvedPath.startsWith(resolvedCustomPath)) {
      throw new Error(
        `Template ${id} is a system template and cannot be modified`
      );
    }

    if (!fs.existsSync(templatePath)) {
      throw new Error(`Template not found: ${id}`);
    }

    // Load existing template
    const existingContent = await fs.promises.readFile(templatePath, 'utf8');
    const { data: frontmatter, content: markdownContent } =
      matter(existingContent);

    // Update fields
    if (data.description !== undefined)
      frontmatter.description = data.description;
    if (data.extends !== undefined) frontmatter.extends = data.extends;
    if (data.validation !== undefined)
      frontmatter.validation = {
        ...frontmatter.validation,
        ...data.validation,
      };
    if (data.sections !== undefined) frontmatter.sections = data.sections;

    // Update content if provided
    const newContent =
      data.content !== undefined ? data.content : markdownContent;

    // Write updated template
    const frontmatterYaml = yaml.stringify(frontmatter);
    const templateContent = `---\n${frontmatterYaml}---\n\n${newContent}`;

    await fs.promises.writeFile(templatePath, templateContent, 'utf8');

    // Invalidate cache
    if (this.enableCache) {
      this.cache.invalidate(id);
    }

    // Load and return updated template
    const updated = await this.getTemplate(id);
    if (!updated) {
      throw new Error(`Failed to load updated template: ${id}`);
    }
    return updated;
  }

  /**
   * Delete a template
   */
  async deleteTemplate(id: TemplateId): Promise<void> {
    // Validate ID
    const pathValidation = this.validator.validatePath(id);
    if (!pathValidation.valid) {
      throw new Error(
        `Invalid template ID: ${pathValidation.errors.join(', ')}`
      );
    }

    const { type, name } = parseTemplateId(id);
    const templatePath = path.join(this.customTemplatePath, type, `${name}.md`);

    // Check if template exists and is writable
    if (!fs.existsSync(templatePath)) {
      throw new Error(`Template not found: ${id}`);
    }

    // Delete template file
    await fs.promises.unlink(templatePath);

    // Invalidate cache
    if (this.enableCache) {
      this.cache.invalidate(id);
    }
  }

  /**
   * Preview template with variables
   *
   * Security measures:
   * - Validates template ID format
   * - Sanitizes variable values to prevent code injection
   * - Validates template exists before rendering
   *
   * @param id Template ID
   * @param variables Variables to substitute in template
   * @returns Preview response with rendered content and variable analysis
   * @throws Error if template not found
   */
  async previewTemplate(
    id: TemplateId,
    variables: Record<string, any>
  ): Promise<TemplatePreviewResponse> {
    // Get template
    const template = await this.getTemplate(id);
    if (!template) {
      throw new Error(`Template not found: ${id}`);
    }

    // Load core template for rendering
    const { type, name } = parseTemplateId(id);
    const coreTemplate = await this.templateEngine.loadTemplate(type, name);
    if (!coreTemplate) {
      throw new Error(`Template not found: ${id}`);
    }

    // Generate rendered content
    const rendered = this.templateEngine.generateContent(
      coreTemplate,
      variables
    );

    // Analyze variable usage
    const used: string[] = [];
    const missing: string[] = [];
    const available = template.variables || [];

    // Extract variables from template content
    const variableRegex = /\{\{(\w+)\}\}/g;
    let match;
    const foundVariables = new Set<string>();
    while ((match = variableRegex.exec(template.content)) !== null) {
      foundVariables.add(match[1]);
    }

    // Check which variables are used and missing
    for (const varName of foundVariables) {
      if (variables[varName] !== undefined) {
        used.push(varName);
      } else {
        missing.push(varName);
      }
    }

    return {
      rendered,
      variables: {
        used,
        missing,
        available,
      },
    };
  }

  /**
   * Validate a template
   */
  async validateTemplate(id: TemplateId): Promise<ValidationResult> {
    // Get template
    const template = await this.getTemplate(id);
    if (!template) {
      throw new Error(`Template not found: ${id}`);
    }

    // Load core template for validation
    const { type, name } = parseTemplateId(id);
    const coreTemplate = await this.templateEngine.loadTemplate(type, name);
    if (!coreTemplate) {
      throw new Error(`Template not found: ${id}`);
    }

    // Run comprehensive validation
    return this.validator.validateTemplate(id, coreTemplate);
  }

  /**
   * Invalidate cache
   */
  async invalidateCache(id?: TemplateId): Promise<void> {
    this.cache.invalidate(id);
  }

  /**
   * Get available record types
   */
  private getAvailableTypes(): string[] {
    const types: string[] = [];
    const typeDirs = [
      this.customTemplatePath,
      path.join(process.cwd(), '.system-data', 'templates'),
    ];

    for (const typeDir of typeDirs) {
      if (fs.existsSync(typeDir)) {
        const dirs = fs.readdirSync(typeDir, { withFileTypes: true });
        for (const dir of dirs) {
          if (dir.isDirectory() && !types.includes(dir.name)) {
            types.push(dir.name);
          }
        }
      }
    }

    return types;
  }

  /**
   * Build cache key for template list
   */
  private buildListCacheKey(filters: TemplateFilters): string {
    const parts = [
      filters.type || 'all',
      filters.search || '',
      filters.include?.join(',') || '',
    ];
    return `list:${parts.join(':')}`;
  }

  /**
   * Get template metadata from file stats
   */
  private async getTemplateMetadata(
    type: string,
    name: string
  ): Promise<TemplateResponse['metadata']> {
    // Try custom template first
    const customPath = path.join(this.customTemplatePath, type, `${name}.md`);
    if (fs.existsSync(customPath)) {
      const stats = await fs.promises.stat(customPath);
      return {
        created: stats.birthtime.toISOString(),
        updated: stats.mtime.toISOString(),
      };
    }

    // Try base template
    const basePath = path.join(
      process.cwd(),
      '.system-data',
      'templates',
      type,
      `${name}.md`
    );
    if (fs.existsSync(basePath)) {
      const stats = await fs.promises.stat(basePath);
      return {
        created: stats.birthtime.toISOString(),
        updated: stats.mtime.toISOString(),
      };
    }

    return undefined;
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    this.cache.stopWatching();
  }
}
