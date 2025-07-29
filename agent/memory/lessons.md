# Agent Memory: Lessons Learned

## UI Development Lessons (Latest)

### Vue 3 and Nuxt UI Pro Patterns

- **Component Resolution**: Some Nuxt UI Pro components like `ULoadingBlock` may
  not be available - use standard alternatives like `UIcon` with `animate-spin`
- **Reactive State Management**: Direct access to Pinia store properties
  (`recordsStore.isLoading`) is more reliable than `storeToRefs` for certain
  reactive properties
- **Composable Architecture**: Extract reusable logic into composables
  (`useMarkdown`, `useRecordUtils`, `useRecordTypes`, `useRecordStatuses`) for
  DRY principle
- **Type Safety**: Use proper TypeScript casting for component props (e.g.,
  `color="getStatusColor(record.status) as any"`)

### URL State Management

- **Query Parameter Synchronization**: Use `useRoute` and `useRouter` to sync UI
  state with URL query parameters
- **State Persistence**: Implement `updateURL` and `restoreFromURL` functions to
  preserve filters, search, and pagination across navigation
- **Back Navigation**: Use `router.back()` instead of `navigateTo('/records')`
  to preserve previous page state
- **Debounced Updates**: Use `useDebounceFn` for search input to avoid excessive
  API calls

### Pagination and Data Management

- **Client-Side Pagination**: Implement pagination in the `filteredRecords`
  getter rather than server-side for every page change
- **Record Accumulation**: Always call `addOrUpdateRecords` to accumulate
  records in the store, never replace
- **Display Logic**: Separate data fetching from display logic - display should
  show current page subset from accumulated data
- **Page Size Reactivity**: Use computed properties for pagination display to
  ensure reactivity to page size changes

### Loading States and Error Handling

- **Loading Indicators**: Show loading states during initial load and subsequent
  data fetches
- **Parallel Loading**: Use `Promise.all` to fetch records and configuration
  data in parallel
- **Error Boundaries**: Implement proper error handling with user-friendly
  messages and retry options
- **State Debugging**: Use extensive `console.log` to trace reactive state
  issues between store and UI

### Markdown Rendering

- **Custom Renderer**: Use `marked` library with custom renderer to shift
  heading levels and avoid conflicts with page structure
- **HTML Rendering**: Use `v-html` directive to render parsed Markdown HTML
  instead of displaying as plain text
- **Styling Integration**: Apply Tailwind's `prose` classes and custom CSS for
  consistent styling with Nuxt UI Pro theme
- **Content Safety**: Ensure Markdown content is properly sanitized before
  rendering

### API Integration Patterns

- **Request Interceptors**: Use `$fetch.create` wrapper with request
  interceptors for automatic token injection
- **Response Handling**: Implement proper error handling for API responses
- **Type Safety**: Use proper TypeScript interfaces for API responses and
  request payloads
- **Headers Management**: Handle different header formats (array, Headers
  object, plain object) in request interceptors

### Search and Filtering Logic

- **Filter Combinations**: Implement OR logic within filter types and AND logic
  between different filter types
- **Search Integration**: Ensure search queries work correctly with active
  filters
- **Clear Functionality**: Implement individual clear buttons for filters and
  search with proper state updates
- **Debounced Search**: Use debounced search to avoid excessive API calls while
  typing

### Component Design Patterns

- **Slot Usage**: Use named slots (e.g., `#trailing`) for complex input
  components with clear buttons
- **Computed Properties**: Use computed properties for derived state that
  depends on multiple reactive sources
- **Watchers**: Use watchers for side effects like API calls when reactive state
  changes
- **Template Organization**: Keep templates clean with proper conditional
  rendering and loading states

### Performance Optimization

- **Caching**: Cache record types and statuses globally to avoid repeated API
  calls
- **Lazy Loading**: Load data only when needed and show appropriate loading
  states
- **Memory Management**: Properly manage accumulated records to prevent memory
  leaks
