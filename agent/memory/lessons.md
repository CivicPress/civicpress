# Agent Memory: Lessons Learned

## User Registration System Lessons (Latest)

### API Configuration and Database Setup

- **Configuration Format**: `.civicrc` must be in YAML format, not JSON
  - The `CentralConfigManager` expects YAML parsing with `yaml.parse()`
  - JSON format causes parsing failures and fallback to default configuration
  - Database path must use `sqlite.file` format, not `path` field
- **Database Path Resolution**: API uses
  `CentralConfigManager.getDatabaseConfig()` for database path
  - Default fallback creates database in root directory (`./civic.db`)
  - Proper configuration creates database in `.system-data/civic.db`
  - Always check database file location when troubleshooting user creation
- **Route Ordering**: Express.js route order is critical for authentication
  bypass
  - Public routes (`/api/users/register`, `/api/users/auth`) must be registered
    before general auth middleware
  - Order: Public routes → Public API middleware → Authenticated API middleware
    → Protected routes
  - **CRITICAL**: When adding authentication, ensure public viewing routes
    remain accessible
    - Records (`/api/records`) and search (`/api/search`) should remain public
      for transparency
    - Only administrative functions should require authentication
    - Public routes must be registered BEFORE authentication middleware
- **Error Status Codes**: Explicitly set `statusCode` on error objects for
  proper HTTP responses
  - Validation errors: `(error as any).statusCode = 400`
  - Authentication errors: `(error as any).statusCode = 401`
  - Conflict errors: `(error as any).statusCode = 409`
  - Use `handleApiError()` with proper error objects for consistent responses

### UI Development Patterns

- **API URL Configuration**: Use runtime config for API URLs instead of relying
  on proxy
  - `const config = useRuntimeConfig()` to get `config.public.civicApiUrl`
  - Direct API calls:
    `$fetch(\`${config.public.civicApiUrl}/api/users/register\`)`
  - Avoids proxy issues and ensures correct endpoint resolution
- **Form Validation**: Implement comprehensive client-side validation
  - Email format validation with regex: `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`
  - Password strength assessment with visual indicators
  - Real-time password matching validation
  - Disable submit button until all validations pass
- **Password Strength Indicator**: Create visual strength assessment
  - 5-level strength system: Very Weak → Weak → Fair → Good → Strong
  - Color-coded progress bars with descriptive labels
  - Real-time feedback as user types
  - Minimum strength requirement for form submission
- **Error Handling**: Comprehensive error display and user feedback
  - Use `UAlert` components for error and success messages
  - Parse API error responses: `err.data?.error?.message || err.message`
  - Show field-specific validation errors in form help text
  - Clear form and redirect on successful registration

### Database Integration Lessons

- **User Creation Flow**: Proper user creation with password hashing
  - Use `bcrypt.hash()` with salt rounds (12) for password security
  - Call `authService.createUserWithPassword()` with all required fields
  - Handle username uniqueness validation before creation
  - Return proper user object with all fields for UI display
- **Username as Name Fallback**: Automatic fallback when no full name provided
  - Use `userData.name || userData.username` for name field
  - Ensures every user has a meaningful display name
  - Maintains backward compatibility with existing name field
  - Improves user experience by reducing required fields
- **Database Persistence**: Ensure users are saved to correct database
  - Verify database configuration in `.civicrc` (YAML format)
  - Check database file location: `.system-data/civic.db` vs `./civic.db`
  - Test user creation and retrieval to confirm persistence
  - Monitor API logs for database connection issues

### Authentication Integration

- **Public Endpoints**: Registration and authentication endpoints bypass auth
  middleware
  - Register endpoints before general authentication middleware
  - Add CivicPress instance to request:
    `(req as any).civicPress = this.civicPress`
  - Ensure proper route ordering in Express.js setup
