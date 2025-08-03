# ✍️ CivicPress Spec: `signatures.md`

---

version: 1.0.0 status: stable created: '2025-07-03' updated: '2025-07-15'
deprecated: false sunset_date: null additions:

- comprehensive signature documentation
- digital signatures
- security considerations compatibility: min_civicpress: 1.0.0 max_civicpress:
  'null' dependencies:
  - 'auth.md: >=1.2.0'
  - 'permissions.md: >=1.1.0' authors:
- Sophie Germain <sophie@civic-press.org> reviewers:
- Ada Lovelace
- Irène Joliot-Curie

---

## 📛 Name

Civic Record Signatures

## 🎯 Purpose

Allow civic records — like bylaws, minutes, or decisions — to be **digitally
signed** by authorized individuals or systems.  
This ensures traceability, trust, and legal authenticity in both local and
remote governance.

---

## 🧩 Scope & Responsibilities

✅ Responsibilities:

- Allow signing of records via CLI or API
- Store signature metadata in frontmatter or alongside record
- Support GPG or signature hash systems (MVP = plaintext log)
- Verify signatures during audits or approvals
- Allow multiple signers (e.g. Mayor, Clerk)

❌ Out of Scope:

- Blockchain notarization (can be added later)
- Secure certificate authority integration (not MVP)

---

## 🔗 Inputs & Outputs

| Action                   | Result                               |
| ------------------------ | ------------------------------------ |
| `civic sign record.md`   | Adds/updates `signed_by:` field      |
| `civic verify record.md` | Confirms known signature or mismatch |
| API approval via webhook | May include digital token            |

---

## 📝 Example Frontmatter

```yaml
title: 'Bylaw 2025-14: Curfew'
status: adopted
signed_by:
  - name: 'Ada Lovelace'
    role: 'Mayor'
    date: '2025-07-03'
    key: 'GPG:4A3B...EEA1'
```

---

## 📂 File/Folder Location

```
records/bylaws/2025-14-curfew.md
.civic/signatures/     # Optional GPG storage or metadata
```

---

## 🔐 Security & Trust Considerations

- Signing actions must be auditable and role-restricted
- Signature hash or key ID must match signer identity
- `verify` CLI must warn on mismatch or altered content
- Signatures must apply to frozen/committed content only

---

## 🧪 Testing & Validation

- Sign valid and invalid records
- Verify correct parsing and signature metadata
- Attempt forgery or content tampering — ensure detection
- Validate signature chain for multi-signer approval

---

## 🛠️ Future Enhancements

- GPG or Minisign key management
- Signature trust chains or delegation
- Signature verification UI
- Optional blockchain anchoring
- QR code print exports for on-paper validation

## 🔗 Related Specs

- [`auth.md`](./auth.md) — User identity and authentication
- [`votes.md`](./votes.md) — Vote authentication and verification
- [`data-integrity.md`](./data-integrity.md) — Cryptographic integrity
  verification
- [`permissions.md`](./permissions.md) — Signature authorization and roles

---

## 📅 History

- Drafted: 2025-07-04
