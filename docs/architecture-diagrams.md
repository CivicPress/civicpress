# CivicPress Architecture Diagrams

**Last Updated:** 2025-01-30  
**Version:** v0.2.0  
**Status:** Active  
**Format:** Mermaid diagrams

---

This document contains visual architecture diagrams for CivicPress. These
diagrams complement the detailed architecture documentation and provide visual
representations of system components, data flows, and interactions.

**Note**: These diagrams use Mermaid syntax and will render in Markdown viewers
that support Mermaid (GitHub, GitLab, many documentation sites, and VS Code with
Mermaid extensions).

---

## 1. Service Dependency Diagram

This diagram shows the dependency injection container structure and how services
depend on each other.

```mermaid
graph TB
    CivicPress[CivicPress Orchestrator]
    Container[ServiceContainer DI]

    CivicPress --> Container

    Container --> Logger[Logger]
    Container --> Secrets[SecretsManager]
    Container --> DB[DatabaseService]
    Container --> Auth[AuthService]
    Container --> Cache[UnifiedCacheManager]
    Container --> RecordMgr[RecordManager]
    Container --> Storage[CloudUuidStorageService]

    Secrets --> Auth
    Secrets --> Notification[NotificationService]
    Secrets --> Email[EmailValidationService]

    Auth --> RoleMgr[RoleManager]
    Auth --> Email

    Cache --> MemoryCache[MemoryCache]
    Cache --> FileCache[FileWatcherCache]

    RecordMgr --> SagaExec[SagaExecutor]
    RecordMgr --> Git[GitEngine]
    RecordMgr --> Hooks[HookSystem]
    RecordMgr --> Workflow[WorkflowEngine]

    SagaExec --> StateStore[SagaStateStore]
    SagaExec --> Idempotency[IdempotencyManager]
    SagaExec --> LockMgr[ResourceLockManager]

    StateStore --> DB
    LockMgr --> DB

    Storage --> StorageConfig[StorageConfigManager]
    Storage --> Cache
    Storage --> DB

    style Secrets fill:#e1f5ff
    style Auth fill:#e1f5ff
    style RecordMgr fill:#e1f5ff
    style Cache fill:#e1f5ff
```

**Key Points:**

- **SecretsManager** is initialized early and used by Auth, Notification, and
  EmailValidation services
- **RecordManager** orchestrates multiple services (Saga, Git, Hooks, Workflow)
- **SagaExecutor** depends on state management and locking services
- **Storage** services are registered in DI container but initialized lazily

---

## 2. Record Creation Data Flow

This sequence diagram shows the complete flow of creating a record using the
Saga pattern.

```mermaid
sequenceDiagram
    participant User
    participant API as API Layer
    participant RM as RecordManager
    participant Saga as CreateRecordSaga
    participant DB as DatabaseService
    participant FS as FileSystem
    participant Git as GitEngine
    participant Index as IndexingService
    participant Hooks as HookSystem

    User->>API: POST /api/v1/records
    API->>API: Validate & Authorize
    API->>RM: createRecord(request)
    RM->>Saga: Execute CreateRecordSaga

    Saga->>DB: Step 1: Create in DB
    DB-->>Saga: Record created

    Saga->>FS: Step 2: Create file
    FS-->>Saga: File created

    Saga->>Git: Step 3: Commit
    Git-->>Saga: Commit hash

    Saga->>Index: Step 4: Queue indexing
    Index-->>Saga: Queued

    Saga->>Hooks: Step 5: Emit hooks
    Hooks-->>Saga: Hooks emitted

    Saga-->>RM: Success
    RM-->>API: RecordData
    API-->>User: 201 Created
```

**Key Points:**

- All steps are compensatable - if any step fails, previous steps are rolled
  back
- State is persisted after each step for recovery
- Saga ensures atomicity across database, filesystem, and Git operations

---

## 3. Error Handling Flow

This flowchart shows how errors are processed across different layers of the
application.