- **Efficient Rendering**: Use `v-if` and `v-else` for conditional rendering
  instead of `v-show` when appropriate

### Development and Debugging

- **Build Process**: Remember to rebuild core module (`pnpm run build` in `core`
  directory) for API changes
- **API Delays**: Use temporary delays in API for testing loading states, then
  remove them
- **Console Debugging**: Use extensive logging to trace data flow between
  frontend and backend
- **Component Resolution**: Check for missing components and use available
  alternatives

### CSS and Styling

- **SCSS Integration**: Be cautious with SCSS integration - Nuxt UI Pro may have
  compatibility issues with `sass-embedded`
- **Fallback Strategy**: Revert to plain CSS if SCSS causes build issues
- **Theme Integration**: Ensure custom styles integrate properly with Nuxt UI
  Pro theme
- **Responsive Design**: Use Tailwind's responsive utilities for mobile-friendly
  interfaces

### Testing Considerations

- **Component Testing**: Test Vue components with proper mocking of composables
  and stores
- **API Mocking**: Mock API responses for consistent testing
- **State Testing**: Test reactive state changes and computed properties
- **User Interaction**: Test user interactions like search, filtering, and
  pagination

## Authentication Implementation Lessons (Latest)

### UI Authentication Patterns

- **Dual Authentication Support**: Implement both username/password and GitHub
  token authentication for flexibility
- **Form Validation**: Use real-time validation with computed properties for
  better UX
- **Loading States**: Always show loading indicators during authentication
  operations
- **Error Handling**: Comprehensive error display with user-friendly messages
- **Session Persistence**: Use localStorage with proper cleanup and expiration
  handling

### JWT Token Management

- **Automatic Injection**: Configure API plugin to automatically add
  Authorization headers
- **Token Expiration**: Check token expiration on app startup and clear invalid
  tokens
- **401 Handling**: Automatically logout and redirect on authentication failures
- **Security**: Never store sensitive data in localStorage, only tokens and user
  info
- **Cleanup**: Proper cleanup of all auth data on logout or token expiry

### Pinia Store Patterns

- **Centralized State**: Use Pinia store for all authentication state management
- **Persistence**: Implement localStorage persistence with error handling
- **Reactivity**: Ensure all auth state changes trigger proper UI updates
- **Integration**: Seamless integration between store and API plugin
- **Permissions**: Implement role and permission checking in store getters

### API Integration Best Practices

- **Login Endpoint Bypass**: Skip token injection for authentication endpoints
- **Error Recovery**: Graceful handling of network errors and auth failures
- **Request Interceptors**: Use request interceptors for automatic token
  injection
- **Response Interceptors**: Use response interceptors for 401 error handling
- **Type Safety**: Proper TypeScript typing for API responses and auth state

### User Experience Considerations

- **Confirmation Dialogs**: Use confirmation dialogs for destructive actions
  like logout
- **User Feedback**: Always provide clear feedback for all authentication
  actions
- **Redirect Flow**: Proper redirect handling after login/logout
- **Form UX**: Disable forms during loading states
- **Error Display**: Clear, actionable error messages for users

### Security Considerations

- **Token Storage**: Store tokens securely with proper expiration handling
- **State Cleanup**: Complete cleanup of all auth data on logout
- **Error Handling**: Don't expose sensitive information in error messages
- **Validation**: Client-side validation for better UX, server-side for security
- **Session Management**: Proper session timeout and cleanup

## Test Infrastructure Lessons

### Test Setup Patterns

- **Centralized Fixtures:** Use shared test fixtures for consistent setup across
  all tests
- **Database Isolation:** Each test should use isolated database with unique
  temp directories
- **Git Repository Setup:** Initialize Git repos in test directories for history
  API tests
- **Role Configuration:** Create standardized role configs for all test
  scenarios
- **Authentication Bypass:** Use BYPASS_AUTH=true for test environments

### Test Execution Patterns

