# 🗺️ CivicPress Roadmap

> This roadmap outlines the development path for CivicPress, from MVP to
> long-term goals.  
> It is designed to prioritize transparency, resilience, and civic trust.

---

## 🧪 MVP — Local Demo with Shadow Town (Richmond)

🎯 Goal: Simulate a working civic platform using real town data in Markdown and
Git.

### Modules & Features

- [x] ✅ `legal-register` — Bylaws + civic records
- [x] ✅ `public-sessions` — Minutes, livestream index, archives
- [x] ✅ `feedback` — Comments from residents
- [x] ✅ `hooks` + `workflows` — Custom local civic logic
- [x] ✅ `editor-layer` — Markdown editing via UI
- [x] ✅ `api` — REST interface for UI/app
- [x] ✅ `frontend` — Public-facing read-only civic portal
- [x] ✅ `permissions` — Role-based restrictions (manual for now)
- [x] ✅ `auth` — GitHub OAuth + simulated accounts
- [x] ✅ `indexing` — Parse `index.yml`, structure civic data
- [ ] 🔲 `serve` — Minimal PWA to browse civic records

🎉 Target: **Working Shadow Mode for Richmond**  
📆 Estimated: **4–6 weeks part-time**, depending on data conversion pace

---

## 🚀 Phase 2 — Alpha Launch

🎯 Goal: Let a small real town (or simulated) use the system for decision
tracking

### Planned

- [ ] `votes` module for formal decisions
- [ ] `review-policy` to define who approves what
- [ ] `lifecycle` + `status-tags`
- [ ] `notifications` (email or UI)
- [ ] `scheduler` for future-dated triggers
- [ ] Real-time feedback → approvals flow

---

## 🌐 Phase 3 — Federation & Scale

🎯 Goal: Run CivicPress for multiple towns, contributors, and more data

### Planned

- [ ] Full multi-user auth + user DB
- [ ] Git federation or hosted version
- [ ] `metrics` module
- [ ] `themes` + `branding`
- [ ] Advanced search + indexing
- [ ] Multi-language support

---

## 🔮 Stretch & Long-Term

- Voting module with signatures
- Inter-town workflows (e.g., MRC approval flows)
- PDF & print generation
- Smart visualizations
- Public API key registry
- AI assistant with audit log integration

---

**This roadmap is a living document.**  
Contribute ideas via issues or submit a spec in `.civic/specs/`.