```mermaid
flowchart TD
    Start[Error Occurs] --> CheckType{Error Type?}

    CheckType -->|CivicPressError| HasCorrelation[Has Correlation ID]
    CheckType -->|Generic Error| Normalize[Normalize to CivicPressError]

    Normalize --> HasCorrelation
    HasCorrelation --> Categorize[Categorize Error]

    Categorize --> Layer{Which Layer?}

    Layer -->|API| APIHandler[errorHandler Middleware]
    Layer -->|CLI| CLIHandler[cliError Handler]
    Layer -->|Core| CoreHandler[coreError Handler]

    APIHandler --> APILog[Log with Request Context]
    CLIHandler --> CLILog[Log with Command Context]
    CoreHandler --> CoreLog[Log with Service Context]

    APILog --> APIResponse[Structured JSON Response]
    CLILog --> CLIOutput[Formatted Error Message]
    CoreLog --> CoreOutput[Error Details]

    APIResponse --> APIFeatures{Development?}
    APIFeatures -->|Yes| APIDev[Include Stack & Details]
    APIFeatures -->|No| APIProd[Generic Message Only]

    APIDev --> User
    APIProd --> User
    CLIOutput --> User
    CoreOutput --> User

    User[User/System]

    style Start fill:#ffebee
    style CheckType fill:#fff3e0
    style Categorize fill:#e3f2fd
    style APIHandler fill:#e8f5e9
    style CLIHandler fill:#e8f5e9
    style CoreHandler fill:#e8f5e9
```

**Key Points:**

- All errors are normalized to CivicPressError with correlation IDs
- Layer-specific handlers provide appropriate formatting
- Development mode includes detailed error information
- Production mode sanitizes error messages for security

---

## 4. Module Interaction Diagram

This diagram shows how different modules interact with the core platform.

```mermaid
graph LR
    subgraph Core[Core Module]
        CP[CivicPress]
        DI[DI Container]
        Services[Core Services]
    end

    subgraph API[API Module]
        Routes[API Routes]
        Middleware[Middleware]
    end

    subgraph UI[UI Module]
        Pages[Vue Pages]
        Composables[Composables]
    end

    subgraph Storage[Storage Module]
        StorageSvc[Storage Service]
    end

    subgraph CLI[CLI Module]
        Commands[CLI Commands]
    end

    Pages -->|HTTP| Routes
    Composables -->|HTTP| Routes
    Commands -->|Direct| Services

    Routes -->|getService| DI
    Routes -->|getService| StorageSvc
    Middleware -->|getService| DI

    DI --> Services
    Services --> StorageSvc

    style Core fill:#e1f5ff
    style API fill:#f3e5f5
    style UI fill:#e8f5e9
    style Storage fill:#fff3e0
    style CLI fill:#fce4ec
```

**Key Points:**

- **Core** provides foundation services via DI container
- **API** and **CLI** access services directly from DI container
- **UI** communicates with **API** via HTTP
- **Storage** is registered in DI container but can be accessed independently

---

## 5. Security System Architecture

This diagram shows the security system architecture, including secrets
management and CSRF protection.

```mermaid
graph TB
    subgraph Root[Root Secret]
        EnvVar[CIVICPRESS_SECRET<br/>Environment Variable]
        File[.system-data/secrets.yml<br/>File Storage]
    end

    subgraph Secrets[SecretsManager]
        HKDF[HKDF-SHA256<br/>Key Derivation]
    end

    subgraph Keys[Derived Keys On-Demand]
        Session[Session Signing Key]
        API[API Key Signing Key]
        CSRF[CSRF Signing Key]
        Webhook[Webhook Signing Key]
        JWT[JWT Secret]
        Email[Email Verification Key]
    end

    subgraph Services[Services Using Keys]
        AuthSvc[AuthService]
        CSRFProt[CsrfProtection]
        NotifSvc[NotificationService]
        EmailVal[EmailValidationService]
    end

    subgraph APILayer[API Layer]
        CSRFMid[CSRF Middleware]
        TokenEndpoint[CSRF Token Endpoint]
    end

    subgraph UILayer[UI Layer]
        CSRFComp[useCsrf Composable]
    end

    EnvVar --> Secrets
    File --> Secrets

    Secrets --> HKDF
    HKDF --> Session
    HKDF --> API
    HKDF --> CSRF
    HKDF --> Webhook
    HKDF --> JWT
    HKDF --> Email

    Session --> AuthSvc
    API --> AuthSvc
    JWT --> AuthSvc
    Email --> EmailVal

    CSRF --> CSRFProt
    CSRFProt --> CSRFMid
    CSRFProt --> TokenEndpoint

    TokenEndpoint --> CSRFComp
    CSRFMid --> CSRFComp

    Webhook --> NotifSvc

    style Root fill:#ffebee
    style Secrets fill:#e1f5ff
    style Keys fill:#fff3e0
    style Services fill:#e8f5e9
    style APILayer fill:#f3e5f5
    style UILayer fill:#e8f5e9
```

