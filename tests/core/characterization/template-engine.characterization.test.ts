/**
 * Phase 2d W2-T1 — template-engine.ts characterization tests
 *
 * Pins the public-API behaviors of `TemplateEngine` so the W2-T1
 * decomposition (split into types / loader / generator / record-validator
 * files) can't silently change semantics. The existing
 * tests/template-engine.test.ts already covers loadTemplate-with-inheritance
 * and validateRecord-advanced-rules; this file adds coverage for the
 * generator/listing/sanitization surface that decomposition is most
 * likely to touch.
 *
 * What this pins:
 * 1. generateContent variable substitution + smart defaults
 * 2. processConditionalBlocks ({{#if}}...{{/if}})
 * 3. sanitizeVariableValue (XSS hardening — script / iframe / javascript: / event handlers)
 * 4. listTemplates + listPartials discovery
 * 5. getTemplateVariables introspection shape
 * 6. partial loading and parameterized substitution
 * 7. smart-default variable generation (bylaw/policy/resolution numbers, fiscal year)
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TemplateEngine, type Template } from '../../../core/src/utils/template-engine';
import * as fs from 'fs';
import * as path from 'path';

const tempDir = path.join(
  process.cwd(),
  'tests',
  'tmp-template-engine-characterization'
);
const civicTemplatesDir = path.join(tempDir, '.civic', 'templates');
const civicPartialsDir = path.join(tempDir, '.civic', 'partials');

function writeFile(dir: string, filename: string, content: string): void {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, filename), content, 'utf8');
}

function makeTemplate(overrides: Partial<Template> = {}): Template {
  return {
    name: 'default',
    type: 'bylaw',
    validation: {
      required_fields: [],
      status_values: [],
      business_rules: [],
      sections: [],
    },
    sections: [],
    content: '',
    rawContent: '',
    ...overrides,
  };
}

describe('TemplateEngine — generateContent (W2-T1 characterization)', () => {
  let engine: TemplateEngine;

  beforeAll(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
    fs.mkdirSync(tempDir, { recursive: true });
    engine = new TemplateEngine(tempDir);
  });

  afterAll(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('substitutes {{var}} tokens in template content', () => {
    const template = makeTemplate({
      content: '# {{title}}\n\nBy {{author}}',
    });
    const out = engine.generateContent(template, {
      title: 'Test Bylaw',
      author: 'Jane Doe',
    });
    expect(out).toContain('# Test Bylaw');
    expect(out).toContain('By Jane Doe');
  });

  it('handles whitespace around tokens: {{ var }} variants', () => {
    const template = makeTemplate({ content: '{{ title }} {{title}}' });
    const out = engine.generateContent(template, { title: 'X' });
    expect(out).toBe('X X');
  });

  it('applies smart defaults when variables are omitted', () => {
    const template = makeTemplate({
      content: 'status={{status}} version={{version}} author={{author}}',
    });
    const out = engine.generateContent(template, {});
    // status defaults to 'draft', version to '1.0.0', author detected from git or "Unknown Author"
    expect(out).toMatch(/status=draft/);
    expect(out).toMatch(/version=1\.0\.0/);
    expect(out).toMatch(/author=.+/); // some non-empty author string
  });

  it('processes {{#if field}}...{{/if}} blocks when condition truthy', () => {
    const template = makeTemplate({
      content: '{{#if approved}}APPROVED{{/if}}',
    });
    expect(engine.generateContent(template, { approved: true })).toBe(
      'APPROVED'
    );
  });

  it('hides {{#if field}}...{{/if}} blocks when condition falsy', () => {
    const template = makeTemplate({
      content: 'before{{#if approved}}HIDDEN{{/if}}after',
    });
    expect(engine.generateContent(template, { approved: false })).toBe(
      'beforeafter'
    );
  });

  it('processes equality conditions: {{#if status == "approved"}}...{{/if}}', () => {
    const template = makeTemplate({
      content: '{{#if status == "approved"}}YES{{/if}}',
    });
    expect(engine.generateContent(template, { status: 'approved' })).toBe(
      'YES'
    );
    expect(engine.generateContent(template, { status: 'draft' })).toBe('');
  });

  it('processes inequality conditions: {{#if status != "draft"}}...{{/if}}', () => {
    const template = makeTemplate({
      content: '{{#if status != "draft"}}NOT_DRAFT{{/if}}',
    });
    expect(engine.generateContent(template, { status: 'approved' })).toBe(
      'NOT_DRAFT'
    );
    expect(engine.generateContent(template, { status: 'draft' })).toBe('');
  });
});

describe('TemplateEngine — sanitizeVariableValue (XSS hardening, W2-T1 characterization)', () => {
  let engine: TemplateEngine;

  beforeAll(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
    fs.mkdirSync(tempDir, { recursive: true });
    engine = new TemplateEngine(tempDir);
  });

  afterAll(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('strips <script> tags from variable substitutions', () => {
    const template = makeTemplate({ content: '{{evil}}' });
    const out = engine.generateContent(template, {
      evil: '<script>alert("xss")</script>safe',
    });
    expect(out).not.toContain('<script>');
    expect(out).toContain('safe');
  });

  it('strips <iframe> tags from variable substitutions', () => {
    const template = makeTemplate({ content: '{{evil}}' });
    const out = engine.generateContent(template, {
      evil: '<iframe src="x"></iframe>safe',
    });
    expect(out).not.toContain('<iframe');
    expect(out).toContain('safe');
  });

  it('strips javascript: protocol URLs', () => {
    const template = makeTemplate({ content: '{{link}}' });
    const out = engine.generateContent(template, {
      link: 'javascript:alert(1)',
    });
    expect(out).not.toContain('javascript:');
  });

  it('strips on* event handlers (onclick, onerror, ...)', () => {
    const template = makeTemplate({ content: '{{evil}}' });
    const out = engine.generateContent(template, {
      evil: 'onclick="alert(1)" onerror="x"',
    });
    expect(out).not.toMatch(/onclick\s*=/i);
    expect(out).not.toMatch(/onerror\s*=/i);
  });
});

describe('TemplateEngine — listTemplates + listPartials (W2-T1 characterization)', () => {
  let engine: TemplateEngine;

  beforeAll(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
    fs.mkdirSync(tempDir, { recursive: true });
    // Custom templates
    writeFile(
      path.join(civicTemplatesDir, 'bylaw'),
      'default.md',
      '---\n---\n# default'
    );
    writeFile(
      path.join(civicTemplatesDir, 'bylaw'),
      'noise.md',
      '---\n---\n# noise'
    );
    writeFile(path.join(civicTemplatesDir, 'policy'), 'default.md', '---\n---');
    // Custom partials
    writeFile(civicPartialsDir, 'header.md', '---\n---\n# header partial');
    writeFile(civicPartialsDir, 'footer.md', '---\n---\n# footer partial');

    engine = new TemplateEngine(tempDir);
  });

  afterAll(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('lists custom templates by type', () => {
    const bylaws = engine.listTemplates('bylaw');
    expect(bylaws).toContain('default');
    expect(bylaws).toContain('noise');
  });

  it('returns empty list for unknown type', () => {
    expect(engine.listTemplates('does-not-exist')).toEqual([]);
  });

  it('lists custom partials', () => {
    const partials = engine.listPartials();
    expect(partials).toContain('header');
    expect(partials).toContain('footer');
  });
});

describe('TemplateEngine — getTemplateVariables introspection (W2-T1 characterization)', () => {
  it('returns the canonical metadata list', () => {
    const engine = new TemplateEngine('/tmp/civic-tve-introspection');
    const template = makeTemplate({ type: 'bylaw' });
    const vars = engine.getTemplateVariables(template);

    // Pin the shape: must include all categories
    const names = vars.map((v) => v.name);
    // Static
    expect(names).toContain('title');
    expect(names).toContain('type');
    expect(names).toContain('status');
    // Dynamic
    expect(names).toContain('date');
    expect(names).toContain('author');
    expect(names).toContain('version');
    // Type-specific
    expect(names).toContain('bylaw_number');
    expect(names).toContain('policy_number');
    expect(names).toContain('resolution_number');
    expect(names).toContain('fiscal_year');
    // Conditional
    expect(names).toContain('approval_date');
    expect(names).toContain('effective_date');

    // Each entry has the correct shape
    const titleVar = vars.find((v) => v.name === 'title');
    expect(titleVar?.type).toBe('static');
    const dateVar = vars.find((v) => v.name === 'date');
    expect(dateVar?.type).toBe('dynamic');
    const approvalVar = vars.find((v) => v.name === 'approval_date');
    expect(approvalVar?.type).toBe('conditional');
  });
});

describe('TemplateEngine — smart-default variable generators (W2-T1 characterization)', () => {
  let engine: TemplateEngine;

  beforeAll(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
    fs.mkdirSync(tempDir, { recursive: true });
    engine = new TemplateEngine(tempDir);
  });

  afterAll(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('auto-generates a bylaw_number for type=bylaw when missing', () => {
    const template = makeTemplate({
      type: 'bylaw',
      content: 'num={{bylaw_number}}',
    });
    const out = engine.generateContent(template, {});
    expect(out).toMatch(/^num=\d{4}-\d{3}$/);
  });

  it('auto-generates a policy_number for type=policy when missing', () => {
    const template = makeTemplate({
      type: 'policy',
      content: 'num={{policy_number}}',
    });
    const out = engine.generateContent(template, {});
    expect(out).toMatch(/^num=POL-\d{4}-\d{3}$/);
  });

  it('auto-generates a resolution_number for type=resolution when missing', () => {
    const template = makeTemplate({
      type: 'resolution',
      content: 'num={{resolution_number}}',
    });
    const out = engine.generateContent(template, {});
    expect(out).toMatch(/^num=RES-\d{4}-\d{3}$/);
  });

  it('uses caller-provided number over auto-generated', () => {
    const template = makeTemplate({
      type: 'bylaw',
      content: '{{bylaw_number}}',
    });
    const out = engine.generateContent(template, { bylaw_number: 'CUSTOM-1' });
    expect(out).toBe('CUSTOM-1');
  });

  it('auto-fills fiscal_year with current year string', () => {
    const template = makeTemplate({ content: '{{fiscal_year}}' });
    const out = engine.generateContent(template, {});
    expect(out).toBe(String(new Date().getFullYear()));
  });

  it('auto-fills date/created/updated with today (YYYY-MM-DD)', () => {
    const template = makeTemplate({
      content: 'd={{date}} c={{created}} u={{updated}}',
    });
    const out = engine.generateContent(template, {});
    const today = new Date().toISOString().split('T')[0];
    expect(out).toBe(`d=${today} c=${today} u=${today}`);
  });
});

describe('TemplateEngine — partial loading and substitution (W2-T1 characterization)', () => {
  let engine: TemplateEngine;

  beforeAll(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
    fs.mkdirSync(tempDir, { recursive: true });
    writeFile(
      civicPartialsDir,
      'greeting.md',
      `---
parameters: [name]
description: A greeting partial
---
Hello {{name}}!`
    );
    engine = new TemplateEngine(tempDir);
  });

  afterAll(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('substitutes a partial with explicit parameter', () => {
    const template = makeTemplate({
      content: 'Top {{> greeting name=Alice}} Bottom',
    });
    const out = engine.generateContent(template, {});
    expect(out).toContain('Hello Alice!');
    expect(out).toContain('Top ');
    expect(out).toContain(' Bottom');
  });

  it('resolves partial parameter from variables when value matches a var name', () => {
    const template = makeTemplate({
      content: '{{> greeting name=mayor}}',
    });
    // 'mayor' is not a quoted literal — current code first checks if it's a
    // variable; if globalVariables.mayor exists it's used; else taken
    // literally with quotes stripped.
    const out = engine.generateContent(template, { mayor: 'Jane Q.' });
    expect(out).toContain('Hello Jane Q.!');
  });

  it('emits a comment marker when partial does not exist', () => {
    const template = makeTemplate({
      content: '{{> does-not-exist}}',
    });
    const out = engine.generateContent(template, {});
    expect(out).toContain('<!-- Partial not found: does-not-exist -->');
  });

  it('getPartialDetails returns metadata for known partial', () => {
    const detail = engine.getPartialDetails('greeting');
    expect(detail?.name).toBe('greeting');
    expect(detail?.content).toContain('Hello {{name}}');
    expect(detail?.parameters).toEqual(['name']);
    expect(detail?.description).toBe('A greeting partial');
  });

  it('getPartialDetails returns null for unknown partial', () => {
    expect(engine.getPartialDetails('does-not-exist')).toBeNull();
  });
});
