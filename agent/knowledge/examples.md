# 💡 CivicPress Code Examples

**Last Updated**: 2025-01-27  
**Example Categories**: 6

## 🎯 **Core Platform Examples**

### **Basic CivicPress Setup**

```typescript
// core/civic-core.ts
import { HookSystem } from './hooks';
import { WorkflowEngine } from './workflows';
import { GitIntegration } from './git';

export class CivicCore {
  private hooks: HookSystem;
  private workflows: WorkflowEngine;
  private git: GitIntegration;

  constructor(config: CivicConfig) {
    this.hooks = new HookSystem();
    this.workflows = new WorkflowEngine();
    this.git = new GitIntegration(config.git);
  }

  async initialize(): Promise<void> {
    // Initialize core systems
    await this.hooks.initialize();
    await this.workflows.initialize();
    await this.git.initialize();

    // Register core hooks
    this.registerCoreHooks();
  }

  private registerCoreHooks(): void {
    // Register system-wide hooks
    this.hooks.on('record:created', this.handleRecordCreated.bind(this));
    this.hooks.on('record:updated', this.handleRecordUpdated.bind(this));
    this.hooks.on('workflow:executed', this.handleWorkflowExecuted.bind(this));
  }

  async emitHook(event: string, data?: any): Promise<void> {
    return this.hooks.emit(event, data);
  }
}
```

### **Hook System Implementation**

```typescript
// core/hooks.ts
export type HookHandler = (data?: any) => Promise<void>;

export class HookSystem {
  private listeners: Map<string, HookHandler[]> = new Map();

  async emit(event: string, data?: any): Promise<void> {
    const handlers = this.listeners.get(event) || [];
    const promises = handlers.map(handler => handler(data));
    await Promise.all(promises);
  }

  on(event: string, handler: HookHandler): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)!.push(handler);
  }

  off(event: string, handler: HookHandler): void {
    const handlers = this.listeners.get(event) || [];
    const index = handlers.indexOf(handler);
    if (index > -1) {
      handlers.splice(index, 1);
    }
  }

  async initialize(): Promise<void> {
    // Initialize hook system
    console.log('Hook system initialized');
  }
}
```

### **Workflow Engine Example**

```typescript
// core/workflows.ts
export class WorkflowEngine {
  private workflows: Map<string, WorkflowFunction> = new Map();

  async executeWorkflow(name: string, context: WorkflowContext): Promise<any> {
    const workflow = this.workflows.get(name);
    if (!workflow) {
      throw new Error(`Workflow '${name}' not found`);
    }

    // Execute in sandboxed environment
    return this.executeInSandbox(workflow, context);
  }

  private async executeInSandbox(
    workflow: WorkflowFunction,
    context: WorkflowContext
  ): Promise<any> {
    // Sandbox implementation
    return workflow(context);
  }

  registerWorkflow(name: string, workflow: WorkflowFunction): void {
    this.workflows.set(name, workflow);
  }

  async initialize(): Promise<void> {
    // Load workflows from .civic/workflows/
    await this.loadWorkflows();
  }

  private async loadWorkflows(): Promise<void> {
    // Implementation to load workflow files
  }
}
```

## ⚙️ **Configuration Examples**

### **Organization Config Separation**

```yaml
# data/.civic/org-config.yml (Organization Config)
name: City of Springfield
city: Springfield
state: Illinois
country: USA
timezone: America/Chicago
website: https://springfield.gov
repo_url: https://github.com/springfield/civic-records
email: clerk@springfield.gov
phone: (555) 123-4567

# Branding
logo: assets/logo.png
favicon: assets/favicon.ico
description: Official civic records for the City of Springfield
tagline: Transparency in Government

# Social Media
social:
  twitter: @SpringfieldGov
  facebook: SpringfieldGovernment
  linkedin: city-of-springfield

# Custom Branding
custom:
  primary_color: "#1e40af"
  secondary_color: "#3b82f6"
  font_family: "Inter, system-ui, sans-serif"
```

