import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  beforeAll,
  afterAll,
  vi,
} from 'vitest';
import { execSync } from 'child_process';
import { join } from 'path';
import { existsSync, rmSync, mkdirSync, writeFileSync, writeFile } from 'fs';
import { tmpdir } from 'os';
import yaml from 'js-yaml';

// Test configuration
export interface TestConfig {
  testDir: string;
  dataDir: string;
  civicDir: string;
  recordsDir: string;
  originalCwd: string;
  cleanupOnExit: boolean;
}

// Test context for API tests
export interface APITestContext {
  api: any;
  testDir: string;
  authToken?: string;
  adminToken?: string;
  regularUserToken?: string;
  port?: number; // Added for dynamic port allocation
}

// Test context for CLI tests
export interface CLITestContext {
  testDir: string;
  cliPath: string;
  authToken?: string;
  adminToken?: string;
  regularUserToken?: string;
}

// Test context for Core tests
export interface CoreTestContext {
  civic: any;
  testDir: string;
  dbPath: string;
}

// Global test configuration
export const TEST_CONFIG = {
  CLI_PATH: join(process.cwd(), 'cli/dist/index.js'),
  DEFAULT_TIMEOUT: 30000,
  CLEANUP_ON_EXIT: true,
  // Dynamic port allocation
  PORT_RANGE: { min: 3000, max: 3999 },
};

// Port management for API tests
let usedPorts = new Set<number>();

export function getRandomPort(): number {
  const { min, max } = TEST_CONFIG.PORT_RANGE;
  let port: number;

  do {
    port = Math.floor(Math.random() * (max - min + 1)) + min;
  } while (usedPorts.has(port));

  usedPorts.add(port);
  return port;
}

export function releasePort(port: number): void {
  usedPorts.delete(port);
}

// Mock setup for @civicpress/core - COMMENTED OUT FOR INTEGRATION TESTS
export function setupCoreMocks() {
  // Core mocks disabled for integration testing
  // vi.mock('@civicpress/core', () => ({
  //   CivicPress: vi.fn().mockImplementation(() => ({
  //     initialize: vi.fn().mockResolvedValue(undefined),
  //     shutdown: vi.fn().mockResolvedValue(undefined),
  //     getRecordManager: vi.fn(() => createMockRecordManager()),
  //     getTemplateManager: vi.fn(() => createMockTemplateManager()),
  //     getHookSystem: vi.fn(() => createMockHookSystem()),
  //     getWorkflowEngine: vi.fn(() => createMockWorkflowEngine()),
  //     getImportExportManager: vi.fn(() => createMockImportExportManager()),
  //     getSearchManager: vi.fn(() => createMockSearchManager()),
  //     getAuthService: vi.fn(() => createMockAuthService()),
  //     getIndexingService: vi.fn(() => createMockIndexingService()),
  //     getGitEngine: vi.fn(() => createMockGitEngine()),
  //   })),
  //   WorkflowConfigManager: vi.fn().mockImplementation(() => ({
  //     initialize: vi.fn().mockResolvedValue(undefined),
  //     loadWorkflows: vi.fn().mockResolvedValue([]),
  //     getWorkflow: vi.fn().mockReturnValue(null),
  //     listWorkflows: vi.fn().mockReturnValue([]),
  //     validateAction: vi.fn().mockResolvedValue({ valid: true }),
  //   })),
  //   AuthConfigManager: {
  //     getInstance: vi.fn().mockReturnValue({
  //       loadConfig: vi.fn().mockResolvedValue(undefined),
  //     }),
  //   },
  //   Logger: vi.fn().mockImplementation(() => ({
  //     info: vi.fn(),
  //     warn: vi.fn(),
  //     error: vi.fn(),
  //     debug: vi.fn(),
  //   })),
  //   CentralConfigManager: {
  //     getDatabaseConfig: vi.fn().mockReturnValue({
  //     type: 'sqlite',
  //     database: ':memory:',
  //   }),
  // },
  // userCan: vi
  //   .fn()
  //   .mockImplementation(async (user: any, permission: string) => {
  //   const role = user?.role || 'public';
  //   if (role === 'admin') return true;
  //   if (role === 'clerk') {
  //     if (
  //       permission.includes('delete') ||
  //       permission.includes('import') ||
  //       permission.includes('export') ||
  //       permission.includes('templates:manage') ||
  //       permission.includes('hooks:manage') ||
  //       permission.includes('workflows:manage')
  //     ) {
  //       return false;
  //     }
  //     return true;
  //   }
  //   if (role === 'public') {
  //     if (permission.includes('view') || permission.includes('search')) {
  //       return true;
  //     }
  //     return false;
  //   }
  //   return false;
  // }),
  // }));
}

