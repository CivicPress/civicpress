# 🔧 CivicPress Spec: `maintenance.md`

---
version: 1.0.0
status: stable
created: '2025-07-03'
updated: '2025-07-15'
deprecated: false
sunset_date: null
additions:

- comprehensive maintenance documentation
- operational patterns
- security considerations
compatibility:
  min_civicpress: 1.0.0
  max_civicpress: 'null'
  dependencies:
  - 'deployment.md: >=1.0.0'
authors:
- Sophie Germain <sophie@civic-press.org>
reviewers:
- Ada Lovelace
- Irène Joliot-Curie

---

## 📛 Name

Maintenance & Downtime Handling

## 🎯 Purpose

Define how CivicPress handles planned maintenance, scheduled downtime, or
degraded service modes — with clear communication and graceful fallback for
users.

---

## 🧩 Scope & Responsibilities

✅ Responsibilities:

- Allow toggling of maintenance mode via CLI or config
- Display maintenance banner or message in UI
- Serve fallback or static content when API is offline
- Schedule upcoming maintenance windows
- Log maintenance start/stop in audit trail

❌ Out of Scope:

- Full observability or uptime monitoring (see `observability.md`)
- Disaster scenarios (see `disaster-recovery.md`)

---

## 🔗 Inputs & Outputs

| Trigger                     | Result                                   |
| --------------------------- | ---------------------------------------- |
| CLI: `civic maintenance on` | Sets platform into maintenance mode      |
| `.civic/maintenance.yml`    | Message, window, expected duration       |
| API detects downtime        | Returns HTTP 503 with Retry-After header |
| UI detects mode             | Shows banner and disables civic actions  |

---

## 📂 File/Folder Location

```
.civic/maintenance.yml
public/maintenance.html (optional fallback)
core/maintenance.ts
```

---

## 📄 Example `maintenance.yml`

```yaml
enabled: true
message: 'Scheduled maintenance from 3–4 PM. Some features may be unavailable.'
start: '2025-07-05T15:00:00Z'
end: '2025-07-05T16:00:00Z'
contact: 'admin@richmond.qc'
```

---

## 🔐 Security & Trust Considerations

- Only authorized users should toggle mode
- Maintenance message must not leak sensitive info
- Ensure graceful reactivation (no cached state)

---

## 🧪 Testing & Validation

- Trigger manually via CLI or file
- Validate UI messaging and disabled actions
- Confirm 503 API response + retry header
- Test auto-deactivation at scheduled end

---

## 🛠️ Future Enhancements

- Auto-notify users via email or dashboard
- Show previous downtime history
- Maintenance webhook for monitoring systems
- Soft mode: disable specific modules only

---

## 📅 History

- Drafted: 2025-07-04
