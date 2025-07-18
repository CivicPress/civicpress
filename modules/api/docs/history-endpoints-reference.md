# History API Endpoints Reference

## Overview

This document provides a complete reference for all History API endpoints,
parameters, and usage examples.

## Base URL

```
http://localhost:3000
```

## Authentication

All endpoints require authentication via Bearer token:

```bash
Authorization: Bearer <your-token>
```

---

## Endpoint 1: GET /api/history

Get Git commit history for all records or filtered by specific criteria.

### URL

```
GET /api/history
```

### Authentication

- **Required**: Yes
- **Permission**: `records:view`

### Query Parameters

| Parameter | Type     | Required | Default | Min | Max | Description                                             |
| --------- | -------- | -------- | ------- | --- | --- | ------------------------------------------------------- |
| `record`  | string   | No       | -       | -   | -   | Filter by specific record (e.g., "policy/data-privacy") |
| `limit`   | integer  | No       | 10      | 1   | 100 | Number of commits to return                             |
| `offset`  | integer  | No       | 0       | 0   | -   | Number of commits to skip                               |
| `author`  | string   | No       | -       | -   | -   | Filter by author name or email                          |
| `since`   | ISO 8601 | No       | -       | -   | -   | Filter commits since this date                          |
| `until`   | ISO 8601 | No       | -       | -   | -   | Filter commits until this date                          |

### Example Requests

```bash
# Get recent history for all records
curl -H "Authorization: Bearer <token>" \
     "http://localhost:3000/api/history"

# Get history with pagination
curl -H "Authorization: Bearer <token>" \
     "http://localhost:3000/api/history?limit=20&offset=10"

# Filter by specific record
curl -H "Authorization: Bearer <token>" \
     "http://localhost:3000/api/history?record=policy/data-privacy"

# Filter by author
curl -H "Authorization: Bearer <token>" \
     "http://localhost:3000/api/history?author=clerk"

# Filter by date range
curl -H "Authorization: Bearer <token>" \
     "http://localhost:3000/api/history?since=2024-01-01T00:00:00Z&until=2024-12-31T23:59:59Z"

# Combined filters
curl -H "Authorization: Bearer <token>" \
     "http://localhost:3000/api/history?record=policy/data-privacy&author=clerk&limit=5"
```

### Response Format

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
        "author": "clerk",
        "since": null,
        "until": null
      }
    }
  },
  "meta": {
    "totalCommits": 25,
    "returnedCommits": 10
  }
}
```

### HTTP Status Codes

| Code | Description                           |
| ---- | ------------------------------------- |
| 200  | Success                               |
| 400  | Validation error (invalid parameters) |
| 401  | Authentication required               |
| 403  | Permission denied                     |
| 500  | Server error                          |

---

## Endpoint 2: GET /api/history/:record

Get Git commit history for a specific record.

### URL

```
GET /api/history/{record}
```

### Path Parameters

| Parameter | Type   | Required | Description                                     |
| --------- | ------ | -------- | ----------------------------------------------- |
| `record`  | string | Yes      | Record identifier (e.g., "policy/data-privacy") |

### Query Parameters

| Parameter | Type     | Required | Default | Min | Max | Description                    |
| --------- | -------- | -------- | ------- | --- | --- | ------------------------------ |
| `limit`   | integer  | No       | 10      | 1   | 100 | Number of commits to return    |
| `offset`  | integer  | No       | 0       | 0   | -   | Number of commits to skip      |
| `author`  | string   | No       | -       | -   | -   | Filter by author name or email |
| `since`   | ISO 8601 | No       | -       | -   | -   | Filter commits since this date |
| `until`   | ISO 8601 | No       | -       | -   | -   | Filter commits until this date |

### Example Requests

```bash
# Get history for specific record
curl -H "Authorization: Bearer <token>" \
     "http://localhost:3000/api/history/policy/data-privacy"

# Get history with pagination
curl -H "Authorization: Bearer <token>" \
     "http://localhost:3000/api/history/policy/data-privacy?limit=5&offset=0"

