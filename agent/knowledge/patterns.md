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

### **6. Configuration Management**

#### **Pattern**: Configuration separation

- **When to Use**: For all configuration management
- **How to Apply**:
  1. Separate system config (`.civicrc`) from organization config
     (`org-config.yml`)
  2. Keep system settings in `.civicrc` (database, modules, workflows)
  3. Keep organization details in `org-config.yml` (name, city, branding)
  4. Centralize defaults in `core/src/defaults/`
- **Benefits**: Cleaner configuration management and better separation of
  concerns
- **Examples**: Organization config separation in CivicPress

#### **Pattern**: Default configuration centralization

- **When to Use**: For all default configurations and templates
- **How to Apply**:
  1. Store all defaults in `core/src/defaults/`
  2. Use consistent file structure for templates and configs
  3. Copy defaults during initialization
  4. Allow customization after initialization
- **Benefits**: Single source of truth and consistent defaults
- **Examples**: Default templates and configurations in CivicPress

### **7. Initialization Workflow**

#### **Pattern**: Complete initialization

- **When to Use**: For project setup and initialization
- **How to Apply**:
  1. Create all necessary directories and files
  2. Copy default configurations and templates
  3. Initialize Git repository
  4. Index and sync all records to database
  5. Create initial commit with all files
- **Benefits**: Users get a complete, ready-to-use repository
- **Examples**: `civic init` command with automatic indexing

#### **Pattern**: Interactive and non-interactive modes

- **When to Use**: For CLI commands that need flexibility
- **How to Apply**:
  1. Support interactive prompts for manual setup
  2. Support `--yes` flag for automated setup
  3. Support `--config` flag for configuration files
  4. Support `--data-dir` flag for custom data directories
- **Benefits**: Works for both manual setup and automated deployment
- **Examples**: `civic init` with multiple initialization modes

### **8. Role-Based Authorization**

#### **Pattern**: Granular permission checking

- **When to Use**: For all CLI commands and API endpoints
- **How to Apply**:
  1. Check specific permissions for each operation
  2. Use `userCan(user, permission)` function
  3. Provide clear error messages for denied access
  4. Support JSON output for scripting
- **Benefits**: Ensures security and proper access control
- **Examples**: All CLI commands check appropriate permissions

#### **Pattern**: Role hierarchy inheritance

- **When to Use**: For complex permission scenarios
- **How to Apply**:
  1. Define role hierarchy: Admin > Mayor > Council > Clerk > Editor > Viewer >
     Public
  2. Implement permission inheritance from parent roles
  3. Allow role-specific permission overrides
  4. Provide fallback to public role for unknown users
- **Benefits**: Supports complex civic government workflows
- **Examples**: Role-based authorization system with inheritance

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

### **CLI Authorization Pattern**

```typescript
// cli/src/commands/example.ts
import { userCan } from '@civicpress/core';
import { AuthUtils } from '../utils/auth-utils.js';

export const exampleCommand = (cli: CAC) => {
  cli
    .command('example', 'Example command')
    .option('--token <token>', 'Session token for authentication')
    .action(async (options: any) => {
      // Initialize logger and get global options
      const globalOptions = getGlobalOptionsFromArgs();
      const logger = initializeLogger();
      const shouldOutputJson = globalOptions.json;

      // Validate authentication and get civic instance
      const { civic, user } = await AuthUtils.requireAuthWithCivic(
        options.token,
        shouldOutputJson
      );
      const dataDir = civic.getDataDir();

      // Check specific permissions
      const canPerformAction = await userCan(user, 'specific:permission');
      if (!canPerformAction) {
        if (shouldOutputJson) {
          console.log(
            JSON.stringify(
              {
                success: false,
                error: 'Insufficient permissions',
                details: 'You do not have permission to perform this action',
                requiredPermission: 'specific:permission',
                userRole: user.role,
              },
              null,
              2
            )
          );
        } else {
          logger.error('❌ Insufficient permissions to perform action');
          logger.info(`Role '${user.role}' cannot perform this action`);
        }
        process.exit(1);
      }

      // Perform authorized action
      // ... command logic here
    });
};
```

### **Role Configuration Pattern**

```yaml
# .civic/roles.yml
roles:
  admin:
    name: 'System Administrator'
    description: 'Full system access'
    permissions:
      - 'records:create'
      - 'records:edit'
      - 'records:view'
      - 'records:export'
      - 'records:import'
      - 'templates:manage'
      - 'hooks:manage'
    record_types:
      can_create: ['bylaw', 'policy', 'resolution', 'proclamation']
      can_edit: ['bylaw', 'policy', 'resolution', 'proclamation']
      can_view: ['bylaw', 'policy', 'resolution', 'proclamation']

  editor:
    name: 'Content Editor'
    description: 'Can edit and create records'
    permissions:
      - 'records:create'
      - 'records:edit'
      - 'records:view'
    record_types:
      can_create: ['bylaw', 'policy']
      can_edit: ['bylaw', 'policy']
      can_view: ['bylaw', 'policy', 'resolution']

  viewer:
    name: 'Content Viewer'
    description: 'Read-only access to records'
    permissions:
      - 'records:view'
    record_types:
      can_view: ['bylaw', 'policy', 'resolution']

role_hierarchy:
  admin: []
  editor: ['viewer']
  viewer: ['public']
  public: []
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