// Mock implementations
function createMockRecordManager() {
  let recordStore: any = {
    'test-record-1': {
      id: 'test-record-1',
      title: 'Test Record',
      type: 'bylaw',
      status: 'draft',
      content: '# Test Record\n\nContent here...',
      metadata: {},
      path: '/test-record-1.md',
      created_at: new Date().toISOString(),
      author: 'test-user',
    },
  };

  return {
    createRecord: vi.fn().mockImplementation((request: any) => {
      const id = `test-record-${Object.keys(recordStore).length + 1}`;
      const record = {
        id,
        title: request.title || 'Test Record',
        type: request.type || 'bylaw',
        status: 'draft',
        content: request.content || '# Test Record\n\nContent here...',
        metadata: request.metadata || {},
        path: `/${id}.md`,
        created_at: new Date().toISOString(),
        author: 'test-user',
      };
      recordStore[id] = record;
      return record;
    }),
    getRecord: vi.fn().mockImplementation((id: string) => {
      return recordStore[id] || null;
    }),
    updateRecord: vi.fn().mockImplementation((id: string, updates: any) => {
      if (!recordStore[id]) return null;
      recordStore[id] = { ...recordStore[id], ...updates };
      return recordStore[id];
    }),
    archiveRecord: vi.fn().mockImplementation((id: string) => {
      if (!recordStore[id]) return false;
      delete recordStore[id];
      return true;
    }),
    listRecords: vi.fn().mockResolvedValue({
      records: Object.values(recordStore),
      total: Object.keys(recordStore).length,
      page: 1,
      limit: 10,
    }),
  };
}

function createMockTemplateManager() {
  return {
    createTemplate: vi.fn().mockImplementation((data: any) => ({
      id: 'template-1',
      name: data.name,
      content: data.content,
    })),
    updateTemplate: vi.fn().mockImplementation((id: string, data: any) => ({
      id,
      ...data,
    })),
    deleteTemplate: vi.fn().mockResolvedValue(true),
    getTemplate: vi.fn().mockImplementation((id: string) => ({
      id,
      name: 'Test Template',
      content: 'Template content',
    })),
    listTemplates: vi.fn().mockResolvedValue({
      templates: [
        {
          id: 'template-1',
          name: 'Test Template',
          content: 'Template content',
        },
      ],
    }),
  };
}

function createMockHookSystem() {
  return {
    registerHook: vi.fn().mockResolvedValue(true),
    updateHook: vi.fn().mockResolvedValue(true),
    deleteHook: vi.fn().mockResolvedValue(true),
    getHook: vi.fn().mockImplementation((id: string) => ({
      id,
      event: 'record:created',
      handler: 'testHandler',
    })),
    listHooks: vi.fn().mockResolvedValue({
      hooks: [
        { id: 'hook-1', event: 'record:created', handler: 'testHandler' },
      ],
    }),
    emit: vi.fn().mockResolvedValue(undefined),
  };
}

function createMockWorkflowEngine() {
  return {
    createWorkflow: vi.fn().mockImplementation((data: any) => ({
      id: 'workflow-1',
      ...data,
    })),
    updateWorkflow: vi.fn().mockImplementation((id: string, data: any) => ({
      id,
      ...data,
    })),
    deleteWorkflow: vi.fn().mockResolvedValue(true),
    getWorkflow: vi.fn().mockImplementation((id: string) => ({
      id,
      name: 'Test Workflow',
      status: 'active',
    })),
    listWorkflows: vi.fn().mockResolvedValue({
      workflows: [
        { id: 'workflow-1', name: 'Test Workflow', status: 'active' },
      ],
    }),
    startWorkflow: vi.fn().mockResolvedValue('mock-workflow-id'),
  };
}

function createMockImportExportManager() {
  return {
    importData: vi.fn().mockResolvedValue({ success: true }),
    exportData: vi.fn().mockResolvedValue({ data: '{}' }),
  };
}

function createMockSearchManager() {
  return {
    search: vi.fn().mockResolvedValue({
      results: [{ id: 'test-record-1', title: 'Test Record', type: 'bylaw' }],
      total: 1,
    }),
  };
}

