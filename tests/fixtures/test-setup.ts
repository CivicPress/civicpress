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
import { join, dirname } from 'path';
import {
  existsSync,
  rmSync,
  mkdirSync,
  writeFileSync,
  writeFile,
  readFileSync,
} from 'fs';
import { ensureDirSync } from 'fs-extra';
import { tmpdir } from 'os';
import yaml from 'js-yaml';
import { RecordParser, RecordData } from '@civicpress/core';

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
  civic: any;
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

let cliBuilt = false;

export function ensureCliBuilt(): void {
  if (!cliBuilt) {
    const cliDir = join(dirname(TEST_CONFIG.CLI_PATH), '..');
    const distIndex = join(cliDir, 'dist', 'index.js');
    if (!existsSync(distIndex)) {
      execSync('pnpm run build', {
        cwd: cliDir,
        stdio: 'pipe',
      });
    }
    cliBuilt = true;
  }
}

// Mock setup for @civicpress/core - Removed for integration tests
// Integration tests now use the real CivicPress instance instead of mocks
export function setupCoreMocks() {
  // This function is kept for API compatibility but does nothing
  // Integration tests use real CivicPress instances
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
            status: 'published', // Changed from 'adopted'
            module: 'legal-register',
            tags: ['noise', 'nighttime', 'curfew'],
            authors: [{ name: 'Ada Lovelace', role: 'clerk' }],
            created: '2025-06-12T10:00:00Z', // ISO 8601 format
            updated: '2025-07-01T14:30:00Z', // ISO 8601 format
            slug: 'noise-restrictions',
            path: 'records/bylaw-noise-restrictions.md',
          },
          {
            title: 'Old Regulation',
            type: 'bylaw',
            status: 'archived',
            module: 'legal-register',
            tags: ['archived', 'historical'],
            authors: [{ name: 'Historical Department', role: 'clerk' }],
            created: '2020-01-01T10:00:00Z', // ISO 8601 format
            updated: '2025-01-01T10:00:00Z', // ISO 8601 format
            slug: 'old-regulation',
            path: 'records/bylaw-old-regulation.md',
          },
        ],
        metadata: {
          totalRecords: 2,
          modules: ['legal-register'],
          types: ['bylaw'],
          statuses: ['published', 'archived'], // Changed from 'adopted'
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

      // Update metadata based on filtered entries
      index.metadata.totalRecords = index.entries.length;
      index.metadata.types = [...new Set(index.entries.map((e) => e.type))];
      index.metadata.statuses = [
        ...new Set(index.entries.map((e) => e.status)),
      ];
      index.metadata.modules = [
        ...new Set(index.entries.map((e) => e.module).filter(Boolean)),
      ];

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
            status: 'published', // Changed from 'adopted'
            module: 'legal-register',
            tags: ['noise', 'nighttime', 'curfew'],
            authors: [{ name: 'Ada Lovelace', role: 'clerk' }],
            created: '2025-06-12T10:00:00Z', // ISO 8601 format
            updated: '2025-07-01T14:30:00Z', // ISO 8601 format
            slug: 'noise-restrictions',
            path: 'records/bylaw-noise-restrictions.md',
          },
        ],
        metadata: {
          totalRecords: 1,
          modules: ['legal-register'],
          types: ['bylaw'],
          statuses: ['published'], // Changed from 'adopted'
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
            status: 'published', // Changed from 'adopted'
            module: 'legal-register',
            tags: ['noise', 'nighttime', 'curfew'],
            authors: [{ name: 'Ada Lovelace', role: 'clerk' }],
            created: '2025-06-12T10:00:00Z', // ISO 8601 format
            updated: '2025-07-01T14:30:00Z', // ISO 8601 format
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

  // Also create config.yml in data/.civic/ for CentralConfigManager
  const configYmlPath = join(config.dataDir, '.civic', 'config.yml');
  ensureDirSync(join(config.dataDir, '.civic'));

  // Copy default config.yml structure (record types and statuses)
  const defaultConfig = {
    modules: ['legal-register'],
    default_role: 'clerk',
    hooks: { enabled: true },
    workflows: { enabled: true },
    audit: { enabled: true },
    record_types_config: {
      bylaw: {
        label: 'Bylaws',
        description: 'Municipal bylaws and regulations',
        source: 'core',
        priority: 1,
      },
      ordinance: {
        label: 'Ordinances',
        description: 'Local ordinances and laws',
        source: 'core',
        priority: 2,
      },
      policy: {
        label: 'Policies',
        description: 'Administrative policies',
        source: 'core',
        priority: 3,
      },
      proclamation: {
        label: 'Proclamations',
        description: 'Official proclamations',
        source: 'core',
        priority: 4,
      },
      resolution: {
        label: 'Resolutions',
        description: 'Council resolutions',
        source: 'core',
        priority: 5,
      },
      geography: {
        label: 'Geography',
        description: 'Geographic data files (GeoJSON/KML)',
        source: 'core',
        priority: 6,
      },
      session: {
        label: 'Session',
        description: 'Meeting sessions and minutes',
        source: 'core',
        priority: 7,
      },
    },
    record_statuses_config: {
      draft: {
        label: 'Draft',
        description: 'Initial working version, not yet ready for review',
        source: 'core',
        priority: 1,
      },
      pending_review: {
        label: 'Pending Review',
        description: 'Submitted for review and awaiting approval',
        source: 'core',
        priority: 2,
      },
      under_review: {
        label: 'Under Review',
        description: 'Currently under active review by authorized personnel',
        source: 'core',
        priority: 3,
      },
      approved: {
        label: 'Approved',
        description: 'Approved and currently in effect',
        source: 'core',
        priority: 4,
      },
      published: {
        label: 'Published',
        description: 'Publicly available and in effect',
        source: 'core',
        priority: 5,
      },
      rejected: {
        label: 'Rejected',
        description: 'Rejected and not approved',
        source: 'core',
        priority: 6,
      },
      archived: {
        label: 'Archived',
        description: 'No longer active but preserved for reference',
        source: 'core',
        priority: 7,
      },
      expired: {
        label: 'Expired',
        description: 'Past its effective date and no longer in force',
        source: 'core',
        priority: 8,
      },
    },
    version: '1.0.0',
  };

  writeFileSync(configYmlPath, yaml.dump(defaultConfig));
}

