# 🧭 CivicPress Spec: `indexing.md`

## 📛 Name

`indexing` — CivicPress Indexing Layer & Index File Convention

## 🎯 Purpose

Define how CivicPress builds and uses index files (e.g. `index.yml`) to support
record discovery, search, filtering, and modular data access without requiring a
full database.

---

## 🧩 Scope & Responsibilities

✅ Responsibilities:

- Generate and update index files (global or scoped)
- Enable modules and UIs to quickly load civic summaries
- Allow basic filtering without scanning all files
- Serve as bridge to eventual structured DB layers

❌ Out of scope:

- Full-text search (requires dedicated search service)
- DB schema definition or joins (future data layer)

---

## 🗃️ Index File Examples

### 🌍 Global Civic Record Index

`records/index.yml`

```yaml
- file: 'timeline/2025-07-03/bylaw-curfew.md'
  title: 'Bylaw on Curfew'
  type: bylaw
  status: adopted
  created: '2025-07-03'
  module: 'legal-register'
  tags: ['safety']
```

### 🏛️ Module-Specific Index

`records/bylaws/index.yml`

```yaml
- file: 'section-01/bylaw-curfew.md'
  status: adopted
  source: 'timeline/2025-07-03/bylaw-curfew.md'
```

### 📅 Daily Timeline Index

`records/timeline/2025-07-03/index.yml`

```yaml
- bylaw-curfew.md
- motion-budget.md
```

---

## ⚙️ Generation Strategy

- `civic index` command rebuilds all or partial indexes
- Automatically updates on commit (via hook or CI)
- Modules may generate their own scoped indexes
- Indexes must be committed to Git (to support offline use)

---

## 📦 Format & Schema

Each entry in an index must include at minimum:

```yaml
- file: 'relative/path.md'
  title: 'Readable Title'
  type: 'bylaw' # e.g., bylaw, motion, permit
  status: 'draft' # e.g., draft, adopted
  module: 'legal-register'
```

Other optional fields:

- `tags`, `authors`, `created`, `updated`, `source`, `slug`

---

## 🔎 Use Cases

- Display list of records in civic dashboard
- Module loads index instead of scanning files
- Enable filters like "show all draft bylaws"
- Feed search results or civic feeds

---

## 🧪 Testing & Validation

- Ensure all indexed files exist
- Parse frontmatter to extract required fields
- Detect orphaned files or empty folders
- Run via `civic lint:index`
- Test index regeneration after file changes
- Verify filtering and sorting work correctly

---

## 🔐 Security & Trust Considerations

- Index must be rebuilt when records are edited
- Git commit ensures integrity
- Do not expose unpublished drafts in public indexes unless role allows

---

## 🛠️ Future Enhancements

- Auto-regenerate on commit hook
- Smart diff-based incremental reindex
- Module-defined index schemas
- JSON and SQLite mirror outputs
- Search-ready pre-built filters

---

## 📅 History

- Drafted: 2025-07-03
- Last updated: 2025-07-03
