# 🏗️ CivicPress Architecture Diagrams

**Last Updated**: 2025-01-27  
**Diagram Type**: Mermaid  
**Purpose**: Visual representation of CivicPress architecture

## 🎯 **High-Level System Architecture**

### **Core Platform Overview**

```mermaid
graph TB
    subgraph "Git Repository"
        GR[Git Records]
        GH[Git History]
        GB[Git Branches]
    end

    subgraph "Civic Core"
        CC[Civic Core]
        HS[Hook System]
        WE[Workflow Engine]
        GI[Git Integration]
    end

    subgraph "Civic Modules"
        LR[Legal Register]
        FB[Feedback System]
        NT[Notifications]
        PL[Plugins]
    end

    subgraph "User Interface"
        CD[Civic Dashboard]
        API[REST API]
        CLI[CLI Tools]
    end

    subgraph "Security Layer"
        SB[Sandbox]
        RBAC[Role-Based Access]
        AL[Audit Logs]
    end

    GR --> GI
    GH --> GI
    GB --> GI

    GI --> CC
    CC --> HS
    CC --> WE

    HS --> LR
    HS --> FB
    HS --> NT

    WE --> SB
    SB --> LR
    SB --> FB
    SB --> NT

    LR --> CD
    FB --> CD
    NT --> CD

    CD --> RBAC
    API --> RBAC
    CLI --> RBAC

    RBAC --> AL
    SB --> AL
    HS --> AL
```

## 🔄 **Data Flow Architecture**

### **Civic Record Lifecycle**

```mermaid
flowchart TD
    A[User Input] --> B{Validation}
    B -->|Valid| C[Create Record]
    B -->|Invalid| D[Return Error]

    C --> E[Git Engine Commit]
    E --> F[Role-Based Commit Message]
    F --> G[Hook Event: record:created]
    G --> H[Workflow Engine]

    H --> I{Record Type}
    I -->|Bylaw| J[Legal Register Workflow]
    I -->|Policy| K[Policy Workflow]
    I -->|Proposal| L[Proposal Workflow]

    J --> M[Approval Process]
    K --> M
    L --> M

    M --> N{Approved?}
    N -->|Yes| O[Git Engine: Publish Record]
    N -->|No| P[Git Engine: Return to Draft]

    O --> Q[Role-Based Commit: feat(clerk): publish]
    P --> R[Role-Based Commit: feat(council): reject]

    Q --> S[Hook Event: record:published]
    R --> T[Hook Event: record:rejected]

    S --> U[Notification System]
    T --> V[Notify Creator]

    U --> W[Public Dashboard]
    V --> X[Audit Log]
    W --> X
```

## 🧩 **Module Interaction Architecture**

### **Legal Register Module Flow**

```mermaid
sequenceDiagram
    participant U as User
    participant LR as Legal Register
    participant CC as Civic Core
    participant HS as Hook System
    participant WE as Workflow Engine
    participant GE as Git Engine
    participant AL as Audit Log

    U->>LR: Create Bylaw
    LR->>LR: Validate Input
    LR->>CC: Emit Hook (record:created)
    CC->>HS: Process Hook
    HS->>WE: Trigger Approval Workflow
    WE->>GE: Create Role-Based Commit
    GE->>AL: Log Activity with Role

    WE->>LR: Update Status (draft)
    LR->>U: Return Record ID

    Note over U,AL: Approval Process
    U->>LR: Submit for Approval
    LR->>WE: Trigger Approval Workflow
    WE->>GE: Create Approval Commit (feat(council): approve)
    GE->>AL: Log Approval with Role

    WE->>LR: Update Status (approved)
    LR->>U: Notify Approval

    Note over U,AL: Publication Process
    U->>LR: Publish Bylaw
    LR->>WE: Trigger Publication Workflow
    WE->>GE: Create Publication Commit (feat(clerk): publish)
    GE->>AL: Log Publication with Role
    GE->>AL: Update Audit Trail
```

## 🔐 **Security Architecture**

### **Access Control Flow**

```mermaid
graph TD
    A[User Request] --> B{Authentication}
    B -->|Valid| C[Role Check]
    B -->|Invalid| D[Access Denied]

    C --> E{Permission Check}
    E -->|Allowed| F[Resource Access]
    E -->|Denied| G[Access Denied]

    F --> H[Sandbox Execution]
    H --> I[Git Engine Audit]
    I --> J[Response]

    D --> K[Log Failed Attempt]
    G --> K
    K --> L[Security Alert]

    I --> M[Role-Based Commit]
    M --> N[Audit Trail]
    N --> O[Compliance Report]
```

### **Sandbox Security Model**

```mermaid
graph TB
    subgraph "Trusted Zone"
        CC[Civic Core]
        HS[Hook System]
        GE[Git Engine]
    end

    subgraph "Sandbox Zone"
        WE[Workflow Engine]
        PL[Plugins]
        LR[Legal Register]
        FB[Feedback System]
    end

    subgraph "Isolated Zone"
        SB[Sandbox Container]
        FS[File System Access]
        NET[Network Access]
        GC[Git Commands]
    end

    CC --> WE
    HS --> WE
    WE --> SB
    SB --> FS
    SB --> NET
    SB --> GC

    PL --> SB
    LR --> SB
    FB --> SB

    GE --> GC
    GC --> AL[Audit Log]
```

## 🎨 **User Interface Architecture**

### **Dashboard Component Structure**

