# Diff API Documentation

## Overview

The Diff API provides comprehensive record comparison and change tracking
functionality for CivicPress. It's designed to support frontend applications
that need GitHub-style diff interfaces, including side-by-side views, word-level
diffing, and bulk comparison operations.

## Frontend Integration Features

### 🎯 **GitHub-Style Interface Support**

The Diff API is specifically designed to power frontend diff interfaces similar
to GitHub's pull request and commit views:

#### **Visual Components Supported**

- **Side-by-side diff view** - Compare old and new versions side by side
- **Unified diff view** - Traditional unified diff format
- **Word-level highlighting** - Inline word changes within lines
- **Metadata diffing** - YAML frontmatter comparison
- **File tree navigation** - Browse multiple changed files
- **Commit timeline** - Historical change tracking

#### **Interactive Features**

- **Format switching** - Toggle between unified and side-by-side views
- **Context adjustment** - Expand/collapse context lines
- **Bulk operations** - Compare multiple records at once
- **Filtering** - Filter by record type, author, date range
- **Statistics** - Change counts and severity assessment

## Authentication

All endpoints require authentication via Bearer token:

```bash
Authorization: Bearer <your-token>
```

## Endpoints

### GET /api/diff/:recordId

Compare record versions between two Git commits.

**Authentication:** Required  
**Permission:** `records:view`

#### Query Parameters

| Parameter      | Type    | Required | Description                                                         |
| -------------- | ------- | -------- | ------------------------------------------------------------------- |
| `commit1`      | string  | No       | First commit (default: HEAD~1)                                      |
| `commit2`      | string  | No       | Second commit (default: HEAD)                                       |
| `format`       | string  | No       | Output format: `unified`, `side-by-side`, `json` (default: unified) |
| `context`      | integer | No       | Number of context lines (default: 3)                                |
| `showMetadata` | boolean | No       | Include metadata changes (default: true)                            |
| `showContent`  | boolean | No       | Include content changes (default: true)                             |
| `wordLevel`    | boolean | No       | Include word-level diffing (default: false)                         |
| `includeStats` | boolean | No       | Include change statistics (default: true)                           |

#### Response Format

```json
{
  "success": true,
  "data": {
    "recordId": "article-001---animal-control",
    "type": "bylaw",
    "commit1": "abc123456789def",
    "commit2": "def456789abc123",
    "changes": {
      "metadata": [
        {
          "field": "title",
          "oldValue": "Old Title",
          "newValue": "New Title",
          "type": "modified"
        }
      ],
      "content": {
        "unified": "@@ -1,3 +1,3 @@\n- Old content\n+ New content",
        "sideBySide": {
          "left": [
            {
              "lineNumber": 1,
              "content": "Old content",
              "type": "removed"
            }
          ],
          "right": [
            {
              "lineNumber": 1,
              "content": "New content",
              "type": "added"
            }
          ]
        },
        "wordLevel": {
          "lines": [
            {
              "lineNumber": 1,
              "words": [
                {
                  "word": "Old",
                  "type": "removed",
                  "position": 0
                },
                {
                  "word": "New",
                  "type": "added",
                  "position": 0
                }
              ]
            }
          ]
        },
        "stats": {
          "linesAdded": 5,
          "linesRemoved": 3,
          "wordsAdded": 25,
          "wordsRemoved": 15,
          "filesChanged": 1
        }
      }
    },
    "summary": {
      "hasChanges": true,
      "changeTypes": ["metadata", "content"],
      "severity": "minor",
      "totalFiles": 1,
      "totalChanges": 8
    }
  }
}
```

#### Frontend Usage Examples

```javascript
// Side-by-side diff for GitHub-style interface
const response = await fetch('/api/diff/article-001?format=side-by-side', {
  headers: { 'Authorization': 'Bearer token' }
});
const diff = await response.json();

// Render side-by-side view
diff.data.changes.content.sideBySide.left.forEach(line => {
  renderLeftLine(line);
});
diff.data.changes.content.sideBySide.right.forEach(line => {
  renderRightLine(line);
});

// Word-level highlighting
if (diff.data.changes.content.wordLevel) {
  diff.data.changes.content.wordLevel.lines.forEach(line => {
    line.words.forEach(word => {
      highlightWord(word);
    });
  });
}
```