- **Public vs Protected Routes**: Critical distinction for government
  transparency
  - **Public Routes** (No Authentication): `/api/records`, `/api/search`,
    `/api/status`, `/api/validation`
    - These should remain accessible to all citizens for transparency
    - Records viewing and search are fundamental public services
  - **Protected Routes** (Authentication Required): `/api/export`,
    `/api/import`, `/api/hooks`, `/api/templates`, `/api/workflows`,
    `/api/indexing`, `/api/history`, `/api/diff`, `/api/users`, `/api/config`
    - These are administrative functions that require authentication
  - **Special Public Routes**: `/api/users/register`, `/api/users/auth`
    - These bypass authentication for user account creation and login
- **Session Management**: Proper JWT token handling after registration
  - Registration doesn't automatically log in user
  - Redirect to login page after successful registration
  - Clear form data and show success message before redirect
  - Use `setTimeout()` for smooth user experience
- **Error Recovery**: Handle various authentication scenarios
  - Username already exists (409 Conflict)
  - Invalid email format (400 Bad Request)
  - Weak password (400 Bad Request)
  - Network errors with user-friendly messages

### Security Considerations

- **Password Security**: Implement strong password requirements
  - Minimum 8 characters with uppercase, lowercase, numbers, special characters
  - Visual strength indicator with real-time feedback
  - Server-side validation in addition to client-side
  - Secure bcrypt hashing with appropriate salt rounds
- **Input Validation**: Comprehensive validation on both client and server
  - Client-side for immediate user feedback
  - Server-side for security and data integrity
  - Email format validation with proper regex
  - Username uniqueness checking
- **Error Messages**: Secure error handling without information disclosure
  - Don't reveal existing usernames in error messages
  - Use generic messages for security-sensitive operations
  - Log detailed errors for debugging while showing user-friendly messages

### User Experience Patterns

- **Form Design**: Clean, accessible registration form
  - Clear field labels and placeholders
  - Required field indicators
  - Helpful validation messages
  - Loading states during submission
- **Success Flow**: Smooth post-registration experience
  - Clear success message with next steps
  - Automatic form clearing
  - Smooth redirect to login page
  - Preserve user intent and context
- **Error Recovery**: Helpful error messages and recovery options
  - Clear, actionable error messages
  - Field-specific error highlighting
  - Suggestions for fixing validation issues
  - Maintain form data for easy correction

### Testing and Debugging

- **API Testing**: Test registration endpoint directly
  - Use `curl` to test API endpoints independently
  - Verify database persistence after user creation
  - Test both success and error scenarios
  - Check API logs for detailed error information
- **UI Testing**: Test registration flow end-to-end
  - Test form validation and error display
  - Verify password strength indicator functionality
  - Test success flow and redirect behavior
  - Check browser network tab for API calls
- **Database Verification**: Confirm user creation in database
  - Use `sqlite3` to query database directly
  - Verify user data is saved correctly
  - Check for proper password hashing
  - Confirm username-as-name fallback works

### Configuration Management

- **YAML vs JSON**: Always use YAML format for `.civicrc`
  - `CentralConfigManager` expects YAML parsing
  - JSON format causes parsing failures
  - Use proper YAML syntax with correct indentation
- **Database Configuration**: Proper database path specification
  - Use `sqlite.file` format, not `path` field
  - Ensure relative paths resolve correctly
  - Test database creation and access
- **Runtime Configuration**: Use Nuxt runtime config for API URLs
  - Access via `useRuntimeConfig()`
  - Configure in `nuxt.config.ts` runtimeConfig.public
  - Avoid hardcoded URLs in components

## Notification System Lessons (Latest)

### **Hybrid Architecture Pattern**

- **Core + Plugin Approach**: Core handles orchestration, plugins handle channel
  integrations
- **Security Separation**: Sensitive config in `.system-data/`, public config in
  `.civic/`
- **Event-Driven Design**: Leverage existing `HookSystem` for notification
  triggers
- **Plugin Sandboxing**: Isolated execution for third-party integrations

### **Configuration Security Best Practices**

- **Sensitive Storage**: All API keys, credentials, webhook URLs in
  `.system-data/notifications.yml`
