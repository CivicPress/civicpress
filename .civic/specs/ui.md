# 🧑‍💻 CivicPress Spec: `ui.md`

## 📛 Name

`ui` — CivicPress User Interface Architecture

## 🎯 Purpose

Define the structure, responsibilities, and separation of concerns between
CivicPress's public-facing UI and admin/editor tools.

---

## 🧩 Layered UI Architecture

The CivicPress UI is divided into **two layers**:

| Layer     | Audience         | Description                                             |
| --------- | ---------------- | ------------------------------------------------------- |
| `public/` | Citizens, public | Public-facing civic portal to view and explore records  |
| `admin/`  | Clerks, council  | Authenticated tools to create, edit, and manage records |

---

## 🖼️ `public/` UI Responsibilities

| Feature               | Description                                       |
| --------------------- | ------------------------------------------------- |
| Town homepage         | `/` with logo, intro, last 3 bylaws, next session |
| Bylaw viewer          | `/bylaws/[slug]` or `/bylaws/[section]/[slug]`    |
| Timeline navigator    | `/timeline/`                                      |
| Feedback explorer     | `/feedback/`, `/feedback/2025-07-01.md`           |
| Public session viewer | `/sessions/`, linked videos + minutes             |
| Search + tag filters  | Optional in MVP                                   |

✅ Fully static-exportable (Nuxt `nuxi generate`)  
✅ No login required  
✅ 100% safe and public  
✅ Designed to be fast, legible, accessible

---

## 🔐 `admin/` UI Responsibilities

| Feature                | Description                              |
| ---------------------- | ---------------------------------------- |
| GitHub login (MVP)     | Read role from `.civic/roles.yml`        |
| Inline Markdown editor | Edit or propose edits to records         |
| Feedback inbox         | View/respond/approve comments            |
| Submission review      | Accept or reject proposed edits          |
| Index trigger          | Re-run civic index manually              |
| Role settings (future) | View civic permissions and workflow logs |
| Draft workspace        | Unpublished civic work area              |

⚠️ Protected by GitHub or Civic ID (later)  
⚠️ Respects roles defined in `permissions.md`  
⚠️ May run only in dev mode or gated route

---

## 🧱 Frameworks

- **Nuxt 3** (recommended): handles SSR, SSG, file-based routing
- **Tailwind CSS**: styling baseline
- **Headless UI (Vue)**: component logic (dialogs, tabs, etc.)
- Optional: TinaCMS or Decap for file-based visual editing
- Optional: Serve public UI from Netlify/Vercel, admin via `civic dev`

---

## 🔐 Auth Flow (MVP)

```yaml
- User visits /admin
- Prompted to login via GitHub
- GitHub user is matched to `.civic/roles.yml`
- If role is `clerk`, `reviewer`, or `editor`, access granted
```

Later, support for:

- Civic ID / OIDC
- Group-based permissions
- Branch-based access (via Git)

---

## 🛠️ CLI Support

```bash
civic dev        # Launches public + admin UI
civic serve      # Public-only viewer
```

---

## 🧪 Testing & Validation

- Test public UI renders without authentication
- Verify admin routes require proper role access
- Ensure static export works correctly
- Validate responsive design across devices
- Test role-based UI element visibility

---

## 🛠️ Future Enhancements

- `admin/analytics.vue`: civic activity graphs
- `admin/audit.vue`: view hooks + PR logs
- `admin/compare.vue`: show record diffs
- `public/search.vue`: fuzzy search on title + tags

---

## 📅 History

- Drafted: 2025-07-03
- Updated: Renamed `frontend/` → `public/`
