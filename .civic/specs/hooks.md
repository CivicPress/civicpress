# 🔗 CivicPress Spec: `hooks.md`

## 📛 Name

`hooks` — CivicPress Hooks System

## 🎯 Purpose

To allow CivicPress Core and modules to emit named events ("hooks") that trigger
user-defined workflows or internal actions.

---

## 🧩 Scope & Responsibilities

✅ Responsibilities:

- Provide a central `emitHook()` function
- Support core events (e.g., `onRecordPublish`, `onFeedbackSubmit`)
- Allow modules to define and emit custom events
- Pass structured context to any hooked workflows
- Log and audit hook calls

❌ Out of scope:

- Direct access to private module internals
- Long-running external integrations (handled by workflows)

---

## 🔗 Inputs & Outputs

Triggered by: CivicPress Core or modules  
Input: `eventName`, `payload`, `context`  
Output: Executes all matching workflows (if any)

---

## 📂 File/Folder Location

```
core/hooks.ts
core/workflow-engine.ts
.civic/workflows/
```

---

## 🧠 Hook Configuration Examples

### 📄 Example Hook Configuration (`.civic/hooks.yml`)

```yaml
# Global hook configuration
hooks:
  # Core civic events
  onRecordPublish:
    enabled: true
    workflows:
      - 'notify-council'
      - 'update-index'
    audit: true

  onFeedbackSubmit:
    enabled: true
    workflows:
      - 'triage-feedback'
    audit: true

  onBylawApproved:
    enabled: true
    workflows:
      - 'notify-public'
      - 'update-legal-register'
    audit: true

  # Module-specific events
  onSessionScheduled:
    enabled: true
    workflows:
      - 'notify-attendees'
    audit: false

  onBudgetSubmitted:
    enabled: true
    workflows:
      - 'notify-finance-committee'
      - 'schedule-review'
    audit: true

# Hook execution settings
settings:
  maxConcurrent: 5
  timeout: 30000 # 30 seconds
  retryAttempts: 3
  defaultMode: 'async' # sync, async, or dry-run
```

### 📄 Example Hook Context Payload

```yaml
# Example payload for onRecordPublish hook
event: 'onRecordPublish'
timestamp: '2025-07-03T14:30:00Z'
user: 'clerk-richmond'
record:
  path: 'records/bylaws/section-02/bylaw-noise-restrictions.md'
  title: 'Noise Restrictions'
  status: 'published'
  module: 'legal-register'
  authors:
    - 'Ada Lovelace'
  approved_by:
    - 'Marie Curie'
    - 'Luc Lapointe'
context:
  town: 'richmond-qc'
  environment: 'production'
  git_commit: 'abc123def456'
  git_branch: 'main'
```

### 📄 Example Workflow Hook Registration

```yaml
# .civic/workflows/notify-council.js
module.exports = {
  name: "notify-council",
  description: "Notify council members of new published records",
  hooks: ["onRecordPublish"],
  async execute({ record, context }) {
    // Implementation here
  }
};
```

---

## 🔐 Security & Trust Considerations

- Only allowed events can be triggered
- Workflows triggered are signed, sandboxed, and defined in `.civic/workflows/`
- Hook executions are audit-logged

---

## 🧪 Testing & Validation

- Emit known hooks and assert expected workflows fire
- Log output can be validated
- Sandbox prevents dangerous calls

---

## 🛠️ Future Enhancements

- Wildcard or namespaced hook support (e.g. `onRecord:*`)
- Hook replay or re-run mechanism
- Declarative hook config in module manifests
- Allow hooks to chain or trigger async cascades
- Add support for namespacing and priority
- Allow dry-run/test mode

---

## 📅 History

- Drafted: 2025-07-02
- Last updated: 2025-07-02
