# 🏗️ CivicPress Architecture Memory

**Last Updated**: 2025-01-27  
**Architecture Version**: 1.0.0

## 🎯 **System Overview**

CivicPress is a **Git-native, modular civic platform** designed for
transparency, auditability, and local governance. The architecture emphasizes
simplicity, security, and civic trust.

## 🏛️ **Core Architecture Principles**

### 1. **Git-Native Design**

- All civic records stored as Markdown files in Git
- Complete audit trail through Git history
- Version control for all civic documents
- Branch-based workflow for proposals and approvals

### 2. **Modular Plugin System**

- Core platform provides foundation
- Civic modules add specific functionality
- Plugin system for extensibility
- Sandboxed execution for security

### 3. **Security-First Approach**

- Sandboxed workflow execution
- Role-based access control
- Comprehensive audit logging
- Cryptographic integrity verification

### 4. **Transparency by Default**

- All changes traceable
- Public audit logs
- Open source by design
- No hidden automation

## 📁 **Directory Structure**

```
civicpress/
├── .civic/                    # Platform configuration
│   ├── specs/                 # 50+ detailed specifications
│   ├── workflows/             # Civic workflow definitions
│   ├── plugins/               # Plugin installations
│   └── config/                # Platform configuration
├── core/                      # Core platform modules
│   ├── civic-core.ts          # Main platform loader
│   ├── hooks.ts               # Event system
│   ├── workflow-engine.ts     # Workflow execution
│   └── git-integration.ts     # Git operations
├── modules/                   # Civic modules
│   ├── legal-register/        # Legal document management
│   ├── feedback/              # Public feedback system
│   └── notifications/         # Notification system
├── records/                   # Civic records (Markdown)
│   ├── bylaws/               # Municipal bylaws
│   ├── minutes/              # Meeting minutes
│   ├── policies/             # Municipal policies
│   └── proposals/            # Public proposals
└── agent/                    # AI agent memory system
    ├── memory/               # Core memory
    ├── context/              # Contextual information
    ├── knowledge/            # Domain knowledge
    └── sessions/             # Session management
```

## 🔧 **Core Components**

### 1. **Civic Core (`civic-core.ts`)**

- **Purpose**: Main platform loader and coordinator
- **Responsibilities**:
  - Load and initialize modules
  - Manage plugin system
  - Coordinate hook system
  - Handle platform lifecycle
- **Key Methods**:
  - `initialize()` - Platform startup
  - `loadModule(name)` - Load civic modules
  - `emitHook(event, data)` - Trigger events
  - `getConfig()` - Access configuration

### 2. **Hook System (`hooks.ts`)**

- **Purpose**: Event-driven architecture for civic processes
- **Responsibilities**:
  - Emit civic events
  - Handle event listeners
  - Trigger workflows
  - Log event activity
- **Key Events**:
  - `onRecordCreated` - New civic record
  - `onRecordPublished` - Record published
  - `onFeedbackSubmitted` - Public feedback
  - `onWorkflowTriggered` - Workflow execution

### 3. **Workflow Engine (`workflow-engine.ts`)**

- **Purpose**: Execute civic processes and automation
- **Responsibilities**:
  - Load workflow definitions
  - Execute workflows safely
  - Handle workflow state
  - Log workflow activity
- **Security**: Sandboxed execution environment
- **Examples**:
  - Approval workflows
  - Notification workflows
  - Validation workflows

### 4. **Git Integration (`git-integration.ts`)**

- **Purpose**: Git-native civic record management
- **Responsibilities**:
  - Commit civic changes
  - Handle role-aware commits
  - Manage branches for proposals
  - Track civic history
- **Key Features**:
  - Role-based commit messages
  - Branch-based proposal workflow
  - Audit trail preservation
  - Conflict resolution

## 🧩 **Module Architecture**

### Module Structure

```
modules/legal-register/
├── package.json              # Module metadata
├── src/
│   ├── index.ts              # Module entry point
│   ├── types.ts              # TypeScript definitions
│   ├── validation.ts         # Record validation
│   └── workflows.ts          # Module workflows
├── tests/                    # Module tests
└── README.md                 # Module documentation
```

