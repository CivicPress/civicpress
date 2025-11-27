# CivicPress Spec: `versioning.md`

---

version: 1.0.0 status: stable created: '2025-07-03' updated: '2025-07-15'
deprecated: false sunset_date: null additions:

- comprehensive versioning documentation
- version management
- security considerations compatibility: min_civicpress: 1.0.0 max_civicpress:
 'null' dependencies:
 - 'git-policy.md: >=1.1.0' authors:
- Sophie Germain <sophie@civicpress.io> reviewers:
- Ada Lovelace
- Irène Joliot-Curie

---

## Name

Civic Record Versioning

## Purpose

Define how civic records in CivicPress are versioned over time using Git. 
Every edit, proposal, or adoption is traceable via commits, branches, and pull
requests — ensuring full public accountability and transparency.

---

## Scope & Responsibilities

Responsibilities:

- Track every change to civic records via Git
- Provide readable diffs and timeline views
- Represent lifecycle states (draft → proposed → adopted)
- Support rollback and recovery of past versions
- Encourage PR-based editing and review process

Out of Scope:

- API route versioning (handled in `api.md`)
- Real-time collaborative editing (handled in future spec)

---

## Inputs & Outputs

| Input | Description |
| ------------- | ------------------------------------ |
| Git commits | Every file change is a new version |
| Git branches | Used for proposals, drafts, patches |
| Pull requests | Used for civic discussion and review |

| Output | Description |
| ---------------- | --------------------------- |
| Git history view | Civic timeline for any file |
| Commit metadata | Author, timestamp, role |
| PR logs | Public discussion history |

---

## File/Folder Location

```
.git/
records/
.civic/git-policy.md
```

---

## Record Lifecycle Notes

CivicPress avoids hard-deletion of civic records.

End-of-life states are expressed as:

- `status: archived` — Still viewable, no longer in effect
- `status: superseded` — Replaced by a newer record
- `status: retracted` — Removed for legal or privacy reasons

Whenever possible, records should be retained and clearly linked to their
successors.

Archived or replaced records may be moved to a designated folder (e.g.,
`/records/archive/`) or tagged accordingly in frontmatter. Git history always
preserves full traceability.

---

## Security & Trust Considerations

- All commits must be signed or attributable
- History must not be force-pushed or rewritten without audit
- Changes must follow civic role approval policies
- Diff tooling should sanitize sensitive data when needed

---

## Testing & Validation

- Validate Git repo integrity regularly
- Ensure proper PR and branch naming conventions
- Confirm restore functionality via commit checkout
- Ensure all civic changes are accompanied by metadata

---

## ️ Future Enhancements

- Add `/history/` viewer per record in public UI
- Auto-tag major civic milestones (`v1-adopted`, `v2-amended`)
- File-specific retention policies and annotations
- Automatic diff summaries in UI or CLI

---

## History

- Drafted: 2025-07-04
