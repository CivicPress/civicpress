# 🧪 CivicPress Tests

This folder contains test scaffolding and coverage for CivicPress.

## 🧱 Structure

```
tests/
├── api/              # API integration tests
│   ├── geography.test.ts    # Geography API endpoints
│   └── uuid-storage.test.ts # Storage system API endpoints
├── cli/              # Unit tests for CLI commands
├── core/             # Tests for core Git/API logic
├── modules/          # Module-specific tests (feedback, etc.)
├── fixtures/         # Test civic records and examples
│   └── test-setup.ts # Test environment setup utilities
└── utils/            # Shared test utilities
```

## 🧪 Test Goals

- Validate critical civic logic (approvals, merging, feedback)
- Ensure core CLI commands function as expected
- Simulate role-based access and Git commits
- Test API endpoints for geography and storage systems
- Verify data validation and error handling

## 🚀 Running Tests

Tests are run using Vitest. Use the following commands:

```bash
# Run all tests
pnpm run test:run

# Run tests in watch mode
pnpm run test:watch

# Run specific test file
pnpm run test:run tests/api/geography.test.ts
```

## 📋 Test Coverage

### API Tests

- **Geography API** (`tests/api/geography.test.ts`): Comprehensive tests for
  geography CRUD operations, color/icon mapping, presets, and raw content
  retrieval
- **Storage API** (`tests/api/uuid-storage.test.ts`): Tests for file upload,
  download, listing, access control, and folder configuration including the
  icons folder

### Test Fixtures

The `tests/fixtures/` directory contains:

- Test setup utilities (`test-setup.ts`) for creating test environments
- Default storage configurations including icons folder
- Test data generators and mock objects

**Storage Isolation:**

Tests use isolated storage directories with absolute paths (`{testDir}/storage`)
to prevent interference between tests. Each test context creates its own storage
configuration and directories, ensuring complete isolation from other tests and
the working directory.