function createMockAuthService() {
  return {
    validateSession: vi.fn().mockResolvedValue({
      valid: true,
      user: { id: 1, username: 'test', role: 'admin' },
    }),
    validateApiKey: vi.fn().mockResolvedValue({
      valid: true,
      user: { id: 1, username: 'test', role: 'admin' },
    }),
    createUser: vi.fn().mockImplementation((userData: any) => ({
      id: 1,
      username: userData.username,
      role: userData.role || 'public',
      email: userData.email,
      name: userData.name,
    })),
    updateUser: vi.fn().mockImplementation((userId: number, userData: any) => ({
      id: userId,
      username: 'testuser',
      role: userData.role || 'public',
      ...userData,
    })),
    getUserByUsername: vi.fn().mockImplementation((username: string) => ({
      id: 1,
      username,
      role: 'public',
    })),
    authenticateWithPassword: vi
      .fn()
      .mockImplementation((username: string, password: string) => ({
        token: 'mock-token',
        user: { id: 1, username, role: 'public' },
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      })),
    reloadRoleConfig: vi.fn().mockResolvedValue(undefined),
    isValidRole: vi.fn().mockImplementation((role: string) => {
      return ['admin', 'clerk', 'public'].includes(role);
    }),
    createSimulatedSession: vi
      .fn()
      .mockImplementation((username: string, role: string) => ({
        token: 'mock-simulated-token',
        user: { id: 1, username, role },
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      })),
    authenticateWithSimulatedAccount: vi
      .fn()
      .mockImplementation((username: string, role: string) => ({
        token: 'mock-simulated-token',
        user: { id: 1, username, role },
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      })),
  };
}

function createMockIndexingService() {
  return {
    generateIndexes: vi.fn().mockImplementation((options: any = {}) => {
      const index = {
        entries: [
          {
            title: 'Noise Restrictions',
            type: 'bylaw',
            status: 'adopted',
            module: 'legal-register',
            tags: ['noise', 'nighttime', 'curfew'],
            authors: [{ name: 'Ada Lovelace', role: 'clerk' }],
            created: '2025-06-12',
            updated: '2025-07-01',
            slug: 'noise-restrictions',
            path: 'records/bylaw-noise-restrictions.md',
          },
        ],
        metadata: {
          totalRecords: 1,
          modules: ['legal-register'],
          types: ['bylaw'],
          statuses: ['adopted'],
          generatedAt: new Date().toISOString(),
        },
      };

      if (options.types) {
        index.entries = index.entries.filter((entry) =>
          options.types.includes(entry.type)
        );
      }
      if (options.statuses) {
        index.entries = index.entries.filter((entry) =>
          options.statuses.includes(entry.status)
        );
      }

      return index;
    }),
    loadIndex: vi.fn().mockImplementation((path: string) => {
      if (path.includes('non-existent')) {
        return null;
      }
      return {
        entries: [
          {
            title: 'Noise Restrictions',
            type: 'bylaw',
            status: 'adopted',
            module: 'legal-register',
            tags: ['noise', 'nighttime', 'curfew'],
            authors: [{ name: 'Ada Lovelace', role: 'clerk' }],
            created: '2025-06-12',
            updated: '2025-07-01',
            slug: 'noise-restrictions',
            path: 'records/bylaw-noise-restrictions.md',
          },
        ],
        metadata: {
          totalRecords: 1,
          modules: ['legal-register'],
          types: ['bylaw'],
          statuses: ['adopted'],
          generatedAt: new Date().toISOString(),
        },
      };
    }),
    searchIndex: vi
      .fn()
      .mockImplementation((query: string, options: any = {}) => {
        let results = [
          {
            title: 'Noise Restrictions',
            type: 'bylaw',
            status: 'adopted',
            module: 'legal-register',
            tags: ['noise', 'nighttime', 'curfew'],
            authors: [{ name: 'Ada Lovelace', role: 'clerk' }],
            created: '2025-06-12',
            updated: '2025-07-01',
            slug: 'noise-restrictions',
            path: 'records/bylaw-noise-restrictions.md',
          },
        ];

        // Filter by query
        if (query && query.toLowerCase() !== 'noise') {
          return { results: [], total: 0 };
        }

        // Filter by type
        if (options.type) {
          results = results.filter((result) => result.type === options.type);
        }

        // Filter by status
        if (options.status) {
          results = results.filter(
            (result) => result.status === options.status
          );
        }

        return { results, total: results.length };
      }),
    syncRecordsToDatabase: vi.fn().mockImplementation((options: any = {}) => {
      return {
        totalRecords: 3,
        created: 3,
        updated: 0,
        conflicts: 0,
        conflictResolution: options.conflictResolution || 'file-wins',
        details: {
          bylaw: { created: 1, updated: 0 },
          policy: { created: 1, updated: 0 },
          resolution: { created: 1, updated: 0 },
        },
      };
    }),
  };
}

