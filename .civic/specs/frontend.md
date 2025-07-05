# 🖥️ CivicPress Spec: `frontend.md`

---
version: 1.0.0
status: stable
created: '2025-07-03'
updated: '2025-07-15'
deprecated: false
sunset_date: null
additions:

- comprehensive frontend documentation
- UI patterns
- security considerations
compatibility:
  min_civicpress: 1.0.0
  max_civicpress: 'null'
  dependencies:
  - 'ui.md: >=1.0.0'
  - 'api.md: >=1.0.0'
authors:
- Sophie Germain <sophie@civic-press.org>
reviewers:
- Ada Lovelace
- Irène Joliot-Curie

---

## 📛 Name

`frontend` — CivicPress User Interface Layer

## 🎯 Purpose

Define the core user experience for navigating, viewing, and submitting civic
records through a modern, web-accessible interface.

---

## 🧩 Scope & Responsibilities

✅ Responsibilities:

- Serve Markdown records as readable civic documents
- Provide feedback submission interface
- Display civic modules, timelines, and indexes
- Surface role-based tools (e.g. propose, review, approve)
- Enable light editing for permitted users

❌ Out of scope:

- Real-time multi-user editing (see `collaborative-editing.md`)
- Full CMS backend (Tina/Decap = optional enhancements)

---

## 🖼️ Key Screens

| Page                | Purpose                           |
| ------------------- | --------------------------------- |
| `/`                 | Welcome + Town Dashboard          |
| `/bylaws/`          | List of bylaws by section/status  |
| `/feedback/`        | Recent feedback with filters      |
| `/timeline/`        | Chronological civic activity      |
| `/sessions/`        | Public meeting archives           |
| `/records/XYZ.md`   | Rendered Markdown civic record    |
| `/submit-feedback/` | Form to submit comment/suggestion |
| `/login` (future)   | GitHub or Civic ID auth           |

---

## 🔍 Features

- Responsive layout (mobile-friendly)
- Theme based on local identity (flag, colors)
- Auto-index from `index.yml`
- Read-only unless authenticated
- Markdown rendered with syntax highlighting + YAML badge

---

## ✍️ Editing Behavior

- Light inline editor for small edits (if authorized)
- "Propose edit" opens in new Git branch
- Optional integration with TinaCMS/Decap later
- Lockfile notice if record is in use

---

## 🔐 Permissions Enforcement

- UI respects `.civic/roles.yml` and `permissions.md`
- Non-editors can only view and submit feedback
- Drafts, archived, or rejected records only visible to clerks unless flagged
  `public: true`

---

## 💡 Powered By

- Framework: **Nuxt** (or Next) — supports SSR and static export
- Editor: Basic Markdown textarea (extendable)
- API: Reads from Git or filesystem (eventually via `serve.md`)
- CLI: `civic dev` spins up local instance

---

## 🧪 Testing & Validation

- Test responsive design across devices
- Verify role-based access controls
- Ensure Markdown rendering works correctly
- Test feedback submission flow
- Validate search and filtering functionality

---

## 🛠️ Future Enhancements

- Search by tag, date, role, or status
- Filterable dashboards for clerks and council
- Commenting thread per record (Git-based)
- Interactive timeline graph

---

## 📅 History

- Drafted: 2025-07-03