### GET /api/diff/:recordId/history

Get commit history for a specific record.

**Authentication:** Required  
**Permission:** `records:view`

#### Query Parameters

| Parameter | Type    | Required | Description                             |
| --------- | ------- | -------- | --------------------------------------- |
| `limit`   | integer | No       | Maximum commits to return (default: 20) |
| `author`  | string  | No       | Filter by author                        |
| `since`   | string  | No       | Filter by date (ISO format)             |

#### Response Format

```json
{
  "success": true,
  "data": {
    "recordId": "article-001---animal-control",
    "commits": [
      {
        "hash": "abc123456789def",
        "shortHash": "abc12345",
        "date": "2024-01-15T10:30:00Z",
        "author": "clerk",
        "message": "Update animal control regulations",
        "changes": ["modified"]
      }
    ],
    "summary": {
      "totalCommits": 5,
      "firstCommit": "oldest-hash",
      "lastCommit": "newest-hash"
    }
  }
}
```

#### Frontend Usage Examples

```javascript
// Get commit timeline for record
const response = await fetch('/api/diff/article-001/history?limit=50', {
  headers: { 'Authorization': 'Bearer token' }
});
const history = await response.json();

// Render commit timeline
history.data.commits.forEach(commit => {
  renderCommitTimeline(commit);
});

// Allow user to select commits for comparison
commit.addEventListener('click', () => {
  compareCommits(commit.hash, 'HEAD');
});
```

### POST /api/diff/bulk

Perform bulk diff operations on multiple records.

**Authentication:** Required  
**Permission:** `records:view`

#### Request Body

```json
{
  "records": [
    {
      "recordId": "article-001---animal-control",
      "commit1": "HEAD~1",
      "commit2": "HEAD"
    },
    {
      "recordId": "policy-data-privacy",
      "commit1": "abc123",
      "commit2": "def456"
    }
  ],
  "options": {
    "format": "side-by-side",
    "showMetadata": true,
    "showContent": true,
    "wordLevel": false
  }
}
```

#### Response Format

```json
{
  "success": true,
  "data": {
    "results": [
      {
        "recordId": "article-001---animal-control",
        "type": "bylaw",
        "changes": { ... },
        "summary": { ... }
      }
    ],
    "summary": {
      "totalRecords": 2,
      "successfulDiffs": 2,
      "failedDiffs": 0
    }
  }
}
```

#### Frontend Usage Examples

```javascript
// Bulk diff for file tree view
const response = await fetch('/api/diff/bulk', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer token',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    records: changedFiles.map(file => ({
      recordId: file.name,
      commit1: 'HEAD~1',
      commit2: 'HEAD'
    })),
    options: {
      format: 'side-by-side',
      showMetadata: true,
      showContent: true
    }
  })
});

const bulkDiff = await response.json();

// Render file tree with change indicators
bulkDiff.data.results.forEach(result => {
  renderFileTreeItem(result);
});
```

### GET /api/diff/commits/:commit1/:commit2

Compare all records between two commits.

**Authentication:** Required  
**Permission:** `records:view`

#### Path Parameters

| Parameter | Type   | Required | Description        |
| --------- | ------ | -------- | ------------------ |
| `commit1` | string | Yes      | First commit hash  |
| `commit2` | string | Yes      | Second commit hash |

#### Query Parameters

| Parameter      | Type    | Required | Description                         |
| -------------- | ------- | -------- | ----------------------------------- |
| `type`         | string  | No       | Filter by record type               |
| `format`       | string  | No       | Output format (default: unified)    |
| `context`      | integer | No       | Context lines (default: 3)          |
| `showMetadata` | boolean | No       | Include metadata (default: true)    |
| `showContent`  | boolean | No       | Include content (default: true)     |
| `wordLevel`    | boolean | No       | Word-level diffing (default: false) |

#### Response Format

