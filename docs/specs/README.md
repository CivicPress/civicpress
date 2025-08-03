# 🗂️ `.civic/` Directory

This folder contains all CivicPress internal configuration, specifications, and
governance scaffolding.  
It is **not part of the user-facing platform**, but rather the internal
**blueprint for maintainers and contributors**.

## 📁 Folder Structure

```
.civic/
├── specs/               # Formal specifications for each module and feature
├── specs-index.md       # Index of all spec documents (auto-generated)
├── workflow.policy.yml  # Defines rules for executing civic workflows
├── hooks.log.jsonl      # Audit trail of triggered civic events
├── README.md            # (This file)
```

## 📜 Purpose

- Provide a shared technical vision for the CivicPress platform
- Enable safe and transparent evolution of the project
- Act as onboarding documentation for contributors, collaborators, and future
  maintainers

## ✍️ How to Contribute Specs

1. Browse existing specs in `.civic/specs/`
2. Copy an existing spec or use the `spec-template.md`
3. Use clear titles, dates, and Markdown formatting
4. Submit a Pull Request or open a discussion issue

## ✅ Best Practices

- Keep spec documents readable by non-engineers
- Version specs using the YAML header at the top
- Use the full header template with history, scope, inputs/outputs, etc.
- When implemented, update the spec and add commit notes linking to it

## 🔒 Security & Trust

All customization logic (like workflows) must follow
`.civic/workflow.policy.yml`  
This ensures only trusted logic is executed and all events are auditable.

---

**This folder is the brain of the CivicPress platform.**  
It keeps the code honest, the team aligned, and the future flexible.