```mermaid
graph TB
    subgraph "Civic Dashboard Layout"
        NH[Navigation Header]
        SB[Sidebar Navigation]
        MC[Main Content Area]
        FT[Footer]
    end

    subgraph "Main Content Views"
        RC[Record Catalog View]
        RD[Record Detail View]
        CF[Create/Edit Form]
        SE[Search Results]
        AP[Approval Panel]
    end

    subgraph "UI Component Library"
        BT[Button Components]
        TF[Form Fields]
        TB[Data Tables]
        CH[Charts/Graphs]
        AL[Alert Components]
    end

    NH --> RC
    NH --> RD
    NH --> CF
    NH --> SE
    NH --> AP

    RC --> TB
    RD --> BT
    CF --> TF
    SE --> TB
    AP --> AL

    SB --> RC
    SB --> RD
    SB --> CF
    SB --> AP
```

## 🔄 **Workflow Architecture**

### **Approval Workflow**

```mermaid
stateDiagram-v2
    [*] --> Draft
    Draft --> UnderReview : Submit for Review
    UnderReview --> NeedsChanges : Request Changes
    UnderReview --> PendingApproval : Ready for Approval
    NeedsChanges --> Draft : Changes Made
    PendingApproval --> Approved : Approval Granted
    PendingApproval --> Rejected : Approval Denied
    Approved --> Published : Publish
    Rejected --> Draft : Resubmit
    Published --> [*]
```

### **Plugin Workflow**

```mermaid
flowchart LR
    A[Plugin Request] --> B[Load Plugin]
    B --> C[Validate Plugin]
    C --> D[Initialize Plugin]
    D --> E[Register Hooks]
    E --> F[Execute Plugin]
    F --> G[Log Activity]
    G --> H[Return Result]
```

## 📊 **Performance Architecture**

### **Caching Strategy**

```mermaid
graph TB
    subgraph "Client Side"
        BC[Browser Cache]
        LC[Local Storage]
    end

    subgraph "Server Side"
        MC[Memory Cache]
        RC[Redis Cache]
        FC[File Cache]
    end

    subgraph "Data Sources"
        GI[Git Integration]
        DB[Database]
        FS[File System]
    end

    BC --> MC
    LC --> MC
    MC --> RC
    RC --> FC
    FC --> GI
    FC --> DB
    FC --> FS
```

## 🔗 **API Architecture**

### **REST API Structure**

```mermaid
graph TB
    subgraph "API Gateway"
        AG[API Gateway]
        AUTH[Authentication]
        RATE[Rate Limiting]
    end

    subgraph "API Endpoints"
        REC[Records API]
        USR[Users API]
        WF[Workflows API]
        PLG[Plugins API]
        GE[Git Engine API]
    end

    subgraph "Core Services"
        CS[Civic Core Service]
        HS[Hook Service]
        WS[Workflow Service]
        GI[Git Integration Service]
    end

    AG --> AUTH
    AUTH --> RATE
    RATE --> REC
    RATE --> USR
    RATE --> WF
    RATE --> PLG
    RATE --> GE

    REC --> CS
    USR --> CS
    WF --> WS
    PLG --> CS
    GE --> GI
```

## 🎯 **Deployment Architecture**

### **System Deployment**

```mermaid
graph TB
    subgraph "Load Balancer"
        LB[Load Balancer]
    end

    subgraph "Application Servers"
        AS1[App Server 1]
        AS2[App Server 2]
        AS3[App Server 3]
    end

    subgraph "Data Layer"
        DB1[Primary DB]
        DB2[Replica DB]
        RED[Redis Cache]
    end

    subgraph "Storage"
        FS1[File Storage 1]
        FS2[File Storage 2]
        GIT[Git Repository]
    end

    LB --> AS1
    LB --> AS2
    LB --> AS3

    AS1 --> DB1
    AS2 --> DB1
    AS3 --> DB1

    AS1 --> RED
    AS2 --> RED
    AS3 --> RED

    AS1 --> FS1
    AS2 --> FS2
    AS3 --> GIT
```

## 📋 **Diagram Usage Guidelines**

### **When to Use Each Diagram**

- **High-Level System**: For understanding overall architecture
- **Data Flow**: For understanding how data moves through the system
- **Module Interaction**: For understanding component relationships
- **Security**: For understanding access control and security measures
- **User Interface**: For understanding UI component structure
- **Workflow**: For understanding business processes
- **Performance**: For understanding caching and optimization
- **API**: For understanding service communication
- **Deployment**: For understanding infrastructure

### **Maintenance**

- Update diagrams when architecture changes
- Keep diagrams synchronized with code
- Use diagrams in documentation and presentations
- Version control diagrams with code

## 🔗 **Related Documentation**

- **Specifications Index**: `.civic/specs-index.md`
- **Core Platform**: `.civic/specs/api.md`, `.civic/specs/hooks.md`,
  `.civic/specs/workflows.md`
- **Git Engine**: `.civic/specs/git-engine.md`
- **Legal Register**: `.civic/specs/legal-register.md`
- **Security**: `.civic/specs/security.md`, `.civic/specs/auth.md`,
  `.civic/specs/permissions.md`
- **UI/UX**: `.civic/specs/ui.md`, `.civic/specs/frontend.md`,
  `.civic/specs/accessibility.md`
- **Plugins**: `.civic/specs/plugins.md`, `.civic/specs/plugin-api.md`,
  `.civic/specs/plugin-development.md`
