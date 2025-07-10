# 👁️ CivicPress Spec: `review-policy.md`

---
version: 1.0.0
status: stable
created: '2025-07-03'
updated: '2025-07-15'
deprecated: false
sunset_date: null
additions:

- comprehensive review policy documentation
- review workflows
- security considerations
compatibility:
  min_civicpress: 1.0.0
  max_civicpress: 'null'
  dependencies:
  - 'permissions.md: >=1.1.0'
  - 'workflows.md: >=1.3.0'
authors:
- Sophie Germain <sophie@civic-press.org>
reviewers:
- Ada Lovelace
- Irène Joliot-Curie

---

## 📛 Name

`review-policy` — Record Review & Approval Policy

## 🎯 Purpose

Define how civic records move through **review and approval workflows** before
being published, adopted, or archived.  
This includes contributor roles, PR-style approvals, and customizable review
gates for transparency and accountability.

---

## 🧩 Scope & Responsibilities

✅ Responsibilities:

- Specify how many approvals are required for record adoption
- Define who can approve records (roles, committees)
- Support PR-style workflows via Git or UI
- Allow review policies to vary by record type (e.g. bylaw vs. minutes)
- Track review status in metadata and audit logs

❌ Out of Scope:

- Voting results (covered by `votes.md`)
- Moderation or spam protection

---

## 🔗 Inputs & Outputs

| Action                             | Result                               |
| ---------------------------------- | ------------------------------------ |
| User proposes new record           | Status = `proposed`                  |
| Required approvals are met         | Status = `adopted`, `approved`, etc. |
| `review-policy.yml` says 2 signers | Blocks until 2 valid approvals given |
| Record history shows reviewers     | Audit and trust preserved            |

---

## 📂 File/Folder Location

```
.civic/review-policy.yml
records/**/*.md
```

---

## 📝 Example `review-policy.yml`

```yaml
defaults:
  required_approvals: 2
  eligible_roles: [clerk, mayor, councilor]

rules:
  bylaws/:
    required_approvals: 3
    eligible_roles: [clerk, councilor]

  minutes/:
    required_approvals: 1
    eligible_roles: [clerk]
```

---

## 🔐 Security & Trust Considerations

- Approvers must be authenticated and authorized
- Review actions must be auditable
- Avoid single-user sign-off where possible
- Consider quorum and conflict-of-interest flags in future

---

## 🧪 Testing & Validation

- Simulate approval flow for new record
- Attempt early merge without quorum — block it
- Ensure review logs are correctly formatted and traceable
- Confirm policy overrides work for specific folders

---

## 🛠️ Future Enhancements

- UI approval queue (inbox of pending items)
- Role-weighted or committee-based approvals
- Review expiry deadlines or reminders
- Delegation and proxy review

---

## 📅 History

- Drafted: 2025-07-04