- **Parallel Execution:** Tests should run in parallel without interference
- **Proper Cleanup:** Always clean up test artifacts and temporary files
- **Isolation:** Each test should be completely independent
- **Mocking Strategy:** Use real implementations over mocks when possible

### API Testing Patterns

- **Response Structure:** All API responses should follow
  `{ success: true/false, data: ... }` format
- **Status Codes:** Use consistent HTTP status codes across all endpoints
- **Error Handling:** Include proper error messages and details
- **Authentication:** Test both authenticated and unauthenticated scenarios

### CLI Testing Patterns

- **JSON Output:** All CLI commands should support --json flag for
  machine-readable output
- **Silent Mode:** Implement --silent flag to suppress output
- **Exit Codes:** Use proper exit codes (0 for success, non-zero for errors)
- **Error Messages:** Provide clear, actionable error messages

### CLI Authentication Testing (Latest Lessons)

- **Mixed Output Handling:** CLI commands may output initialization messages
  before JSON
- **JSON Extraction:** Implement robust JSON extraction from mixed CLI output
- **Simulated Authentication:** Use simulated auth for testing instead of
  password auth
- **Brace Counting:** Use brace counting to find complete JSON objects in output
- **Error Recovery:** Handle JSON parsing failures gracefully with clear error
  messages

## Debugging Lessons

### Common Issues and Solutions

1. **Database Constraint Errors:** Ensure unique constraints are respected in
   test data
2. **Permission System:** Role configurations must match API permission strings
   exactly
3. **Git History:** Tests requiring Git history need proper repo initialization
4. **Response Structure:** API tests must expect correct response format
5. **Authentication:** Mock user setup must work with real permission system
6. **JSON Parsing:** CLI commands with mixed output require proper JSON
   extraction
7. **Test Authentication:** Use simulated auth for tests, password auth for real
   usage

### Test Environment Setup

- **NODE_ENV=test:** Essential for test-specific behavior
- **BYPASS_AUTH=true:** Required for authentication bypass in tests
- **Temporary Directories:** Use unique temp dirs for each test
- **Database Paths:** Ensure consistent database paths between setup and
  execution

### Build and Rebuild Process

- **Clean Rebuild:** Always clean and rebuild after major changes
- **Dependency Management:** Fix peer dependency issues before testing
- **Artifact Cleanup:** Remove temporary files and build artifacts
- **Package Installation:** Use pnpm for consistent dependency management

## Code Quality Lessons

### Error Handling

- **Graceful Degradation:** Handle errors without crashing
- **User-Friendly Messages:** Provide clear error messages
- **Logging:** Use appropriate log levels for debugging
- **Validation:** Validate inputs and provide helpful feedback

### Performance Optimization

- **Test Isolation:** Prevent test interference for faster execution
- **Resource Cleanup:** Proper cleanup prevents resource leaks
- **Parallel Execution:** Design tests to run efficiently in parallel
- **Setup Optimization:** Minimize setup time with shared fixtures

### Maintainability

- **Consistent Patterns:** Use consistent patterns across all modules
- **Documentation:** Document test setup and expected behavior
- **Modular Design:** Keep tests modular and focused
- **Version Control:** Commit test fixes with clear commit messages

## Project-Specific Lessons

### CivicPress Architecture

- **Core Module:** Handles business logic and data management
- **API Module:** Provides RESTful endpoints with authentication
- **CLI Module:** Command-line interface with JSON output support
- **Test Infrastructure:** Centralized setup with shared fixtures

### Authentication System

- **Role-Based Access:** Uses role configurations for permission checking
- **Simulated Authentication:** Supports simulated auth for testing
- **Password Authentication:** Traditional username/password auth for real usage
- **Token Management:** Handles JWT tokens for API authentication
- **Permission Strings:** Must match exactly between roles and API endpoints

### Database Management

