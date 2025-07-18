# Status API Documentation

## Overview

The Status API provides comprehensive system monitoring and health information
for CivicPress. It includes system status, Git repository status, record
statistics, and configuration information.

## Authentication

All endpoints require authentication via Bearer token:

```bash
Authorization: Bearer <your-token>
```

## Endpoints

### GET /api/status

Get comprehensive system status including system health, Git status, record
statistics, and configuration information.

**Authentication:** Required  
**Permission:** `records:view`

#### Response Format

```json
{
  "success": true,
  "data": {
    "system": {
      "status": "healthy",
      "uptime": 1234.56,
      "memory": {
        "rss": 123456789,
        "heapTotal": 987654321,
        "heapUsed": 456789123,
        "external": 12345678
      },
      "nodeVersion": "18.17.0",
      "platform": "darwin",
      "environment": "development",
      "timestamp": "2024-01-15T10:30:00.000Z"
    },
    "git": {
      "status": "clean",
      "modified": [],
      "created": [],
      "deleted": [],
      "renamed": [],
      "untracked": []
    },
    "records": {
      "totalRecords": 101,
      "byType": {
        "bylaw": {
          "count": 57,
          "files": ["article-001---animal-control", "article-002---noise-regulation"]
        },
        "policy": {
          "count": 25,
          "files": ["data-privacy-policy", "public-records-policy"]
        }
      },
      "byStatus": {
        "active": 7,
        "draft": 25,
        "proposed": 3,
        "approved": 2,
        "archived": 2,
        "unknown": 58
      },
      "archive": {
        "totalRecords": 3,
        "byType": {
          "bylaw": {
            "count": 2,
            "files": ["old-bylaw-1", "old-bylaw-2"]
          }
        }
      }
    },
    "configuration": {
      "exists": true,
      "files": ["workflows.yml", "hooks.yml", "templates"],
      "workflows": {
        "exists": true,
        "size": 1234,
        "lastModified": "2024-01-15T10:30:00.000Z"
      },
      "templates": {
        "exists": true,
        "count": 5,
        "files": ["default.md", "bylaw.md", "policy.md"]
      },
      "hooks": {
        "exists": true,
        "size": 567,
        "lastModified": "2024-01-15T10:30:00.000Z"
      }
    },
    "summary": {
      "totalRecords": 101,
      "pendingChanges": 0,
      "systemHealth": "healthy",
      "lastUpdated": "2024-01-15T10:30:00.000Z"
    }
  }
}
```

#### System Information

- **status**: Overall system health (`healthy`, `degraded`, `unhealthy`)
- **uptime**: Server uptime in seconds
- **memory**: Node.js memory usage statistics
- **nodeVersion**: Node.js version
- **platform**: Operating system platform
- **environment**: Current environment (`development`, `production`)

#### Git Status

- **status**: Repository status (`clean`, `dirty`)
- **modified**: List of modified files
- **created**: List of new files
- **deleted**: List of deleted files
- **renamed**: List of renamed files
- **untracked**: List of untracked files

#### Record Statistics

- **totalRecords**: Total number of active records
- **byType**: Breakdown by record type with counts and file lists
- **byStatus**: Breakdown by record status
- **archive**: Archived records statistics

#### Configuration Status

- **exists**: Whether `.civic` configuration directory exists
- **files**: List of configuration files
- **workflows**: Workflow configuration status
- **templates**: Template directory status
- **hooks**: Hooks configuration status

### GET /api/status/git

Get detailed Git repository status including pending changes and recent commits.

**Authentication:** Required  
**Permission:** `records:view`

#### Response Format

```json
{
  "success": true,
  "data": {
    "status": "clean",
    "modified": [],
    "created": [],
    "deleted": [],
    "renamed": [],
    "untracked": [],
    "recentCommits": [
      {
        "hash": "abc123456789def",
        "shortHash": "abc12345",
        "message": "feat(clerk): Update data privacy policy",
        "author": "clerk",
        "date": "2024-01-15T10:30:00Z"
      }
    ],
    "summary": {
      "totalChanges": 0,
      "modifiedFiles": 0,
      "newFiles": 0,
      "deletedFiles": 0,
      "renamedFiles": 0
    }
  }
}
```

