# 🔎 CivicPress Spec: `search.md`

---

version: 1.0.0 status: stable created: '2025-07-03' updated: '2025-07-15'
deprecated: false sunset_date: null additions:

- comprehensive search documentation
- algorithms
- security considerations compatibility: min_civicpress: 1.0.0 max_civicpress:
  'null' dependencies:
  - 'indexing.md: >=1.0.0' authors:
- Sophie Germain <sophie@civic-press.org> reviewers:
- Ada Lovelace
- Irène Joliot-Curie

---

## 📛 Name

Civic Record Search Engine

## 🎯 Purpose

Provide powerful, accessible search functionality across all civic records —
enabling users to find bylaws, feedback, meetings, votes, or modules by keyword,
tag, author, or date.

Search must support both **public transparency** and **internal workflows**, and
gracefully scale from small towns to large cities.

---

## 🧩 Scope & Responsibilities

✅ Responsibilities:

- Index all `.md` records and structured metadata
- Support API queries and CLI searches
- Allow filtering by tag, author, date, status, type
- Rank results by relevance
- Return contextual excerpt (snippet) for display

❌ Out of Scope:

- Full database indexing (handled later via DB)
- Cross-town search (can be federated later)
- OCR or image search (not MVP)

---

## 🔗 Inputs & Outputs

| Input Example                  | Result                                |
| ------------------------------ | ------------------------------------- |
| `civic search curfew`          | Returns all records mentioning curfew |
| `/v1/search?q=mayor+signature` | Ranked civic records with matches     |
| `civic search --tag=budget`    | Results filtered by tag               |
| UI search box                  | Renders paginated result view         |

---

## 📂 File/Folder Location

```
core/search.ts
.civic/index.json
```

---

## 📝 Index Format

```json
[
  {
    "path": "records/bylaws/curfew.md",
    "title": "Bylaw 2025-14: Curfew",
    "tags": ["safety", "bylaw"],
    "status": "adopted",
    "excerpt": "No citizen shall be outdoors past 10pm..."
  }
]
```

Index is built from frontmatter + extracted content, refreshed on change.

---

## 🔐 Security & Trust Considerations

- Only public records are indexed for public UI
- Private records may have separate access-controlled search
- API must respect auth (where applicable)
- Index generation should warn on broken/missing metadata

---

## 🧪 Testing & Validation

- Index valid and invalid Markdown files
- Test various search inputs for expected results
- Ensure ranked, deduplicated output
- Validate filtered search by tag, status, date

---

## 🛠️ Future Enhancements

- Search weight tuning (title > content > tags)
- Advanced filters (module, vote outcome, signer)
- Smart tag suggestions
- Federated search across instances
- ElasticSearch or full DB integration

## 🔗 Related Specs

- [`indexing.md`](./indexing.md) — File indexing and metadata extraction
- [`manifest.md`](./manifest.md) — Record metadata and frontmatter
- [`status-tags.md`](./status-tags.md) — Status and tag filtering
- [`api.md`](./api.md) — Search API endpoints

---

## 📅 History

- Drafted: 2025-07-04
