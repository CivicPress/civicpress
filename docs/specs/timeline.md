# 📅 CivicPress Spec: `timeline.md`

---

version: 1.0.0 status: stable created: '2025-07-03' updated: '2025-07-15'
deprecated: false sunset_date: null additions:

- comprehensive timeline documentation
- chronological tracking
- security considerations compatibility: min_civicpress: 1.0.0 max_civicpress:
  'null' dependencies:
  - 'public-data-structure.md: >=1.0.0'
  - 'workflows.md: >=1.3.0' authors:
- Sophie Germain <sophie@civic-press.org> reviewers:
- Ada Lovelace
- Irène Joliot-Curie

---

## 📛 Name

Civic Activity Timeline

## 🎯 Purpose

Provide a chronological view of civic events, decisions, feedback, and changes —
to give users and contributors a clear picture of how governance unfolds over
time.

The timeline is both a **journal of civic activity** and a **development
sandbox** for drafts and proposals before they are moved into structured
modules.

---

## 🧩 Scope & Responsibilities

✅ Responsibilities:

- Store daily entries of civic activity
- Accept any record type: proposals, drafts, discussions, etc.
- Enable visualization of activity by date
- Offer hooks for UI (calendar view, list, heatmap)
- Allow modules to reference timeline entries

❌ Out of Scope:

- Serving as final record of law (those move to `bylaws/`, etc.)
- Full text search (handled by index)

---

## 🔗 Inputs & Outputs

| Input                        | Result                             |
| ---------------------------- | ---------------------------------- |
| `timeline/2025-07-04/foo.md` | Appears in timeline view           |
| Record with `date:` tag      | Sorted and grouped chronologically |
| Hooked module entry          | Displays link in timeline format   |

---

## 📂 File/Folder Location

```
records/timeline/
  └── 2025-07-04/
        └── curfew-debate.md
        └── notes-ada.md
```

---

## 📝 Example Frontmatter

```yaml
title: 'Curfew Debate Summary'
authors:
  - name: 'Ada Lovelace'
    role: 'Clerk'
tags: [bylaw, discussion]
date: 2025-07-04
status: draft
```

---

## 🔐 Security & Trust Considerations

- Timeline entries may include sensitive drafts
- Records must follow same permission rules as others
- Editing history should be tracked via Git or audit log

---

## 🧪 Testing & Validation

- Render timeline chronologically with frontmatter parsing
- Validate date formatting and directory sorting
- Test references from other modules into timeline
- Simulate activity and visualize range of events

---

## 🛠️ Future Enhancements

- UI calendar and list view modes
- Timeline filters by tag/author/module
- Record move suggestions (e.g. "This is a bylaw? Move to `/bylaws/`")
- CLI `civic timeline add` with prompts

---

## 📅 History

- Drafted: 2025-07-04
