# 🧩 CivicPress Development Patterns

**Last Updated**: 2025-01-27  
**Pattern Categories**: 5

## 🎯 **Core Development Patterns**

### **1. Specification-Driven Development**

#### **Pattern**: Write specs before implementation

- **When to Use**: For all new features and modules
- **How to Apply**:
  1. Create specification in `.civic/specs/`
  2. Define requirements, interfaces, and behavior
  3. Include security and accessibility considerations
  4. Write tests based on specification
  5. Implement according to specification
- **Benefits**: Ensures consistency, security, and accessibility
- **Examples**: All 50+ specifications follow this pattern

#### **Pattern**: Specification validation

- **When to Use**: During development and CI/CD
- **How to Apply**:
  1. Use `pnpm run spec:validate` to check specs
  2. Use `pnpm run spec:check-deps` to verify dependencies
  3. Use `pnpm run spec:all` for comprehensive validation
- **Benefits**: Catches specification inconsistencies early
- **Examples**: Specification validation tools in package.json

### **2. Git-Native Workflow**

#### **Pattern**: Git as source of truth

- **When to Use**: For all civic records and changes
- **How to Apply**:
  1. Store all civic records as Markdown in Git
  2. Use role-aware commit messages
  3. Maintain complete audit trail
  4. Use branches for proposals and approvals
- **Benefits**: Complete transparency and auditability
- **Examples**: Civic records in `records/` directory

#### **Pattern**: Role-aware commits

- **When to Use**: When making changes to civic records
- **How to Apply**:
  1. Include role in commit message: `feat(role): description`
  2. Use conventional commit format
  3. Include relevant metadata
  4. Reference related issues or records
- **Benefits**: Clear attribution and accountability
- **Examples**: `feat(clerk): add noise restriction bylaw`

### **3. Security-First Implementation**

#### **Pattern**: Sandboxed execution

- **When to Use**: For workflows and plugins
- **How to Apply**:
  1. Execute workflows in isolated environment
  2. Limit file system and network access
  3. Enforce resource limits
  4. Log all execution activity
- **Benefits**: Prevents security vulnerabilities
- **Examples**: Workflow engine sandboxing

#### **Pattern**: Input validation

- **When to Use**: For all user inputs and data
- **How to Apply**:
  1. Validate all inputs against schemas
  2. Sanitize user-provided content
  3. Check permissions before operations
  4. Log validation failures
- **Benefits**: Prevents injection attacks and data corruption
- **Examples**: Record validation in modules

### **4. Accessibility-First Design**

#### **Pattern**: WCAG 2.2 AA compliance

- **When to Use**: For all user interfaces
- **How to Apply**:
  1. Use semantic HTML elements
  2. Provide ARIA labels and descriptions
  3. Ensure keyboard navigation
  4. Test with screen readers
  5. Support high contrast modes
- **Benefits**: Ensures accessibility for all users
- **Examples**: All UI components follow accessibility guidelines

#### **Pattern**: Progressive enhancement

- **When to Use**: For web interfaces
- **How to Apply**:
  1. Start with basic HTML functionality
  2. Add CSS for styling
  3. Add JavaScript for enhancements
  4. Ensure core functionality works without JS
- **Benefits**: Works for all users regardless of technology
- **Examples**: Civic dashboard progressive enhancement

### **5. Civic-Focused Design**

#### **Pattern**: Transparency by default

- **When to Use**: For all civic functionality
- **How to Apply**:
  1. Make all changes traceable
  2. Provide public audit logs
  3. Use open formats and standards
  4. Avoid hidden automation
- **Benefits**: Builds public trust and accountability
- **Examples**: All civic records publicly accessible

#### **Pattern**: Public-first design

- **When to Use**: For civic interfaces
- **How to Apply**:
  1. Design for public use first
  2. Use clear, simple language
  3. Provide multiple access methods
  4. Consider diverse user needs
- **Benefits**: Ensures civic accessibility
- **Examples**: Public-facing civic dashboard

## 🔧 **Technical Patterns**

### **Module Development Pattern**

```typescript
// modules/example-module/src/index.ts
export class ExampleModule {
  constructor(private config: ModuleConfig) {}

  async initialize(): Promise<void> {
    // Register hooks
    this.registerHooks();
    // Set up routes
    this.setupRoutes();
    // Initialize workflows
    this.initializeWorkflows();
  }

  private registerHooks(): void {
    // Register module-specific hooks
  }

  private setupRoutes(): void {
    // Set up API routes
  }

  private initializeWorkflows(): void {
    // Initialize module workflows
  }
}
```

### **Hook System Pattern**

```typescript
// core/hooks.ts
export class HookSystem {
  private listeners: Map<string, HookHandler[]> = new Map();

  emit(event: string, data?: any): Promise<void> {
    const handlers = this.listeners.get(event) || [];
    return Promise.all(handlers.map(handler => handler(data)));
  }

  on(event: string, handler: HookHandler): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)!.push(handler);
  }
}
```

