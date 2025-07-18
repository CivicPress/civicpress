# History API Documentation

## Overview

The History API provides Git-based audit trail functionality for CivicPress
records. This API replicates the CLI `history` command functionality, allowing
applications to retrieve commit history for transparency and trust in civic
governance.

## Endpoints

### GET /api/history

Get Git commit history for all records or filtered by specific criteria.

**Authentication:** Required  
**Permission:** `records:view`

#### Query Parameters

| Parameter | Type     | Required | Description                                             |
| --------- | -------- | -------- | ------------------------------------------------------- |
| `record`  | string   | No       | Filter by specific record (e.g., "policy/data-privacy") |
| `limit`   | integer  | No       | Number of commits to return (1-100, default: 10)        |
| `offset`  | integer  | No       | Number of commits to skip (default: 0)                  |
| `author`  | string   | No       | Filter by author name or email                          |
| `since`   | ISO 8601 | No       | Filter commits since this date                          |
| `until`   | ISO 8601 | No       | Filter commits until this date                          |

#### Example Requests

```bash
# Get recent history for all records
curl -H "Authorization: Bearer <token>" \
     "http://localhost:3000/api/history"

# Get history for specific record
curl -H "Authorization: Bearer <token>" \
     "http://localhost:3000/api/history?record=policy/data-privacy"

# Get history with pagination
curl -H "Authorization: Bearer <token>" \
     "http://localhost:3000/api/history?limit=20&offset=10"

# Filter by author
curl -H "Authorization: Bearer <token>" \
     "http://localhost:3000/api/history?author=clerk"

# Filter by date range
curl -H "Authorization: Bearer <token>" \
     "http://localhost:3000/api/history?since=2024-01-01T00:00:00Z&until=2024-12-31T23:59:59Z"
```

#### Response Format

```json
{
  "success": true,
  "data": {
    "history": [
      {
        "hash": "abc123456789def",
        "shortHash": "abc12345",
        "message": "feat(clerk): Update data privacy policy",
        "author": "clerk",
        "email": "clerk@city.gov",
        "date": "2024-01-15T10:30:00Z",
        "timestamp": "2024-01-15T10:30:00.000Z",
        "record": "policy/data-privacy"
      }
    ],
    "summary": {
      "totalCommits": 25,
      "returnedCommits": 10,
      "limit": 10,
      "offset": 0,
      "record": "policy/data-privacy",
      "filters": {
        "author": null,
        "since": null,
        "until": null
      }
    }
  }
}
```

### GET /api/history/:record

Get Git commit history for a specific record.

**Authentication:** Required  
**Permission:** `records:view`

#### Path Parameters

| Parameter | Type   | Required | Description                                     |
| --------- | ------ | -------- | ----------------------------------------------- |
| `record`  | string | Yes      | Record identifier (e.g., "policy/data-privacy") |

#### Query Parameters

| Parameter | Type     | Required | Description                                      |
| --------- | -------- | -------- | ------------------------------------------------ |
| `limit`   | integer  | No       | Number of commits to return (1-100, default: 10) |
| `offset`  | integer  | No       | Number of commits to skip (default: 0)           |
| `author`  | string   | No       | Filter by author name or email                   |
| `since`   | ISO 8601 | No       | Filter commits since this date                   |
| `until`   | ISO 8601 | No       | Filter commits until this date                   |

#### Example Requests

```bash
# Get history for specific record
curl -H "Authorization: Bearer <token>" \
     "http://localhost:3000/api/history/policy/data-privacy"

# Get history with filters
curl -H "Authorization: Bearer <token>" \
     "http://localhost:3000/api/history/policy/data-privacy?author=clerk&limit=5"
```

#### Response Format

```json
{
  "success": true,
  "data": {
    "history": [
      {
        "hash": "abc123456789def",
        "shortHash": "abc12345",
        "message": "feat(clerk): Update data privacy policy",
        "author": "clerk",
        "email": "clerk@city.gov",
        "date": "2024-01-15T10:30:00Z",
        "timestamp": "2024-01-15T10:30:00.000Z",
        "record": "policy/data-privacy"
      }
    ],
    "summary": {
      "totalCommits": 15,
      "returnedCommits": 5,
      "limit": 5,
      "offset": 0,
      "record": "policy/data-privacy",
      "filters": {
        "author": "clerk",
        "since": null,
        "until": null
      }
    }
  }
}
```

## Error Responses

### Validation Error

```json
{
  "success": false,
  "error": {
    "message": "Invalid request data",
    "details": [
      {
        "type": "field",
        "value": "invalid",
        "msg": "Limit must be between 1 and 100",
        "path": "limit",
        "location": "query"
      }
    ]
  }
}
```

### Permission Error

```json
{
  "success": false,
  "error": {
    "message": "Permission denied",
    "code": "PERMISSION_DENIED",
    "details": "Role 'public' cannot view record history"
  }
}
```

