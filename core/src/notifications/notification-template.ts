export interface TemplateData {
  [key: string]: any;
}

export interface ProcessedTemplate {
  subject?: string;
  body: string;
  html?: string;
  text?: string;
}

export abstract class NotificationTemplate {
  protected name: string;
  protected template: string;
  protected variables: string[];

  constructor(name: string, template: string) {
    this.name = name;
    this.template = template;
    this.variables = this.extractVariables(template);
  }

  /**
   * Process template with data
   */
  abstract process(data: TemplateData): Promise<ProcessedTemplate>;

  /**
   * Get template name
   */
  getName(): string {
    return this.name;
  }

  /**
   * Get template variables
   */
  getVariables(): string[] {
    return this.variables;
  }

  /**
   * Validate template data
   */
  validateData(data: TemplateData): boolean {
    const requiredVars = this.variables.filter(
      (v) => !v.startsWith('optional_')
    );
    return requiredVars.every((v) => data[v] !== undefined);
  }

  /**
   * Extract variables from template
   */
  protected extractVariables(template: string): string[] {
    const variableRegex = /\{\{([^}]+)\}\}/g;
    const variables = new Set<string>();
    let match;

    while ((match = variableRegex.exec(template)) !== null) {
      const varName = match[1].trim();
      if (varName.startsWith('optional_')) {
        variables.add(varName);
      } else {
        variables.add(varName);
      }
    }

    return Array.from(variables);
  }

  /**
   * Replace variables in template
   */
  protected replaceVariables(template: string, data: TemplateData): string {
    return template.replace(/\{\{([^}]+)\}\}/g, (match, varName) => {
      const key = varName.trim();
      const value = data[key];

      if (value === undefined) {
        if (key.startsWith('optional_')) {
          return ''; // Remove optional variables if not provided
        }
        throw new Error(`Missing required template variable: ${key}`);
      }

      return String(value);
    });
  }

  /**
   * Sanitize HTML content
   */
  protected sanitizeHtml(html: string): string {
    // Basic HTML sanitization - in production, use a proper HTML sanitizer
    return html
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
      .replace(/javascript:/gi, '')
      .replace(/on\w+\s*=/gi, '');
  }

  /**
   * Convert HTML to plain text
   */
  protected htmlToText(html: string): string {
    return html
      .replace(/<[^>]*>/g, '') // Remove HTML tags
      .replace(/&nbsp;/g, ' ') // Replace &nbsp; with space
      .replace(/&amp;/g, '&') // Replace &amp; with &
      .replace(/&lt;/g, '<') // Replace &lt; with <
      .replace(/&gt;/g, '>') // Replace &gt; with >
      .replace(/&quot;/g, '"') // Replace &quot; with "
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim();
  }
}