function createMockGitEngine() {
  const mockHistory = [
    {
      hash: 'abc123456789def',
      shortHash: 'abc12345',
      message: 'Add noise restrictions bylaw',
      author_name: 'Test User',
      author_email: 'test@example.com',
      date: '2025-07-12T10:00:00Z',
    },
    {
      hash: 'def987654321abc',
      shortHash: 'def98765',
      message: 'Update policy data privacy',
      author_name: 'Test User',
      author_email: 'test@example.com',
      date: '2025-07-11T15:30:00Z',
    },
    {
      hash: 'ghi456789123def',
      shortHash: 'ghi45678',
      message: 'Create budget resolution 2025',
      author_name: 'Test User',
      author_email: 'test@example.com',
      date: '2025-07-10T09:15:00Z',
    },
  ];

  return {
    getHistory: vi.fn().mockResolvedValue(mockHistory),
    getCommit: vi.fn().mockImplementation((hash: string) => {
      return mockHistory.find((commit) => commit.hash === hash) || null;
    }),
    getFileHistory: vi.fn().mockImplementation((filePath: string) => {
      return mockHistory.filter((commit) =>
        commit.message.toLowerCase().includes(filePath.toLowerCase())
      );
    }),
    commit: vi.fn().mockResolvedValue('mock-commit-hash'),
    add: vi.fn().mockResolvedValue(undefined),
    status: vi.fn().mockResolvedValue({
      modified: [],
      untracked: [],
      staged: [],
    }),
  };
}

// Example: How to extend setup when new features are added
// This shows the extensible pattern for adding new functionality

// When you add a new service to CivicPress core:
// 1. Add it to the mock setup
// 2. Add it to the test context
// 3. Add helper functions if needed

// Example: Adding a new "NotificationService"
function createMockNotificationService() {
  return {
    sendNotification: vi.fn().mockResolvedValue({ success: true }),
    getNotifications: vi.fn().mockResolvedValue([]),
    markAsRead: vi.fn().mockResolvedValue(true),
  };
}

// Example: Adding a new "AuditService"
function createMockAuditService() {
  return {
    logEvent: vi.fn().mockResolvedValue(undefined),
    getAuditLog: vi.fn().mockResolvedValue([]),
    exportAuditLog: vi.fn().mockResolvedValue('audit.csv'),
  };
}

// Test directory management
export function createTestDirectory(
  prefix: string = 'civicpress-test'
): TestConfig {
  const testDir = join(
    tmpdir(),
    `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}-${process.pid}`
  );
  const originalCwd = process.cwd();

  // Create directory structure
  const dataDir = join(testDir, 'data');
  const civicDir = join(dataDir, '.civic');
  const recordsDir = join(dataDir, 'records');

  mkdirSync(testDir, { recursive: true });
  mkdirSync(dataDir, { recursive: true });
  mkdirSync(civicDir, { recursive: true });
  mkdirSync(recordsDir, { recursive: true });

  // Initialize a git repository in the dataDir
  try {
    execSync('git init', { cwd: dataDir, stdio: 'ignore' });
  } catch (err) {
    // Ignore errors if git is not available
  }

  return {
    testDir,
    dataDir,
    civicDir,
    recordsDir,
    originalCwd,
    cleanupOnExit: TEST_CONFIG.CLEANUP_ON_EXIT,
  };
}

export function cleanupTestDirectory(config: TestConfig) {
  if (config.cleanupOnExit && existsSync(config.testDir)) {
    rmSync(config.testDir, { recursive: true, force: true });
  }
  process.chdir(config.originalCwd);
}

// Configuration file generation
export function createCivicConfig(config: TestConfig, overrides: any = {}) {
  const civicConfig = {
    dataDir: config.dataDir,
    database: {
      type: 'sqlite',
      sqlite: {
        file: join(config.testDir, 'test.db'),
      },
    },
    auth: {
      providers: ['password', 'github'],
      defaultRole: 'public',
      sessionTimeout: 24,
    },
    ...overrides,
  };

  writeFileSync(join(config.testDir, '.civicrc'), yaml.dump(civicConfig));
}

