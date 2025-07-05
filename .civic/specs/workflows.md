# 🔄 CivicPress Spec: `workflows.md`

---
version: 1.3.0
status: stable
created: '2025-07-03'
updated: '2025-07-15'
deprecated: false
sunset_date: null
additions:

- comprehensive security considerations
- detailed workflow examples
- enhanced testing patterns
compatibility:
  min_civicpress: 1.0.0
  max_civicpress: 'null'
  dependencies:
  - 'auth.md: >=1.2.0'
  - 'permissions.md: >=1.1.0'
  - 'hooks.md: >=1.2.0'
authors:
- Sophie Germain <sophie@civic-press.org>
reviewers:
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

## 📂 File/Folder Layout

```
.civic/
├── workflows/
│   ├── onRecordSubmit.js
│   ├── onFeedback.js
│   └── onApproval.js
├── workflow.policy.yml
└── hooks.log.jsonl
core/
└── workflow-engine.ts
```

---

## 🔐 Security & Trust Considerations

- Files must be signed or approved based on `workflow.policy.yml`
- Must run in a secure sandbox (e.g., `vm2`)
- Cannot access `fs` or `net` unless explicitly permitted
- Only run by authorized roles defined in policy
- Logs are kept in `.civic/hooks.log.jsonl`

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
