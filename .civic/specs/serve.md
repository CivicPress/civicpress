# 🌐 CivicPress Spec: `serve.md`

---
version: 1.0.0
status: stable
created: '2025-07-03'
updated: '2025-07-15'
deprecated: false
sunset_date: null
additions:

- comprehensive serve documentation
- hosting patterns
- security considerations
compatibility:
  min_civicpress: 1.0.0
  max_civicpress: 'null'
  dependencies:
  - 'deployment.md: >=1.0.0'
  - 'static-export.md: >=1.0.0'
authors:
- Sophie Germain <sophie@civic-press.org>
reviewers:
- Ada Lovelace
- Irène Joliot-Curie

---

## 📛 Name

`serve` — CivicPress Static & Live Preview Server

## 🎯 Purpose

Enable towns, clerks, and citizens to preview civic records locally or on hosted
platforms without requiring a full frontend app.

`civic serve` provides a universal, portable viewer for CivicPress records —
using static HTML or local Nuxt rendering.

---

## 🧩 Scope & Responsibilities

✅ Responsibilities:

- Render Markdown records as HTML
- Read from local Git repo (`records/`)
- Support Git history view, change tracking
- Allow filtered browsing (`/bylaws`, `/timeline`, etc.)
- Serve `.civic/index.yml` for navigation

❌ Not responsible for:

- Admin UI
- Approvals, publishing, or writing actions

---

## 🏗️ Architecture

- Lightweight Express or Hono server
- Uses `markdown-it`, `highlight.js`, `gray-matter`, and civic theming
- Local `.env` config for port, root path, theme
- Compatible with `public/` folder (Nuxt optional)

---

## 📂 Folder Example

```
serve/
├── server.ts         # Entry file
├── routes/
│   └── *.ts          # Markdown and asset routes
├── lib/
│   └── render.ts     # Markdown to HTML
├── views/
│   └── layout.html   # Templated renderer
└── themes/
    └── default.css
```

---

## 🚦 Preview Modes

| Mode    | Description                                |
| ------- | ------------------------------------------ |
| Static  | Previews Markdown only, fast load          |
| Dynamic | Enables search, tags, Git log view         |
| API     | Acts as API fallback if `api/` not running |

---

## 🛠️ Usage

```bash
civic serve
```

Options:

- `--port 4000`
- `--theme ./themes/classic.css`
- `--records ./records/`
- `--index .civic/index.yml`

---

## 🔐 Permissions & Security

- Read-only mode
- Optional `.htpasswd` or GitHub auth
- Log IP, requests, and headers for audit

---

## 🧪 Testing & Validation

- Test Markdown rendering with various content types
- Verify theme switching works correctly
- Test different preview modes (static, dynamic, API)
- Ensure proper error handling for missing files
- Validate security restrictions in read-only mode

---

## 🛠️ Future Enhancements

- Export static build (`civic export`)
- Mobile-friendly theme
- Timeline visualization (e.g. `/timeline`)
- QR code civic document preview

---

## 📅 History

- Drafted: 2025-07-03