### Git Engine Error

```json
{
  "success": false,
  "error": {
    "message": "Failed to get history",
    "code": "GIT_ERROR",
    "details": "Git engine not available"
  }
}
```

## Use Cases

### 1. Audit Trail

Track all changes to civic records for transparency and accountability:

```javascript
// Get complete audit trail for a policy
const response = await fetch('/api/history/policy/budget-2024', {
  headers: { 'Authorization': `Bearer ${token}` }
});
const auditTrail = await response.json();
```

### 2. Change Monitoring

Monitor recent changes across all records:

```javascript
// Get recent changes
const response = await fetch('/api/history?limit=50', {
  headers: { 'Authorization': `Bearer ${token}` }
});
const recentChanges = await response.json();
```

### 3. Author Activity

Track changes by specific authors:

```javascript
// Get changes by specific author
const response = await fetch('/api/history?author=council&limit=20', {
  headers: { 'Authorization': `Bearer ${token}` }
});
const authorChanges = await response.json();
```

### 4. Time-based Analysis

Analyze changes within specific time periods:

```javascript
// Get changes in last month
const lastMonth = new Date();
lastMonth.setMonth(lastMonth.getMonth() - 1);

const response = await fetch(`/api/history?since=${lastMonth.toISOString()}`, {
  headers: { 'Authorization': `Bearer ${token}` }
});
const recentChanges = await response.json();
```

## Implementation Details

### Git Integration

The History API uses the CivicPress GitEngine to:

- Retrieve commit history from the Git repository
- Filter commits by record, author, and date
- Transform Git commit data into standardized API responses
- Maintain audit trail integrity

### Performance Considerations

- **Pagination**: Use `limit` and `offset` for large history datasets
- **Filtering**: Apply filters early to reduce data transfer
- **Caching**: Consider caching for frequently accessed history data
- **Rate Limiting**: History queries may be rate-limited for performance

### Security

- **Authentication**: All history endpoints require valid authentication
- **Authorization**: Users must have `records:view` permission
- **Audit Logging**: All history queries are logged for security monitoring
- **Data Sanitization**: Input validation prevents injection attacks

## Integration Examples

### JavaScript/Node.js

```javascript
class CivicPressHistory {
  constructor(baseUrl, token) {
    this.baseUrl = baseUrl;
    this.token = token;
  }

  async getHistory(options = {}) {
    const params = new URLSearchParams(options);
    const response = await fetch(`${this.baseUrl}/api/history?${params}`, {
      headers: { 'Authorization': `Bearer ${this.token}` }
    });
    return response.json();
  }

  async getRecordHistory(record, options = {}) {
    const params = new URLSearchParams(options);
    const response = await fetch(`${this.baseUrl}/api/history/${record}?${params}`, {
      headers: { 'Authorization': `Bearer ${this.token}` }
    });
    return response.json();
  }
}

// Usage
const history = new CivicPressHistory('http://localhost:3000', token);
const auditTrail = await history.getRecordHistory('policy/data-privacy');
```

### Python

```python
import requests
from datetime import datetime, timedelta

class CivicPressHistory:
    def __init__(self, base_url, token):
        self.base_url = base_url
        self.headers = {'Authorization': f'Bearer {token}'}

    def get_history(self, **params):
        response = requests.get(f'{self.base_url}/api/history',
                              headers=self.headers, params=params)
        return response.json()

    def get_record_history(self, record, **params):
        response = requests.get(f'{self.base_url}/api/history/{record}',
                              headers=self.headers, params=params)
        return response.json()

# Usage
history = CivicPressHistory('http://localhost:3000', token)
audit_trail = history.get_record_history('policy/data-privacy')
```

## CLI Equivalence

The History API provides the same functionality as the CLI `history` command:

| CLI Command                         | API Equivalent                         |
| ----------------------------------- | -------------------------------------- |
| `civic history`                     | `GET /api/history`                     |
| `civic history policy/data-privacy` | `GET /api/history/policy/data-privacy` |
| `civic history --limit 20`          | `GET /api/history?limit=20`            |
| `civic history --format json`       | `GET /api/history` (always JSON)       |

## Trust and Transparency

The History API is essential for:

- **Audit Compliance**: Complete audit trail for regulatory requirements
- **Transparency**: Public visibility into civic record changes
- **Accountability**: Track who made changes and when
- **Trust**: Immutable Git-based history ensures data integrity
- **Governance**: Support democratic oversight of civic processes

## Future Enhancements

- **Real-time Updates**: WebSocket support for live history updates
- **Advanced Filtering**: More sophisticated commit filtering options
- **Export Formats**: Support for CSV, PDF export of history data
- **Analytics**: Built-in analytics for change patterns and trends
- **Notifications**: Webhook support for history-based notifications