# Filter by author for specific record
curl -H "Authorization: Bearer <token>" \
     "http://localhost:3000/api/history/policy/data-privacy?author=clerk"

# Filter by date range for specific record
curl -H "Authorization: Bearer <token>" \
     "http://localhost:3000/api/history/policy/data-privacy?since=2024-01-01T00:00:00Z"

# Combined filters for specific record
curl -H "Authorization: Bearer <token>" \
     "http://localhost:3000/api/history/policy/data-privacy?author=clerk&limit=3&since=2024-01-01T00:00:00Z"
```

### Response Format

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
        "since": "2024-01-01T00:00:00Z",
        "until": null
      }
    }
  },
  "meta": {
    "record": "policy/data-privacy",
    "totalCommits": 15,
    "returnedCommits": 5
  }
}
```

### HTTP Status Codes

| Code | Description                           |
| ---- | ------------------------------------- |
| 200  | Success                               |
| 400  | Validation error (invalid parameters) |
| 401  | Authentication required               |
| 403  | Permission denied                     |
| 404  | Record not found                      |
| 500  | Server error                          |

---

## Parameter Details

### Record Parameter

The `record` parameter can be specified in two ways:

1. **Query parameter** (GET /api/history): `?record=policy/data-privacy`
2. **Path parameter** (GET /api/history/:record):
   `/api/history/policy/data-privacy`

**Format**: `{type}/{id}` where:

- `type`: Record type (bylaw, policy, resolution, etc.)
- `id`: Record identifier (filename without extension)

**Examples**:

- `policy/data-privacy`
- `bylaw/zoning-amendment`
- `resolution/budget-2024`

### Limit Parameter

Controls the number of commits returned:

- **Range**: 1-100
- **Default**: 10
- **Validation**: Must be integer between 1 and 100

**Examples**:

- `limit=5` - Return 5 commits
- `limit=50` - Return 50 commits
- `limit=100` - Return maximum 100 commits

### Offset Parameter

Controls pagination by skipping commits:

- **Range**: 0 or greater
- **Default**: 0
- **Validation**: Must be non-negative integer

**Examples**:

- `offset=0` - Start from first commit
- `offset=10` - Skip first 10 commits
- `offset=50` - Skip first 50 commits

### Author Parameter

Filters commits by author name or email:

- **Type**: String
- **Case**: Case-insensitive partial match
- **Search**: Matches author name or email

**Examples**:

- `author=clerk` - Commits by "clerk"
- `author=Mathieu` - Commits by "Mathieu Halle"
- `author=@city.gov` - Commits by authors with "@city.gov" email

### Since Parameter

Filters commits from a specific date onwards:

- **Format**: ISO 8601 datetime string
- **Example**: `2024-01-01T00:00:00Z`
- **Behavior**: Includes commits on or after the specified date

**Examples**:

- `since=2024-01-01T00:00:00Z` - Commits from January 1, 2024
- `since=2024-06-01T12:00:00Z` - Commits from June 1, 2024 at noon

### Until Parameter

Filters commits up to a specific date:

- **Format**: ISO 8601 datetime string
- **Example**: `2024-12-31T23:59:59Z`
- **Behavior**: Includes commits on or before the specified date

**Examples**:

- `until=2024-12-31T23:59:59Z` - Commits up to December 31, 2024
- `until=2024-06-30T23:59:59Z` - Commits up to June 30, 2024

---

## Response Data Structure

### History Entry

Each commit in the history array contains:

| Field       | Type   | Description                         |
| ----------- | ------ | ----------------------------------- |
| `hash`      | string | Full Git commit hash                |
| `shortHash` | string | Shortened hash (first 8 characters) |
| `message`   | string | Git commit message                  |
| `author`    | string | Author name                         |
| `email`     | string | Author email address                |
| `date`      | string | Original commit date                |
| `timestamp` | string | ISO 8601 formatted timestamp        |
| `record`    | string | Associated record (or "all")        |

