# 🛡️ CivicPress Spec: `data-integrity.md`

---
version: 1.0.0
status: stable
created: '2025-07-03'
updated: '2025-07-15'
deprecated: false
sunset_date: null
additions:

- comprehensive data integrity documentation
- validation patterns
- security considerations
compatibility:
  min_civicpress: 1.0.0
  max_civicpress: 'null'
  dependencies:
  - 'public-data-structure.md: >=1.0.0'
  - 'records-validation.md: >=1.0.0'
authors:
- Sophie Germain <sophie@civic-press.org>
reviewers:
- Ada Lovelace
- Irène Joliot-Curie

---

## 📛 Name

Data Integrity & Record Validation

## 🎯 Purpose

Ensure that civic records and metadata remain **untampered**, **authentic**, and
**verifiable** — especially in long-term archival and public trust scenarios.

This spec defines mechanisms for hashing, fingerprinting, and confirming data
consistency.

---

## 🧩 Scope & Responsibilities

✅ Responsibilities:

- Generate and store record-level cryptographic hashes
- Enable CLI or API integrity verification
- Detect tampering or corruption in civic records
- Track expected file size, format, and schema
- Log validation results in audit trail

❌ Out of Scope:

- Full blockchain or decentralized storage (future)
- Cryptographic signatures (see `signatures.md`)

---

## 🔗 Inputs & Outputs

| Action                             | Output                            |
| ---------------------------------- | --------------------------------- |
| `civic hash records/bylaw.md`      | SHA-256 hash written to log       |
| `civic verify`                     | Lists modified or missing records |
| API endpoint: `/integrity/:record` | Returns fingerprint & status      |

---

## 📂 File/Folder Location

```
.civic/integrity.json
.civic/integrity.log.jsonl
core/integrity.ts
```

---

## 📝 Example Fingerprint

```json
{
  "path": "records/bylaws/curfew.md",
  "sha256": "c4ab7f3d99f1e83a8d9f84e2f7bb9...",
  "size": 4121,
  "format": "markdown",
  "verified_at": "2025-07-04T14:21:00Z"
}
```

---

## 🔐 Security & Trust Considerations

- Any file change must update or invalidate its hash
- Git commit logs can be cross-validated with hashes
- Integrity checks should run regularly or on publish

---

## 🧪 Testing & Validation

- Test verification after file edits
- Simulate tampered or corrupted records
- Check CLI, API, and audit outputs
- Ensure hashing respects canonical form (e.g., line endings)

---

## 🛠️ Future Enhancements

- Signed Merkle trees for entire civic folder
- Time-stamped notarization (e.g. OpenTimestamps)
- Blockchain anchoring plugin (opt-in)
- Immutable file snapshots for historic records

## 🔗 Related Specs

- [`backup.md`](./backup.md) — Backup integrity verification
- [`signatures.md`](./signatures.md) — Cryptographic signature validation
- [`git-policy.md`](./git-policy.md) — Git-based integrity tracking
- [`archive-policy.md`](./archive-policy.md) — Long-term record preservation

---

## 📅 History

- Drafted: 2025-07-04