- **Encryption**: Encrypt sensitive configuration values at rest
- **Access Control**: Role-based access to notification configuration
- **Audit Logging**: Track all configuration changes and notification activities
- **Rate Limiting**: Prevent notification spam and abuse

### **Authentication Integration Patterns**

- **Email Verification**: Send verification emails for new user accounts
- **Password Reset**: Email-based password recovery workflows
- **2FA Support**: SMS/email two-factor authentication
- **Security Alerts**: Notifications for suspicious account activities
- **Template System**: Reusable templates for authentication workflows

### **Channel Plugin Architecture**

- **Unified Interface**: All channels implement same `NotificationChannel`
  interface
- **Plugin Discovery**: Runtime plugin loading from
  `modules/notifications/channels/`
- **Configuration-Driven**: Each channel configurable via YAML
- **Error Handling**: Graceful degradation when channels fail
- **Delivery Tracking**: Monitor delivery status and retry failed notifications

### **Security & Compliance Considerations**

- **Content Filtering**: Automatic PII redaction from notification content
- **TLS Encryption**: Required for all outbound notification channels
- **Webhook Signatures**: HMAC-SHA256 for webhook verification
- **Audit Trails**: Complete logging for compliance and debugging
- **Rate Limiting**: Prevent notification abuse and spam

### **Implementation Strategy Lessons**

- **Phase 1**: Start with core system and UI notifications
- **Phase 2**: Add authentication integration (email verification, 2FA)
- **Phase 3**: Implement channel plugins (email, SMS, Slack)
- **Phase 4**: Advanced features (queue system, templates, digests)
- **Security First**: Always implement security features from the start

### **Integration with Existing Systems**

- **Hook System**: Leverage existing `HookSystem` for event-driven notifications
- **Auth System**: Integrate with existing authentication for user management
- **Role System**: Use existing role-based access control for notification
  permissions
- **Audit System**: Integrate with existing audit logging for comprehensive
  trails
- **Configuration**: Follow existing configuration patterns and security
  practices

---

**Last Updated:** Current  
**Status:** ✅ ACTIVE LEARNING  
**Confidence:** HIGH

## Notification System Lessons (Previous)

### CLI Development Patterns

- **Use Existing Logger System**: Don't create new utilities when the project
  already has established patterns
  - The login command uses `initializeLogger()` from `global-options.js`
  - Other commands use `console.log` directly for simplicity
  - Use `logger.info()`, `logger.success()`, `logger.error()`, `logger.warn()`
    for proper logging
  - Reserve `console.log` only for JSON output when `--json` is specified

### Multi-Provider Architecture

- **Provider-Agnostic Design**: Create provider-agnostic configuration schema
  - Use `provider` field to specify active provider (sendgrid, ses, smtp,
    nodemailer)
  - Nest provider-specific configs under provider names
  - Implement `getEmailProviderConfig()` and `validateEmailProviderConfig()`
    methods
  - Route requests via switch statement to provider-specific methods

### Configuration Management

- **Sensitive Data Storage**: Store API keys and credentials in `.system-data/`
  (outside Git)
  - Use YAML format for readable configuration
  - Include default configurations for all providers
  - Validate configuration on load with graceful fallbacks
  - Mask sensitive data in CLI output

### Email Integration

- **SendGrid Integration**: Direct integration with `@sendgrid/mail` for real
  email sending
  - Configure API key in `.system-data/notifications.yml`
  - Validate API key format (must start with "SG.")
  - Handle send responses and error cases properly
  - Test connection before sending

### SMTP Integration Lessons

- **Generic SMTP Support**: Implemented generic SMTP support that works with any
  provider (Gmail, Outlook, Yahoo, custom servers)
- **SSL Certificate Issues**: Common issue with self-signed certificates or
  domain mismatches
  - Solution: Add `tls: { rejectUnauthorized: false }` to configuration
  - Lesson: Always handle SSL certificate issues gracefully