```yaml
# .civicrc (System Config)
version: "1.0.0"
dataDir: "data"
modules: ["legal-register"]
record_types: ["bylaw", "policy", "resolution", "ordinance", "proclamation"]
default_role: "clerk"
hooks:
  enabled: true
workflows:
  enabled: true
audit:
  enabled: true
database:
  type: "sqlite"
  sqlite:
    file: ".system-data/civic.db"
```

### **Default Configuration Structure**

```typescript
// core/src/defaults/index.ts
export const DEFAULT_CONFIGS = {
  roles: 'roles.yml',
  workflows: 'workflows.yml',
  hooks: 'hooks.yml',
  orgConfig: 'org-config.yml',
  templates: {
    bylaw: 'templates/bylaw/default.md',
    ordinance: 'templates/ordinance/default.md',
    policy: 'templates/policy/default.md',
    proclamation: 'templates/proclamation/default.md',
    resolution: 'templates/resolution/default.md'
  }
};

export async function copyDefaults(dataDir: string): Promise<void> {
  const defaultsDir = path.join(__dirname, '..');

  // Copy configuration files
  for (const [name, file] of Object.entries(DEFAULT_CONFIGS)) {
    if (name === 'templates') continue;
    await copyFile(path.join(defaultsDir, file), path.join(dataDir, '.civic', file));
  }

  // Copy templates
  for (const [type, template] of Object.entries(DEFAULT_CONFIGS.templates)) {
    await copyFile(
      path.join(defaultsDir, template),
      path.join(dataDir, '.civic', template)
    );
  }
}
```

### **Enhanced Init Command**

```typescript
// cli/src/commands/init.ts
export const initCommand = (cli: CAC) => {
  cli
    .command('init', 'Initialize a new CivicPress project')
    .option('--yes', 'Skip all prompts and use defaults')
    .option('--config <path>', 'Path to configuration file')
    .option('--data-dir <path>', 'Specify the data directory')
    .option('--demo-data [city]', 'Load demo data')
    .action(async (options: any) => {
      // ... setup logic ...

      // Copy default configurations
      await copyDefaults(fullDataDir);

      // Load demo data if requested
      if (loadDemoDataFlag) {
        await loadDemoData(fullDataDir, demoCity, logger);
      }

      // Always run indexing and db sync after init
      try {
        logger.info('🔄 Indexing records...');
        const civic = new CivicPress({ dataDir: fullDataDir });
        await civic.initialize();
        const indexingService = civic.getIndexingService();

        // Index all records
        await indexingService.generateIndexes();
        logger.success('📊 Indexing complete');

        // Sync to database
        logger.info('🔄 Syncing indexed records to database...');
        await indexingService.generateIndexes({ syncDatabase: true });
        logger.success('🗄️  Database sync complete');
      } catch (err: any) {
        logger.warn('⚠️  Indexing or DB sync failed: ' + err.message);
      }

      // Create initial commit
      if (initGit || gitExists) {
        const git = new GitEngine(fullDataDir);
        await git.initialize();
        await git.commit('Initial CivicPress setup');
        logger.success('📝 Initial commit created');
      }
    });
};
```

### **Info Command Implementation**

```typescript
// cli/src/commands/info.ts
export const infoCommand = (cli: CAC) => {
  cli
    .command('info', 'Show organization and system configuration info')
    .option('--token <token>', 'Authentication token for admin access')
    .action(async (options: any) => {
      const civic = new CivicPress({ dataDir: 'data' });
      await civic.initialize();

      const configManager = civic.getConfigManager();
      const orgConfig = await configManager.getOrgConfig();

      const info = {
        organization: {
          name: orgConfig.name,
          city: orgConfig.city,
          state: orgConfig.state,
          country: orgConfig.country,
          timezone: orgConfig.timezone,
          website: orgConfig.website,
          repo_url: orgConfig.repo_url
        }
      };

      // Add system config if admin token provided
      if (options.token) {
        try {
          const authService = civic.getAuthService();
          const user = await authService.validateToken(options.token);

          if (user.role === 'admin') {
            const systemConfig = await configManager.getSystemConfig();
            info.system = {
              version: systemConfig.version,
              modules: systemConfig.modules,
              record_types: systemConfig.record_types,
              database: systemConfig.database
            };
          }
        } catch (error) {
          // Invalid token - continue without system info
        }
      }

      if (globalOptions.json) {
        console.log(JSON.stringify(info, null, 2));
      } else {
        // Human-readable output
        console.log('🏢 Organization Information:');
        console.log(`   Name: ${info.organization.name}`);
        console.log(`   Location: ${info.organization.city}, ${info.organization.state}, ${info.organization.country}`);
        console.log(`   Timezone: ${info.organization.timezone}`);

        if (info.system) {
          console.log('\n⚙️  System Configuration:');
          console.log(`   Version: ${info.system.version}`);
          console.log(`   Modules: ${info.system.modules.join(', ')}`);
          console.log(`   Record Types: ${info.system.record_types.join(', ')}`);
        }
      }
    });
};
```

