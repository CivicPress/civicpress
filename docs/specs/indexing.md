# 🔍 CivicPress Spec: `indexing.md`

---

version: 1.0.0 status: stable created: '2025-07-03' updated: '2025-07-15'
deprecated: false sunset_date: null additions:

- comprehensive indexing documentation
- search optimization
- security considerations compatibility: min_civicpress: 1.0.0 max_civicpress:
  'null' dependencies:
  - 'public-data-structure.md: >=1.0.0' authors:
- Sophie Germain <sophie@civic-press.org> reviewers:
- Ada Lovelace
- Irène Joliot-Curie

---

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

## 🔗 Inputs & Outputs

| Input                 | Description                              |
| --------------------- | ---------------------------------------- |
| Civic records         | Markdown files from `records/` directory |
| Frontmatter metadata  | YAML metadata from civic record headers  |
| File system structure | Directory organization and file paths    |
| Index configuration   | Index generation rules and schemas       |
| Search queries        | User search requests and filters         |

| Output         | Description                           |
| -------------- | ------------------------------------- |
| Index files    | YAML index files for record discovery |
| Search results | Filtered and sorted record listings   |
| Module indexes | Module-specific index files           |
| Index metadata | Index generation timestamps and stats |
| Cache files    | Pre-computed search indexes           |

---

## 📂 File/Folder Location

```
core/
├── indexing.ts            # Main indexing logic
├── index-generator.ts     # Index file generation
├── index-validator.ts     # Index validation utilities
└── index-cache.ts         # Index caching system

modules/
├── indexing/
│   ├── components/
│   │   ├── IndexViewer.tsx # Index display component
│   │   └── IndexBuilder.tsx # Index generation UI
│   ├── hooks/
│   │   └── useIndex.ts     # Index data hook
│   └── utils/
│       ├── index-parser.ts # Index file parsing
│       └── index-schema.ts # Index schema validation
└── search/
    └── components/
        └── SearchProvider.tsx # Search context provider

records/
├── index.yml              # Global civic record index
├── bylaws/
│   └── index.yml          # Bylaws-specific index
├── feedback/
│   └── index.yml          # Feedback-specific index
└── timeline/
    └── 2025-07-03/
        └── index.yml      # Daily timeline index

.civic/
├── indexing.yml           # Index configuration
└── index-schemas/
    ├── global.yml         # Global index schema
    ├── bylaws.yml         # Bylaws index schema
    └── feedback.yml       # Feedback index schema

tests/
├── indexing/
│   ├── index-generation.test.ts
│   ├── index-validation.test.ts
│   └── index-caching.test.ts
└── integration/
    └── indexing-integration.test.ts
```

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