- **SQLite:** Primary database with in-memory option for tests
- **Record Management:** CRUD operations with proper error handling
- **Schema Management:** Automatic schema creation and migration
- **Constraint Handling:** Proper handling of unique constraints

### Git Integration

- **History Tracking:** Tracks changes to records over time
- **Commit Management:** Handles commits and metadata
- **Repository Setup:** Proper initialization for history API
- **Conflict Resolution:** Multiple strategies for handling conflicts

## Best Practices Established

### Test Organization

- **File Structure:** Organize tests by module (core, api, cli)
- **Naming Conventions:** Use descriptive test names
- **Setup Functions:** Centralize common setup logic
- **Cleanup Functions:** Ensure proper cleanup after tests

### Code Standards

- **TypeScript:** Use strict typing throughout
- **Error Handling:** Comprehensive error handling
- **Logging:** Appropriate logging levels
- **Documentation:** Clear inline documentation

### Development Workflow

- **Test-First:** Write tests before implementing features
- **Continuous Testing:** Run tests frequently during development
- **Debugging Tools:** Use proper debugging tools and techniques
- **Version Control:** Commit frequently with clear messages

## Configuration Management Lessons

### Configuration Architecture

- **Separation of Concerns:** Keep system config (`.civicrc`) separate from
  organization config (`org-config.yml`)
- **Default Centralization:** Centralize all defaults in `core/src/defaults/`
  for consistency
- **Template Standardization:** Create standardized templates for all record
  types
- **Configuration Evolution:** Design configs to evolve independently

### Initialization Workflow

- **Automatic Indexing:** Always index and sync records after initialization for
  immediate availability
- **Git Integration:** Initialize Git repository and create initial commit
  during setup
- **Interactive Flexibility:** Support both interactive and non-interactive
  modes
- **Error Handling:** Gracefully handle indexing and sync failures

### CLI Command Design

- **Info Commands:** Provide easy access to configuration details
- **Debug Commands:** Include development and troubleshooting tools
- **Cleanup Commands:** Support testing and development scenarios
- **Consistent Output:** Maintain JSON and human-readable output formats

## Platform Vision and Specifications (Latest Lessons)

### Comprehensive Platform Understanding

- **Complete Civic Technology Platform:** CivicPress is designed as a
  comprehensive platform, not just a simple record management system
- **50+ Detailed Specifications:** Recovered specifications provide complete
  technical blueprints for all planned features
- **Core Principles:** Transparency by default, trust through traceability,
  open-source auditable, equity and accessibility
- **Modular Architecture:** Plugin system, federation, enterprise features,
  civic modules
- **Enterprise-Grade Security:** Cryptographic verification, audit logs,
  compliance, multi-tenant support

### Development with Specifications

- **Reference Specifications:** Always consult `docs/specs/` for implementation
  guidance
- **Follow Core Principles:** Ensure all development aligns with transparency,
  trust, and accessibility principles
- **Consider Platform Vision:** Think beyond current features to the complete
  civic technology platform
- **Security First:** Implement features with security and compliance in mind
  from the start
- **Scalability Planning:** Design features to support federation and
  multi-tenant deployments

### Specification-Driven Development

- **Technical Blueprints:** Use specifications as implementation guides
- **Quality Standards:** Follow testing and quality standards from
  specifications
- **Security Requirements:** Implement security features based on specification
  requirements
- **Compliance Considerations:** Ensure features meet civic and legal
  requirements
- **Future-Proofing:** Design features to support advanced platform capabilities

### Platform Architecture Awareness

- **Current Foundation:** Solid CLI, API, and database foundation with
  comprehensive testing
- **Planned Features:** Plugin system, workflow engine, civic modules,
  federation
- **Enterprise Features:** Multi-tenant support, advanced security, audit trails
- **Civic Modules:** Legal register, voting systems, feedback systems, audit
  trails
- **Frontend Evolution:** Migration from Astro to Nuxt PWA with advanced
  features

## Recent Test Stabilization Lessons