## 🏛️ **Module Examples**

### **Legal Register Module**

```typescript
// modules/legal-register/src/index.ts
import { CivicModule } from '../../core/module';
import { LegalRecord } from './types';
import { validateLegalRecord } from './validation';

export class LegalRegisterModule extends CivicModule {
  constructor(config: ModuleConfig) {
    super('legal-register', config);
  }

  async initialize(): Promise<void> {
    // Register module hooks
    this.registerHooks();

    // Set up API routes
    this.setupRoutes();

    // Initialize workflows
    this.initializeWorkflows();
  }

  private registerHooks(): void {
    this.hooks.on('legal:record:created', this.handleRecordCreated.bind(this));
    this.hooks.on('legal:record:published', this.handleRecordPublished.bind(this));
  }

  private setupRoutes(): void {
    this.api.get('/legal/records', this.getRecords.bind(this));
    this.api.post('/legal/records', this.createRecord.bind(this));
    this.api.put('/legal/records/:id', this.updateRecord.bind(this));
    this.api.delete('/legal/records/:id', this.deleteRecord.bind(this));
  }

  private initializeWorkflows(): void {
    this.workflows.registerWorkflow('publish-bylaw', this.publishBylawWorkflow.bind(this));
    this.workflows.registerWorkflow('approve-resolution', this.approveResolutionWorkflow.bind(this));
  }

  async createRecord(data: CreateRecordData): Promise<LegalRecord> {
    // Validate input
    const validatedData = validateLegalRecord(data);

    // Create record
    const record = await this.createLegalRecord(validatedData);

    // Emit hook
    await this.hooks.emit('legal:record:created', { record });

    return record;
  }

  private async publishBylawWorkflow(context: WorkflowContext): Promise<any> {
    const { recordId } = context;

    // Get record
    const record = await this.getRecord(recordId);

    // Validate can be published
    if (record.status !== 'approved') {
      throw new Error('Record must be approved before publishing');
    }

    // Update status
    record.status = 'published';
    record.publishedAt = new Date();

    // Save record
    await this.updateRecord(record);

    // Emit hook
    await this.hooks.emit('legal:record:published', { record });

    return record;
  }
}
```

### **Record Validation Example**

```typescript
// modules/legal-register/src/validation.ts
import { LegalRecord, CreateRecordData } from './types';

export function validateLegalRecord(data: CreateRecordData): CreateRecordData {
  const errors: string[] = [];

  // Required fields
  if (!data.title || data.title.trim().length === 0) {
    errors.push('Title is required');
  }

  if (!data.content || data.content.trim().length === 0) {
    errors.push('Content is required');
  }

  if (!data.type || !['bylaw', 'resolution', 'policy'].includes(data.type)) {
    errors.push('Valid type is required (bylaw, resolution, policy)');
  }

  // Content length validation
  if (data.content && data.content.length > 10000) {
    errors.push('Content exceeds maximum length of 10,000 characters');
  }

  // Title length validation
  if (data.title && data.title.length > 200) {
    errors.push('Title exceeds maximum length of 200 characters');
  }

  if (errors.length > 0) {
    throw new Error(`Validation failed: ${errors.join(', ')}`);
  }

  // Sanitize content
  const sanitizedData = {
    ...data,
    title: data.title.trim(),
    content: sanitizeHtml(data.content.trim()),
    type: data.type as 'bylaw' | 'resolution' | 'policy'
  };

  return sanitizedData;
}

function sanitizeHtml(content: string): string {
  // Basic HTML sanitization
  return content
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
    .replace(/javascript:/gi, '');
}
```