export function createStorageConfig(config: TestConfig) {
  // Use absolute path within test directory to ensure complete isolation
  const storagePath = join(config.testDir, 'storage');
  const storageConfig = {
    backend: {
      type: 'local',
      path: storagePath, // Use absolute path for test isolation
    },
    providers: {
      local: {
        type: 'local',
        path: storagePath, // Use absolute path for test isolation
        enabled: true,
      },
    },
    active_provider: 'local',
    failover_providers: ['local'],
    global: {
      max_file_size: '100MB',
      health_checks: false,
      health_check_interval: 30,
      retry_attempts: 1,
      cross_provider_backup: false,
      backup_providers: [],
    },
    folders: {
      public: {
        path: 'public',
        access: 'public',
        allowed_types: [
          'jpg',
          'jpeg',
          'png',
          'gif',
          'pdf',
          'txt',
          'md',
          'doc',
          'docx',
        ],
        max_size: '10MB',
        description: 'Public files for testing',
      },
      sessions: {
        path: 'sessions',
        access: 'public',
        allowed_types: ['mp4', 'webm', 'mp3', 'wav', 'pdf', 'md'],
        max_size: '100MB',
        description: 'Session files for testing',
      },
      icons: {
        path: 'icons',
        access: 'authenticated',
        allowed_types: ['png', 'svg', 'jpg', 'jpeg', 'gif', 'webp', 'ico'],
        max_size: '2MB',
        description: 'Icons and map-related images for geography records',
      },
    },
    metadata: {
      auto_generate_thumbnails: false,
      store_exif: false,
      compress_images: false,
      backup_included: false,
    },
  };

  const systemDataDir = join(config.dataDir, '.system-data');
  ensureDirSync(systemDataDir);
  const storageConfigPath = join(systemDataDir, 'storage.yml');

  // Ensure storage directory exists
  ensureDirSync(storagePath);
  // Create folder subdirectories
  for (const folder of Object.keys(storageConfig.folders)) {
    const folderPath = join(storagePath, storageConfig.folders[folder].path);
    ensureDirSync(folderPath);
  }

  writeFileSync(storageConfigPath, yaml.dump(storageConfig));
}

