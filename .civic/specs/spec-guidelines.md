# 📄 CivicPress Spec: `spec-guidelines.md`

---
version: 1.0.0
status: stable
created: '2025-07-04'
updated: '2025-07-04'
deprecated: false
sunset_date: null
breaking_changes: []
additions:

- standardized spec format
- metadata fields
- authorship tracking
fixes: []
migration_guide: null
compatibility:
  min_civicpress: 1.0.0
  max_civicpress: null
  dependencies: []
authors:
- Sophie Germain <sophie@civic-press.org>
reviewers:
- Ada Lovelace
- Tim Berners-Lee

---

## 📛 Name

`spec-guidelines.md`

---

## 🎯 Purpose

This specification defines the **standard format** for all CivicPress `.md`
specs, ensuring consistent documentation, machine-readability, and long-term
traceability.

---

## 🧩 Scope & Responsibilities

✅ Responsibilities:

- Define the required structure and metadata for all CivicPress spec files
- Ensure all specs are human-readable and machine-parseable
- Provide guidance for authorship, versioning, and changelog practices
- Serve as the canonical reference for spec formatting and compliance
- Establish validation rules and compliance checking
- Define spec template and boilerplate generation

❌ Out of Scope:

- Content guidelines for specific spec topics
- Implementation details of spec processing
- Third-party documentation format standards

---

## 🔗 Inputs & Outputs

| Input                    | Description                           |
| ------------------------ | ------------------------------------- |
| Spec content             | Raw specification content and metadata |
| Format requirements       | Structure and formatting rules |
| Validation rules         | Compliance and quality standards |
| Template definitions      | Boilerplate and structure templates |
| Author information        | Contributor and reviewer details |

| Output                   | Description                           |
| ------------------------ | ------------------------------------- |
| Formatted specs          | Properly structured specification files |
| Validation reports       | Compliance and quality assessment |
| Template files           | Reusable spec templates and boilerplates |
| Style guides             | Formatting and documentation standards |
| Compliance checkers      | Automated validation tools |

---

## 📂 File/Folder Location

```
.civic/
├── spec-guidelines.yml    # Guidelines configuration
├── templates/             # Spec templates
│   ├── basic-spec.md
│   ├── module-spec.md
│   └── api-spec.md
├── validators/            # Validation rules
│   ├── format-validator.yml
│   ├── metadata-validator.yml
│   └── structure-validator.yml
└── style-guides/          # Style documentation
    ├── markdown-style.yml
    ├── metadata-style.yml
    └── content-style.yml

core/
├── spec-guidelines.ts     # Guidelines enforcement
├── spec-validator.ts      # Spec validation logic
├── template-generator.ts  # Template generation
└── format-checker.ts      # Format compliance checking

modules/
├── spec-guidelines/
│   ├── components/
│   │   ├── SpecValidator.tsx # Validation UI
│   │   ├── TemplateGenerator.tsx # Template creation
│   │   └── FormatChecker.tsx # Format checking
│   ├── hooks/
│   │   └── useSpecGuidelines.ts # Guidelines data hook
│   └── utils/
│       ├── format-parser.ts # Format parsing utilities
│       └── template-engine.ts # Template processing
└── ui/
    └── components/
        └── SpecGuidelinesProvider.tsx # Guidelines context provider

tests/
├── spec-guidelines/
│   ├── format-validation.test.ts
│   ├── template-generation.test.ts
│   └── compliance-checking.test.ts
└── integration/
    └── spec-guidelines-integration.test.ts
```

---

## 🧪 Testing & Validation

### Format Validation Testing

