# 🔗 CivicPress Hooks System

## 📛 Name

Hook System

## 🎯 Purpose

To allow CivicPress Core and modules to emit named events ("hooks") that trigger
user-defined workflows or internal actions.

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

## 🔗 Inputs & Outputs

Triggered by: CivicPress Core or modules  
Input: `eventName`, `payload`, `context`  
Output: Executes all matching workflows (if any)

## 📂 File/Folder Location

```
core/hooks.ts
.civic/workflows/
```

## 🔐 Security & Trust Considerations

- Only allowed events can be triggered
- Workflows triggered are signed, sandboxed, and defined in `.civic/workflows/`
- Hook executions are audit-logged

## 🧪 Testing & Validation

- Emit known hooks and assert expected workflows fire
- Log output can be validated
- Sandbox prevents dangerous calls

## 🛠️ Future Enhancements

- Allow hooks to chain or trigger async cascades
- Add support for namespacing and priority
- Allow dry-run/test mode

## 📅 History

- Drafted: 2025-07-02
- Last updated: 2025-07-02
