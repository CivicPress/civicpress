# CivicPress Indexing System

The CivicPress indexing system provides powerful search and discovery
capabilities for civic records. It automatically scans markdown files, extracts
metadata from YAML frontmatter, and creates searchable indexes that enable fast
record discovery and filtering.

## Features

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
- **Index Validation**: Comprehensive validation of index integrity
- **Statistics & Monitoring**: Detailed indexing statistics and health checks
- **Performance Optimizations**: Cached record parsing, direct database access,
  and optimized sync operations

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

# Get indexing statistics
civic index --stats

# JSON output
civic index --json
```

## File Structure

```
records/
├── index.yml                    # Global index
├── bylaw-noise-restrictions.md  # Sample record
├── policy-data-privacy.md       # Sample record
└── legal-register/             # Module-specific directory
    └── index.yml               # Module-specific index
```

## Record Format

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

## API Endpoints

### Indexing Endpoints

#### POST /api/indexing/generate

Generate or update civic record indexes.

**Request:**

```json
{
  "rebuild": false,
  "modules": ["legal-register"],
  "types": ["bylaw", "policy"],
  "statuses": ["adopted", "draft"],
  "syncDatabase": false,
  "conflictResolution": "file-wins"
}
```

**Response:**

```json
{
  "success": true,
  "index": {
    "entries": [
      {
        "file": "bylaw-noise-restrictions.md",
        "title": "Noise Restrictions",
        "type": "bylaw",
        "status": "adopted",
        "module": "legal-register",
        "tags": ["noise", "nighttime"],
        "authors": [
          {
            "name": "Ada Lovelace",
            "role": "clerk"
          }
        ],
        "created": "2025-06-12",
        "updated": "2025-07-01",
        "slug": "noise-restrictions"
      }
    ],
    "metadata": {
      "generated": "2025-01-27T10:00:00Z",
      "totalRecords": 1,
      "modules": ["legal-register"],
      "types": ["bylaw"],
      "statuses": ["adopted"]
    }
  }
}
```

#### GET /api/indexing/stats

Get indexing statistics and health information.

**Response:**

```json
{
  "success": true,
  "stats": {
    "totalRecords": 15,
    "modules": ["legal-register", "feedback"],
    "types": ["bylaw", "policy", "resolution"],
    "statuses": ["draft", "proposed", "adopted"],
    "lastGenerated": "2025-01-27T10:00:00Z",
    "indexFiles": [
      "index.yml",
      "legal-register/index.yml",
      "feedback/index.yml"
    ]
  }
}
```

#### GET /api/indexing/validate

Validate all indexes for integrity and consistency.

**Response:**

```json
{
  "success": true,
  "validation": {
    "valid": true,
    "errors": [],
    "warnings": [
      "Index entry missing required fields: old-record.md"
    ],
    "stats": {
      "totalIndexes": 3,
      "totalRecords": 15,
      "orphanedFiles": 0,
      "invalidEntries": 1
    }
  }
}
```

## API Usage

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

// Get indexing statistics
const stats = await indexingService.getIndexingStats();

// Validate indexes
const validation = await indexingService.validateIndexes();
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

## Testing

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
- ✅ Index statistics and health checks
- ✅ Validation of index integrity

## Performance

- **Fast Scanning**: Efficient directory traversal and file processing
- **Memory Efficient**: Processes files one at a time
- **Incremental Updates**: Only regenerates indexes when needed
- **Caching**: Intelligent caching of parsed metadata
- **Parallel Processing**: Multi-threaded processing for large datasets

## Search Capabilities

### Text Search

```bash
# Search by title
civic index --search "noise"

# Search by content
civic index --search "curfew"

# Search by author
civic index --search "Ada Lovelace"
```

### Advanced Filtering

```bash
# Filter by type
civic index --type bylaw

# Filter by status
civic index --status adopted

# Filter by module
civic index --module legal-register

# Filter by tags
civic index --tags noise,safety

# Combine filters
civic index --type bylaw --status adopted --search "noise"
```

### API Search

```javascript
// Search with filters
const response = await fetch('/api/indexing/generate', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    types: ['bylaw'],
    statuses: ['adopted'],
    search: 'noise'
  })
});

const { index } = await response.json();
console.log(`Found ${index.entries.length} records`);
```

## Monitoring & Health

### Index Statistics

```bash
# Get indexing statistics
civic index --stats

# Output:
# Indexing Statistics
# Total Records: 15
# Modules: legal-register, feedback
# Types: bylaw, policy, resolution
# Statuses: draft, proposed, adopted
# Last Generated: 2025-01-27T10:00:00Z
# Index Files: 3
```

### Index Validation

```bash
# Validate all indexes
civic index --validate

# Output:
# Index Validation Results
# Valid: true
# Total Indexes: 3
# Total Records: 15
# Orphaned Files: 0
# Invalid Entries: 1
# Warnings: 1
```

### Health Checks

```bash
# Check index health
curl -H "Authorization: Bearer <token>" \
     http://localhost:3000/api/indexing/validate

# Response:
{
  "success": true,
  "validation": {
    "valid": true,
    "errors": [],
    "warnings": ["Index entry missing required fields: old-record.md"],
    "stats": {
      "totalIndexes": 3,
      "totalRecords": 15,
      "orphanedFiles": 0,
      "invalidEntries": 1
    }
  }
}
```

## Automation

### Git Hooks

```bash
# .git/hooks/post-commit
#!/bin/bash
cd "$(git rev-parse --show-toplevel)"
civic index --silent
git add data/records/index.yml
git commit -m "Auto-update indexes" --no-verify
```

### Scheduled Indexing

```bash
# Cron job for hourly indexing
0 * * * * cd /path/to/civicpress && civic index --silent
```

### CI/CD Integration

```yaml
# .github/workflows/index.yml
name: Index Civic Records
on:
  push:
    paths: ['data/records/**']
jobs:
  index:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm install
      - run: civic index --validate
      - run: civic index --rebuild
```

## Security Considerations

### Index Integrity

- **File Validation**: All indexed files are validated for existence
- **Metadata Validation**: Required fields are checked for completeness
- **Orphan Detection**: Detects and reports orphaned index entries
- **Consistency Checks**: Ensures index consistency across modules

### Access Control

- **Role-Based Access**: Index operations respect user permissions
- **Audit Logging**: All indexing operations are logged
- **Validation**: Index validation requires appropriate permissions
- **Secure Storage**: Index files are stored securely

## Troubleshooting

### Common Issues

1. **Missing Required Fields**:

   ```bash

   ```

# Check for missing fields

civic index --validate

# Fix missing fields in frontmatter

# Add title, type, status to YAML frontmatter

````

2. **Orphaned Files**:

```bash
# Find orphaned files
civic index --validate

# Remove orphaned index entries
# Or restore missing files
````

3. **Index Corruption**:

   ```bash

   ```

# Rebuild all indexes

civic index --rebuild

# Validate after rebuild

civic index --validate

````

### Debug Mode

```bash
# Enable debug logging
export CIVIC_DEBUG=indexing

# Run with verbose output
civic index --rebuild --verbose
````

## Related Documentation

- [Indexing Schedules](indexing-schedules.md) - Strategies for scheduling
  indexing operations
- [Authentication System](auth-system.md)
- [API Documentation](api.md)
- [CLI Commands](cli.md)
- [Indexing Spec](specs/indexing.md) - Technical specification