## 🔧 **Workflow Examples**

### **Bylaw Publication Workflow**

```javascript
// .civic/workflows/publish-bylaw.js
module.exports = async ({ record, context }) => {
  const { user, git } = context;

  // Validate permissions
  if (!user.hasPermission('legal:publish')) {
    throw new Error('User does not have permission to publish bylaws');
  }

  // Validate record state
  if (record.status !== 'approved') {
    throw new Error('Bylaw must be approved before publishing');
  }

  // Update record status
  record.status = 'published';
  record.publishedAt = new Date();
  record.publishedBy = user.id;

  // Create Git commit
  const commitMessage = `feat(legal): publish bylaw "${record.title}"`;
  await git.commit(commitMessage, {
    author: {
      name: user.name,
      email: user.email
    },
    role: user.role
  });

  // Log activity
  await logActivity('bylaw_published', {
    recordId: record.id,
    userId: user.id,
    timestamp: new Date()
  });

  return record;
};
```

### **Record Approval Workflow**

```javascript
// .civic/workflows/approve-record.js
module.exports = async ({ record, context }) => {
  const { user, git } = context;

  // Check if user can approve this record type
  const canApprove = await checkApprovalPermissions(user, record.type);
  if (!canApprove) {
    throw new Error('User does not have approval permissions for this record type');
  }

  // Update record status
  record.status = 'approved';
  record.approvedAt = new Date();
  record.approvedBy = user.id;

  // Create approval commit
  const commitMessage = `feat(${record.type}): approve "${record.title}"`;
  await git.commit(commitMessage, {
    author: {
      name: user.name,
      email: user.email
    },
    role: user.role
  });

  // Notify relevant parties
  await notifyApproval(record, user);

  return record;
};
```

## 🧪 **Testing Examples**

### **Module Unit Test**

```typescript
// modules/legal-register/tests/legal-register.test.ts
import { LegalRegisterModule } from '../src/index';
import { createTestContext } from '../../core/testing';

describe('LegalRegisterModule', () => {
  let module: LegalRegisterModule;
  let context: TestContext;

  beforeEach(async () => {
    context = await createTestContext();
    module = new LegalRegisterModule({
      hooks: context.hooks,
      workflows: context.workflows,
      api: context.api
    });
    await module.initialize();
  });

  afterEach(async () => {
    await context.cleanup();
  });

  describe('createRecord', () => {
    it('should create valid legal record', async () => {
      const recordData = {
        title: 'Noise Restriction Bylaw',
        content: 'This bylaw restricts noise levels...',
        type: 'bylaw'
      };

      const record = await module.createRecord(recordData);

      expect(record.id).toBeDefined();
      expect(record.title).toBe(recordData.title);
      expect(record.status).toBe('draft');
      expect(record.createdAt).toBeDefined();
    });

    it('should reject invalid record data', async () => {
      const invalidData = {
        title: '', // Empty title
        content: 'Valid content',
        type: 'bylaw'
      };

      await expect(module.createRecord(invalidData))
        .rejects
        .toThrow('Validation failed: Title is required');
    });
  });

  describe('publishBylaw workflow', () => {
    it('should publish approved bylaw', async () => {
      // Create and approve bylaw
      const bylaw = await createApprovedBylaw();

      // Execute publish workflow
      const result = await context.workflows.executeWorkflow('publish-bylaw', {
        recordId: bylaw.id
      });

      expect(result.status).toBe('published');
      expect(result.publishedAt).toBeDefined();
    });

    it('should reject publishing unapproved bylaw', async () => {
      // Create draft bylaw
      const bylaw = await createDraftBylaw();

      // Attempt to publish
      await expect(context.workflows.executeWorkflow('publish-bylaw', {
        recordId: bylaw.id
      })).rejects.toThrow('Record must be approved before publishing');
    });
  });
});
```