### **Workflow Pattern**

```javascript
// .civic/workflows/example-workflow.js
module.exports = async ({ record, context }) => {
  // Validate input
  if (!record || !context) {
    throw new Error('Missing required parameters');
  }

  // Perform workflow logic
  const result = await processRecord(record);

  // Log activity
  await logActivity('workflow_executed', { record, result });

  return result;
};
```

### **Plugin Pattern**

```typescript
// plugins/example-plugin/index.ts
export class ExamplePlugin {
  constructor(private api: CivicPressAPI) {}

  async onInit(): Promise<void> {
    // Initialize plugin
  }

  async onEnable(): Promise<void> {
    // Register plugin functionality
  }

  async onDisable(): Promise<void> {
    // Cleanup plugin
  }
}
```

## 📋 **Code Organization Patterns**

### **File Structure Pattern**

```
module-name/
├── package.json              # Module metadata
├── src/
│   ├── index.ts              # Module entry point
│   ├── types.ts              # TypeScript definitions
│   ├── validation.ts         # Input validation
│   └── workflows.ts          # Module workflows
├── tests/                    # Module tests
└── README.md                 # Module documentation
```

### **Naming Convention Pattern**

- **Files**: kebab-case (e.g., `legal-register.ts`)
- **Classes**: PascalCase (e.g., `LegalRegister`)
- **Functions**: camelCase (e.g., `validateRecord`)
- **Constants**: UPPER_SNAKE_CASE (e.g., `MAX_RECORD_SIZE`)
- **Types**: PascalCase with suffix (e.g., `RecordData`, `UserConfig`)

### **Import Organization Pattern**

```typescript
// 1. External libraries
import { readFile, writeFile } from 'fs/promises';

// 2. Internal modules
import { CivicCore } from '../core/civic-core';
import { HookSystem } from '../core/hooks';

// 3. Types and interfaces
import type { RecordData, UserConfig } from '../types';

// 4. Utilities
import { validateInput } from '../utils/validation';
```

## 🔒 **Security Patterns**

### **Input Validation Pattern**

```typescript
function validateRecordInput(input: any): RecordData {
  // Check required fields
  if (!input.title || !input.content) {
    throw new Error('Missing required fields');
  }

  // Validate types
  if (typeof input.title !== 'string' || typeof input.content !== 'string') {
    throw new Error('Invalid field types');
  }

  // Sanitize content
  const sanitizedContent = sanitizeHtml(input.content);

  return {
    title: input.title,
    content: sanitizedContent,
    // ... other fields
  };
}
```

### **Permission Check Pattern**

```typescript
async function checkPermission(user: User, action: string, resource: string): Promise<boolean> {
  const userRole = user.role;
  const permissions = await getRolePermissions(userRole);

  return permissions.some(permission =>
    permission.action === action &&
    permission.resource === resource
  );
}
```

## 🧪 **Testing Patterns**

### **Unit Test Pattern**

```typescript
describe('Record Validation', () => {
  it('should validate valid record', () => {
    const validRecord = {
      title: 'Test Record',
      content: 'Valid content'
    };

    const result = validateRecord(validRecord);
    expect(result.isValid).toBe(true);
  });

  it('should reject invalid record', () => {
    const invalidRecord = {
      title: '', // Empty title
      content: 'Valid content'
    };

    const result = validateRecord(invalidRecord);
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain('Title is required');
  });
});
```

### **Integration Test Pattern**

```typescript
describe('Legal Register Module', () => {
  beforeEach(async () => {
    await setupTestDatabase();
  });

  afterEach(async () => {
    await cleanupTestDatabase();
  });

  it('should create and publish bylaw', async () => {
    // Create bylaw
    const bylaw = await createBylaw(testBylawData);
    expect(bylaw.status).toBe('draft');

    // Publish bylaw
    const publishedBylaw = await publishBylaw(bylaw.id);
    expect(publishedBylaw.status).toBe('published');
  });
});
```

## 📊 **Pattern Usage Guidelines**

### **When to Apply Patterns**

- **Always**: For security, accessibility, and civic requirements
- **Usually**: For code organization and consistency
- **Sometimes**: For performance optimization
- **Rarely**: For experimental features

### **Pattern Selection Criteria**

1. **Security**: Does it improve security?
2. **Accessibility**: Does it improve accessibility?
3. **Maintainability**: Does it improve code maintainability?
4. **Consistency**: Does it follow established patterns?
5. **Performance**: Does it improve performance?

### **Pattern Documentation**

- Document patterns in this file
- Include examples and usage guidelines
- Update patterns as project evolves
- Share patterns with team members

## 🔗 **Related Resources**

- **Architecture**: `agent/memory/architecture.md`
- **Project State**: `agent/memory/project-state.md`
- **Decisions**: `agent/memory/decisions.md`
- **Specifications**: `.civic/specs/`
- **Examples**: `agent/knowledge/examples.md`