export function createWorkflowConfig(config: TestConfig) {
  const workflowConfig = {
    statuses: ['draft', 'proposed', 'reviewed', 'approved', 'archived'],
    transitions: {
      draft: ['proposed'],
      proposed: ['reviewed', 'archived'],
      reviewed: ['approved', 'archived'],
      approved: ['archived'],
      archived: [],
    },
    roles: {
      admin: {
        can_create: ['bylaw', 'policy', 'resolution'],
        can_edit: ['bylaw', 'policy', 'resolution'],
        can_delete: ['bylaw', 'policy', 'resolution'],
        can_transition: {
          draft: ['proposed'],
          any: ['archived'],
        },
      },
      clerk: {
        can_create: ['bylaw', 'policy', 'resolution'],
        can_edit: ['bylaw', 'policy', 'resolution'],
        can_transition: {
          draft: ['proposed'],
          any: ['archived'],
        },
      },
      council: {
        can_create: ['bylaw', 'policy', 'resolution'],
        can_edit: ['bylaw', 'policy', 'resolution'],
        can_delete: ['bylaw', 'policy', 'resolution'],
        can_transition: {
          draft: ['proposed'],
          any: ['archived'],
        },
      },
    },
  };

  writeFileSync(
    join(config.civicDir, 'workflow.yml'),
    yaml.dump(workflowConfig)
  );
}

export function createRolesConfig(config: TestConfig) {
  const rolesConfig = {
    default_role: 'public',
    roles: {
      admin: {
        name: 'Administrator',
        description: 'Full system access with all permissions',
        permissions: [
          'system:admin',
          'records:create',
          'records:edit',
          'records:delete',
          'records:view',
          'users:manage',
          'workflows:manage',
          'records:import',
          'records:export',
          'templates:manage',
          'hooks:manage',
        ],
        status_transitions: {
          draft: ['proposed'],
          any: ['archived'],
        },
      },
      clerk: {
        name: 'City Clerk',
        description: 'Administrative support with document management',
        permissions: ['records:create', 'records:edit', 'records:view'],
        status_transitions: {
          draft: ['proposed'],
        },
      },
      public: {
        name: 'Public',
        description: 'Read-only access to published records',
        permissions: ['records:view'],
      },
    },
    permissions: {
      'system:admin': {
        description: 'Full system administration access',
        level: 'system',
      },
      'records:create': {
        description: 'Create new records',
        level: 'record',
      },
      'records:edit': {
        description: 'Edit existing records',
        level: 'record',
      },
      'records:delete': {
        description: 'Delete records',
        level: 'record',
      },
      'records:view': {
        description: 'View records',
        level: 'record',
      },
      'users:manage': {
        description: 'Manage users',
        level: 'system',
      },
      'workflows:manage': {
        description: 'Manage workflow transitions',
        level: 'workflow',
      },
      'records:import': {
        description: 'Import data',
        level: 'system',
      },
      'records:export': {
        description: 'Export data',
        level: 'system',
      },
      'templates:manage': {
        description: 'Manage templates',
        level: 'system',
      },
      'hooks:manage': {
        description: 'Manage hooks',
        level: 'system',
      },
    },
    role_hierarchy: {
      admin: ['clerk', 'public'],
      clerk: ['public'],
      public: [],
    },
  };

  writeFileSync(join(config.civicDir, 'roles.yml'), yaml.dump(rolesConfig));

  // Debug output: log the path and existence of the roles config file
  const rolesPath = join(config.civicDir, 'roles.yml');
  // eslint-disable-next-line no-console
  console.log(
    '[DEBUG] roles.yml written at:',
    rolesPath,
    'exists:',
    existsSync(rolesPath)
  );
}

// Sample data generation
export function createSampleRecords(config: TestConfig) {
  const sampleRecords = [
    {
      id: 'bylaw-noise-restrictions',
      title: 'Noise Restrictions',
      type: 'bylaw',
      status: 'adopted',
      content: '# Noise Restrictions\n\nQuiet hours from 10 PM to 7 AM.',
      metadata: {
        author: 'Ada Lovelace',
        created: '2025-06-12',
        tags: ['noise', 'nighttime', 'curfew'],
      },
      path: 'records/bylaw-noise-restrictions.md',
    },
    {
      id: 'policy-data-privacy',
      title: 'Data Privacy Policy',
      type: 'policy',
      status: 'draft',
      content: '# Data Privacy Policy\n\nProtecting citizen data.',
      metadata: {
        author: 'Irène Joliot-Curie',
        created: '2025-07-15',
        tags: ['privacy', 'data', 'technology'],
      },
      path: 'records/policy-data-privacy.md',
    },
    {
      id: 'resolution-budget-2025',
      title: 'Budget Resolution 2025',
      type: 'resolution',
      status: 'proposed',
      content: '# Budget Resolution 2025\n\nAnnual budget allocation.',
      metadata: {
        author: 'Luc Lapointe',
        created: '2025-07-20',
        tags: ['budget', 'finance', '2025'],
        attachments: ['budget.pdf', 'metrics.xlsx'],
      },
      path: 'records/resolution-budget-2025.md',
    },
  ];

  sampleRecords.forEach((record) => {
    const filePath = join(config.recordsDir, record.path);
    const dir = join(filePath, '..');
    mkdirSync(dir, { recursive: true });
    writeFileSync(filePath, record.content);
  });

  return sampleRecords;
}