### Module Lifecycle

1. **Discovery**: Core scans for available modules
2. **Loading**: Module code loaded and initialized
3. **Registration**: Module registers hooks and routes
4. **Execution**: Module handles civic events
5. **Cleanup**: Module cleanup on shutdown

## 🔌 **Plugin System**

### Plugin Architecture

- **Sandboxed Execution**: Plugins run in isolated environment
- **API Access**: Controlled access to CivicPress APIs
- **Lifecycle Hooks**: Plugin initialization and cleanup
- **Configuration**: Plugin-specific settings

### Plugin Capabilities

- **UI Widgets**: Add components to civic dashboard
- **CLI Commands**: Extend command-line interface
- **API Routes**: Add REST API endpoints
- **Workflows**: Define civic automation
- **Hooks**: Respond to civic events

## 🔐 **Security Architecture**

### 1. **Sandboxing**

- Workflow execution in isolated environment
- Plugin execution with limited permissions
- File system access controls
- Network access restrictions

### 2. **Role-Based Access**

- User roles defined in `.civic/roles.yml`
- Permission-based access control
- Audit logging for all actions
- Cryptographic signatures for approvals

### 3. **Data Integrity**

- Cryptographic hashing of records
- Tamper-evident audit logs
- Version control for all changes
- Backup and recovery procedures

## 🎨 **User Interface Architecture**

### Frontend Design

- **Progressive Enhancement**: Works without JavaScript
- **Accessibility First**: WCAG 2.2 AA compliance
- **Responsive Design**: Works on all devices
- **Civic-Focused**: Designed for public use

### UI Components

- **Record Viewer**: Display civic documents
- **Feedback Forms**: Public input collection
- **Admin Dashboard**: Municipal staff interface
- **Search Interface**: Find civic records

## 🔄 **Data Flow**

### 1. **Record Creation**

```
User Input → Validation → Git Commit → Hook Event → Workflow Trigger
```

### 2. **Record Publication**

```
Approval → Git Merge → Hook Event → Notification → Public Display
```

### 3. **Feedback Processing**

```
Public Input → Validation → Hook Event → Workflow → Response
```

## 📊 **Performance Considerations**

### 1. **Scalability**

- Static file generation for public records
- Caching for frequently accessed data
- Database for dynamic content only
- CDN for public assets

### 2. **Reliability**

- Git as source of truth
- Backup and recovery procedures
- Offline capability for core functions
- Graceful degradation

### 3. **Monitoring**

- Comprehensive logging
- Performance metrics
- Error tracking
- Usage analytics

## 🛠️ **Development Patterns**

### 1. **Specification-Driven Development**

- All features specified before implementation
- Comprehensive testing requirements
- Security review for all changes
- Documentation as code

### 2. **Civic-First Design**

- Public transparency requirements
- Accessibility by default
- Audit trail for all actions
- User-friendly interfaces

### 3. **Security-First Implementation**

- Sandboxed execution
- Input validation
- Output sanitization
- Error handling

## 📚 **Key Specifications**

### Core System

- `manifest.md` - Platform configuration
- `auth.md` - Authentication and authorization
- `permissions.md` - Role-based access control
- `git-policy.md` - Git workflow policies

### Architecture

- `api.md` - REST API design
- `cli.md` - Command-line interface
- `frontend.md` - User interface design
- `plugins.md` - Plugin system architecture

### Security

- `security.md` - Security architecture
- `testing-framework.md` - Testing standards
- `accessibility.md` - Accessibility requirements

## 🎯 **Implementation Priorities**

### Phase 1: Core Foundation

1. Implement `civic-core.ts` loader
2. Build basic hook system
3. Create simple workflow engine
4. Add Git integration

### Phase 2: First Module

1. Complete legal-register module
2. Add record validation
3. Implement basic workflows
4. Create approval processes

### Phase 3: Development Tools

1. Build testing framework
2. Implement specification validation
3. Create development documentation
4. Add example implementations