```json
{
  "success": true,
  "data": {
    "commit1": "abc123456789def",
    "commit2": "def456789abc123",
    "results": [
      {
        "recordId": "article-001---animal-control",
        "type": "bylaw",
        "changes": { ... },
        "summary": { ... }
      }
    ],
    "summary": {
      "totalFiles": 5,
      "changedFiles": 3,
      "unchangedFiles": 2
    }
  }
}
```

#### Frontend Usage Examples

```javascript
// Compare two commits (like GitHub's commit comparison)
const response = await fetch('/api/diff/commits/abc123/def456?format=side-by-side', {
  headers: { 'Authorization': 'Bearer token' }
});
const commitDiff = await response.json();

// Render commit comparison view
commitDiff.data.results.forEach(result => {
  renderFileDiff(result);
});

// Show summary statistics
renderSummary(commitDiff.data.summary);
```

## Frontend Integration Patterns

### 1. **GitHub-Style Pull Request View**

```javascript
// Get all changed files between branches
const response = await fetch('/api/diff/commits/main/feature-branch', {
  headers: { 'Authorization': 'Bearer token' }
});

// Render file tree with change indicators
const files = response.data.results;
files.forEach(file => {
  renderFileTreeItem({
    name: file.recordId,
    status: file.summary.hasChanges ? 'modified' : 'unchanged',
    changes: file.summary.totalChanges
  });
});

// When user clicks on a file, show side-by-side diff
fileItem.addEventListener('click', async () => {
  const diffResponse = await fetch(`/api/diff/${file.recordId}?format=side-by-side`);
  const diff = diffResponse.data;
  renderSideBySideDiff(diff.changes.content.sideBySide);
});
```

### 2. **Word-Level Inline Diffing**

```javascript
// Enable word-level diffing for precise highlighting
const response = await fetch('/api/diff/article-001?wordLevel=true', {
  headers: { 'Authorization': 'Bearer token' }
});

const diff = response.data;

// Render inline word changes
diff.changes.content.wordLevel.lines.forEach(line => {
  line.words.forEach(word => {
    const element = document.createElement('span');
    element.textContent = word.word;
    element.className = `diff-word diff-${word.type}`;
    element.dataset.position = word.position;
    lineElement.appendChild(element);
  });
});
```

### 3. **Metadata Comparison Panel**

```javascript
// Show metadata changes in a separate panel
const response = await fetch('/api/diff/article-001?showMetadata=true', {
  headers: { 'Authorization': 'Bearer token' }
});

const diff = response.data;

// Render metadata changes
diff.changes.metadata.forEach(change => {
  renderMetadataChange({
    field: change.field,
    oldValue: change.oldValue,
    newValue: change.newValue,
    type: change.type
  });
});
```

### 4. **Bulk Operations for File Tree**

```javascript
// Get all changed files and their diffs in one request
const changedFiles = ['file1', 'file2', 'file3'];
const response = await fetch('/api/diff/bulk', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer token',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    records: changedFiles.map(file => ({
      recordId: file,
      commit1: 'HEAD~1',
      commit2: 'HEAD'
    })),
    options: {
      format: 'side-by-side',
      showMetadata: true,
      showContent: true
    }
  })
});

// Cache all diffs for instant navigation
const diffs = response.data.results;
diffs.forEach(diff => {
  cacheDiff(diff.recordId, diff);
});
```

## Error Handling

### Common Error Responses

```json
{
  "success": false,
  "error": {
    "message": "One or both commits not found",
    "code": "COMMIT_NOT_FOUND",
    "statusCode": 400
  }
}
```

### Error Codes

- `COMMIT_NOT_FOUND` - Specified commit doesn't exist
- `NO_CHANGES` - Record not found or no changes between commits
- `INVALID_INPUT` - Invalid request parameters
- `CONFIG_NOT_FOUND` - CivicPress configuration not found

## Performance Considerations

### **Optimization Tips**

1. **Use appropriate formats**:
   - `unified` for simple text display
   - `side-by-side` for interactive interfaces
   - `wordLevel` only when needed (computationally expensive)

