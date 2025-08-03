# 🔄 CivicPress Spec: `workflows.md`

---

version: 1.0.0 status: stable created: '2025-07-03' updated: '2025-07-15'
deprecated: false sunset_date: null breaking_changes: [] additions:

- comprehensive security considerations
- detailed workflow examples
- enhanced testing patterns fixes: [] migration_guide: null compatibility:
  min_civicpress: 1.0.0 max_civicpress: 'null' dependencies:
  - 'auth.md: >=1.0.0'
  - 'permissions.md: >=1.0.0'
  - 'hooks.md: >=1.0.0' authors:
- Sophie Germain <sophie@civic-press.org> reviewers:
- Ada Lovelace
- Irène Joliot-Curie

---

## 📛 Name

`workflows` — CivicPress Workflows Engine

## 🎯 Purpose

To allow towns to define local civic logic (notifications, tagging, approvals)
using event-based JavaScript files stored in `.civic/workflows/`.

Workflows let CivicPress respond dynamically to civic events — without modifying
core logic.

---

## 🧩 Scope & Responsibilities

✅ Responsibilities:

- Load `.js` files from the workflows folder
- Execute on matching hook events
- Provide safe civic context (record, user, timestamp)
- Enforce policy (signatures, dry-run, role checks)
- Log executions for audit trail

❌ Out of scope:

- Unrestricted file system or network access
- Background job scheduling (separate system)
- Frontend workflow interface (UI is separate)

---

## 🔗 Inputs & Outputs

Triggered by: Hook events from core or modules  
Input: Civic object payload and context  
Output: Actions taken, logs recorded

---

## 📂 File/Folder Location

```
.civic/
├── workflows/              # Workflow files
│   ├── onRecordSubmit.js
│   ├── onFeedback.js
│   ├── onApproval.js
│   ├── onBylawPublish.js
│   └── onUserRegistration.js
├── workflow.policy.yml     # Workflow security policy
├── workflow.config.yml     # Workflow configuration
├── hooks.log.jsonl        # Workflow execution logs
└── workflow-cache/         # Workflow execution cache
    ├── compiled/
    └── metadata/

core/
├── workflow-engine.ts      # Main workflow execution engine
├── workflow-sandbox.ts     # Secure sandbox environment
├── workflow-policy.ts      # Policy enforcement logic
├── workflow-logger.ts      # Workflow logging system
└── workflow-cache.ts       # Workflow caching system

modules/
├── workflows/
│   ├── components/
│   │   ├── WorkflowEditor.tsx # Workflow editing UI
│   │   ├── PolicyManager.tsx # Policy management UI
│   │   └── ExecutionMonitor.tsx # Execution monitoring
│   ├── hooks/
│   │   └── useWorkflows.ts # Workflow data hook
│   └── utils/
│       ├── workflow-parser.ts # Workflow parsing utilities
│       └── policy-validator.ts # Policy validation
└── ui/
    └── components/
        └── WorkflowProvider.tsx # Workflow context provider

tests/
├── workflows/
│   ├── workflow-execution.test.ts
│   ├── policy-enforcement.test.ts
│   ├── sandbox-security.test.ts
│   └── workflow-validation.test.ts
├── integration/
│   ├── workflow-hooks.test.ts
│   └── workflow-api.test.ts
└── e2e/
    └── workflow-journey.test.ts
```

---

## 🔐 Security & Trust Considerations

### Workflow Security

- All workflow files must be cryptographically signed or approved based on
  `workflow.policy.yml`
- Workflows must run in a secure sandbox environment (e.g., `vm2`)
- File system and network access must be explicitly permitted in policy
- Only authorized roles defined in policy can execute workflows
- All workflow executions must be logged for audit purposes

### Sandbox Security

- Workflow execution must be isolated from core system
- Memory and CPU limits must be enforced during execution
- Timeout limits must prevent infinite loops or hanging workflows
- Resource usage must be monitored and logged
- Sandbox permissions must be validated before execution

### Data Protection

- Workflow input data must be sanitized and validated
- Sensitive data must not be exposed to untrusted workflows
- Workflow output must be validated before applying changes
- Audit logs must capture all data access and modifications
- Data retention policies must be enforced for workflow logs

### Policy Enforcement

- Workflow policies must be validated before execution
- Role-based access control must be strictly enforced
- Policy changes must be reviewed and approved
- Policy violations must be logged and reported
- Default security policies must be applied to all workflows

### Compliance & Audit

- All workflow executions must be traceable and auditable
- Workflow logs must be immutable and tamper-evident
- Compliance with local regulations must be verified
- Regular security audits of workflow policies must be performed
- Workflow performance and security metrics must be monitored

---

## 🧪 Testing & Validation

- Support `--dry-run` mode
- Simulate events via CLI (`civic run-workflow`)
- Ensure enforcement of policy restrictions
- Audit sandbox permissions with test suites

---

## 🧰 Invocation Methods

- CLI: `civic run-workflow onRecordSubmit record.yaml`
- API: `POST /v1/hook/onRecordSubmit`
- Git hook: Triggered on `commit`, `push`, or `merge`

---

## 🧠 Example Workflow: onRecordSubmit.js

```js
module.exports = async ({ record, context }) => {
  if (record.path.includes('bylaws/')) {
    await civic.appendTag(record, 'awaiting-legal');
  }
};
```

---

## 📜 Example Policy File: workflow.policy.yml

```yaml
trustedAuthors:
  - clerk-richmond
  - civic-devs
permissions:
  allowNetwork: false
  allowFilesystem: false
defaultMode: dry-run
```

---

## 🛠️ Future Enhancements

- Visual editor in admin UI
- Scheduled (cron-like) triggers
- Cross-module event chaining
- Workflow registry or marketplace
- WASM support for sandboxing

---

## 📅 History

- Drafted: 2025-07-02
- Merged revision: 2025-07-03