**Key Points:**

- **Single Root Secret**: All keys derived from one secret using HKDF-SHA256
- **Scoped Keys**: Each service gets its own cryptographically independent key
- **Zero Key Storage**: Keys derived on-demand, never stored
- **CSRF Protection**: Token-based protection for browser requests
- **Production Ready**: Environment variable support for production

---

## 6. Saga Pattern Execution Flow

This diagram shows how the Saga pattern ensures reliable multi-step operations.

```mermaid
stateDiagram-v2
    [*] --> Initialize: Start Saga
    Initialize --> Step1: Create Context
    Step1 --> Step1Success: Execute Step 1
    Step1Success --> Step2: Persist State
    Step2 --> Step2Success: Execute Step 2
    Step2Success --> Step3: Persist State
    Step3 --> Step3Success: Execute Step 3
    Step3Success --> Step4: Persist State
    Step4 --> Step4Success: Execute Step 4
    Step4Success --> Step5: Persist State
    Step5 --> Step5Success: Execute Step 5
    Step5Success --> Complete: All Steps Done
    Complete --> [*]

    Step1 --> Compensate1: Error
    Step2 --> Compensate2: Error
    Step3 --> Compensate3: Error
    Step4 --> Compensate4: Error
    Step5 --> Compensate5: Error

    Compensate5 --> Compensate4: Rollback Step 5
    Compensate4 --> Compensate3: Rollback Step 4
    Compensate3 --> Compensate2: Rollback Step 3
    Compensate2 --> Compensate1: Rollback Step 2
    Compensate1 --> Failed: Rollback Step 1
    Failed --> [*]

    note right of Step1Success
        State persisted
        Can recover from here
    end note

    note right of Compensate5
        Compensation in
        reverse order
    end note
```

**Key Points:**

- **State Persistence**: Each step's state is saved for recovery
- **Compensation**: Failed steps trigger reverse-order compensation
- **Idempotency**: Operations can be safely retried
- **Recovery**: Failed sagas can be recovered and resumed

---

## 7. Caching Strategy Flow

This diagram shows how the unified caching layer works across different
services.

```mermaid
flowchart LR
    Request[Service Request] --> Cache{Check Cache}

    Cache -->|Hit| Return[Return Cached Value]
    Cache -->|Miss| Execute[Execute Operation]

    Execute --> Strategy{Cache Strategy?}

    Strategy -->|Memory| MemoryCache[MemoryCache<br/>TTL + LRU]
    Strategy -->|FileWatcher| FileCache[FileWatcherCache<br/>File Watching]

    MemoryCache --> Store[Store in Cache]
    FileCache --> Store

    Store --> Metrics[Update Metrics]
    Metrics --> Return

    Return --> Request

    style Cache fill:#e3f2fd
    style MemoryCache fill:#e8f5e9
    style FileCache fill:#fff3e0
    style Metrics fill:#f3e5f5
```

**Key Points:**

- **Unified Interface**: All services use same caching interface
- **Strategy Pattern**: Different strategies for different use cases
- **Metrics**: Cache performance tracked and monitored
- **Automatic Invalidation**: FileWatcherCache invalidates on file changes

---

## Related Documentation

- [Architecture Overview](architecture.md) - Main architecture documentation
- [Architecture Comprehensive Analysis](architecture-comprehensive-analysis.md) -
  Detailed analysis
- [Module Integration Guide](module-integration-guide.md) - Module integration
  patterns
- [Saga Pattern Usage Guide](saga-pattern-usage-guide.md) - Saga pattern details
- [Error Handling Guide](error-handling.md) - Error handling patterns
- [Secrets Management Guide](secrets-management.md) - Security system details

---

**Document Status:** Active  
**Last Updated:** 2025-01-30  
**Maintained By:** Architecture Team