2. **Limit context lines**:
   - Use `context=1` for large files
   - Use `context=5` for detailed review

3. **Bulk operations**:
   - Use `/api/diff/bulk` for multiple files
   - Cache results for frequently accessed diffs

4. **Filtering**:
   - Use `type` parameter to limit scope
   - Use `author` and `since` for targeted history

### **Caching Strategies**

```javascript
// Cache diff results for better performance
const diffCache = new Map();

async function getCachedDiff(recordId, commit1, commit2, options) {
  const cacheKey = `${recordId}-${commit1}-${commit2}-${JSON.stringify(options)}`;

  if (diffCache.has(cacheKey)) {
    return diffCache.get(cacheKey);
  }

  const response = await fetch(`/api/diff/${recordId}?${new URLSearchParams(options)}`);
  const diff = await response.json();

  diffCache.set(cacheKey, diff);
  return diff;
}
```

## Security Notes

- All endpoints require authentication
- Users can only diff records they have permission to view
- Commit validation prevents access to unauthorized commits
- Input sanitization prevents injection attacks

## Integration Examples

### **React Component Example**

```jsx
function DiffViewer({ recordId, commit1, commit2 }) {
  const [diff, setDiff] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDiff();
  }, [recordId, commit1, commit2]);

  const fetchDiff = async () => {
    try {
      const response = await fetch(
        `/api/diff/${recordId}?commit1=${commit1}&commit2=${commit2}&format=side-by-side`,
        {
          headers: { 'Authorization': `Bearer ${token}` }
        }
      );
      const data = await response.json();
      setDiff(data.data);
    } catch (error) {
      console.error('Failed to fetch diff:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div>Loading diff...</div>;
  if (!diff) return <div>No changes found</div>;

  return (
    <div className="diff-viewer">
      <div className="diff-header">
        <h3>{diff.recordId}</h3>
        <span className={`severity-${diff.summary.severity}`}>
          {diff.summary.totalChanges} changes
        </span>
      </div>

      <div className="diff-content">
        <div className="side-by-side">
          <div className="left-panel">
            {diff.changes.content.sideBySide.left.map((line, i) => (
              <DiffLine key={i} line={line} side="left" />
            ))}
          </div>
          <div className="right-panel">
            {diff.changes.content.sideBySide.right.map((line, i) => (
              <DiffLine key={i} line={line} side="right" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
```

### **Vue.js Component Example**

```vue
<template>
  <div class="diff-viewer">
    <div class="diff-header">
      <h3>{{ diff.recordId }}</h3>
      <span :class="`severity-${diff.summary.severity}`">
        {{ diff.summary.totalChanges }} changes
      </span>
    </div>

    <div class="diff-content">
      <div class="side-by-side">
        <div class="left-panel">
          <DiffLine
            v-for="(line, index) in diff.changes.content.sideBySide.left"
            :key="index"
            :line="line"
            side="left"
          />
        </div>
        <div class="right-panel">
          <DiffLine
            v-for="(line, index) in diff.changes.content.sideBySide.right"
            :key="index"
            :line="line"
            side="right"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<script>
export default {
  name: 'DiffViewer',
  props: {
    recordId: String,
    commit1: String,
    commit2: String
  },
  data() {
    return {
      diff: null,
      loading: true
    };
  },
  async mounted() {
    await this.fetchDiff();
  },
  methods: {
    async fetchDiff() {
      try {
        const response = await fetch(
          `/api/diff/${this.recordId}?commit1=${this.commit1}&commit2=${this.commit2}&format=side-by-side`,
          {
            headers: { 'Authorization': `Bearer ${this.token}` }
          }
        );
        const data = await response.json();
        this.diff = data.data;
      } catch (error) {
        console.error('Failed to fetch diff:', error);
      } finally {
        this.loading = false;
      }
    }
  }
};
</script>
```

This Diff API provides all the functionality needed to build sophisticated
frontend diff interfaces similar to GitHub, with support for side-by-side views,
word-level highlighting, bulk operations, and comprehensive change tracking.
