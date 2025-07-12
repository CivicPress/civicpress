# Test Infrastructure Documentation

## Overview

The test infrastructure creates **completely isolated test environments** that
are separate from your project files. Each test gets its own temporary
directory, database, and configuration.

## What Each Test Context Does

### 🔧 **Test Directory Creation**

```typescript
// Creates a unique temporary directory like:
// /tmp/civicpress-test-1703123456789-abc123def-12345/
const config = createTestDirectory('api-test');
```

**Directory Structure Created:**

```
/tmp/civicpress-test-{timestamp}-{random}-{pid}/
├── .civicrc                    # Test configuration
├── test.db                     # SQLite database (in-memory for tests)
└── data/
    ├── .civic/
    │   └── workflow.yml        # Workflow configuration
    └── records/
        ├── bylaw-noise-restrictions.md
        ├── policy-data-privacy.md
        └── resolution-budget-2025.md
```

### 🗄️ **Database Setup**

**API Tests:**

- Uses **SQLite in-memory database** (`:memory:`)
- Each test gets a fresh database
- No persistent files created

**Core Tests:**

- Uses **SQLite file database** in test directory
- Database file: `{testDir}/test.db`
- Automatically cleaned up after test

### 🌐 **API Server Setup**

**Port Usage:**

- **Default Port:** `3002` (hardcoded in `createAPITestContext()`)
- **Server Type:** Express.js server via CivicPressAPI
- **Isolation:** Each test gets its own server instance
- **Cleanup:** Server automatically shut down after test

```typescript
// In createAPITestContext():
const api = new CivicPressAPI(3002);  // Port 3002
await api.initialize(config.testDir);
```

### 👥 **User Management**

**Test Users Created:**

- **Admin User:** `test-admin` with full permissions
- **Clerk User:** `test-clerk` with limited permissions
- **Public User:** `test-public` with minimal permissions

**Authentication:**

- Uses **mock authentication** (not real password hashing)
- Tokens are generated instantly for testing
- No real user creation in database

### 📁 **File Isolation**

**Complete Separation:**

- ✅ **Temporary directories** in `/tmp/`
- ✅ **No access to project files**
- ✅ **No interference between tests**
- ✅ **Automatic cleanup** after each test
- ✅ **Unique timestamps** prevent conflicts

**Example Test Directory:**

```
/tmp/civicpress-test-1703123456789-abc123def-12345/
├── .civicrc
├── test.db
└── data/
    ├── .civic/
    │   └── workflow.yml
    └── records/
        ├── bylaw-noise-restrictions.md
        ├── policy-data-privacy.md
        └── resolution-budget-2025.md
```

## Test Context Types

### 1. **API Test Context** (`createAPITestContext()`)

**What it does:**

- Creates temporary test directory
- Generates `.civicrc` configuration
- Creates sample records (3 files)
- Starts API server on port 3002
- Sets up mock authentication

**Usage:**

```typescript
const context = await createAPITestContext();
// context.api.getApp() - Express app for supertest
// context.testDir - Path to test directory
```

### 2. **CLI Test Context** (`createCLITestContext()`)

**What it does:**

- Creates temporary test directory
- Runs `civic init --yes` to initialize CivicPress
- Sets up CLI environment

**Usage:**

```typescript
const context = createCLITestContext();
// context.testDir - Path to test directory
// context.cliPath - Path to CLI executable
```

### 3. **Core Test Context** (`createCoreTestContext()`)

**What it does:**

- Creates temporary test directory
- Initializes CivicPress core (no API server)
- Sets up database and configuration
- Provides direct access to core services

**Usage:**

```typescript
const context = await createCoreTestContext();
// context.civic - CivicPress core instance
// context.dbPath - Path to database file
```

## Configuration Files Generated

### `.civicrc` Configuration

```yaml
dataDir: /tmp/civicpress-test-.../data
database:
  type: sqlite
  sqlite:
    file: /tmp/civicpress-test-.../test.db
auth:
  providers: [password, github]
  defaultRole: public
  sessionTimeout: 24
```

### `workflow.yml` Configuration

```yaml
statuses: [draft, proposed, reviewed, approved, archived]
transitions:
  draft: [proposed]
  proposed: [reviewed, archived]
  # ... more transitions
roles:
  admin:
    can_create: [bylaw, policy, resolution]
    can_edit: [bylaw, policy, resolution]
    can_delete: [bylaw, policy, resolution]
  # ... more roles
```

## Sample Data Created

**3 Sample Records:**

1. **Noise Restrictions** (bylaw, adopted)
2. **Data Privacy Policy** (policy, draft)
3. **Budget Resolution 2025** (resolution, proposed)

**Each record includes:**

- Markdown content
- Metadata (author, created date, tags)
- Proper file structure

## Mock System

**What's Mocked:**

- ✅ All `@civicpress/core` exports
- ✅ Database operations (for API tests)
- ✅ Authentication (tokens, users)
- ✅ File system operations
- ✅ Git operations

**What's Real:**

- ✅ Express.js server (for API tests)
- ✅ HTTP requests/responses
- ✅ File system (for CLI tests)
- ✅ Database (for core tests)

## Cleanup Process

**Automatic Cleanup:**

1. **API Server:** `await context.api.shutdown()`
2. **Database:** Close connections
3. **Files:** `rmSync(testDir, { recursive: true, force: true })`
4. **Process:** Restore original working directory

**Example Cleanup:**

```typescript
afterEach(async () => {
  await cleanupAPITestContext(context);
  // Deletes: /tmp/civicpress-test-1703123456789-abc123def-12345/
});
```

## Environment Variables Set

```typescript
process.env.NODE_ENV = 'test';
process.env.BYPASS_AUTH = 'true';
```

## Port Conflicts

**Current Setup:**

- **API Tests:** Port 3002 (hardcoded)
- **Potential Issue:** Multiple tests running simultaneously could conflict

**Solutions:**

1. **Sequential Tests:** Vitest runs tests sequentially by default
2. **Dynamic Ports:** Could modify to use random available ports
3. **Test Isolation:** Each test gets fresh server instance

## Example Test Flow

```typescript
describe('API Test', () => {
  let context: APITestContext;

  beforeEach(async () => {
    // 1. Creates: /tmp/civicpress-test-1703123456789-abc123def-12345/
    // 2. Generates: .civicrc, workflow.yml, sample records
    // 3. Starts: API server on port 3002
    // 4. Sets up: Mock authentication
    context = await createAPITestContext();
  });

  afterEach(async () => {
    // 1. Shuts down: API server
    // 2. Closes: Database connections
    // 3. Deletes: Entire test directory
    // 4. Restores: Original working directory
    await cleanupAPITestContext(context);
  });

  it('should work', async () => {
    // Test runs in isolated environment
  });
});
```

## Benefits

1. **Complete Isolation:** No interference between tests
2. **No Project Pollution:** Tests don't touch your actual files
3. **Fast Setup:** Pre-configured environments
4. **Automatic Cleanup:** No leftover files
5. **Consistent Environment:** Same setup for all tests
6. **Easy Debugging:** Clear test directory structure
