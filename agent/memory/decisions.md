# CivicPress Development Decisions

## Roles API Endpoint Implementation (Latest)

### **✅ IMPLEMENTED: Dynamic Role Management API**

**Decision**: Successfully implemented comprehensive roles API endpoint
following established patterns:

1. **✅ API Endpoint** - `GET /api/config/roles` following same pattern as
   record-types/statuses
2. **✅ Core Methods** - Added `getRoleConfig()` to RoleManager and
   `getRoleManager()` to AuthService
3. **✅ Dynamic Role Loading** - Gets roles from `data/.civic/roles.yml`
   (platform config)
4. **✅ Complete Metadata** - Returns role name, description, permissions,
   status transitions
5. **✅ Error Handling** - Graceful fallback if role config is unavailable
6. **✅ Authentication Required** - Protected endpoint for security
7. **✅ Consistent API Pattern** - Follows same structure as existing config
   endpoints
8. **✅ Production Ready** - Tested and verified with full role configuration
   data

### **Architecture Benefits**

- **Configuration-Driven**: UI will always reflect actual platform roles
- **No Hardcoding**: Roles come from platform configuration
- **Municipality Flexibility**: Each deployment can have custom roles
- **Future-Proof**: New roles automatically appear in UI
- **Security**: Role validation happens at platform level

### **Response Structure**

```json
{
  "success": true,
  "data": {
    "roles": [
      {
        "key": "admin",
        "name": "Administrator",
        "description": "Full system access",
        "permissions": ["*", "records:import", ...],
        "record_types": {},
        "status_transitions": ["draft", "review", "approved", ...]
      },
      {
        "key": "clerk",
        "name": "Clerk",
        "description": "Can create and edit records",
        "permissions": ["records:create", "records:edit", ...],
        "record_types": {},
        "status_transitions": ["draft", "review"]
      },
      {
        "key": "public",
        "name": "Public",
        "description": "Read-only access",
        "permissions": ["records:view", "records:list"],
        "record_types": {},
        "status_transitions": []
      }
    ],
    "total": 3
  }
}
```

### **Implementation Details**

#### **Core Methods Added**

1. **RoleManager.getRoleConfig(role: string)**: Get detailed role configuration
2. **AuthService.getRoleManager()**: Expose role manager for API access
3. **RoleManager export**: Added to core module exports

#### **API Integration**

- **Endpoint**: `GET /api/config/roles`
- **Authentication**: Required (protected endpoint)
- **Location**: `modules/api/src/routes/config.ts`
- **Pattern**: Follows same structure as `/api/config/record-types` and
  `/api/config/record-statuses`

#### **Error Handling**

- Graceful fallback if role config is unavailable
- Includes role even if full config can't be retrieved
- Proper error logging and user-friendly messages

### **Next Steps for UI Integration**

1. **Call `/api/config/roles`** to get available roles
2. **Use role data** for user management dropdowns
3. **Display role details** in user edit forms
4. **Validate role assignments** against platform config

### **Key Implementation Notes**

- **Configuration Location**: Roles loaded from `data/.civic/roles.yml`
- **Dynamic Loading**: UI always reflects current platform configuration
- **Security First**: Protected endpoint ensures role data security
- **Consistent Pattern**: Follows established API patterns for maintainability
- **Production Ready**: Tested with real role configuration data

## Notification System Architecture (Latest)

### **✅ IMPLEMENTED: Production-Ready Multi-Provider System**

**Decision**: Successfully implemented comprehensive notification system with:

1. **✅ Core Notification System** - Complete foundation with audit, queue,
   security
2. **✅ Multi-Provider Email** - SMTP, SendGrid, AWS SES, Nodemailer support
3. **✅ CLI Integration** - `civic notify:test`, `civic notify:queue`,
   `civic notify:retry`
4. **✅ Template System** - AuthTemplate for email verification, password reset,
   2FA
5. **✅ Security & Compliance** - Rate limiting, audit logging, PII filtering
6. **✅ Documentation** - Complete notification system documentation
7. **✅ Init Integration** - Automatic notifications.yml creation during
   `civic init`
8. **✅ Production Testing** - Verified with real email delivery (SMTP +
   SendGrid)

### **Configuration Storage Decision**

**Decision**: Store sensitive notification configuration in `.system-data/`
directory

- **Rationale**: Sensitive information like API keys, webhook URLs, SMTP
  credentials
- **Security**: Keeps sensitive config separate from public `.civic/` directory
- **Structure**: `.system-data/notifications.yml` for all channel configurations

### **Authentication Integration Decision**

**Decision**: Use notification system for authentication workflows

