/**
 * TemplateGenerator — extracted from template-engine.ts in Phase 2d W2-T1.
 *
 * Pure-ish content-generation responsibilities: variable substitution,
 * conditional block processing, partial inlining, smart-default variable
 * fills, and XSS-sanitization of substituted values. Takes a partial-
 * loader callback (typically TemplateLoader.loadPartial) so it doesn't
 * carry filesystem state itself.
 */

import { execSync } from 'node:child_process';
import type { Template, TemplateVariable, Partial } from './types.js';

/** `value` as a literal inside a regular expression. */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Replace every `{{ key }}` in `content` with `value`.
 *
 * The key is ESCAPED. It used to be interpolated into the pattern as written,
 * and on the preview route the keys come from the request body: a key of `.*`
 * replaced every placeholder in the template, a key of `a(` threw, and a key
 * with a nested quantifier — `q|([a-z ]+)+!|q` — sent the match exponential
 * against the first long line of ordinary text. One request from anyone with
 * `templates:view` stalled the process.
 *
 * The value is supplied through a FUNCTION. Passed as a string, `$&`, `$'`
 * and `` $` `` in it are replacement patterns: a value could pull the text
 * around its placeholder into the output.
 */
function substitute(content: string, key: string, value: string): string {
  const placeholder = new RegExp(`{{\\s*${escapeRegExp(key)}\\s*}}`, 'g');
  return content.replace(placeholder, () => value);
}

/**
 * Finds `{{<open> … }}` tags in one pass over `content`.
 *
 * This replaces two global regular expressions that did the same job in
 * quadratic time. A pattern of the form `{{>…[^}]*…}}` has to scan from each
 * opening to the next `}` to learn that it does not match, so a body made of
 * openings with no closing cost n² — 2.8 s for 50 KB, measured.
 *
 * Here nothing is scanned twice. A tag cannot contain `}`, so its closing is
 * at the FIRST `}` after its opening, and that position is remembered: every
 * opening before it shares it.
 */
class TagScanner {
  private nextBrace = -1;

  constructor(
    private readonly content: string,
    private readonly open: string
  ) {}

  /** Index of the first `}` at or after `from`, or -1. Never looks back. */
  private firstBraceFrom(from: number): number {
    if (this.nextBrace !== -1 && this.nextBrace >= from) return this.nextBrace;
    if (this.nextBrace === -2) return -1;
    const found = this.content.indexOf('}', from);
    this.nextBrace = found === -1 ? -2 : found;
    return found;
  }

  /**
   * Replace each tag `render` accepts. `render` is given where the text
   * inside the tag starts and ends, and where the content resumes after the
   * closing `}}`; it returns the replacement and the position to continue
   * from, or null to leave the tag as written.
   */
  replace(
    render: (
      innerStart: number,
      innerEnd: number,
      afterClose: number
    ) => { text: string; resume: number } | null
  ): string {
    const { content, open } = this;
    let out = '';
    let position = 0;

    for (;;) {
      const start = content.indexOf(open, position);
      if (start === -1) break;

      const innerStart = start + open.length;
      const brace = this.firstBraceFrom(innerStart);
      if (brace === -1) break;

      const rendered =
        content[brace + 1] === '}'
          ? render(innerStart, brace, brace + 2)
          : null;

      if (rendered) {
        out += content.slice(position, start) + rendered.text;
        position = rendered.resume;
      } else {
        out += content.slice(position, innerStart);
        position = innerStart;
      }
    }

    return out + content.slice(position);
  }
}

/**
 * What `\s+([^}]+)` captured from `content[from, to)`, or null if it did not
 * match. `to` is the closing brace, so the range holds no `}`.
 *
 * The pattern needs at least one whitespace character and then at least one
 * character of anything. Both are greedy, so: the whole leading run of
 * whitespace is skipped — unless the range is nothing BUT whitespace, in which
 * case the pattern gives the last character back to have something to
 * capture. One character of whitespace alone is therefore no match.
 */
function afterWhitespace(
  content: string,
  from: number,
  to: number
): string | null {
  if (to - from < 2 || !/\s/.test(content[from])) return null;

  let index = from;
  while (index < to && /\s/.test(content[index])) index++;
  return index === to ? content[to - 1] : content.slice(index, to);
}

const NAME_CHARACTER = /[a-zA-Z0-9_-]/;

export class TemplateGenerator {
  constructor(private partialLoader: (name: string) => Partial | null) {}

  /**
   * Generate content from template with variables
   */
  generateContent(
    template: Template,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    variables: Record<string, any> = {}
  ): string {
    let content = template.content;

    const processedVariables = this.processTemplateVariables(
      variables,
      template
    );

    // Process partials first
    content = this.processPartials(content, processedVariables);

    // Replace variables in content (with sanitization to prevent injection)
    for (const [key, value] of Object.entries(processedVariables)) {
      const sanitizedValue = this.sanitizeVariableValue(String(value || ''));
      content = substitute(content, key, sanitizedValue);
    }

    // Process conditional blocks
    content = this.processConditionalBlocks(content, processedVariables);

    return content;
  }

  /**
   * Get available template variables (metadata)
   */
  getTemplateVariables(_template: Template): TemplateVariable[] {
    return [
      // Static
      { name: 'title', type: 'static', description: 'Record title' },
      { name: 'type', type: 'static', description: 'Record type' },
      { name: 'status', type: 'static', description: 'Record status' },
      { name: 'author', type: 'dynamic', description: 'Record author' },
      { name: 'version', type: 'dynamic', description: 'Record version' },
      // Dynamic
      { name: 'date', type: 'dynamic', description: 'Current date' },
      { name: 'created', type: 'dynamic', description: 'Creation date' },
      { name: 'updated', type: 'dynamic', description: 'Last updated date' },
      // Type-specific
      { name: 'bylaw_number', type: 'dynamic', description: 'Bylaw number' },
      { name: 'policy_number', type: 'dynamic', description: 'Policy number' },
      {
        name: 'resolution_number',
        type: 'dynamic',
        description: 'Resolution number',
      },
      { name: 'fiscal_year', type: 'dynamic', description: 'Fiscal year' },
      // Conditional
      {
        name: 'approval_date',
        type: 'conditional',
        description: 'Approval date (when status is approved)',
      },
      {
        name: 'approved_by',
        type: 'conditional',
        description: 'Approver name (when status is approved)',
      },
      {
        name: 'approval_meeting',
        type: 'conditional',
        description: 'Approval meeting (when status is approved)',
      },
      {
        name: 'effective_date',
        type: 'conditional',
        description: 'Effective date (when status is active)',
      },
      {
        name: 'implementation_notes',
        type: 'conditional',
        description: 'Implementation notes (when status is active)',
      },
    ];
  }

  // ----- partials -----

  private processPartials(
    content: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    variables: Record<string, any>
  ): string {
    // `{{>` name [parameters] `}}` — what `/{{>\s*([a-zA-Z0-9_-]+)(?:\s+([^}]+))?}}/`
    // matched, including that `{{> name }}`, with a single space before the
    // braces, does not: the optional group needs a character after the space,
    // and without the group the name has to be followed by `}}` directly.
    // Preserved, not endorsed.
    return new TagScanner(content, '{{>').replace(
      (innerStart, innerEnd, afterClose) => {
        let index = innerStart;
        while (index < innerEnd && /\s/.test(content[index])) index++;
        const nameStart = index;
        while (index < innerEnd && NAME_CHARACTER.test(content[index])) index++;
        if (index === nameStart) return null;

        const partialName = content.slice(nameStart, index);
        let params: string | undefined;
        if (index < innerEnd) {
          const captured = afterWhitespace(content, index, innerEnd);
          if (captured === null) return null;
          params = captured;
        }

        const partial = this.partialLoader(partialName);
        if (!partial) {
          return {
            text: `<!-- Partial not found: ${partialName} -->`,
            resume: afterClose,
          };
        }

        const partialVariables = this.parsePartialParameters(params, variables);

        let partialContent = partial.content;
        for (const [key, value] of Object.entries(partialVariables)) {
          partialContent = substitute(partialContent, key, String(value || ''));
        }

        partialContent = this.processConditionalBlocks(
          partialContent,
          partialVariables
        );

        return { text: partialContent, resume: afterClose };
      }
    );
  }

  private parsePartialParameters(
    paramsString: string | undefined,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    globalVariables: Record<string, any>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ): Record<string, any> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const partialVariables: Record<string, any> = {};

    if (!paramsString) return partialVariables;

    const paramRegex = /(\w+)=([^\s]+)/g;
    let match;
    while ((match = paramRegex.exec(paramsString)) !== null) {
      const [, paramName, paramValue] = match;
      if (globalVariables[paramValue]) {
        partialVariables[paramName] = globalVariables[paramValue];
      } else {
        partialVariables[paramName] = paramValue.replace(/['"]/g, '');
      }
    }

    return partialVariables;
  }

  // ----- variable processing -----

  private processTemplateVariables(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    variables: Record<string, any>,
    template: Template
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ): Record<string, any> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const processed: Record<string, any> = { ...variables };

    if (!processed.date && !processed.created) {
      processed.date = new Date().toISOString().split('T')[0];
      processed.created = processed.date;
    }

    if (!processed.updated) {
      processed.updated = processed.date;
    }

    if (!processed.author) {
      processed.author = this.detectAuthor();
    }

    if (!processed.version) {
      processed.version = '1.0.0';
    }

    if (!processed.status) {
      processed.status = 'draft';
    }

    if (template.type === 'bylaw' && !processed.bylaw_number) {
      processed.bylaw_number = this.generateBylawNumber();
    }

    if (template.type === 'policy' && !processed.policy_number) {
      processed.policy_number = this.generatePolicyNumber();
    }

    if (template.type === 'resolution' && !processed.resolution_number) {
      processed.resolution_number = this.generateResolutionNumber();
    }

    if (!processed.fiscal_year) {
      const currentYear = new Date().getFullYear();
      processed.fiscal_year = currentYear.toString();
    }

    return processed;
  }

  // ----- conditionals -----

  private processConditionalBlocks(
    content: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    variables: Record<string, any>
  ): string {
    // `{{#if <condition>}}…{{/if}}`, to the FIRST `{{/if}}` — blocks do not
    // nest, and did not before.
    const END = '{{/if}}';
    // Once a search for the ending has failed, every later one will.
    let noMoreEndings = false;

    return new TagScanner(content, '{{#if').replace(
      (innerStart, innerEnd, afterClose) => {
        const condition = afterWhitespace(content, innerStart, innerEnd);
        if (condition === null || noMoreEndings) return null;

        const end = content.indexOf(END, afterClose);
        if (end === -1) {
          noMoreEndings = true;
          return null;
        }

        const blockContent = content.slice(afterClose, end);
        return {
          text: this.evaluateCondition(condition, variables)
            ? blockContent
            : '',
          resume: end + END.length,
        };
      }
    );
  }

  private evaluateCondition(
    condition: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    variables: Record<string, any>
  ): boolean {
    // Supports: field, !field, field == 'value', field != 'value'
    // Split on the operator, then trim — not `/\s*(==|!=)\s*/`, which is
    // quadratic in a run of spaces that no operator follows.
    const parts = condition
      .trim()
      .split(/(==|!=)/)
      .map((part) => part.trim());

    if (parts.length === 1) {
      const field = parts[0].replace(/^!/, '');
      const value = variables[field];
      const isNegated = parts[0].startsWith('!');

      if (isNegated) {
        return !value || value === '' || value === null || value === undefined;
      }
      return !!value && value !== '' && value !== null && value !== undefined;
    } else if (parts.length === 3) {
      const field = parts[0].trim();
      const operator = parts[1];
      const expectedValue = parts[2].replace(/['"]/g, '');
      const actualValue = variables[field];

      if (operator === '==') return String(actualValue) === expectedValue;
      if (operator === '!=') return String(actualValue) !== expectedValue;
    }

    return false;
  }

  // ----- smart defaults -----

  private detectAuthor(): string {
    try {
      const gitName = execSync('git config user.name', {
        encoding: 'utf8',
      }).trim();
      const gitEmail = execSync('git config user.email', {
        encoding: 'utf8',
      }).trim();
      return `${gitName} <${gitEmail}>`;
    } catch {
      return 'Unknown Author';
    }
  }

  private generateBylawNumber(): string {
    const year = new Date().getFullYear();
    const random = Math.floor(Math.random() * 999) + 1;
    return `${year}-${random.toString().padStart(3, '0')}`;
  }

  private generatePolicyNumber(): string {
    const year = new Date().getFullYear();
    const random = Math.floor(Math.random() * 999) + 1;
    return `POL-${year}-${random.toString().padStart(3, '0')}`;
  }

  private generateResolutionNumber(): string {
    const year = new Date().getFullYear();
    const random = Math.floor(Math.random() * 999) + 1;
    return `RES-${year}-${random.toString().padStart(3, '0')}`;
  }

  // ----- sanitization -----

  /**
   * Sanitize variable value to prevent code injection in template
   * substitution output. Strips script/iframe tags, javascript: protocol,
   * and on* event handlers.
   */
  private sanitizeVariableValue(value: string): string {
    if (!value) return '';

    let sanitized = value.replace(
      /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
      ''
    );
    sanitized = sanitized.replace(
      /<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi,
      ''
    );
    sanitized = sanitized.replace(/javascript:/gi, '');
    sanitized = sanitized.replace(/on\w+\s*=/gi, '');

    return sanitized;
  }
}
