# 📄 CivicPress Spec: `static-export.md`

---

version: 1.0.0 status: stable created: '2025-07-03' updated: '2025-07-15'
deprecated: false sunset_date: null additions:

- comprehensive static export documentation
- asset validation
- security considerations compatibility: min_civicpress: 1.0.0 max_civicpress:
  'null' dependencies:
  - 'ui.md: >=1.0.0'
  - 'public-data-structure.md: >=1.0.0' authors:
- Sophie Germain <sophie@civicpress.io> reviewers:
- Ada Lovelace
- Irène Joliot-Curie

---

## 📛 Name

Static Export & Offline Access

## 🎯 Purpose

Allow towns to export their entire CivicPress deployment as **static HTML +
assets**, for offline browsing, archival, and ultra-low-cost hosting.  
Ideal for disconnected communities, government USB archives, or GitHub Pages.

---

## 🧩 Scope & Responsibilities

✅ Responsibilities:

- Pre-render all civic records and modules as HTML
- Export theme, branding, search index, assets
- Package as a ZIP or folder
- Support full offline browsing (no API calls)
- Provide download CLI/API command

❌ Out of Scope:

- Live editing or feedback submission
- Dynamic workflows or CLI integrations

---

## 🔗 Inputs & Outputs

| Action                | Result                                 |
| --------------------- | -------------------------------------- |
| `civic export static` | Generates `/dist/static-export` folder |
| `GET /export.zip`     | Offers prebuilt static export download |
| GitHub Pages          | Can serve `/static-export` folder      |

---

## 📂 File/Folder Location

```
dist/static-export/
  ├── index.html
  ├── records/bylaws/...
  ├── assets/css/
  ├── assets/js/
  ├── civic-index.json
  └── civic-manifest.json
```

---

## 💡 Export Features

- Markdown fully rendered
- Civic index + metadata embedded
- Static search via JSON + Lunr or FlexSearch
- Printable formats respected
- No external scripts or fonts

---

## 🔐 Security & Trust Considerations

- Exported data must not leak drafts or unpublished items
- All links must resolve offline
- Optional filename hashing to detect corruption

---

## 🧪 Testing & Validation

- Open index.html locally in browser
- Browse records, test search, print, theme
- Confirm full ZIP integrity
- Simulate low-memory or offline usage

---

## 🛠️ Future Enhancements

- USB export mode (`--usb`) with README + launcher
- Weekly auto-exports (see `scheduler.md`)
- Signed digest of export contents
- Multi-language toggle built in

---

## 📅 History

- Drafted: 2025-07-04