- **Email Validation**: Send verification emails for new user accounts
- **2FA Support**: SMS/email-based two-factor authentication
- **Password Reset**: Email-based password reset workflows
- **Account Security**: Security alerts for suspicious activities

### **Architecture Components**

#### **Core Notification System** (`core/src/notifications/`)

```
core/src/notifications/
├── notification-service.ts     # Main notification orchestrator
├── notification-manager.ts     # Notification lifecycle management
├── notification-queue.ts       # Queue system for delivery
├── notification-logger.ts      # Audit logging
├── notification-validator.ts   # Content validation
└── types/
    ├── notification-types.ts   # Core notification interfaces
    └── channel-types.ts        # Channel abstraction layer
```

#### **Plugin System for Channel Integrations**

```
modules/
├── notifications/
│   ├── channels/
│   │   ├── email/             # SMTP, SendGrid, Mailgun
│   │   ├── sms/              # Twilio, AWS SNS
│   │   ├── slack/            # Slack webhooks
│   │   ├── webhook/          # Generic webhooks
│   │   └── ui/               # In-app notifications
│   └── notification-ui/       # UI for notification management
```

#### **Configuration Structure**

```yaml
# .system-data/notifications.yml (SENSITIVE - not in Git)
notifications:
  channels:
    email:
      enabled: true
      provider: 'smtp'
      config:
        host: 'smtp.example.com'
        port: 587
        secure: true
        username: 'notifications@civicpress.org'
        password: '***'  # Encrypted
    sms:
      enabled: true
      provider: 'twilio'
      config:
        account_sid: '***'
        auth_token: '***'
        from_number: '+1234567890'
    slack:
      enabled: true
      webhook_url: 'https://hooks.slack.com/***'

  # Authentication-specific templates
  auth_templates:
    email_verification:
      subject: 'Verify your CivicPress account'
      body: 'Click here to verify: {verification_url}'
    password_reset:
      subject: 'Reset your CivicPress password'
      body: 'Reset link: {reset_url}'
    two_factor:
      subject: 'Your 2FA code'
      body: 'Code: {code}'
    security_alert:
      subject: 'Security alert for your account'
      body: 'Suspicious activity detected: {details}'

  # Notification rules
  rules:
    - event: 'user:registered'
      channels: ['email']
      template: 'email_verification'
    - event: 'user:password_reset_requested'
      channels: ['email']
      template: 'password_reset'
    - event: 'user:two_factor_requested'
      channels: ['sms', 'email']
      template: 'two_factor'
    - event: 'record:created'
      channels: ['email', 'ui']
      recipients: ['council', 'clerk']
    - event: 'status:changed'
      channels: ['email', 'slack']
      recipients: ['author', 'approvers']
```

### **Security & Compliance Decisions**

#### **Content Protection**

- **PII Filtering**: Automatic redaction of sensitive data
- **Content Encryption**: End-to-end encryption for sensitive notifications
- **Rate Limiting**: Prevent notification spam and abuse
- **Audit Trails**: Complete logging for compliance

#### **Channel Security**

- **Webhook Signatures**: HMAC-SHA256 for webhook verification
- **TLS Encryption**: Required for all outbound channels
- **Authentication**: Multi-factor auth for notification admin
- **Sandboxing**: Isolated execution for third-party integrations

#### **Configuration Security**

- **Sensitive Storage**: All API keys and credentials in `.system-data/`
- **Encryption**: Encrypt sensitive configuration values
- **Access Control**: Role-based access to notification configuration
- **Audit Logging**: Track all configuration changes

### **Implementation Strategy**

#### **Phase 1: Core Foundation**

1. **Core Notification Service** - Basic notification infrastructure
2. **Hook Integration** - Connect to existing `HookSystem`
3. **UI Notifications** - In-app notification system
4. **Audit Logging** - Complete notification audit trail

#### **Phase 2: Authentication Integration**

1. **Email Verification** - New user account validation
2. **Password Reset** - Email-based password recovery
3. **2FA Support** - SMS/email two-factor authentication
4. **Security Alerts** - Suspicious activity notifications

#### **Phase 3: Channel Plugins**

1. **Email Plugin** - SMTP/SendGrid integration
2. **SMS Plugin** - Twilio integration
3. **Slack Plugin** - Webhook integration
4. **Webhook Plugin** - Generic webhook support

#### **Phase 4: Advanced Features**

1. **Queue System** - Retry logic and scheduling
2. **Template Engine** - Dynamic notification templates
3. **Digest Notifications** - Daily/weekly summaries
4. **User Preferences** - Notification subscription management