// Example: Adding new configuration options
export function createExtendedCivicConfig(
  config: TestConfig,
  overrides: any = {}
) {
  const civicConfig = {
    dataDir: config.dataDir,
    database: {
      type: 'sqlite',
      sqlite: {
        file: join(config.testDir, 'test.db'),
      },
    },
    auth: {
      providers: ['password', 'github'],
      defaultRole: 'public',
      sessionTimeout: 24,
    },
    // New features can be added here
    notifications: {
      enabled: true,
      email: false,
      webhook: false,
    },
    audit: {
      enabled: true,
      retention: 30,
    },
    // ... more new features
    ...overrides,
  };

  writeFileSync(join(config.testDir, '.civicrc'), yaml.dump(civicConfig));
}

// Example: Adding new sample data
export function createExtendedSampleRecords(config: TestConfig) {
  const baseRecords = createSampleRecords(config);

  // Add new record types
  const extendedRecords = [
    ...baseRecords,
    {
      id: 'proposal-new-park',
      title: 'New Park Proposal',
      type: 'proposal', // New record type
      status: 'draft',
      content: '# New Park Proposal\n\nBuilding a community park.',
      metadata: {
        author: 'Jane Smith',
        created: '2025-08-01',
        tags: ['parks', 'community', 'recreation'],
        budget: 50000,
      },
      path: 'records/proposal-new-park.md',
    },
    {
      id: 'report-quarterly-2025',
      title: 'Q1 2025 Quarterly Report',
      type: 'report', // New record type
      status: 'published',
      content:
        '# Q1 2025 Quarterly Report\n\nFinancial and operational summary.',
      metadata: {
        author: 'Finance Department',
        created: '2025-04-15',
        tags: ['finance', 'quarterly', '2025'],
        attachments: ['budget.pdf', 'metrics.xlsx'],
      },
      path: 'records/report-quarterly-2025.md',
    },
  ];

  // Write the new records
  extendedRecords.forEach((record) => {
    const filePath = join(config.recordsDir, record.path);
    const dir = join(filePath, '..');
    mkdirSync(dir, { recursive: true });
    writeFileSync(filePath, record.content);
  });

  return extendedRecords;
}

// CLI test helpers
export async function createCLITestContext(): Promise<CLITestContext> {
  const config = createTestDirectory('cli-test');

  // Create configuration files first
  createCivicConfig(config);
  createWorkflowConfig(config);
  createRolesConfig(config);
  createSampleRecords(config);

  // Initialize Git repository for the test directory
  const { simpleGit } = await import('simple-git');
  const git = simpleGit(config.testDir);
  await git.init();

  // Initialize CivicPress
  execSync(`cd ${config.testDir} && node ${TEST_CONFIG.CLI_PATH} init --yes`, {
    stdio: 'pipe',
  });

  return {
    testDir: config.testDir,
    cliPath: TEST_CONFIG.CLI_PATH,
  };
}

export function cleanupCLITestContext(context: CLITestContext) {
  if (existsSync(context.testDir)) {
    rmSync(context.testDir, { recursive: true, force: true });
  }
}