export function createWorkflowConfig(config: TestConfig) {
  const workflowConfig = {
    statuses: [
      'draft',
      'pending_review',
      'under_review',
      'approved',
      'published',
      'archived',
    ],
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
    _metadata: {
      name: 'Test User Roles & Permissions',
      description:
        'Test configuration for user roles, permissions, and status transitions',
      version: '1.0.0',
      editable: true,
    },
    default_role: {
      value: 'public',
      type: 'string',
      description: 'Default role assigned to new users',
      required: true,
    },
    roles: {
      admin: {
        name: {
          value: 'Administrator',
          type: 'string',
          description: 'Role display name',
          required: true,
        },
        description: {
          value: 'Full system access with all permissions',
          type: 'string',
          description: 'Role description',
          required: true,
        },
        permissions: {
          value: [
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
            'config:manage',
            'storage:admin',
            'storage:manage',
            'storage:upload',
            'storage:download',
            'storage:delete',
          ],
          type: 'array',
          description: 'List of permissions granted to this role',
          required: true,
        },
        status_transitions: {
          value: {
            draft: ['proposed'],
            any: ['archived'],
          },
          type: 'object',
          description: 'Status transitions this role can perform',
          required: true,
        },
      },
      clerk: {
        name: {
          value: 'City Clerk',
          type: 'string',
          description: 'Role display name',
          required: true,
        },
        description: {
          value: 'Administrative support with document management',
          type: 'string',
          description: 'Role description',
          required: true,
        },
        permissions: {
          value: [
            'records:create',
            'records:edit',
            'records:view',
            'storage:upload',
            'storage:download',
            'storage:manage',
          ],
          type: 'array',
          description: 'List of permissions granted to this role',
          required: true,
        },
        status_transitions: {
          value: {
            draft: ['proposed'],
          },
          type: 'object',
          description: 'Status transitions this role can perform',
          required: true,
        },
      },
      public: {
        name: {
          value: 'Public',
          type: 'string',
          description: 'Role display name',
          required: true,
        },
        description: {
          value: 'Read-only access to published records',
          type: 'string',
          description: 'Role description',
          required: true,
        },
        permissions: {
          value: ['records:view'],
          type: 'array',
          description: 'List of permissions granted to this role',
          required: true,
        },
        status_transitions: {
          value: {},
          type: 'object',
          description: 'Status transitions this role can perform',
          required: true,
        },
      },
    },
    permissions: {
      'system:admin': {
        description: 'Full system administration access',
        level: 'system',
      },
      'config:manage': {
        description: 'Manage configuration files and settings',
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
      admin: {
        value: ['clerk', 'public'],
        type: 'array',
        description: 'Roles that admin can manage',
        required: true,
      },
      clerk: {
        value: ['public'],
        type: 'array',
        description: 'Roles that clerk can manage',
        required: true,
      },
      public: {
        value: [],
        type: 'array',
        description: 'Roles that public users can manage',
        required: true,
      },
    },
  };

  writeFileSync(join(config.civicDir, 'roles.yml'), yaml.dump(rolesConfig));

  // Copy geography presets file - ensure it's always created for tests
  const presetsSourcePath = join(
    process.cwd(),
    'core',
    'src',
    'defaults',
    'geography-presets.yml'
  );
  const presetsDestPath = join(config.civicDir, 'geography-presets.yml');

  // Always create presets file - either from source or minimal version
  if (existsSync(presetsSourcePath)) {
    const presetsContent = readFileSync(presetsSourcePath, 'utf8');
    writeFileSync(presetsDestPath, presetsContent);
  } else {
    // If source doesn't exist, create a minimal presets file for tests
    const minimalPresets = {
      _metadata: {
        name: 'Geography Styling Presets',
        description: 'Reusable color and icon mapping configurations',
        version: '1.0.0',
        editable: true,
      },
      presets: {
        land_use_zones: {
          name: 'Land Use Zones',
          description: 'Color scheme for land use zones using LETTRE codes',
          type: 'color',
          color_mapping: {
            property: 'LETTRE',
            type: 'property',
            colors: {
              IND: '#64748b',
              A: '#10b981',
              RF: '#059669',
              PU: '#f59e0b',
              AFD: '#84cc16',
              AF: '#22c55e',
            },
            default_color: '#6b7280',
          },
        },
        zone_by_name: {
          name: 'Zones by Name',
          description: 'Color scheme for zones using the NOM property',
          type: 'color',
          color_mapping: {
            property: 'NOM',
            type: 'property',
            colors: {
              Industrielle: '#64748b',
              Agricole: '#10b981',
              'Récréo-forestière': '#059669',
            },
            default_color: '#6b7280',
          },
        },
      },
    };
    writeFileSync(presetsDestPath, yaml.dump(minimalPresets));
  }

  // Ensure the file was created
  if (!existsSync(presetsDestPath)) {
    console.warn(
      `Warning: Failed to create presets file at ${presetsDestPath}`
    );
  }
}

// Sample data generation
export function createSampleRecords(config: TestConfig) {
  const sampleRecords = [
    {
      id: 'bylaw-noise-restrictions',
      title: 'Noise Restrictions',
      type: 'bylaw',
      status: 'published', // Changed from 'adopted'
      content: '# Noise Restrictions\n\nQuiet hours from 10 PM to 7 AM.',
      metadata: {
        author: 'alovelace',
        authorName: 'Ada Lovelace',
        created: '2025-06-12T10:00:00Z', // ISO 8601 format
        updated: '2025-07-01T14:30:00Z', // Added required updated field
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
        author: 'ijoliot',
        authorName: 'Irène Joliot-Curie',
        created: '2025-07-15T10:00:00Z', // ISO 8601 format
        updated: '2025-07-15T10:00:00Z', // Added required updated field
        tags: ['privacy', 'data', 'technology'],
      },
      path: 'records/policy-data-privacy.md',
    },
    {
      id: 'resolution-budget-2025',
      title: 'Budget Resolution 2025',
      type: 'resolution',
      status: 'pending_review', // Changed from 'proposed'
      content: '# Budget Resolution 2025\n\nAnnual budget allocation.',
      metadata: {
        author: 'llapointe',
        authorName: 'Luc Lapointe',
        created: '2025-07-20T10:00:00Z', // ISO 8601 format
        updated: '2025-07-20T10:00:00Z', // Added required updated field
        tags: ['budget', 'finance', '2025'],
        attachments: ['budget.pdf', 'metrics.xlsx'],
      },
      path: 'records/resolution-budget-2025.md',
    },
    {
      id: 'bylaw-old-regulation',
      title: 'Old Regulation',
      type: 'bylaw',
      status: 'archived',
      content: '# Old Regulation\n\nThis regulation has been archived.',
      metadata: {
        author: 'historical',
        authorName: 'Historical Department',
        created: '2020-01-01T10:00:00Z', // ISO 8601 format
        updated: '2025-01-01T10:00:00Z', // Added required updated field
        tags: ['archived', 'historical', 'old'],
      },
      path: 'records/bylaw-old-regulation.md',
    },
  ];

  sampleRecords.forEach((record) => {
    const createdTimestamp =
      record.metadata.created ||
      record.metadata.updated ||
      new Date().toISOString();
    const createdDate = new Date(createdTimestamp);
    const year = Number.isNaN(createdDate.getTime())
      ? new Date().getUTCFullYear().toString()
      : createdDate.getUTCFullYear().toString();
    const relativePath = join(
      'records',
      record.type,
      year,
      `${record.id}.md`
    ).replace(/\\/g, '/');
    record.path = relativePath;

    const filePath = join(
      config.dataDir,
      relativePath.replace(/^records\//, '')
    );
    const dir = join(filePath, '..');
    mkdirSync(dir, { recursive: true });

    const metadata: Record<string, any> = {};
    if (record.metadata.tags) {
      metadata.tags = record.metadata.tags;
    }
    if (record.metadata.attachments) {
      metadata.attachments = record.metadata.attachments;
    }

    const recordData: RecordData = {
      id: record.id,
      title: record.title,
      type: record.type,
      status: record.status,
      content: record.content,
      author: record.metadata.author,
      authors: [
        {
          name: record.metadata.authorName,
          username: record.metadata.author,
          role: 'clerk',
        },
      ],
      created_at: record.metadata.created,
      updated_at: record.metadata.updated,
      metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
    };

    const markdown = RecordParser.serializeToMarkdown(recordData);

    writeFileSync(filePath, markdown);
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
      metadata: {
        author: 'Jane Smith',
        authorName: 'Jane Smith',
        created: '2025-08-01T00:00:00Z',
      },
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
        authorName: 'Finance Department',
        created: '2025-04-15T00:00:00Z',
        tags: ['finance', 'quarterly', '2025'],
        attachments: ['budget.pdf', 'metrics.xlsx'],
      },
    },
  ];

  // Write the new records
  extendedRecords.forEach((record) => {
    const createdTimestamp =
      record.metadata?.created ||
      record.metadata?.updated ||
      new Date().toISOString();
    const createdDate = new Date(createdTimestamp);
    const year = Number.isNaN(createdDate.getTime())
      ? new Date().getUTCFullYear().toString()
      : createdDate.getUTCFullYear().toString();
    const relativePath = join(
      'records',
      record.type,
      year,
      `${record.id}.md`
    ).replace(/\\/g, '/');
    record.path = relativePath;

    const filePath = join(
      config.dataDir,
      relativePath.replace(/^records\//, '')
    );
    mkdirSync(join(filePath, '..'), { recursive: true });

    const recordData: RecordData = {
      id: record.id,
      title: record.title,
      type: record.type,
      status: record.status,
      content: record.content,
      author: record.metadata?.author || 'system',
      authors: [
        {
          name: record.metadata?.authorName || 'System',
          username: record.metadata?.author || 'system',
          role: 'clerk',
        },
      ],
      created_at: record.metadata?.created || new Date().toISOString(),
      updated_at: record.metadata?.created || new Date().toISOString(),
      metadata: record.metadata,
    };

    const markdown = RecordParser.serializeToMarkdown(recordData);
    writeFileSync(filePath, markdown);
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

  // Ensure CLI is built before executing commands
  ensureCliBuilt();

  // Initialize Git repository for the test directory
  const { simpleGit } = await import('simple-git');
  const git = simpleGit(config.testDir);
  await git.init();

  // Initialize CivicPress
  execSync(`cd ${config.testDir} && node ${TEST_CONFIG.CLI_PATH} init --yes`, {
    stdio: 'pipe',
  });

  // Create admin user using simulated authentication (for testing)
  let adminToken: string | undefined;
  try {
    // Use simulated authentication for admin user
    const authResult = execSync(
      `cd ${config.testDir} && node ${TEST_CONFIG.CLI_PATH} auth:simulated --username testadmin --role admin --json`,
      { encoding: 'utf8' }
    );

    // Extract JSON from the output - look for the last JSON object
    const lines = authResult.split('\n');

    // Find the last line that starts with '{' (the JSON response)
    let jsonStart = -1;
    for (let i = lines.length - 1; i >= 0; i--) {
      if (lines[i].trim().startsWith('{')) {
        jsonStart = i;
        break;
      }
    }

    if (jsonStart !== -1) {
      // Parse from the start of JSON to the end
      const jsonText = lines.slice(jsonStart).join('\n');
      try {
        const authJson = JSON.parse(jsonText);
        if (authJson.success && authJson.session && authJson.session.token) {
          adminToken = authJson.session.token;
        } else {
          throw new Error('Invalid JSON structure from auth:simulated');
        }
      } catch (parseError) {
        throw new Error(
          `Failed to parse JSON from auth:simulated: ${parseError}`
        );
      }
    } else {
      throw new Error('No JSON output found in simulated authentication');
    }
  } catch (error) {
    // If admin user creation failed, we'll continue without admin token
    // Tests that need authentication will need to handle this case
    console.warn('Warning: Failed to create admin user for CLI tests:', error);
  }

  return {
    testDir: config.testDir,
    cliPath: TEST_CONFIG.CLI_PATH,
    adminToken,
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
  createStorageConfig(config);
  createSampleRecords(config);

  // Initialize Git repository for the test directory
  const { simpleGit } = await import('simple-git');
  const git = simpleGit(config.testDir);
  await git.init();

  // Also initialize Git repository in the data directory where CivicPress expects it
  const dataGit = simpleGit(config.dataDir);
  await dataGit.init();

  // Add sample record files and commit them
  const bylawDir = join(config.dataDir, 'records', 'bylaw');
  await (await import('fs/promises')).mkdir(bylawDir, { recursive: true });

  // Add the test record (using new standardized format)
  const sampleRecordPath = join(bylawDir, 'test-record.md');
  const sampleRecord: RecordData = {
    id: 'test-record',
    title: 'Test Record',
    type: 'bylaw',
    status: 'archived',
    content: '# Test Record\n\nThis is a test record for API testing.',
    author: 'test',
    authors: [
      {
        name: 'Test User',
        username: 'test',
        role: 'clerk',
      },
    ],
    created_at: '2025-01-01T10:00:00Z',
    updated_at: '2025-01-01T10:00:00Z',
  };
  const sampleRecordContent = RecordParser.serializeToMarkdown(sampleRecord);
  await (
    await import('fs/promises')
  ).writeFile(sampleRecordPath, sampleRecordContent);

  // Add an archived record for indexing tests (using new standardized format)
  const archivedRecordPath = join(bylawDir, 'old-regulation.md');
  const archivedRecord: RecordData = {
    id: 'old-regulation',
    title: 'Old Regulation',
    type: 'bylaw',
    status: 'archived',
    content: '# Old Regulation\n\nThis regulation has been archived.',
    author: 'historical',
    authors: [
      {
        name: 'Historical Department',
        username: 'historical',
        role: 'clerk',
      },
    ],
    created_at: '2024-01-01T10:00:00Z',
    updated_at: '2024-01-01T10:00:00Z',
  };
  const archivedRecordContent =
    RecordParser.serializeToMarkdown(archivedRecord);
  await (
    await import('fs/promises')
  ).writeFile(archivedRecordPath, archivedRecordContent);

  await dataGit.add(sampleRecordPath);
  await dataGit.commit('feat(bylaw): Add test-record for API testing');

  await dataGit.add(archivedRecordPath);
  await dataGit.commit('feat(bylaw): Add old-regulation (archived)');

  // Add some additional commits to create more history
  await dataGit.add(sampleRecordPath);
  await dataGit.commit('update(bylaw): Update test-record content');

  await dataGit.add(archivedRecordPath);
  await dataGit.commit('update(bylaw): Update old-regulation metadata');

  // Add a commit that affects both records
  await dataGit.add('.');
  await dataGit.commit(
    'chore(bylaw): Update both test-record and old-regulation'
  );

  // Initialize API with dynamic port
  const { CivicPressAPI } = await import('../../modules/api/src/index.js');
  const api = new CivicPressAPI(port);

  // Change to test directory so CentralConfigManager finds the .civicrc file
  const originalCwd = process.cwd();
  process.chdir(config.testDir);

  try {
    // Initialize CivicPress core first, then force reload role config before setting up routes
    await api.initialize(config.dataDir);

    // Force reload role configuration after CivicPress initialization but before routes are fully set up
    const civicPress = api.getCivicPress();
    if (civicPress && typeof civicPress.getAuthService === 'function') {
      await civicPress.getAuthService().reloadRoleConfig();
    }

    // Generate the index after creating sample records and initializing the API
    if (civicPress && typeof civicPress.getIndexingService === 'function') {
      await civicPress.getIndexingService().generateIndexes({
        rebuild: true,
        syncDatabase: true,
        conflictResolution: 'file-wins',
      });
    }
  } finally {
    // Restore original working directory
    process.chdir(originalCwd);
  }

  return {
    api,
    civic: api.getCivicPress(),
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
  createStorageConfig(config);
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

  // Integration tests use real CivicPress instances, not mocks
  // setupCoreMocks(); // No longer needed

  // Global cleanup
  afterAll(() => {
    vi.clearAllMocks();
  });
}

// Extended mock setup - Removed for integration tests
// Integration tests now use the real CivicPress instance instead of mocks
export function setupExtendedCoreMocks() {
  // This function is kept for API compatibility but does nothing
  // Integration tests use real CivicPress instances
}

// Export test utilities for use in individual test files
export { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll, vi };