### **Benefits of This Architecture**

#### **1. Modularity**

- Core system handles orchestration and security
- Channel plugins handle specific integrations
- Easy to add/remove channels without core changes

#### **2. Security**

- Centralized security controls in core
- Sandboxed plugin execution
- Comprehensive audit logging
- Sensitive config isolated in `.system-data/`

#### **3. Extensibility**

- Plugin system for unlimited channel types
- Hook integration for event-driven notifications
- Configuration-driven behavior

#### **4. Authentication Integration**

- Seamless integration with existing auth system
- Email verification for new accounts
- 2FA support for enhanced security
- Security alerts for account protection

#### **5. Maintainability**

- Clear separation of concerns
- Isolated testing for each component
- Configuration-driven customization

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

## UI Module Development (Latest)

### Technology Stack Decisions

- **Framework**: Nuxt 4 (Vue 3) chosen over other options
- **UI Library**: Nuxt UI Pro selected for enhanced components
  - Note: Currently paid but planned to go free soon
  - Provides advanced components and better styling out of the box
- **Mode**: SPA (Single Page Application) - no SSR since API-driven
- **Port**: 3030 to avoid conflicts with API server (3000)
- **Styling**: Nuxt UI Pro handles Tailwind CSS automatically

### Authentication Implementation Status

#### **✅ Completed Features**

1. **Login System**:
   - **Dual Authentication**: Username/password + GitHub token support
   - **Form Validation**: Real-time validation with proper error handling
   - **Loading States**: Proper loading indicators during authentication
   - **Error Handling**: Comprehensive error display and recovery
   - **Session Management**: JWT token storage with localStorage persistence
   - **Token Expiration**: Automatic session cleanup on token expiry

2. **Auth Store (Pinia)**:
   - **State Management**: Centralized auth state with Pinia
   - **Persistence**: localStorage-based session persistence
   - **Security**: Proper token validation and cleanup
   - **Integration**: Seamless integration with API plugin
   - **Permissions**: Role and permission checking capabilities

3. **API Integration**:
   - **Automatic Token Injection**: JWT tokens automatically added to requests
   - **401 Handling**: Automatic logout and redirect on authentication failure
   - **Login Endpoint Bypass**: Proper handling of authentication endpoints
   - **Error Recovery**: Graceful handling of network and auth errors

4. **Logout System**:
   - **Confirmation Dialog**: User-friendly logout confirmation
   - **State Cleanup**: Complete auth state and localStorage cleanup
   - **API Integration**: Proper logout API call with error handling
   - **Redirect Flow**: Automatic redirect to login page

#### **❌ Missing Features**

1. **Account Registration**:
   - **Status**: Not implemented
   - **Missing**: User registration page (`/auth/register`)
   - **Missing**: Account creation workflow
   - **Missing**: Email verification (if needed)

2. **Password Reset**:
   - **Status**: Not implemented
   - **Missing**: Password reset page (`/auth/forgot-password`)
   - **Missing**: Password reset workflow
   - **Missing**: Email-based reset functionality

3. **Account Management**:
   - **Status**: Not implemented
   - **Missing**: User profile management
   - **Missing**: Password change functionality
   - **Missing**: Account settings page

### Key Implementation Decisions

1. **API-First Design**: Frontend consumes REST API endpoints
   - Clean separation of concerns
   - Enables multiple frontend implementations
2. **No Custom CSS Initially**: Using Nuxt UI Pro components for styling
   - Removed custom Tailwind config and PostCSS config
   - All styling handled by Nuxt UI Pro components
3. **Development Server**: Running on port 3030 with hot reload
4. **Authentication**: OAuth + user/password integration working

### Current Working State

- ✅ Nuxt 4 development server running on port 3030
- ✅ Nuxt UI Pro components available and working
- ✅ Authentication system functional (login/logout)
- ✅ API server integration configured (port 3000)
- ✅ Development tools enabled
- ✅ Both servers running without conflicts
- ✅ Records interface with search/filtering working

### Manual Setup Required

- User manually installed Nuxt UI Pro
- User manually updated to `@nuxt/ui-pro` in nuxt.config.ts
- Removed custom CSS files that were causing issues
- Cleaned up PostCSS and Tailwind configs

### Next Steps

1. **Immediate**: Implement account registration and password reset
2. **Short Term**: Add user profile management
3. **Medium Term**: Create admin dashboard and plugin registry
4. **Long Term**: Build advanced civic modules

### Troubleshooting Resolved

