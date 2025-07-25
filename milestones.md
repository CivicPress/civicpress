# ✅ CivicPress MVP Milestone Checklist

Trackable implementation plan for MVP.

## 🏗️ Phase 1: Foundation

- [x] **M1. Repo Bootstrapping**
  - Setup `/core`, `/modules`, `/cli`, `.civic`
  - Configure `pnpm-workspace.yaml`, Prettier, TSConfig

- [x] **M2. Git Layer Integration**
  - Implement Git wrapper in `core/git/`
  - Support: init, commit, history, diff

- [x] **M3. Markdown Civic Schema**
  - YAML+Markdown schema via `gray-matter`
  - Add schema validation and serialization

## 🌐 Phase 2: API & CLI

- [x] **M4. API Server**
  - Create REST or GraphQL API in `core/api/`
  - Endpoints: GET/POST/PUT docs, version history

- [x] **M5. CLI Commands**
  - CLI commands: init, create, commit, history
  - Located in `/cli`

## 🔐 Phase 3: Workflows & Modules

- [x] **M6. Civic Lifecycle & Permissions**
  - Draft → Published → Archived flow
  - Role-based permissions enforcement

- [x] **M7. Minimal Civic Module**
  - Example: `legal-register` with doc type & flow
  - Demonstrates full-stack behavior

## 🤖 Phase 4: Developer Experience

- [x] **M8. AI Developer Memory**
  - Link specs & decisions into AI memory
  - Support for Cursor, Copilot, etc.

- [x] **M9. End-to-End MVP Test**
  - Create civic doc via CLI
  - Sign, version, and publish through Git-backed API