// API test helpers
export async function createAPITestContext(): Promise<APITestContext> {
  const config = createTestDirectory('api-test');
  const port = getRandomPort();

  // Create configuration files
  createCivicConfig(config);
  createWorkflowConfig(config);
  createRolesConfig(config);
  createSampleRecords(config);

  // Initialize Git repository for the test directory
  const { simpleGit } = await import('simple-git');
  const git = simpleGit(config.testDir);
  await git.init();

  // Also initialize Git repository in the data directory where CivicPress expects it
  const dataGit = simpleGit(config.dataDir);
  await dataGit.init();

  // Add some sample commits to the Git repository for testing
  await dataGit.add('.');
  await dataGit.commit('Initial commit');

  // Add a sample record file and commit it
  const bylawDir = join(config.dataDir, 'records', 'bylaw');
  await (await import('fs/promises')).mkdir(bylawDir, { recursive: true });
  const sampleRecordPath = join(bylawDir, 'test-record.md');
  const sampleRecordContent = `---
id: test-record
title: Test Record
type: bylaw
status: draft
author: test
---

# Test Record

This is a test record for API testing.`;
  await (
    await import('fs/promises')
  ).writeFile(sampleRecordPath, sampleRecordContent);
  await dataGit.add(sampleRecordPath);
  await dataGit.commit('feat(admin): Add test-record for API tests');

  // Initialize API with dynamic port
  const { CivicPressAPI } = await import('../../modules/api/src/index.js');
  const api = new CivicPressAPI(port);

  // Initialize CivicPress core first, then force reload role config before setting up routes
  await api.initialize(config.dataDir);

  // Generate the index after creating sample records and initializing the API
  const civicPress = api.getCivicPress();
  if (civicPress && typeof civicPress.getIndexingService === 'function') {
    await civicPress.getIndexingService().generateIndexes({
      rebuild: true,
      syncDatabase: true,
      conflictResolution: 'file-wins',
    });
  }

  // Force reload role configuration after CivicPress initialization but before routes are fully set up
  if (civicPress && typeof civicPress.getAuthService === 'function') {
    await civicPress.getAuthService().reloadRoleConfig();
    const { getLogger } = await import('../../core/dist/utils/logger.js');
    const logger = getLogger();
    logger.debug(
      'API test context: Called civicPress.getAuthService().reloadRoleConfig() after CivicPress initialization'
    );
  }

  return {
    api,
    testDir: config.testDir,
    port, // Include port in context for tests that need it
  };
}

export async function cleanupAPITestContext(context: APITestContext) {
  if (context.api) {
    await context.api.shutdown();
  }
  // Release the port back to the pool
  if (context.port) {
    releasePort(context.port);
  }
  if (existsSync(context.testDir)) {
    rmSync(context.testDir, { recursive: true, force: true });
  }
}

// Example: Extended API test context with new features
export async function createExtendedAPITestContext(): Promise<APITestContext> {
  const config = createTestDirectory('api-test-extended');
  const port = getRandomPort();

  // Create extended configuration
  createExtendedCivicConfig(config);
  createWorkflowConfig(config);
  createExtendedSampleRecords(config);

  // Initialize API with dynamic port
  const { CivicPressAPI } = await import('../../modules/api/src/index.js');
  const api = new CivicPressAPI(port);
  await api.initialize(config.dataDir);

  return {
    api,
    testDir: config.testDir,
    port,
  };
}

// Core test helpers
export async function createCoreTestContext(): Promise<CoreTestContext> {
  const config = createTestDirectory('core-test');

  // Create configuration files
  createCivicConfig(config);
  createWorkflowConfig(config);
  createRolesConfig(config);

  // Initialize Git repository for the test directory
  const { simpleGit } = await import('simple-git');
  const git = simpleGit(config.testDir);
  await git.init();

  // Also initialize Git repository in the data directory where CivicPress expects it
  const dataGit = simpleGit(config.dataDir);
  await dataGit.init();

  // Initialize CivicPress core
  const { CivicPress } = await import('../../core/src/civic-core.js');
  const civic = new CivicPress({
    dataDir: config.dataDir,
    database: {
      type: 'sqlite' as const,
      sqlite: {
        file: join(config.testDir, 'test.db'),
      },
    },
  });
  await civic.initialize();

  return {
    civic,
    testDir: config.testDir,
    dbPath: join(config.testDir, 'test.db'),
  };
}

export async function cleanupCoreTestContext(context: CoreTestContext) {
  if (context.civic) {
    await context.civic.shutdown();
  }
  if (existsSync(context.testDir)) {
    rmSync(context.testDir, { recursive: true, force: true });
  }
}

// Test utilities
export function createTestUser(role: string = 'public') {
  return {
    id: 1,
    username: `test-${role}`,
    role,
    email: `test-${role}@example.com`,
    name: `Test ${role.charAt(0).toUpperCase() + role.slice(1)} User`,
  };
}

export function createAuthToken(user: any = createTestUser('admin')) {
  return 'mock-auth-token-' + user.username;
}

// Example: Adding new test utilities
export function createTestNotification(userId: number, type: string = 'info') {
  return {
    id: Math.random().toString(36).substr(2, 9),
    userId,
    type,
    message: `Test ${type} notification`,
    createdAt: new Date().toISOString(),
    read: false,
  };
}

