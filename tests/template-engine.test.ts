import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TemplateEngine } from '../core/src/utils/template-engine';
import * as fs from 'fs';
import * as path from 'path';

// Helper to create a temporary template directory structure
const tempDir = path.join(process.cwd(), 'tests', 'tmp-templates');
const civicDir = path.join(tempDir, '.civic', 'templates');

function writeTemplate(type: string, name: string, content: string) {
  const dir = path.join(civicDir, type);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${name}.md`), content, 'utf8');
}

describe('TemplateEngine inheritance', () => {
  beforeAll(() => {
    // Clean and set up temp template directory
    if (fs.existsSync(tempDir))
      fs.rmSync(tempDir, { recursive: true, force: true });
    fs.mkdirSync(tempDir, { recursive: true });
    // Base template
    writeTemplate(
      'bylaw',
      'base',
      `---
template: bylaw/base
validation:
  required_fields: [title, type, status]
  business_rules: ["must have title"]
  sections:
    - name: header
      required: true
    - name: content
      required: true
sections:
  - name: header
    required: true
  - name: content
    required: true
---

# {{title}}
\n{{content}}
`
    );
    // Child template
    writeTemplate(
      'bylaw',
      'child',
      `---
extends: bylaw/base
validation:
  required_fields: [child_field]
  business_rules: ["must have child_field"]
  sections:
    - name: child_section
      required: true
sections:
  - name: child_section
    required: true
---

# {{title}} (Child)
\n{{content}}
\n{{child_section}}
`
    );
    // Grandchild template
    writeTemplate(
      'bylaw',
      'grandchild',
      `---
extends: bylaw/child
validation:
  required_fields: [grandchild_field]
  business_rules: ["must have grandchild_field"]
sections:
  - name: grandchild_section
    required: true
---

# {{title}} (Grandchild)
\n{{content}}
\n{{child_section}}
\n{{grandchild_section}}
`
    );
  });

  afterAll(() => {
    // Clean up temp directory
    if (fs.existsSync(tempDir))
      fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('loads base template', async () => {
    const engine = new TemplateEngine(tempDir);
    const tpl = await engine.loadTemplate('bylaw', 'base');
    expect(tpl).toBeTruthy();
    expect(tpl?.validation.required_fields).toContain('title');
    expect(tpl?.sections.some((s) => s.name === 'header')).toBe(true);
    expect(tpl?.content).toContain('{{title}}');
  });

  it('loads child template and merges with base', async () => {
    const engine = new TemplateEngine(tempDir);
    const tpl = await engine.loadTemplate('bylaw', 'child');
    expect(tpl).toBeTruthy();
    // Inherited from base
    expect(tpl?.validation.required_fields).toContain('title');
    // Own field
    expect(tpl?.validation.required_fields).toContain('child_field');
    // Inherited section
    expect(tpl?.sections.some((s) => s.name === 'header')).toBe(true);
    // Own section
    expect(tpl?.sections.some((s) => s.name === 'child_section')).toBe(true);
    // Content override
    expect(tpl?.content).toContain('(Child)');
  });

  it('loads grandchild template and merges all levels', async () => {
    const engine = new TemplateEngine(tempDir);
    const tpl = await engine.loadTemplate('bylaw', 'grandchild');
    expect(tpl).toBeTruthy();
    // Inherited from base
    expect(tpl?.validation.required_fields).toContain('title');
    // Inherited from child
    expect(tpl?.validation.required_fields).toContain('child_field');
    // Own field
    expect(tpl?.validation.required_fields).toContain('grandchild_field');
    // All sections
    expect(tpl?.sections.some((s) => s.name === 'header')).toBe(true);
    expect(tpl?.sections.some((s) => s.name === 'child_section')).toBe(true);
    expect(tpl?.sections.some((s) => s.name === 'grandchild_section')).toBe(
      true
    );
    // Content override
    expect(tpl?.content).toContain('(Grandchild)');
  });
});

describe('TemplateEngine advanced validation', () => {
  beforeAll(() => {
    // Clean and set up temp template directory
    if (fs.existsSync(tempDir))
      fs.rmSync(tempDir, { recursive: true, force: true });
    fs.mkdirSync(tempDir, { recursive: true });

    // Advanced template with validation rules
    writeTemplate(
      'bylaw',
      'advanced',
      `---
template: bylaw/advanced
validation:
  required_fields: [title, type, status, author, version]
  advanced_rules:
    - name: "approval_workflow"
      condition: "status == 'approved'"
      fields: [approval_date, approved_by]
      rule: "approved_by_authority"
      severity: "error"
      message: "Approved bylaws must have approval details"
    - name: "date_sequence_validation"
      fields: [approval_date, effective_date]
      rule: "date_sequence"
      severity: "error"
      message: "Approval date must be before effective date"
    - name: "content_quality_check"
      fields: [purpose]
      rule: "content_quality"
      severity: "warning"
      message: "Content should be complete and professional"
  field_relationships:
    - name: "approval_required_together"
      type: "required_together"
      fields: [approval_date, approved_by]
      condition: "status == 'approved'"
      message: "Both approval date and approver must be specified"
    - name: "mutually_exclusive_contacts"
      type: "mutually_exclusive"
      fields: [contact_email, contact_phone]
      message: "Specify either email or phone contact, not both"
  custom_validators:
    - name: "email_validation"
      field: "contact_email"
      validator: "email"
      message: "Contact email must be a valid email address"
    - name: "version_validation"
      field: "version"
      validator: "semantic_version"
      message: "Version must be in semantic format (x.y.z)"
    - name: "conditional_approval_meeting"
      field: "approval_meeting"
      validator: "required_if"
      params: ["status", "approved"]
      message: "Approval meeting must be specified for approved bylaws"
sections:
  - name: header
    required: true
---

# {{title}}
**Type:** {{type}}  
**Status:** {{status}}  
**Author:** {{author}}  
**Version:** {{version}}

{{#if status == 'approved'}} **Approved:** {{approval_date}}  
**By:** {{approved_by}} {{/if}}

## Purpose
{{purpose}}
`
    );
  });

  afterAll(() => {
    // Clean up temp directory
    if (fs.existsSync(tempDir))
      fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('loads advanced template with validation rules', async () => {
    const engine = new TemplateEngine(tempDir);
    const tpl = await engine.loadTemplate('bylaw', 'advanced');
    expect(tpl).toBeTruthy();
    expect(tpl?.validation.advanced_rules).toHaveLength(3);
    expect(tpl?.validation.field_relationships).toHaveLength(2);
    expect(tpl?.validation.custom_validators).toHaveLength(3);
  });

  it('validates advanced rules correctly', async () => {
    const engine = new TemplateEngine(tempDir);
    const tpl = await engine.loadTemplate('bylaw', 'advanced');

    // Create a test record file
    const testRecordPath = path.join(tempDir, 'test-record.md');
    const testRecord = `---
title: Test Bylaw
type: bylaw
status: approved
author: Test Author
version: 1.0.0
approval_date: 2024-01-15
effective_date: 2024-01-20
approved_by: Test Approver
purpose: This is a test purpose with sufficient content to pass quality checks.
contact_email: test@example.com
contact_phone: 555-1234
---

# Test Bylaw

## Purpose
This is a test purpose with sufficient content to pass quality checks.
`;

    fs.writeFileSync(testRecordPath, testRecord, 'utf8');

    const result = await engine.validateRecord(testRecordPath, tpl!);

    // Should have warnings for field relationships and custom validators
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings.some((w) => w.includes('contact'))).toBe(true);
    expect(result.warnings.some((w) => w.includes('meeting'))).toBe(true);

    // Should be valid overall
    expect(result.valid).toBe(true);
  });

  it('validates field relationships correctly', async () => {
    const engine = new TemplateEngine(tempDir);
    const tpl = await engine.loadTemplate('bylaw', 'advanced');

    // Test record with missing approval_by when status is approved
    const testRecordPath = path.join(tempDir, 'test-record-invalid.md');
    const testRecord = `---
title: Test Bylaw
type: bylaw
status: approved
author: Test Author
version: 1.0.0
approval_date: 2024-01-15
purpose: This is a test purpose.
---

# Test Bylaw

## Purpose
This is a test purpose.
`;

    fs.writeFileSync(testRecordPath, testRecord, 'utf8');

    const result = await engine.validateRecord(testRecordPath, tpl!);

    // Should have warnings for missing approval_by
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings.some((w) => w.includes('approval'))).toBe(true);
  });

  it('validates custom validators correctly', async () => {
    const engine = new TemplateEngine(tempDir);
    const tpl = await engine.loadTemplate('bylaw', 'advanced');

    // Test record with invalid email
    const testRecordPath = path.join(tempDir, 'test-record-invalid-email.md');
    const testRecord = `---
title: Test Bylaw
type: bylaw
status: draft
author: Test Author
version: 1.0.0
contact_email: invalid-email
purpose: This is a test purpose.
---

# Test Bylaw

## Purpose
This is a test purpose.
`;

    fs.writeFileSync(testRecordPath, testRecord, 'utf8');

    const result = await engine.validateRecord(testRecordPath, tpl!);

    // Should have warnings for invalid email
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings.some((w) => w.includes('email'))).toBe(true);
  });
});