- **Port Conflicts**: Resolved by using port 3030 for UI
- **CSS Issues**: Resolved by removing custom CSS and using Nuxt UI Pro
- **YAML Errors**: Fixed demo data frontmatter parsing issues
- **Build Errors**: Resolved by cleaning up configuration files
- **Authentication**: Resolved JWT token handling and API integration

## Previous Decisions

### PostgreSQL Support

- **Decision**: Mark PostgreSQL as unsupported with warnings and fallback to
  SQLite
- **Implementation**: Added warnings in CLI init command
- **Reason**: PostgreSQL adapter not implemented, SQLite sufficient for current
  needs

### Test Database Isolation

- **Decision**: Tests should run against their own database, not modify main
  .system-data/civic.db
- **Implementation**: Each test creates its own temporary database
- **Reason**: Prevents test interference and database corruption

### Debug Message Removal

- **Decision**: Remove debug messages from test files for cleaner output
- **Implementation**: Cleaned up console.log statements in test files
- **Reason**: Improve test output readability and performance

### CLI Init Command Enhancement

- **Decision**: When users opt out of demo data, ask for basic organization info
- **Implementation**: Added prompts for organization name and location
- **Reason**: Better user experience and data quality

## Architecture Decisions

### Monorepo Structure

- **Package Manager**: pnpm for efficient monorepo management
- **Workspace**: Configured with pnpm-workspace.yaml
- **Modules**: CLI, API, Core, UI as separate packages
- **Testing**: Vitest for comprehensive test coverage

### Authentication System

- **Multiple Methods**: OAuth (GitHub), user/password, simulated
- **JWT Tokens**: All methods return valid JWT tokens
- **Role-Based**: Granular permissions for civic roles
- **Security**: Proper token validation and role checking

### Database Strategy

- **Primary**: SQLite for simplicity and portability
- **Version Control**: Git-based with automatic commits
- **Indexing**: Advanced search and discovery capabilities
- **Sync**: Real-time synchronization with database

### API Design

- **RESTful**: Comprehensive REST API with 20+ endpoints
- **Authentication**: JWT-based with proper authorization
- **Documentation**: Auto-generated API documentation
- **Testing**: Comprehensive API test suite

## Development Workflow

### Testing Strategy

- **Comprehensive Coverage**: 391 tests passing across all modules
- **Isolation**: Each test runs in its own environment
- **CI/CD Ready**: Automated testing pipeline
- **Quality**: High test coverage ensures stability

### Documentation

- **Specifications**: 50+ comprehensive platform specs
- **API Docs**: Auto-generated and comprehensive
- **Development Guides**: Step-by-step setup instructions
- **Architecture**: Clear system design documentation

### Version Control

- **Git Integration**: Automatic commits for all changes
- **Audit Trail**: Complete history of all modifications
- **Branching**: Feature branches for development
- **Deployment**: Ready for production deployment

## Future Considerations

### Plugin System

- **Architecture**: Extensible plugin registry with hooks
- **Integration**: Custom workflow and component system
- **Security**: Sandboxed plugin execution
- **Documentation**: Comprehensive plugin development guide

### Federation

- **Multi-Node**: Synchronization between multiple instances
- **Data Sharing**: Secure data exchange between municipalities
- **Scalability**: Support for large-scale deployments
- **Resilience**: Offline-first architecture

### Advanced Features

- **Cryptographic Security**: Digital signatures and verification
- **Audit Framework**: Comprehensive change tracking
- **Multi-tenant Support**: Multiple municipality deployments
- **Advanced Workflows**: Configurable civic approval processes

## User Management Interface Implementation (Latest)

### **API Architecture Decisions**

- **Public Configuration Endpoints**: Made `/api/config/roles` and `/api/status`
  publicly accessible
  - **Rationale**: UI needs role data for dropdowns before authentication
  - **Implementation**: Direct file system reading for roles, removed auth
    middleware from config routes
  - **Security**: Configuration data is not sensitive, roles are public
    information

- **Dynamic Role Loading**: Roles sourced from `data/.civic/roles.yml` platform
  configuration
  - **Rationale**: Ensures UI only shows roles that are actually configured in
    the platform
  - **Implementation**: API reads roles.yml directly, UI fetches via
    `/api/config/roles`
  - **Benefits**: Platform configuration drives UI behavior, no hardcoded roles

### **UI Architecture Decisions**

- **UDashboardPanel Pattern**: All settings pages use consistent
  `UDashboardPanel` structure
  - **Rationale**: Provides consistent navigation, headers, and layout across
    all settings pages
  - **Implementation**: Template slots for `#header` and `#body` with
    `UDashboardNavbar`
  - **Benefits**: Professional appearance, consistent UX, maintainable code