export function createTestAuditEvent(
  userId: number,
  action: string,
  resource: string
) {
  return {
    id: Math.random().toString(36).substr(2, 9),
    userId,
    action,
    resource,
    timestamp: new Date().toISOString(),
    ipAddress: '127.0.0.1',
    userAgent: 'test-agent',
  };
}

// Test decorators and helpers
export function withTestSetup<T extends any[]>(
  setupFn: () => Promise<T>,
  cleanupFn: (...args: T) => Promise<void>
) {
  return function (testFn: (...args: T) => Promise<void>) {
    return async () => {
      const context = await setupFn();
      try {
        await testFn(...context);
      } finally {
        await cleanupFn(...context);
      }
    };
  };
}

// Global test setup
export async function setupGlobalTestEnvironment() {
  // Set test environment variables
  process.env.NODE_ENV = 'test';
  process.env.BYPASS_AUTH = 'true';

  // Configure logger for debug output in tests - do this first
  const loggerModule = await import('../../core/dist/utils/logger.js');
  const logger = new loggerModule.Logger({ level: 4 }); // DEBUG level
  loggerModule.setLogger(logger);

  // Force a test log to confirm logger is working
  logger.debug('Test setup: Logger configured with DEBUG level');

  // Setup core mocks - COMMENTED OUT FOR INTEGRATION TESTS
  // setupCoreMocks();

  // Global cleanup
  afterAll(() => {
    vi.clearAllMocks();
  });
}

// Example: How to update the main mock setup when new services are added - COMMENTED OUT FOR INTEGRATION TESTS
export function setupExtendedCoreMocks() {
  // vi.mock('@civicpress/core', () => ({
  //   CivicPress: vi.fn().mockImplementation(() => ({
  //     initialize: vi.fn().mockResolvedValue(undefined),
  //     shutdown: vi.fn().mockResolvedValue(undefined),
  //     getRecordManager: vi.fn(() => createMockRecordManager()),
  //     getTemplateManager: vi.fn(() => createMockTemplateManager()),
  //     getHookSystem: vi.fn(() => createMockHookSystem()),
  //     getWorkflowEngine: vi.fn(() => createMockWorkflowEngine()),
  //     getImportExportManager: vi.fn(() => createMockImportExportManager()),
  //     getSearchManager: vi.fn(() => createMockSearchManager()),
  //     getAuthService: vi.fn(() => createMockAuthService()),
  //     getIndexingService: vi.fn(() => createMockIndexingService()),
  //     // New services can be added here
  //     getNotificationService: vi.fn(() => createMockNotificationService()),
  //     getAuditService: vi.fn(() => createMockAuditService()),
  //   })),
  //   WorkflowConfigManager: vi.fn().mockImplementation(() => ({
  //     initialize: vi.fn().mockResolvedValue(undefined),
  //     loadWorkflows: vi.fn().mockResolvedValue([]),
  //     getWorkflow: vi.fn().mockReturnValue(null),
  //     listWorkflows: vi.fn().mockReturnValue([]),
  //     validateAction: vi.fn().mockResolvedValue({ valid: true }),
  //   })),
  //   AuthConfigManager: {
  //     getInstance: vi.fn().mockReturnValue({
  //       loadConfig: vi.fn().mockResolvedValue(undefined),
  //     }),
  //   },
  //   Logger: vi.fn().mockImplementation(() => ({
  //     info: vi.fn(),
  //     warn: vi.fn(),
  //     error: vi.fn(),
  //     debug: vi.fn(),
  //   })),
  //   CentralConfigManager: {
  //     getDatabaseConfig: vi.fn().mockReturnValue({
  //       type: 'sqlite',
  //       database: ':memory:',
  //     }),
  //   },
  //   userCan: vi
  //     .fn()
  //     .mockImplementation(async (user: any, permission: string) => {
  //       const role = user?.role || 'public';
  //       if (role === 'admin') return true;
  //       if (role === 'clerk') {
  //         if (
  //           permission.includes('delete') ||
  //           permission.includes('import') ||
  //           permission.includes('export') ||
  //           permission.includes('templates:manage') ||
  //           permission.includes('hooks:manage') ||
  //           permission.includes('workflows:manage')
  //         ) {
  //           return false;
  //         }
  //         return true;
  //       }
  //       if (role === 'public') {
  //         if (permission.includes('view') || permission.includes('search')) {
  //           return true;
  //         }
  //         return false;
  //       }
  //       return false;
  //     }),
  // }));
}

// Export test utilities for use in individual test files
export { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll, vi };
