/**
 * TemplateLoader — extracted from template-engine.ts in Phase 2d W2-T1.
 *
 * Owns filesystem access for templates and partials: discovery (listing),
 * load by name (with inheritance), and merge logic for parent/child
 * templates. State: path roots only (custom + base).
 */

import * as fs from 'fs';
import * as path from 'path';
import matter from 'gray-matter';
import type {
  Template,
  TemplateValidation,
  TemplateSection,
  Partial,
} from './types.js';

export class TemplateLoader {
  private baseTemplatePath: string;
  private customTemplatePath: string;
  private partialsPath: string;

  constructor(dataDir: string) {
    this.baseTemplatePath = path.join(
      process.cwd(),
      '.system-data',
      'templates'
    );
    this.customTemplatePath = path.join(dataDir, '.civic', 'templates');
    this.partialsPath = path.join(dataDir, '.civic', 'partials');
  }

  /**
   * Load a template by type and name with inheritance support
   */
  async loadTemplate(
    type: string,
    templateName: string = 'default'
  ): Promise<Template | null> {
    const customPath = path.join(
      this.customTemplatePath,
      type,
      `${templateName}.md`
    );
    if (fs.existsSync(customPath)) {
      return this.parseTemplateWithInheritance(customPath, type, templateName);
    }

    const basePath = path.join(
      this.baseTemplatePath,
      type,
      `${templateName}.md`
    );
    if (fs.existsSync(basePath)) {
      return this.parseTemplateWithInheritance(basePath, type, templateName);
    }

    return null;
  }

  private async parseTemplateWithInheritance(
    filePath: string,
    type: string,
    name: string
  ): Promise<Template> {
    const content = fs.readFileSync(filePath, 'utf8');
    const { data: frontmatter, content: markdownContent } = matter(content);

    const template: Template = {
      name,
      type,
      extends: frontmatter.extends,
      validation: frontmatter.validation || {},
      sections: frontmatter.sections || [],
      content: markdownContent,
      rawContent: content,
    };

    if (template.extends) {
      const parentTemplate = await this.loadParentTemplate(template.extends);
      if (parentTemplate) {
        template.parentTemplate = parentTemplate;
        return this.mergeTemplates(parentTemplate, template);
      }
    }

    return template;
  }

  private async loadParentTemplate(
    extendsPath: string
  ): Promise<Template | null> {
    const [parentType, parentName] = extendsPath.split('/');

    const customParentPath = path.join(
      this.customTemplatePath,
      parentType,
      `${parentName}.md`
    );
    if (fs.existsSync(customParentPath)) {
      return this.parseTemplateWithInheritance(
        customParentPath,
        parentType,
        parentName
      );
    }

    const baseParentPath = path.join(
      this.baseTemplatePath,
      parentType,
      `${parentName}.md`
    );
    if (fs.existsSync(baseParentPath)) {
      return this.parseTemplateWithInheritance(
        baseParentPath,
        parentType,
        parentName
      );
    }

    return null;
  }

  private mergeTemplates(parent: Template, child: Template): Template {
    return {
      name: child.name,
      type: child.type,
      extends: child.extends,
      validation: this.mergeValidation(parent.validation, child.validation),
      sections: this.mergeSections(parent.sections, child.sections),
      content: child.content || parent.content,
      rawContent: child.rawContent,
      parentTemplate: parent,
    };
  }

  private mergeValidation(
    parent: TemplateValidation,
    child: TemplateValidation
  ): TemplateValidation {
    return {
      required_fields: [
        ...(parent.required_fields || []),
        ...(child.required_fields || []),
      ],
      status_values: child.status_values || parent.status_values || [],
      business_rules: [
        ...(parent.business_rules || []),
        ...(child.business_rules || []),
      ],
      sections: this.mergeSections(parent.sections || [], child.sections || []),
      advanced_rules: [
        ...(parent.advanced_rules || []),
        ...(child.advanced_rules || []),
      ],
      field_relationships: [
        ...(parent.field_relationships || []),
        ...(child.field_relationships || []),
      ],
      custom_validators: [
        ...(parent.custom_validators || []),
        ...(child.custom_validators || []),
      ],
    };
  }

  private mergeSections(
    parentSections: TemplateSection[],
    childSections: TemplateSection[]
  ): TemplateSection[] {
    const merged = new Map<string, TemplateSection>();
    for (const section of parentSections) {
      merged.set(section.name, { ...section });
    }
    for (const section of childSections) {
      merged.set(section.name, { ...section });
    }
    return Array.from(merged.values());
  }

  /**
   * List available templates for a type
   */
  listTemplates(type: string): string[] {
    const templates: string[] = [];

    const customTypePath = path.join(this.customTemplatePath, type);
    if (fs.existsSync(customTypePath)) {
      const files = fs.readdirSync(customTypePath);
      for (const file of files) {
        if (file.endsWith('.md')) {
          templates.push(file.replace('.md', ''));
        }
      }
    }

    const baseTypePath = path.join(this.baseTemplatePath, type);
    if (fs.existsSync(baseTypePath)) {
      const files = fs.readdirSync(baseTypePath);
      for (const file of files) {
        if (file.endsWith('.md')) {
          const templateName = file.replace('.md', '');
          if (!templates.includes(templateName)) {
            templates.push(templateName);
          }
        }
      }
    }

    return templates;
  }

  /**
   * Load a partial by name
   */
  loadPartial(partialName: string): Partial | null {
    try {
      const customPartialPath = path.join(
        this.partialsPath,
        `${partialName}.md`
      );
      if (fs.existsSync(customPartialPath)) {
        const content = fs.readFileSync(customPartialPath, 'utf8');
        const { data: frontmatter, content: markdownContent } = matter(content);
        return {
          name: partialName,
          content: markdownContent,
          parameters: frontmatter.parameters || [],
          description: frontmatter.description || '',
        };
      }

      const basePartialPath = path.join(
        this.baseTemplatePath,
        'partials',
        `${partialName}.md`
      );
      if (fs.existsSync(basePartialPath)) {
        const content = fs.readFileSync(basePartialPath, 'utf8');
        const { data: frontmatter, content: markdownContent } = matter(content);
        return {
          name: partialName,
          content: markdownContent,
          parameters: frontmatter.parameters || [],
          description: frontmatter.description || '',
        };
      }

      return null;
    } catch {
      return null;
    }
  }

  /**
   * List available partials
   */
  listPartials(): string[] {
    const partials: string[] = [];

    try {
      if (fs.existsSync(this.partialsPath)) {
        const files = fs.readdirSync(this.partialsPath);
        for (const file of files) {
          if (file.endsWith('.md')) {
            partials.push(file.replace('.md', ''));
          }
        }
      }

      const basePartialsPath = path.join(this.baseTemplatePath, 'partials');
      if (fs.existsSync(basePartialsPath)) {
        const files = fs.readdirSync(basePartialsPath);
        for (const file of files) {
          if (file.endsWith('.md')) {
            const partialName = file.replace('.md', '');
            if (!partials.includes(partialName)) {
              partials.push(partialName);
            }
          }
        }
      }
    } catch {
      // Ignore errors if directories don't exist
    }

    return partials;
  }
}