- **Authentication Debugging**: Comprehensive debugging output for SMTP
  connection issues
  - Show host, port, user, authentication status
  - Test connection before sending emails
  - Provide detailed error messages for troubleshooting
- **Dynamic Imports**: Use `await import()` instead of `require()` in ES modules
  - Fixes "require is not defined" errors in CLI
  - Use `nodemailer.default.createTransport()` and `sgMail.default.setApiKey()`
- **Provider Selection**: CLI should respect `--provider` argument over config
  file provider setting
  - Lesson: Command line arguments should override configuration defaults

### Template System

- **AuthTemplate Design**: Create reusable templates for authentication flows
  - Email verification, password reset, 2FA, security alerts
  - Variable replacement with `{{variable}}` syntax
  - Support for both text and HTML content
  - Template validation and error handling

### Queue Monitoring

- **Audit Integration**: Use existing audit system for notification history
  - Store notification events with proper metadata
  - Track success/failure status and error messages
  - Provide statistics and filtering capabilities
  - Support JSON output for machine processing

### Error Handling

- **Comprehensive Error Handling**: Implement proper error handling throughout
  - Validate configuration before use
  - Handle provider-specific errors gracefully
  - Provide meaningful error messages to users
  - Log errors for debugging while showing user-friendly messages

### Testing Strategy

- **Incremental Testing**: Test each component separately
  - Test configuration loading first
  - Test provider validation
  - Test actual email sending
  - Test queue monitoring and statistics

### Documentation and Integration

- **Comprehensive Documentation**: Create complete documentation for
  notification system
  - Include configuration examples for all providers
  - Provide troubleshooting guides for common issues
  - Document CLI commands and API endpoints
  - Include security best practices and compliance considerations
- **Init Integration**: Automatically create notifications.yml during
  `civic init`
  - Copy default configuration from `core/src/defaults/notifications.yml`
  - Provide helpful setup instructions
  - Disable by default for security
  - Include test commands for verification
- **Production Readiness**: Test with real email delivery
  - Verify SMTP and SendGrid integration
  - Test with actual email addresses
  - Confirm email delivery and formatting
  - Validate notification tracking and audit logs

## UI Development Lessons (Previous)

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

## Search and Record Page Fixes (July 2025)

### Search API Limit Issue

- **Problem**: UI was sending `limit=300` but API validation only allowed max
  100
- **Solution**: Increased search API validation from `max: 100` to `max: 300` in
  `modules/api/src/routes/search.ts`
- **Lesson**: Always ensure API validation limits match UI expectations

### Single Record Page Functionality

- **Problem**: `fetchRecord` method didn't exist in records store
- **Solution**: Added `fetchRecord` method to `modules/ui/app/stores/records.ts`
  with proper API response transformation
- **Key Fix**: API returns `created`/`updated` but CivicRecord interface expects
  `created_at`/`updated_at`
- **Lesson**: Always transform API responses to match frontend interfaces

### Navigation UX Improvement

- **Problem**: `router.back()` fails when accessing record page via direct link
- **Solution**: Check `window.history.length > 1` before using `router.back()`,
  fallback to `router.push('/records')`
- **Lesson**: Consider direct link scenarios when implementing navigation

### Debug Code Cleanup

- **Removed**: PerformanceMonitor component, debug CLI commands, console.log
  statements
- **Lesson**: Keep codebase clean by removing debug code before committing

### API Watch Mode Enhancement

- **Problem**: API development required manual restarts for every code change
- **Solution**: Added `tsx --watch` functionality with new scripts:
  - `pnpm run dev:api:watch` - API with file watching
  - `pnpm run dev:all:watch` - Combined API + UI with API watching
- **Git Lock Issue**: Resolved `.git/index.lock` conflicts during API startup
- **Lesson**: Always improve developer experience with hot reload and proper
  error handling

### Centralized Error Handling Implementation

- **Problem**: Repetitive error handling code scattered across stores and
  components