### Summary Object

Contains metadata about the response:

| Field             | Type   | Description                              |
| ----------------- | ------ | ---------------------------------------- |
| `totalCommits`    | number | Total number of commits matching filters |
| `returnedCommits` | number | Number of commits in current response    |
| `limit`           | number | Requested limit parameter                |
| `offset`          | number | Requested offset parameter               |
| `record`          | string | Record filter applied                    |
| `filters`         | object | Applied filter parameters                |

### Filters Object

Shows which filters were applied:

| Field    | Type           | Description               |
| -------- | -------------- | ------------------------- |
| `author` | string \| null | Author filter applied     |
| `since`  | string \| null | Since date filter applied |
| `until`  | string \| null | Until date filter applied |

---

## Error Responses

### Validation Error (400)

```json
{
  "success": false,
  "error": {
    "message": "Invalid request data",
    "details": [
      {
        "type": "field",
        "value": "150",
        "msg": "Limit must be between 1 and 100",
        "path": "limit",
        "location": "query"
      }
    ]
  }
}
```

### Authentication Error (401)

```json
{
  "success": false,
  "error": {
    "message": "Authentication required",
    "code": "AUTH_REQUIRED"
  }
}
```

### Permission Error (403)

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

### Not Found Error (404)

```json
{
  "success": false,
  "error": {
    "message": "Route GET /api/history/invalid-path not found",
    "code": "NOT_FOUND"
  }
}
```

### Server Error (500)

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

---

## Usage Examples

### Basic Usage

```bash
# Get recent history
curl -H "Authorization: Bearer <token>" \
     "http://localhost:3000/api/history"

# Get history for specific record
curl -H "Authorization: Bearer <token>" \
     "http://localhost:3000/api/history/policy/data-privacy"
```

### Advanced Filtering

```bash
# Get recent changes by specific author
curl -H "Authorization: Bearer <token>" \
     "http://localhost:3000/api/history?author=clerk&limit=20"

# Get changes in date range
curl -H "Authorization: Bearer <token>" \
     "http://localhost:3000/api/history?since=2024-01-01T00:00:00Z&until=2024-12-31T23:59:59Z"

# Get paginated results
curl -H "Authorization: Bearer <token>" \
     "http://localhost:3000/api/history?limit=5&offset=10"
```

### JavaScript Integration

```javascript
// Get history for all records
const response = await fetch('/api/history', {
  headers: { 'Authorization': `Bearer ${token}` }
});

// Get history for specific record with filters
const response = await fetch('/api/history/policy/data-privacy?author=clerk&limit=10', {
  headers: { 'Authorization': `Bearer ${token}` }
});

const data = await response.json();
console.log(data.data.history);
```

### Python Integration

```python
import requests

# Get history for all records
response = requests.get('http://localhost:3000/api/history',
                       headers={'Authorization': f'Bearer {token}'})

# Get history for specific record
response = requests.get('http://localhost:3000/api/history/policy/data-privacy',
                       headers={'Authorization': f'Bearer {token}'})

data = response.json()
print(data['data']['history'])
```

---

## CLI Equivalence

| CLI Command                         | API Equivalent                         |
| ----------------------------------- | -------------------------------------- |
| `civic history`                     | `GET /api/history`                     |
| `civic history policy/data-privacy` | `GET /api/history/policy/data-privacy` |
| `civic history --limit 20`          | `GET /api/history?limit=20`            |
| `civic history --format json`       | `GET /api/history` (always JSON)       |

---

## Performance Considerations

- **Pagination**: Use `limit` and `offset` for large datasets
- **Filtering**: Apply filters early to reduce data transfer
- **Caching**: Consider caching for frequently accessed history data
- **Rate Limiting**: History queries may be rate-limited for performance

## Security Notes

- **Authentication**: All endpoints require valid authentication
- **Authorization**: Users must have `records:view` permission
- **Audit Logging**: All history queries are logged for security monitoring
- **Data Sanitization**: Input validation prevents injection attacks
