# ⚙️ CivicPress Workflows

## 📛 Name

Workflows Engine

## 🎯 Purpose

To allow towns to define local civic logic (notifications, tagging, approvals)
using event-based JavaScript files stored in `.civic/workflows/`.

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

## 🔗 Inputs & Outputs

Triggered by: Hook events from core or modules  
Input: Civic object payload and context  
Output: Actions taken, logs recorded

## 📂 File/Folder Location

```
.civic/workflows/
.civic/workflow.policy.yml
core/workflow-engine.ts
```

## 🔐 Security & Trust Considerations

- Files must be signed or approved based on `workflow.policy.yml`
- Must run in a sandbox (`vm2`) with controlled APIs
- Logs are kept in `.civic/hooks.log.jsonl`

## 🧪 Testing & Validation

- Add dry-run mode
- Use test hook events with known workflows
- Confirm restricted permissions in sandbox

## 🛠️ Future Enhancements

- Workflow editor UI
- Schedule-based triggers
- Cross-module reactivity

## 📅 History

- Drafted: 2025-07-02
- Last updated: 2025-07-02
