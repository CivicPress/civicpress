# CivicPress TODO

## Test Suite Refactor (High Priority)

### Problem

Current test suite has inconsistent setup/teardown patterns, individual tests
are not standardized, and there's no unified test harness. This leads to:

- Flaky tests due to hidden dependencies
- Inconsistent test environments
- Difficult maintenance and debugging
- Poor performance due to redundant setup

### Solution

Implement a robust, standardized test suite with:

#### 1. Global Test Harness

- **Setup**: Before all tests, create a fresh CivicPress instance with:
  - Standardized config files (`.civic/config.yml`)
  - Pre-defined roles and permissions
  - Sample templates and workflows
  - Clean database initialization
  - Required directory structure (`data/records`, `.civic/`, etc.)

- **Teardown**: After all tests, clean up:
  - All created files and directories
  - Database connections and data
  - Temporary processes and ports

#### 2. Standardized Fixtures

- **Configs**: Standard CivicPress configuration files
- **Roles**: Pre-defined user roles (admin, clerk, council, mayor, public)
- **Templates**: Basic templates for different record types
- **Sample Data**: Standard test records (bylaws, policies, resolutions)
- **Workflows**: Basic workflow configurations

#### 3. Test Utilities

- Helper functions for common setup tasks
- Database reset utilities
- User creation helpers
- Config loading utilities
- Port management for API tests

#### 4. Test Categories

- **Unit Tests**: Individual component testing (isolated)
- **Integration Tests**: Component interaction testing
- **API Tests**: Full API endpoint testing
- **CLI Tests**: Command-line interface testing
- **End-to-End Tests**: Complete workflow testing

### Implementation Plan

#### Phase 1: Foundation

1. Create `tests/setup/` directory with:
   - `global-setup.ts` - Main setup/teardown logic
   - `fixtures/` - Standard test data
   - `utils/` - Helper functions
   - `configs/` - Standard configuration files

2. Update `vitest.config.mjs` to use global setup

#### Phase 2: Migration

1. Refactor existing tests to use new harness
2. Standardize test patterns across all suites
3. Add proper isolation between tests

#### Phase 3: Enhancement

1. Add performance optimizations
2. Implement parallel test execution
3. Add comprehensive error reporting

### Benefits

- **Reliability**: Consistent, isolated test environment
- **Maintainability**: Centralized test configuration
- **Performance**: Optimized setup/teardown
- **Developer Experience**: Clear, predictable test behavior

### Dependencies

- Vitest configuration updates
- CivicPress core initialization improvements
- Database cleanup utilities
- File system management utilities

---

## Other TODOs

### Documentation

- [ ] Complete API documentation
- [ ] Add CLI usage examples
- [ ] Create deployment guide
- [ ] Add troubleshooting section

### Features

- [ ] Implement user management UI
- [ ] Add advanced search capabilities
- [ ] Create workflow visualization
- [ ] Add export/import validation

### Infrastructure

- [ ] Set up CI/CD pipeline
- [ ] Add automated testing
- [ ] Implement monitoring
- [ ] Create backup strategies