### JSON Parsing Challenges

- **Mixed Output:** CLI commands often output initialization messages before
  JSON
- **Brace Counting:** Use brace counting algorithm to find complete JSON objects
- **Robust Extraction:** Implement fallback mechanisms for JSON extraction
- **Error Handling:** Provide clear error messages when JSON parsing fails

### Authentication Testing Strategy

- **Simulated vs Password Auth:** Use simulated auth for tests, password auth
  for real usage
- **Test Isolation:** Each test should create its own authentication context
- **Token Management:** Properly manage and pass tokens between test steps
- **Permission Testing:** Test both positive and negative permission scenarios

### Test Suite Health

- **Comprehensive Coverage:** 391 tests provide confidence in system stability
- **Zero Failures:** All tests passing indicates system health
- **Parallel Execution:** Tests run efficiently without interference
- **Maintenance:** Regular test maintenance prevents technical debt

## Future Considerations

### Scalability

- **Performance Testing:** Add performance benchmarks
- **Load Testing:** Test with realistic data volumes
- **Integration Testing:** Test with external services
- **Monitoring:** Add comprehensive monitoring and alerting

### Quality Assurance

- **Code Coverage:** Maintain high test coverage
- **Static Analysis:** Use linting and type checking
- **Security Testing:** Add security-focused tests
- **Accessibility Testing:** Test for accessibility compliance

### Maintenance

- **Regular Updates:** Keep dependencies updated
- **Test Maintenance:** Regularly review and update tests
- **Documentation Updates:** Keep documentation current
- **Performance Monitoring:** Monitor test performance over time

### Platform Evolution

- **Specification Alignment:** Ensure all development aligns with platform
  specifications
- **Feature Planning:** Plan features based on comprehensive platform vision
- **Security Implementation:** Implement security features from the start
- **Scalability Design:** Design for federation and multi-tenant support
- **Civic Focus:** Maintain focus on civic technology and governance needs

### Performance Monitoring and Optimization

- **VueUse Virtual Scrolling**: `useVirtualList` provides excellent performance
  for large datasets
- **Debounced Search**: `useDebounceFn` prevents excessive API calls during
  typing
- **Memoization**: Pre-computed record data reduces runtime calculations
- **Performance Monitoring**: Real-time metrics tracking with keyboard shortcuts
- **Component Architecture**: Performance monitor can be made global via layout
  template

### Search Suggestions and Auto-complete

- **Intelligent Suggestions**: Generate suggestions from titles, content, and
  record types
- **Debounced API Calls**: Use `useDebounceFn` to prevent excessive API calls
  during typing
- **Click Event Handling**: Implement proper delays to prevent blur events from
  clearing suggestions before clicks register
- **Race Condition Prevention**: Track current query to prevent old API
  responses from overwriting new ones
- **Immediate Reactivity**: Use client-side filtering for instant search
  feedback

### Pagination Architecture Lessons

- **Client vs Server Pagination**: Don't mix client-side and server-side
  pagination logic - choose one approach
- **Page Size Management**: Ensure page size controls work consistently with
  chosen pagination approach
- **URL State Sync**: Keep URL parameters in sync with pagination state
- **Immediate Feedback**: Client-side pagination provides instant response but
  requires proper data management
- **Bug Prevention**: Clear separation between client-side filtering and
  server-side data fetching

### Future Performance Enhancements (Planned)

- **Global Performance Monitor**: Add performance monitor to layout template for
  app-wide monitoring
  - Toggle with Ctrl+Shift+P from any page
  - Show render times, memory usage, and component-specific metrics
  - Useful for development and production monitoring
  - Can be disabled in production builds
- **Component-Level Metrics**: Track performance of individual components
- **Route Change Monitoring**: Measure navigation performance
- **API Call Performance**: Monitor API response times and caching effectiveness

---

**Last Updated:** Current  
**Status:** ✅ ACTIVE LEARNING  
**Confidence:** HIGH
