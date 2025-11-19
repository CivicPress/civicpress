# 🔍 CivicPress Indexing System

The CivicPress indexing system provides powerful search and discovery
capabilities for civic records. It automatically scans markdown files, extracts
metadata from YAML frontmatter, and creates searchable indexes that enable fast
record discovery and filtering.

## 🎯 Features

### Core Functionality

- **Automatic Index Generation**: Scans `records/` directory and extracts
  metadata from markdown files
- **YAML Frontmatter Parsing**: Extracts structured metadata from document
  headers
- **Search Capabilities**: Full-text search across titles, tags, authors, and
  content
- **Advanced Filtering**: Filter by type, status, module, tags, and more
- **Module-Specific Indexes**: Generates separate indexes for each module
- **JSON Output**: Machine-readable output for API integration

### CLI Commands

```bash
# Generate indexes
civic index

# Search for records
civic index --search "noise"

# Filter by type
civic index --type bylaw

# Filter by status
civic index --status draft

# List available indexes
civic index --list

# Validate indexes
civic index --validate

# JSON output
civic index --json
```

## 📁 File Structure

```
records/
├── index.yml                    # Global index
├── bylaw-noise-restrictions.md  # Sample record
├── policy-data-privacy.md       # Sample record
└── legal-register/             # Module-specific directory
    └── index.yml               # Module-specific index
```

## 📝 Record Format

Each civic record should include YAML frontmatter with metadata:

```yaml
---
title: 'Noise Restrictions'
type: bylaw
status: adopted
module: legal-register
tags: ['noise', 'nighttime', 'curfew']
authors:
  - name: 'Ada Lovelace'
    role: 'clerk'
created: '2025-06-12'
updated: '2025-07-01'
slug: 'noise-restrictions'
---

# Document content here...
```

### Required Fields

- `title`: Human-readable title
- `type`: Record type (bylaw, policy, resolution, etc.)
- `status`: Current status (draft, proposed, adopted, etc.)

### Optional Fields

- `module`: Associated module
- `tags`: Array of tags for categorization
- `authors`: Array of authors with name and role
- `created`: Creation date
- `updated`: Last update date
- `slug`: URL-friendly identifier
- `source`: Source file reference

## 🔧 API Usage

### IndexingService

```typescript
import { IndexingService } from '@civicpress/core';

const indexingService = new IndexingService(civicPress, dataDir);

// Generate indexes
const index = await indexingService.generateIndexes({
  types: ['bylaw'],
  statuses: ['adopted']
});

// Search within index
const results = indexingService.searchIndex(index, 'noise', {
  type: 'bylaw',
  tags: ['safety']
});

// Load existing index
const loadedIndex = indexingService.loadIndex('path/to/index.yml');
```

### Index Structure

```typescript
interface CivicIndex {
  entries: CivicIndexEntry[];
  metadata: {
    generated: string;
    totalRecords: number;
    modules: string[];
    types: string[];
    statuses: string[];
  };
}

interface CivicIndexEntry {
  file: string;
  title: string;
  type: string;
  status: string;
  module?: string;
  tags?: string[];
  authors?: Array<{ name: string; role: string }>;
  created?: string;
  updated?: string;
  source?: string;
  slug?: string;
}
```

## 🧪 Testing

The indexing system includes comprehensive tests:

```bash
# Run indexing tests
pnpm run test:run -- tests/core/indexing-service.test.ts
```

Tests cover:

- ✅ Index generation from markdown files
- ✅ Metadata extraction from frontmatter
- ✅ Filtering by type, status, module
- ✅ Search functionality
- ✅ Index loading and validation
- ✅ Combined search and filtering

## 🚀 Performance

- **Fast Scanning**: Efficient directory traversal and file processing
- **Memory Efficient**: Processes files one at a time
- **Incremental Updates**: Only regenerates indexes when needed
- **Cached Results**: Loads existing indexes for quick access

## 🔍 Search Examples

```bash
# Find all noise-related records
civic index --search "noise"

# Find draft bylaws
civic index --type bylaw --status draft

# Find records by author
civic index --search "Ada Lovelace"

# Find records with specific tags
civic index --search "privacy"

# Combine search and filters
civic index --search "budget" --type resolution
```

## 📊 Output Examples

### Human-Readable Output

```
Found 2 records:
1. Noise Restrictions (bylaw/adopted)
   File: bylaw-noise-restrictions.md
   Tags: noise, nighttime, curfew

2. Data Privacy Policy (policy/draft)
   File: policy-data-privacy.md
   Tags: privacy, data, technology
```

### JSON Output

```json
{
  "entries": [
    {
      "file": "bylaw-noise-restrictions.md",
      "title": "Noise Restrictions",
      "type": "bylaw",
      "status": "adopted",
      "module": "legal-register",
      "tags": ["noise", "nighttime", "curfew"],
      "authors": [{"name": "Ada Lovelace", "role": "clerk"}],
      "created": "2025-06-12",
      "updated": "2025-07-01",
      "slug": "noise-restrictions"
    }
  ],
  "metadata": {
    "generated": "2025-07-10T16:13:22.618Z",
    "totalRecords": 1,
    "modules": ["legal-register"],
    "types": ["bylaw"],
    "statuses": ["adopted"]
  }
}
```

## 🔗 Integration

The indexing system integrates with:

- **CLI Commands**: Full command-line interface
- **API Endpoints**: REST API for programmatic access
- **Database**: Can be extended with database storage
- **Search Engine**: Foundation for advanced search features
- **Modules**: Module-specific indexing support

## 🛠️ Future Enhancements

- **Full-Text Search**: Content-based search within documents
- **Fuzzy Matching**: Approximate string matching
- **Ranking**: Relevance-based result ranking
- **Incremental Updates**: Smart diff-based reindexing
- **Real-time Indexing**: Watch file changes and auto-update
- **Elasticsearch Integration**: Advanced search capabilities
- **Caching**: Redis-based index caching
- **Analytics**: Search analytics and insights

## 📚 Related Documentation

- [CLI Usage Guide](cli.md)
- [API Integration Guide](api-integration-guide.md)
- [Data Structure Spec](specs/public-data-structure.md)
- [Indexing Spec](specs/indexing.md)
