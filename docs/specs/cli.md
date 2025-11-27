# CivicPress Spec: `cli.md`

---

version: 1.0.0 status: stable created: '2025-07-03' updated: '2025-07-15'
deprecated: false sunset_date: null breaking_changes: [] additions:

- comprehensive CLI documentation
- security considerations
- testing patterns fixes: [] migration_guide: null compatibility:
 min_civicpress: 1.0.0 max_civicpress: 'null' dependencies:
 - 'auth.md: >=1.0.0'
 - 'permissions.md: >=1.0.0' authors:
- Sophie Germain <sophie@civicpress.io> reviewers:
- Ada Lovelace
- Irène Joliot-Curie

---

## Name

`cli` — CivicPress Command Line Interface (`civic`)

## Purpose

Define the command-line interface used to manage civic records, workflows, and
platform tasks — providing a fast, local-first tool for developers, clerks, and
contributors.

---

## Scope & Responsibilities

Responsibilities:

- Scaffold new civic instances (`init`)
- Validate civic records (`lint`)
- Manage Git interactions (propose, approve, publish)
- Sync content or trigger workflows
- Interact with `.civic/`, `records/`, and modules

Out of scope:

- Hosting, deployment, or auth providers
- Real-time editor interface (covered by frontend)

---

## Internal Usage (Dogfooding the CLI)

CivicPress is designed to use its own CLI internally — just like a headless CMS
or GitHub using `git`. This ensures:

- **Consistency** — UI and automation follow the same rules
- **Auditability** — Every change is traceable, role-aware, and Git-committed
- ️ **Composability** — CI, scripts, and modules can call the CLI directly
- **Reusability** — The CLI becomes the internal "API surface" of CivicPress

### Examples

| Use Case | Internal CLI Command |
| -------------------------------------- | ----------------------------- |
| Editor saves a bylaw draft | `civic propose` |
| GitHub Action publishes after approval | `civic publish` |
| Feedback hook triggers trace | `civic trace feedback-001.md` |
| New town setup | `civic init --town Richmond` |

This model ensures CivicPress is **transparent by design**, not by exception.

---

## Inputs & Outputs

| Input | Description |
| ------------------- | ---------------------------------------- |
| Civic records | Markdown files in `records/` directory |
| Git repository | CivicPress Git repository with history |
| Configuration files | `.civic/` folder with policies and roles |
| User authentication | Git commit author and role permissions |
| Command arguments | CLI flags, file paths, and options |

| Output | Description |
| ------------------ | -------------------------------------- |
| Git commits | Immutable record changes with metadata |
| Validation reports | Linting results and error messages |
| Workflow triggers | Automated processes and notifications |
| Updated metadata | Frontmatter and status changes |
| Audit logs | CLI operation history and traces |

---

## File/Folder Location

```
core/
├── cli/
│ ├── civic.ts
│ ├── commands/
│ │ ├── init.ts
│ │ ├── lint.ts
│ │ └── propose.ts
```

---

## Core Commands

| Command | Purpose |
| ---------------------- | ---------------------------------------------- |
| `civic init` | Scaffold new CivicPress instance |
| `civic lint` | Validate folder structure and frontmatter |
| `civic propose <file>` | Move draft to `review/` with commit + metadata |
| `civic approve <file>` | Add approval metadata and push |
| `civic publish <file>` | Merge to `main` after quorum |
| `civic index` | Rebuild public index (future) |
| `civic trace <file>` | Show full commit history + status |

---

## Integrations

- Git (via `simple-git` or raw shell)
- `.civic/roles.yml`, `git-policy.yml`
- Frontmatter parsing (`gray-matter`)
- Local file system (`fs`, `glob`)
- Hooks + workflows (`hooks/`, `workflows/`)

---

## Testing & Validation

- Run `civic init` → creates valid structure
- Modify a file → `civic lint` catches bad frontmatter
- Propose → new branch is created with PR-ready commit
- Approve → `approved_by` list is updated
- Publish → triggers workflow + merges cleanly to `main`

---

## Security & Trust Considerations

- Only run CLI in Git-tracked CivicPress repo
- Validate all writes against policies in `.civic/`
- All actions logged via Git commits

---

## ️ Future Enhancements

- `civic serve` → start local civic dashboard
- `civic build` → compile static civic site
- `civic login` → for auth-bound modules
- Role-aware interactive prompts
- Plugin architecture for custom towns

---

## History

- Drafted: 2025-07-03
- Last updated: 2025-07-03