### **Integration Test**

```typescript
// tests/integration/legal-register-integration.test.ts
import { CivicCore } from '../../core/civic-core';
import { createTestDatabase } from '../utils/test-database';

describe('Legal Register Integration', () => {
  let core: CivicCore;
  let testDb: TestDatabase;

  beforeAll(async () => {
    testDb = await createTestDatabase();
    core = new CivicCore({
      database: testDb.connection,
      git: { repoPath: testDb.repoPath }
    });
    await core.initialize();
  });

  afterAll(async () => {
    await testDb.cleanup();
  });

  it('should handle complete bylaw lifecycle', async () => {
    // 1. Create bylaw
    const bylawData = {
      title: 'Test Bylaw',
      content: 'This is a test bylaw',
      type: 'bylaw'
    };

    const bylaw = await core.modules.legalRegister.createRecord(bylawData);
    expect(bylaw.status).toBe('draft');

    // 2. Approve bylaw
    const approvedBylaw = await core.workflows.executeWorkflow('approve-record', {
      recordId: bylaw.id,
      user: { id: 'approver', role: 'council' }
    });
    expect(approvedBylaw.status).toBe('approved');

    // 3. Publish bylaw
    const publishedBylaw = await core.workflows.executeWorkflow('publish-bylaw', {
      recordId: approvedBylaw.id,
      user: { id: 'publisher', role: 'clerk' }
    });
    expect(publishedBylaw.status).toBe('published');

    // 4. Verify Git history
    const commits = await core.git.getCommits();
    expect(commits).toHaveLength(3); // create, approve, publish
  });
});
```

## 🔒 **Security Examples**

### **Permission Check Example**

```typescript
// core/security/permissions.ts
export class PermissionManager {
  private rolePermissions: Map<string, Permission[]> = new Map();

  async checkPermission(
    user: User,
    action: string,
    resource: string
  ): Promise<boolean> {
    const userRole = user.role;
    const permissions = this.rolePermissions.get(userRole) || [];

    return permissions.some(permission =>
      permission.action === action &&
      permission.resource === resource
    );
  }

  async checkRecordPermission(
    user: User,
    action: string,
    record: Record
  ): Promise<boolean> {
    // Check basic permission
    const hasPermission = await this.checkPermission(user, action, record.type);
    if (!hasPermission) return false;

    // Check record-specific permissions
    if (action === 'update' && record.createdBy !== user.id) {
      return false; // Only creator can update draft records
    }

    return true;
  }
}
```

### **Input Sanitization Example**

```typescript
// core/security/sanitization.ts
import DOMPurify from 'dompurify';

export function sanitizeHtml(content: string): string {
  return DOMPurify.sanitize(content, {
    ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'ul', 'ol', 'li'],
    ALLOWED_ATTR: []
  });
}

export function sanitizeFilename(filename: string): string {
  return filename
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/_{2,}/g, '_')
    .substring(0, 100);
}

export function validateEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}
```

## 📊 **Example Usage Guidelines**

### **When to Use Examples**

- **Learning**: When understanding new concepts
- **Reference**: When implementing similar functionality
- **Templates**: When starting new modules or features
- **Best Practices**: When following established patterns

### **Example Quality Guidelines**

- **Completeness**: Include all necessary imports and context
- **Accuracy**: Ensure examples work as shown
- **Security**: Include security considerations
- **Accessibility**: Follow accessibility guidelines
- **Documentation**: Include comments explaining key parts

### **Example Maintenance**

- **Regular Updates**: Keep examples current with codebase
- **Version Tracking**: Note which version examples apply to
- **Testing**: Verify examples work correctly
- **Feedback**: Update based on user feedback

## 🔗 **Related Resources**

- **Patterns**: `agent/knowledge/patterns.md`
- **Architecture**: `agent/memory/architecture.md`
- **References**: `agent/knowledge/references.md`
- **Project State**: `agent/memory/project-state.md`
- **Decisions**: `agent/memory/decisions.md`