```typescript
// Test spec format compliance
export class SpecFormatValidationTests {
  async testFormatCompliance(): Promise<TestResult[]> {
    return [
      await this.testYAMLFrontmatter(),
      await this.testRequiredSections(),
      await this.testMetadataValidation(),
      await this.testEmojiHeaders(),
      await this.testMarkdownStandards(),
    ];
  }

  private async testYAMLFrontmatter(): Promise<TestResult> {
    const testSpecs = [
      { name: 'Valid Spec', content: this.getValidSpecContent(), expected: true },
      { name: 'Missing Frontmatter', content: '# Test\nNo frontmatter', expected: false },
      { name: 'Invalid YAML', content: this.getInvalidYAMLContent(), expected: false },
    ];

    const results = await Promise.all(
      testSpecs.map(spec => this.validateYAMLFrontmatter(spec.content))
    );

    const passed = results.every((r, i) => r.valid === testSpecs[i].expected);
    
    return {
      test: 'YAML Frontmatter Validation',
      passed,
      details: { testSpecs, results },
    };
  }

  private async testRequiredSections(): Promise<TestResult> {
    const requiredSections = [
      'Name', 'Purpose', 'Scope & Responsibilities', 
      'Inputs & Outputs', 'File/Folder Location', 
      'Security & Trust Considerations'
    ];

    const specContent = this.getTestSpecContent();
    const missingSections = requiredSections.filter(section => 
      !specContent.includes(`## ${section}`)
    );

    return {
      test: 'Required Sections',
      passed: missingSections.length === 0,
      details: { requiredSections, missingSections },
    };
  }

  private async testMetadataValidation(): Promise<TestResult> {
    const metadataTests = [
      { field: 'version', value: '1.0.0', expected: true },
      { field: 'version', value: 'invalid', expected: false },
      { field: 'status', value: 'stable', expected: true },
      { field: 'status', value: 'invalid-status', expected: false },
      { field: 'authors', value: ['Author Name'], expected: true },
      { field: 'authors', value: [], expected: false },
    ];

    const results = await Promise.all(
      metadataTests.map(test => this.validateMetadataField(test.field, test.value))
    );

    const passed = results.every((r, i) => r.valid === metadataTests[i].expected);

    return {
      test: 'Metadata Validation',
      passed,
      details: { metadataTests, results },
    };
  }
}
```

### Template Generation Testing

```typescript
// Test template generation and validation
export class TemplateGenerationTests {
  async testTemplateGeneration(): Promise<TestResult[]> {
    return [
      await this.testBasicTemplateGeneration(),
      await this.testModuleTemplateGeneration(),
      await this.testAPITemplateGeneration(),
      await this.testTemplateValidation(),
    ];
  }

  private async testBasicTemplateGeneration(): Promise<TestResult> {
    const template = await this.generateBasicTemplate({
      name: 'test-spec',
      purpose: 'Test specification',
      author: 'Test Author',
    });

    const validation = await this.validateGeneratedSpec(template);
    const hasRequiredSections = this.checkRequiredSections(template);

    return {
      test: 'Basic Template Generation',
      passed: validation.valid && hasRequiredSections,
      details: { template, validation, hasRequiredSections },
    };
  }

  private async testTemplateValidation(): Promise<TestResult> {
    const templates = [
      await this.generateBasicTemplate({}),
      await this.generateModuleTemplate({}),
      await this.generateAPITemplate({}),
    ];

    const validations = await Promise.all(
      templates.map(template => this.validateGeneratedSpec(template))
    );

    const allValid = validations.every(v => v.valid);

    return {
      test: 'Template Validation',
      passed: allValid,
      details: { templates, validations },
    };
  }
}
```

### Compliance Checking Testing

```typescript
// Test compliance checking functionality
export class ComplianceCheckingTests {
  async testComplianceChecking(): Promise<TestResult[]> {
    return [
      await this.testFormatCompliance(),
      await this.testStyleGuideCompliance(),
      await this.testMetadataCompliance(),
      await this.testContentCompliance(),
    ];
  }

  private async testFormatCompliance(): Promise<TestResult> {
    const testSpecs = [
      { name: 'Compliant Spec', content: this.getCompliantSpec(), expected: true },
      { name: 'Non-Compliant Spec', content: this.getNonCompliantSpec(), expected: false },
    ];

    const results = await Promise.all(
      testSpecs.map(spec => this.checkFormatCompliance(spec.content))
    );

    const passed = results.every((r, i) => r.compliant === testSpecs[i].expected);

    return {
      test: 'Format Compliance',
      passed,
      details: { testSpecs, results },
    };
  }

  private async testStyleGuideCompliance(): Promise<TestResult> {
    const styleGuideRules = [
      'Use emoji headers',
      'Follow markdown standards',
      'Include code examples',
      'Use proper YAML formatting',
    ];

    const specContent = this.getTestSpecContent();
    const violations = await this.checkStyleGuideViolations(specContent, styleGuideRules);

    return {
      test: 'Style Guide Compliance',
      passed: violations.length === 0,
      details: { styleGuideRules, violations },
    };
  }
}
```

### Integration Testing

```typescript
// Test integration with other systems
export class IntegrationTests {
  async testSystemIntegration(): Promise<TestResult[]> {
    return [
      await this.testCLIIntegration(),
      await this.testAPIIntegration(),
      await this.testUIIntegration(),
      await this.testGitIntegration(),
    ];
  }

