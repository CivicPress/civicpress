# ️ CivicPress Spec: `votes.md`

---

version: 1.0.0 status: stable created: '2025-07-03' updated: '2025-07-15'
deprecated: false sunset_date: null additions:

- comprehensive voting documentation
- vote integrity
- security considerations compatibility: min_civicpress: 1.0.0 max_civicpress:
 'null' dependencies:
 - 'auth.md: >=1.2.0'
 - 'permissions.md: >=1.1.0' authors:
- Sophie Germain <sophie@civicpress.io> reviewers:
- Ada Lovelace
- Irène Joliot-Curie

---

## Name

Civic Record Voting System

## Purpose

Allow councils, boards, and authorized users to **vote on civic records** such
as bylaws, proposals, or appointments — capturing democratic decision-making in
a structured, auditable way.

Votes may determine the status of a record (e.g. `proposed → adopted`), or serve
as a historical record of deliberation.

---

## Scope & Responsibilities

Responsibilities:

- Enable structured voting on records
- Track individual votes with metadata (who, how, when)
- Determine outcomes based on defined vote rules
- Update record `status:` if vote passes
- Display vote results in UI and API

Out of Scope:

- Secret or anonymous voting
- Token-based or financial voting
- Complex vote weighting (initially)

---

## Inputs & Outputs

| Action | Result |
| ----------------------------- | -------------------------------- |
| `civic vote --yes bylaw.md` | Records user's vote as "yes" |
| GitHub PR comment: `vote: no` | Interpreted as structured vote |
| Vote log file update | Triggers possible status change |
| `civic tally` | Displays or updates vote outcome |

---

## Vote Log Format

Stored in: `.civic/votes/bylaw-2025-18.json`

```json
{
 "record": "records/bylaws/2025-18-fireworks-ban.md",
 "outcome": "adopted",
 "threshold": "majority",
 "votes": [
 { "name": "Ada Lovelace", "vote": "yes", "date": "2025-07-03" },
 { "name": "Irène Joliot-Curie", "vote": "yes" },
 { "name": "Alan Turing", "vote": "no" }
 ]
}
```

---

## File/Folder Location

```
.civic/votes/
records/bylaws/*.md
```

---

## Security & Trust Considerations

- Only authorized roles may cast votes
- Vote logs are immutable once finalized
- Status updates require full vote tally
- Must clearly separate deliberation from adoption

---

## Testing & Validation

- Simulate vote casting and outcome tally
- Check that invalid voters are rejected
- Ensure record status is not changed prematurely
- Display votes in UI with correct breakdown

---

## ️ Future Enhancements

- Abstain and conflict-of-interest options
- Custom vote thresholds (⅔, unanimous, quorum logic)
- Time-based voting windows
- Vote delegation and proxy features
- Verifiable civic vote receipts

## Related Specs

- [`signatures.md`](./signatures.md) — Vote authentication and digital
 signatures
- [`permissions.md`](./permissions.md) — Vote authorization and role
 requirements
- [`workflows.md`](./workflows.md) — Automated vote processing and status
 updates

---

## History

- Drafted: 2025-07-04
