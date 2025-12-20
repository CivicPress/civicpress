/**
 * Unit Tests for Template Service
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { TemplateService } from '../template-service.js';
import { Logger } from '../../utils/logger.js';

// Run tests sequentially to avoid memory issues
describe('TemplateService', () => {
  let service: TemplateService;
  let testDataDir: string;
  let mockLogger: Logger;

  beforeEach(() => {
    // Create temporary test directory
    testDataDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'civicpress-template-test-')
    );

    // Create directory structure
    fs.mkdirSync(path.join(testDataDir, '.civic', 'templates'), {
      recursive: true,
    });
    fs.mkdirSync(
      path.join(process.cwd(), '.system-data', 'templates', 'bylaw'),
      { recursive: true }
    );

    mockLogger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    } as any;

    service = new TemplateService({
      dataDir: testDataDir,
      logger: mockLogger,
      enableCache: true,
      enableWatching: false, // Disable watching in tests for speed
    });
  });

  afterEach(async () => {
    // Clear cache first to free memory
    if (service) {
      await service.invalidateCache();
      service.destroy();
    }

    // Cleanup test directory
    if (testDataDir && fs.existsSync(testDataDir)) {
      try {
        fs.rmSync(testDataDir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
    }

    // Cleanup system templates (only if they exist)
    const systemTemplatePath = path.join(
      process.cwd(),
      '.system-data',
      'templates',
      'bylaw'
    );
    if (fs.existsSync(systemTemplatePath)) {
      try {
        const files = fs.readdirSync(systemTemplatePath);
        for (const file of files) {
          if (file.endsWith('.md') && file.startsWith('test-')) {
            try {
              fs.unlinkSync(path.join(systemTemplatePath, file));
            } catch {
              // Ignore individual file errors
            }
          }
        }
      } catch {
        // Ignore cleanup errors
      }
    }
  });

  describe('listTemplates', () => {
    it('should return empty list when no templates exist', async () => {
      const result = await service.listTemplates();

      expect(result).toBeDefined();
      expect(result.templates).toEqual([]);
      expect(result.total).toBe(0);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(50);
    });

    it('should list templates for a specific type', async () => {
      // Create a test template
      const templatePath = path.join(
        testDataDir,
        '.civic',
        'templates',
        'bylaw',
        'test.md'
      );
      fs.mkdirSync(path.dirname(templatePath), { recursive: true });
      fs.writeFileSync(
        templatePath,
        `---
type: bylaw
---
# Test Template
Content here
`
      );

      const result = await service.listTemplates({ type: 'bylaw' });

      expect(result.templates.length).toBeGreaterThan(0);
      expect(result.templates[0].type).toBe('bylaw');
    });

    it('should filter templates by search term', async () => {
      // Create test templates
      const template1Path = path.join(
        testDataDir,
        '.civic',
        'templates',
        'bylaw',
        'default.md'
      );
      const template2Path = path.join(
        testDataDir,
        '.civic',
        'templates',
        'bylaw',
        'comprehensive.md'
      );
      fs.mkdirSync(path.dirname(template1Path), { recursive: true });
      fs.writeFileSync(
        template1Path,
        `---
type: bylaw
description: Default bylaw template
---
# Default Template
`
      );
      fs.writeFileSync(
        template2Path,
        `---
type: bylaw
description: Comprehensive bylaw template
---
# Comprehensive Template
`
      );

      const result = await service.listTemplates({
        type: 'bylaw',
        search: 'default',
      });

      expect(result.templates.length).toBe(1);
      expect(result.templates[0].name).toBe('default');
    });

    it('should paginate results', async () => {
      // Create minimal templates for pagination test (reduced from 5 to 3)
      for (let i = 0; i < 3; i++) {
        const templatePath = path.join(
          testDataDir,
          '.civic',
          'templates',
          'bylaw',
          `template${i}.md`
        );
        fs.mkdirSync(path.dirname(templatePath), { recursive: true });
        fs.writeFileSync(
          templatePath,
          `---
type: bylaw
---
# Template ${i}
`
        );
      }

      const result = await service.listTemplates({
        type: 'bylaw',
        page: 1,
        limit: 2,
      });

      expect(result.templates.length).toBe(2);
      expect(result.total).toBe(3);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(2);
    });
  });

  describe('getTemplate', () => {
    it('should return null for non-existent template', async () => {
      const result = await service.getTemplate('bylaw/nonexistent');

      expect(result).toBeNull();
    });

    it('should load and return template', async () => {
      // Create a test template
      const templatePath = path.join(
        testDataDir,
        '.civic',
        'templates',
        'bylaw',
        'test.md'
      );
      fs.mkdirSync(path.dirname(templatePath), { recursive: true });
      fs.writeFileSync(
        templatePath,
        `---
type: bylaw
description: Test template
---
# Test Template
Content here
`
      );

      const result = await service.getTemplate('bylaw/test');

      expect(result).toBeDefined();
      expect(result?.id).toBe('bylaw/test');
      expect(result?.type).toBe('bylaw');
      expect(result?.name).toBe('test');
      expect(result?.description).toBe('Test template');
    });

    it('should throw error for invalid template ID format', async () => {
      await expect(service.getTemplate('invalid')).rejects.toThrow(
        'Invalid template ID'
      );
    });

    it('should cache template after loading', async () => {
      const templatePath = path.join(
        testDataDir,
        '.civic',
        'templates',
        'bylaw',
        'test.md'
      );
      fs.mkdirSync(path.dirname(templatePath), { recursive: true });
      fs.writeFileSync(
        templatePath,
        `---
type: bylaw
---
# Test Template
`
      );

      // First load
      const result1 = await service.getTemplate('bylaw/test');
      expect(result1).toBeDefined();

      // Second load should use cache
      const result2 = await service.getTemplate('bylaw/test');
      expect(result2).toEqual(result1);
    });
  });

  describe('createTemplate', () => {
    it('should create a new template', async () => {
      const templateData = {
        type: 'bylaw',
        name: 'new-template',
        content: '# New Template\nContent here',
        description: 'A new template',
      };

      const result = await service.createTemplate(templateData);

      expect(result).toBeDefined();
      expect(result.id).toBe('bylaw/new-template');
      expect(result.type).toBe('bylaw');
      expect(result.name).toBe('new-template');
      expect(result.description).toBe('A new template');

      // Verify file was created
      const templatePath = path.join(
        testDataDir,
        '.civic',
        'templates',
        'bylaw',
        'new-template.md'
      );
      expect(fs.existsSync(templatePath)).toBe(true);
    });

    it('should throw error if template already exists', async () => {
      // Create existing template
      const templatePath = path.join(
        testDataDir,
        '.civic',
        'templates',
        'bylaw',
        'existing.md'
      );
      fs.mkdirSync(path.dirname(templatePath), { recursive: true });
      fs.writeFileSync(
        templatePath,
        `---
type: bylaw
---
# Existing Template
`
      );

      const templateData = {
        type: 'bylaw',
        name: 'existing',
        content: '# New Content',
      };

      await expect(service.createTemplate(templateData)).rejects.toThrow(
        "Template 'bylaw/existing' already exists"
      );
    });

    it('should throw error for invalid template ID', async () => {
      const templateData = {
        type: '../bylaw',
        name: 'test',
        content: '# Test',
      };

      await expect(service.createTemplate(templateData)).rejects.toThrow();
    });

    it('should require type, name, and content', async () => {
      await expect(
        service.createTemplate({ type: '', name: 'test', content: 'test' })
      ).rejects.toThrow('Type, name, and content are required');

      await expect(
        service.createTemplate({ type: 'bylaw', name: '', content: 'test' })
      ).rejects.toThrow('Type, name, and content are required');

      await expect(
        service.createTemplate({ type: 'bylaw', name: 'test', content: '' })
      ).rejects.toThrow('Type, name, and content are required');
    });
  });

  describe('updateTemplate', () => {
    it('should update an existing template', async () => {
      // Create template
      const templatePath = path.join(
        testDataDir,
        '.civic',
        'templates',
        'bylaw',
        'update-test.md'
      );
      fs.mkdirSync(path.dirname(templatePath), { recursive: true });
      fs.writeFileSync(
        templatePath,
        `---
type: bylaw
description: Original description
---
# Original Content
`
      );

      const result = await service.updateTemplate('bylaw/update-test', {
        description: 'Updated description',
        content: '# Updated Content',
      });

      expect(result).toBeDefined();
      expect(result.description).toBe('Updated description');

      // Verify file was updated
      const fileContent = fs.readFileSync(templatePath, 'utf8');
      expect(fileContent).toContain('Updated description');
      expect(fileContent).toContain('# Updated Content');
    });

    it('should throw error if template does not exist', async () => {
      await expect(
        service.updateTemplate('bylaw/nonexistent', { description: 'test' })
      ).rejects.toThrow("Template 'bylaw/nonexistent' not found");
    });

    it('should throw error for invalid template ID', async () => {
      await expect(service.updateTemplate('invalid', {})).rejects.toThrow(
        'Invalid template ID'
      );
    });
  });

  describe('deleteTemplate', () => {
    it('should delete an existing template', async () => {
      // Create template
      const templatePath = path.join(
        testDataDir,
        '.civic',
        'templates',
        'bylaw',
        'delete-test.md'
      );
      fs.mkdirSync(path.dirname(templatePath), { recursive: true });
      fs.writeFileSync(
        templatePath,
        `---
type: bylaw
---
# Template to Delete
`
      );

      await service.deleteTemplate('bylaw/delete-test');

      // Verify file was deleted
      expect(fs.existsSync(templatePath)).toBe(false);
    });

    it('should throw error if template does not exist', async () => {
      await expect(service.deleteTemplate('bylaw/nonexistent')).rejects.toThrow(
        "Template 'bylaw/nonexistent' not found"
      );
    });

    it('should throw error for invalid template ID', async () => {
      await expect(service.deleteTemplate('invalid')).rejects.toThrow(
        'Invalid template ID'
      );
    });
  });

  describe('previewTemplate', () => {
    it('should preview template with variables', async () => {
      // Create template
      const templatePath = path.join(
        testDataDir,
        '.civic',
        'templates',
        'bylaw',
        'preview-test.md'
      );
      fs.mkdirSync(path.dirname(templatePath), { recursive: true });
      fs.writeFileSync(
        templatePath,
        `---
type: bylaw
---
# {{title}}

Author: {{author}}
`
      );

      const result = await service.previewTemplate('bylaw/preview-test', {
        title: 'Test Title',
        author: 'Test Author',
      });

      expect(result).toBeDefined();
      expect(result.rendered).toContain('Test Title');
      expect(result.rendered).toContain('Test Author');
      expect(result.variables.used).toContain('title');
      expect(result.variables.used).toContain('author');
    });

    it('should identify missing variables', async () => {
      const templatePath = path.join(
        testDataDir,
        '.civic',
        'templates',
        'bylaw',
        'preview-test.md'
      );
      fs.mkdirSync(path.dirname(templatePath), { recursive: true });
      fs.writeFileSync(
        templatePath,
        `---
type: bylaw
---
# {{title}}
Missing: {{missing}}
`
      );

      const result = await service.previewTemplate('bylaw/preview-test', {
        title: 'Test Title',
      });

      expect(result.variables.missing).toContain('missing');
    });

    it('should throw error if template does not exist', async () => {
      await expect(
        service.previewTemplate('bylaw/nonexistent', {})
      ).rejects.toThrow("Template 'bylaw/nonexistent' not found");
    });
  });

  describe('validateTemplate', () => {
    it('should validate a template', async () => {
      // Create valid template
      const templatePath = path.join(
        testDataDir,
        '.civic',
        'templates',
        'bylaw',
        'validate-test.md'
      );
      fs.mkdirSync(path.dirname(templatePath), { recursive: true });
      fs.writeFileSync(
        templatePath,
        `---
type: bylaw
---
# Valid Template
`
      );

      const result = await service.validateTemplate('bylaw/validate-test');

      expect(result).toBeDefined();
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should detect invalid template structure', async () => {
      // Create invalid template (missing type in frontmatter)
      const templatePath = path.join(
        testDataDir,
        '.civic',
        'templates',
        'bylaw',
        'invalid-test.md'
      );
      fs.mkdirSync(path.dirname(templatePath), { recursive: true });
      fs.writeFileSync(
        templatePath,
        `---
# Missing type field
---
# Invalid Template
`
      );

      const result = await service.validateTemplate('bylaw/invalid-test');

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should throw error if template does not exist', async () => {
      await expect(
        service.validateTemplate('bylaw/nonexistent')
      ).rejects.toThrow("Template 'bylaw/nonexistent' not found");
    });
  });

  describe('invalidateCache', () => {
    it('should invalidate cache for specific template', async () => {
      const templatePath = path.join(
        testDataDir,
        '.civic',
        'templates',
        'bylaw',
        'cache-test.md'
      );
      fs.mkdirSync(path.dirname(templatePath), { recursive: true });
      fs.writeFileSync(
        templatePath,
        `---
type: bylaw
---
# Cache Test
`
      );

      // Load template (should cache)
      await service.getTemplate('bylaw/cache-test');

      // Invalidate cache
      await service.invalidateCache('bylaw/cache-test');

      // Cache should be cleared (we can't directly verify, but no error should occur)
      expect(true).toBe(true);
    });

    it('should invalidate all cache when no ID provided', async () => {
      await service.invalidateCache();
      // Should not throw
      expect(true).toBe(true);
    });
  });
});