#### Git Status Details

- **status**: Repository status (`clean` = no changes, `dirty` = has changes)
- **modified**: Array of modified file paths
- **created**: Array of new file paths
- **deleted**: Array of deleted file paths
- **renamed**: Array of renamed file paths
- **untracked**: Array of untracked file paths
- **recentCommits**: Last 5 commits with details
- **summary**: Count of changes by type

### GET /api/status/records

Get detailed record statistics with optional filtering by type.

**Authentication:** Required  
**Permission:** `records:view`

#### Query Parameters

| Parameter | Type   | Required | Description           |
| --------- | ------ | -------- | --------------------- |
| `type`    | string | No       | Filter by record type |

#### Response Format

```json
{
  "success": true,
  "data": {
    "totalRecords": 101,
    "byType": {
      "bylaw": {
        "count": 57,
        "files": ["article-001---animal-control", "article-002---noise-regulation"]
      },
      "policy": {
        "count": 25,
        "files": ["data-privacy-policy", "public-records-policy"]
      }
    },
    "byStatus": {
      "active": 7,
      "draft": 25,
      "proposed": 3,
      "approved": 2,
      "archived": 2,
      "unknown": 58
    },
    "archive": {
      "totalRecords": 3,
      "byType": {
        "bylaw": {
          "count": 2,
          "files": ["old-bylaw-1", "old-bylaw-2"]
        }
      }
    }
  }
}
```

#### Example Requests

```bash
# Get all record statistics
curl -H "Authorization: Bearer <token>" \
     "http://localhost:3000/api/status/records"

# Get statistics for bylaw records only
curl -H "Authorization: Bearer <token>" \
     "http://localhost:3000/api/status/records?type=bylaw"
```

## Use Cases

### System Monitoring

- Monitor server health and performance
- Track memory usage and uptime
- Check Node.js version and platform

### Git Repository Management

- Monitor pending changes
- Track recent commits
- Identify untracked or modified files

### Record Management

- Get overview of record counts by type
- Monitor record status distribution
- Track archived records

### Configuration Monitoring

- Verify configuration files exist
- Check configuration file sizes and dates
- Monitor template and hook configurations

## Error Responses

```json
{
  "success": false,
  "error": {
    "message": "Permission denied: records:view",
    "code": "INSUFFICIENT_PERMISSIONS",
    "required": "records:view",
    "user": {
      "id": 5,
      "username": "user",
      "role": "public"
    }
  }
}
```

## Performance Notes

- Status endpoints are designed for monitoring and should be cached
  appropriately
- Git status operations may be slow on large repositories
- Record statistics are computed on-demand and may take time for large datasets
- Consider implementing caching for frequently accessed status information

## Integration Examples

### JavaScript/Node.js

```javascript
const response = await fetch('http://localhost:3000/api/status', {
  headers: {
    'Authorization': 'Bearer your-token'
  }
});

const status = await response.json();
console.log(`System Health: ${status.data.system.status}`);
console.log(`Total Records: ${status.data.summary.totalRecords}`);
console.log(`Pending Changes: ${status.data.summary.pendingChanges}`);
```

### Python

```python
import requests

response = requests.get(
    'http://localhost:3000/api/status',
    headers={'Authorization': 'Bearer your-token'}
)

status = response.json()
print(f"System Health: {status['data']['system']['status']}")
print(f"Total Records: {status['data']['summary']['totalRecords']}")
```

### Shell Script

```bash
#!/bin/bash

TOKEN="your-token"
API_URL="http://localhost:3000/api/status"

STATUS=$(curl -s -H "Authorization: Bearer $TOKEN" "$API_URL" | jq -r '.data.system.status')
RECORDS=$(curl -s -H "Authorization: Bearer $TOKEN" "$API_URL" | jq -r '.data.summary.totalRecords')

echo "System Status: $STATUS"
echo "Total Records: $RECORDS"
```
