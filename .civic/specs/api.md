# 🌐 CivicPress Spec: `api.md`

## 📛 Name

`api` — CivicPress Backend API Service

## 🎯 Purpose

Provide a standalone, framework-agnostic API layer for reading, writing, and
orchestrating civic records through clean, stateless, role-aware REST endpoints.

---

## 🧩 Scope & Responsibilities

✅ Responsibilities:

- Expose civic records, indexes, and metadata via REST/JSON
- Accept actions from UI or CLI (e.g. submit feedback, propose edits)
- Trigger workflows via `hooks.md`
- Delegate to CLI (`civic`) where needed

❌ Not responsible for:

- UI rendering
- Storing data outside Git
- Replacing the CivicPress CLI

---

## 🏗️ Architecture

CivicPress API is a **separate stateless REST API** that:

- Reads records from local Git repo (`records/`)
- Reads config from `.civic/` folder
- Invokes `civic` CLI for write actions
- May serve `.md` and `.yml` files as JSON

📡 **Stateless Design**:

- No session storage
- Every request includes full context (auth, payload, intent)
- Ideal for Git-based workflows and CDN caching

🧱 **Backend stack (TypeScript/JavaScript only)**:

- **Express** or **Fastify** — battle-tested, modular Node.js servers
- **Hono** — ultra-light, edge-compatible TS framework
- **Bun** (optional) — fast runtime for local APIs or workers
- **Node.js CLI adapters** — shell out to `civic` or call internal modules

---

## 📂 Suggested Structure

```
api/
├── server.ts            # API entrypoint
├── routes/
│   ├── index.ts
│   ├── feedback.ts
│   ├── bylaws.ts
│   └── auth.ts
├── lib/
│   └── civic-cli.ts     # Wraps CLI commands
└── .env                 # Optional auth config
```

---

## 📡 Example Endpoints

| Method | Endpoint           | Description                |
| ------ | ------------------ | -------------------------- |
| GET    | `/index`           | Returns parsed `index.yml` |
| GET    | `/bylaws/:slug`    | Returns bylaw as JSON      |
| POST   | `/feedback`        | Submits new comment        |
| POST   | `/approve/:slug`   | Approves a civic record    |
| GET    | `/search?q=permit` | Searches titles/tags       |
| POST   | `/hook/:name`      | Triggers workflow hook     |

---

## 🔐 Permissions & Auth

- Role checked against `.civic/roles.yml`
- Supported auth:
  - GitHub bearer token (MVP)
  - Civic ID JWT (future)
  - Signed request URL (`/approve?sig=xyz`)

---

## 🛠️ CLI Integration

Write actions call CivicPress CLI:

```ts
execSync(`civic approve records/bylaws/curfew.md`);
```

Later: wrap core logic as JS/TS functions or modules.

---

## 🧠 Modular Placement

- May live in `core/api` workspace
- Not a civic module like `legal-register` or `public-sessions`
- This is core platform infrastructure

---

## 🧪 Testing & Validation

- Test API endpoints with valid and invalid requests
- Verify role-based access controls
- Test CLI integration for write operations
- Ensure proper error handling and status codes
- Validate JSON response formats

---

## 🛠️ Future Enhancements

- Optional GraphQL endpoint (no commitment)
- Signed Git commits via API
- Audit logging endpoint
- `/towns/:id/index` for federated data

---

## 📅 History

- Drafted: 2025-07-03
- Updated: 2025-07-03