- **Template Slots for Headers**: Use template slots instead of attributes for
  navbar content
  - **Rationale**: More flexible and maintainable than attribute-based
    configuration
  - **Implementation**: `#title`, `#description`, `#toggle` slots for dynamic
    content
  - **Benefits**: Better control over HTML structure, easier customization

- **Reusable UserForm Component**: Single component for both create and edit
  user forms
  - **Rationale**: Reduces code duplication and ensures consistent behavior
  - **Implementation**: Props for `isEditing`, `user`, `canDelete` with event
    emitters
  - **Benefits**: DRY principle, easier maintenance, consistent validation

### **Form Design Decisions**

- **UFormField Components**: All form fields use `UFormField` with rich metadata
  - **Rationale**: Provides consistent styling, help text, and error handling
  - **Implementation**: Label, description, hint, help text, and error props
  - **Benefits**: Professional appearance, better UX, accessible design

- **Inline Validation**: Form validation errors displayed inline, API errors as
  toasts
  - **Rationale**: Clear distinction between user input errors and system errors
  - **Implementation**: `formErrors` reactive object for inline errors, toast
    for API feedback
  - **Benefits**: Better user experience, clear error context

- **Password Features**: Show/hide password with unified control for both fields
  - **Rationale**: Single eye icon controls both password fields for better UX
  - **Implementation**: `showPassword` reactive variable, eye icon in first
    password field only
  - **Benefits**: Intuitive interface, less visual clutter

### **Navigation Decisions**

- **Breadcrumb Navigation**: Reactive breadcrumbs that update with user data
  - **Rationale**: Provides clear navigation context and improves UX
  - **Implementation**: `computed()` breadcrumb items that update when user data
    loads
  - **Benefits**: Dynamic navigation, better user orientation

- **Settings Menu Integration**: Users link added to existing Settings dropdown
  - **Rationale**: Leverages existing navigation structure without adding
    clutter
  - **Implementation**: Conditional children in UserMenu Settings dropdown for
    admin users
  - **Benefits**: Clean navigation, admin-only visibility

### **Access Control Decisions**

- **Admin-Only Features**: User management restricted to admin role
  - **Rationale**: User management is a sensitive administrative function
  - **Implementation**: `canManageUsers` computed property, conditional UI
    rendering
  - **Benefits**: Proper security, clear permission boundaries

- **Self-Delete Prevention**: Admins cannot delete their own account
  - **Rationale**: Prevents accidental account deletion and maintains system
    integrity
  - **Implementation**: `canDeleteUser` computed property comparing user IDs
  - **Benefits**: System safety, prevents administrative lockout

### **Error Handling Decisions**

- **Comprehensive Error States**: Loading, error, and access denied states
  - **Rationale**: Provides clear feedback for all possible scenarios
  - **Implementation**: Conditional rendering with appropriate UI components
  - **Benefits**: Better user experience, clear system status

- **Toast Notifications**: API interaction feedback via toast notifications
  - **Rationale**: Non-intrusive feedback for system-level operations
  - **Implementation**: `useToast()` composable for success/error messages
  - **Benefits**: Consistent feedback, doesn't interrupt user flow

## Roles API Endpoint Implementation (Previous)

### **API Endpoint Design**

- **Endpoint**: `GET /api/config/roles` following established patterns
- **Authentication**: Initially required, later made public for UI access
- **Response Structure**: Consistent with other config endpoints
- **Error Handling**: Graceful fallback if role config is unavailable

### **Core Method Integration**

- **RoleManager.getRoleConfig()**: Added method to retrieve detailed role
  configuration
- **AuthService.getRoleManager()**: Exposed RoleManager instance for API access
- **Core Export**: Made RoleManager available to other modules

### **Benefits**

- **Dynamic Role Management**: UI gets roles from platform configuration
- **Consistent API Pattern**: Follows same structure as record-types/statuses
- **Production Ready**: Tested and verified with full role configuration data
- **Platform Integration**: Seamlessly integrates with existing configuration
  system

### **Response Structure**

```json
{
  "success": true,
  "data": {
    "roles": [
      {
        "key": "admin",
        "name": "Administrator",
        "description": "Full system access",
        "permissions": ["*", "records:import", "..."],
        "record_types": {},
        "status_transitions": ["draft", "review", "approved", "..."]
      }
    ],
    "total": 3
  }
}
```

### **Next Steps for UI Integration**

- **Role Dropdown**: Use role data for user creation/editing forms
- **Permission Display**: Show role permissions in user management interface
- **Validation**: Ensure selected roles are valid for current user
- **Dynamic UI**: Adjust interface based on available roles