- **Solution**: Created `useErrorHandler` composable with specialized handlers:
  - `handleApiError()` - General API errors with toast notifications
  - `handleNetworkError()` - Connection issues with appropriate messaging
  - `handleValidationError()` - Form validation errors with field details
  - `handleAuthError()` - Authentication issues with security focus
  - `handleError()` - Smart error routing based on error type
- **API Interceptor Enhancement**: Enhanced `civicApi` plugin with automatic
  error handling:
  - **401 errors**: Auto-clear auth state and redirect to login
  - **403 errors**: Show permission denied messages
  - **422 errors**: Display validation details
  - **500 errors**: Show server error messages
  - **Toast notifications**: Automatic user feedback for all errors
- **Store Integration**: Updated all stores to use centralized error handling
- **Benefits**: Consistent UX, automatic user feedback, better error
  categorization, reduced code duplication
- **Lesson**: Centralize error handling for consistent user experience and
  maintainable code

### **Key Implementation Notes**

- **Configuration Location**: All sensitive notification config in
  `.system-data/notifications.yml`
- **Authentication Integration**: Use notifications for email verification, 2FA,
  password reset
- **Security First**: Encrypt sensitive config, audit all activities, rate limit
  notifications
- **Plugin Architecture**: Each channel (email, SMS, Slack) as separate plugin
- **Hook Integration**: Leverage existing `HookSystem` for event-driven
  notifications

## Notification System Architecture Lessons (Latest)

### **Hybrid Architecture Pattern**

- **Core + Plugin Approach**: Core handles orchestration, plugins handle channel
  integrations
- **Security Separation**: Sensitive config in `.system-data/`, public config in
  `.civic/`
- **Event-Driven Design**: Leverage existing `HookSystem` for notification
  triggers
- **Plugin Sandboxing**: Isolated execution for third-party integrations

### **Configuration Security Best Practices**

- **Sensitive Storage**: All API keys, credentials, webhook URLs in
  `.system-data/notifications.yml`
- **Encryption**: Encrypt sensitive configuration values at rest
- **Access Control**: Role-based access to notification configuration
- **Audit Logging**: Track all configuration changes and notification activities
- **Rate Limiting**: Prevent notification spam and abuse

### **Authentication Integration Patterns**

- **Email Verification**: Send verification emails for new user accounts
- **Password Reset**: Email-based password recovery workflows
- **2FA Support**: SMS/email two-factor authentication
- **Security Alerts**: Notifications for suspicious account activities
- **Template System**: Reusable templates for authentication workflows

### **Channel Plugin Architecture**

- **Unified Interface**: All channels implement same `NotificationChannel`
  interface
- **Plugin Discovery**: Runtime plugin loading from
  `modules/notifications/channels/`
- **Configuration-Driven**: Each channel configurable via YAML
- **Error Handling**: Graceful degradation when channels fail
- **Delivery Tracking**: Monitor delivery status and retry failed notifications

### **Security & Compliance Considerations**

- **Content Filtering**: Automatic PII redaction from notification content
- **TLS Encryption**: Required for all outbound notification channels
- **Webhook Signatures**: HMAC-SHA256 for webhook verification
- **Audit Trails**: Complete logging for compliance and debugging
- **Rate Limiting**: Prevent notification abuse and spam

### **Implementation Strategy Lessons**

- **Phase 1**: Start with core system and UI notifications
- **Phase 2**: Add authentication integration (email verification, 2FA)
- **Phase 3**: Implement channel plugins (email, SMS, Slack)
- **Phase 4**: Advanced features (queue system, templates, digests)
- **Security First**: Always implement security features from the start

### **Integration with Existing Systems**

- **Hook System**: Leverage existing `HookSystem` for event-driven notifications
- **Auth System**: Integrate with existing authentication for user management
- **Role System**: Use existing role-based access control for notification
  permissions
- **Audit System**: Integrate with existing audit logging for comprehensive
  trails
- **Configuration**: Follow existing configuration patterns and security
  practices

---

**Last Updated:** Current  
**Status:** ✅ ACTIVE LEARNING  
**Confidence:** HIGH