  private async testCLIIntegration(): Promise<TestResult> {
    const cliCommands = [
      'civic spec validate',
      'civic spec lint',
      'civic spec generate-template',
      'civic spec check-compliance',
    ];

    const results = await Promise.all(
      cliCommands.map(cmd => this.executeCLICommand(cmd))
    );

    return {
      test: 'CLI Integration',
      passed: results.every(r => r.success),
      details: { cliCommands, results },
    };
  }

  private async testGitIntegration(): Promise<TestResult> {
    const gitHooks = [
      'pre-commit',
      'pre-push',
      'post-merge',
    ];

    const results = await Promise.all(
      gitHooks.map(hook => this.testGitHook(hook))
    );

    return {
      test: 'Git Integration',
      passed: results.every(r => r.working),
      details: { gitHooks, results },
    };
  }
}
```

## 📦 Format Overview

Each spec begins with a **structured metadata header**, followed by the actual
content. Two supported formats:

```md
# 🧩 CivicPress Spec: `example-spec.md`
---
version: '1.0.0'
status: 'stable'
created: '2025-07-04'
updated: '2025-07-04'
deprecated: false
sunset_date: null
breaking_changes: []
additions: ['standardized spec format', 'metadata fields', 'authorship tracking']
fixes: []
migration_guide: null
compatibility:
  min_civicpress: '1.0.0'
  max_civicpress: null
  dependencies: []
authors:

- 'Sophie Germain <sophie@civic-press.org>'
reviewers:
- 'Ada Lovelace'
- 'Tim Berners-Lee'

---
```

---

## 🛠️ Implementation Guidelines

### Required Metadata Fields

```yaml
# Required fields for all specs
version: '1.0.0'                    # Semantic version
status: 'stable'                     # draft|alpha|beta|stable|deprecated|sunset
created: '2025-07-04'               # ISO date format
updated: '2025-07-04'               # ISO date format
deprecated: false                    # Boolean flag
sunset_date: null                    # ISO date or null
authors: ['Author Name <email>']     # Array of authors
reviewers: ['Reviewer Name']         # Array of reviewers
```

### Optional Metadata Fields

```yaml
# Optional fields for enhanced tracking
breaking_changes: []                 # Array of breaking changes
additions: []                        # Array of new features
fixes: []                           # Array of bug fixes
migration_guide: null               # Path to migration guide
compatibility:
  min_civicpress: '1.0.0'          # Minimum CivicPress version
  max_civicpress: null              # Maximum CivicPress version
  dependencies: []                   # Array of spec dependencies
```

### Content Structure Requirements

```markdown
# 📛 Name
Specification name and identifier

## 🎯 Purpose
Clear description of what the spec accomplishes

## 🧩 Scope & Responsibilities
✅ Responsibilities:
- List of what the spec covers

❌ Out of Scope:
- List of what the spec doesn't cover

## 🔗 Inputs & Outputs
Tables describing inputs and outputs

## 📂 File/Folder Location
Directory structure and file organization

## 🔐 Security & Trust Considerations
Security, privacy, and compliance considerations

## 📅 History
Change log and version history
```

### Validation Rules

```yaml
# .civic/spec-validation.yml
guidelines:
  required_sections:
    - 'Name'
    - 'Purpose'
    - 'Scope & Responsibilities'
    - 'Inputs & Outputs'
    - 'File/Folder Location'
    - 'Security & Trust Considerations'

  required_metadata:
    - 'version'
    - 'status'
    - 'created'
    - 'updated'
    - 'authors'

  format_requirements:
    - 'Must use YAML frontmatter'
    - 'Must include emoji headers'
    - 'Must follow markdown standards'
    - 'Must include code examples'
```

---

## 🛠️ Future Enhancements

- Automated spec validation and compliance checking
- Template generation and boilerplate creation
- Style guide enforcement and linting
- Spec quality metrics and scoring
- Automated documentation generation
- Integration with documentation platforms

## 🔗 Related Specs

- [`spec-versioning.md`](./spec-versioning.md) — Versioning and change management
- [`manifest.md`](./manifest.md) — CivicPress manifest structure
- [`git-policy.md`](./git-policy.md) — Git-based documentation workflow
- [`workflows.md`](./workflows.md) — Documentation workflows

---

## 📅 History

- Drafted: 2025-07-04
- Updated: 2025-07-04
