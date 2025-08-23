# CivicPress API Integration Guide

This guide covers how to integrate with the CivicPress API for building
applications that interact with civic governance data.

## 🎯 Overview

The CivicPress API provides RESTful access to:

- **Records Management**: Create, read, update, delete civic records
- **Workflow Control**: Manage record status transitions
- **Role-based Access**: Enforce permissions based on user roles
- **Template System**: Use predefined templates for record creation
- **Export/Import**: Bulk data operations

## 🚀 Getting Started

### 1. API Server Setup

```bash
# Start the API server
cd modules/api
pnpm run dev

# Server will be available at http://localhost:3000
```

### 2. Basic Authentication

```bash
# All requests require an API key header
curl -H "X-API-Key: clerk" http://localhost:3000/api/v1/records
```

### 3. Test Connection

```bash
# Health check
curl http://localhost:3000/health

# List records
curl http://localhost:3000/api/v1/records
```

## 📋 Core Concepts

### Record Types

- `bylaw` - Municipal bylaws and ordinances
- `policy` - Administrative policies
- `proposal` - Proposed changes or new items
- `resolution` - Council resolutions

### Record Statuses

- `draft` - Initial state, editable
- `proposed` - Submitted for review
- `reviewed` - Under review
- `approved` - Finalized and active
- `archived` - No longer in effect

### User Roles

- `clerk` - Administrative staff
- `council` - Elected officials
- `public` - General public (read-only)

## 🔧 API Integration Examples

### JavaScript/Node.js

```javascript
class CivicPressAPI {
  constructor(baseUrl = 'http://localhost:3000', apiKey) {
    this.baseUrl = baseUrl;
    this.headers = {
      'Content-Type': 'application/json',
      'X-API-Key': apiKey
    };
  }

  // List records with filtering
  async listRecords(options = {}) {
    const params = new URLSearchParams();
    if (options.type) params.append('type', options.type);
    if (options.status) params.append('status', options.status);
    if (options.limit) params.append('limit', options.limit);
    if (options.offset) params.append('offset', options.offset);

    const response = await fetch(`${this.baseUrl}/api/v1/records?${params}`, {
      headers: this.headers
    });
    return response.json();
  }

  // Get specific record
  async getRecord(id, type) {
    const params = type ? `?type=${type}` : '';
    const response = await fetch(`${this.baseUrl}/api/v1/records/${id}${params}`, {
      headers: this.headers
    });
    return response.json();
  }

  // Create new record
  async createRecord(recordData) {
    const response = await fetch(`${this.baseUrl}/api/v1/records`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify(recordData)
    });
    return response.json();
  }

  // Update record
  async updateRecord(id, updates) {
    const response = await fetch(`${this.baseUrl}/api/v1/records/${id}`, {
      method: 'PUT',
      headers: this.headers,
      body: JSON.stringify(updates)
    });
    return response.json();
  }

  // Delete record
  async deleteRecord(id) {
    const response = await fetch(`${this.baseUrl}/api/v1/records/${id}`, {
      method: 'DELETE',
      headers: this.headers
    });
    return response.json();
  }
}

// Usage example
const api = new CivicPressAPI('http://localhost:3000', 'clerk');

// List active bylaws
const bylaws = await api.listRecords({ type: 'bylaw', status: 'active' });

// Create new bylaw
const newBylaw = await api.createRecord({
  title: 'Parking Regulations',
  type: 'bylaw',
  content: '# Parking Regulations\n\nNo parking on Main Street...',
  role: 'clerk'
});
```

### Python

```python
import requests
from typing import Optional, Dict, Any

class CivicPressAPI:
    def __init__(self, base_url: str = "http://localhost:3000", api_key: str = None):
        self.base_url = base_url
        self.headers = {
            'Content-Type': 'application/json',
            'X-API-Key': api_key
        } if api_key else {'Content-Type': 'application/json'}

    def list_records(self, record_type: Optional[str] = None,
                    status: Optional[str] = None,
                    limit: Optional[int] = None,
                    offset: Optional[int] = None) -> Dict[str, Any]:
        """List records with optional filtering."""
        params = {}
        if record_type:
            params['type'] = record_type
        if status:
            params['status'] = status
        if limit:
            params['limit'] = limit
        if offset:
            params['offset'] = offset

        response = requests.get(f"{self.base_url}/api/v1/records",
                              headers=self.headers, params=params)
        response.raise_for_status()
        return response.json()

    def get_record(self, record_id: str, record_type: Optional[str] = None) -> Dict[str, Any]:
        """Get a specific record by ID."""
        params = {'type': record_type} if record_type else {}
        response = requests.get(f"{self.base_url}/api/v1/records/{record_id}",
                              headers=self.headers, params=params)
        response.raise_for_status()
        return response.json()

    def create_record(self, title: str, record_type: str,
                     content: Optional[str] = None,
                     template: Optional[str] = None,
                     role: Optional[str] = None,
                     metadata: Optional[Dict] = None) -> Dict[str, Any]:
        """Create a new record."""
        data = {
            'title': title,
            'type': record_type
        }
        if content:
            data['content'] = content
        if template:
            data['template'] = template
        if role:
            data['role'] = role
        if metadata:
            data['metadata'] = metadata

        response = requests.post(f"{self.base_url}/api/v1/records",
                               headers=self.headers, json=data)
        response.raise_for_status()
        return response.json()

    def update_record(self, record_id: str, updates: Dict[str, Any]) -> Dict[str, Any]:
        """Update an existing record."""
        response = requests.put(f"{self.base_url}/api/v1/records/{record_id}",
                              headers=self.headers, json=updates)
        response.raise_for_status()
        return response.json()

    def delete_record(self, record_id: str) -> Dict[str, Any]:
        """Delete a record."""
        response = requests.delete(f"{self.base_url}/api/v1/records/{record_id}",
                                 headers=self.headers)
        response.raise_for_status()
        return response.json()

# Usage example
api = CivicPressAPI("http://localhost:3000", "clerk")

# List all active bylaws
bylaws = api.list_records(record_type="bylaw", status="active")

# Create new policy
new_policy = api.create_record(
    title="Remote Work Policy",
    record_type="policy",
    content="# Remote Work Policy\n\nEmployees may work remotely...",
    role="clerk"
)
```

### cURL Examples

```bash
#!/bin/bash

API_BASE="http://localhost:3000/api/v1"
API_KEY="clerk"

# List all records
echo "=== Listing all records ==="
curl -s -H "X-API-Key: $API_KEY" "$API_BASE/records" | jq '.'

# List only bylaws
echo "=== Listing bylaws only ==="
curl -s -H "X-API-Key: $API_KEY" "$API_BASE/records?type=bylaw" | jq '.'

# Create new record
echo "=== Creating new record ==="
curl -s -X POST "$API_BASE/records" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $API_KEY" \
  -d '{
    "title": "Test Bylaw",
    "type": "bylaw",
    "content": "# Test Bylaw\n\nThis is a test bylaw.",
    "role": "clerk"
  }' | jq '.'

# Update record status
echo "=== Updating record status ==="
curl -s -X PUT "$API_BASE/records/test-bylaw" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: council" \
  -d '{"status": "proposed"}' | jq '.'
```

## 🔐 Authentication & Authorization

### API Key Authentication

All API requests require an `X-API-Key` header:

```bash
curl -H "X-API-Key: clerk" http://localhost:3000/api/v1/records
```

### Role-based Permissions

| Operation          | clerk   | council | public |
| ------------------ | ------- | ------- | ------ |
| Read records       | ✅      | ✅      | ✅     |
| Create records     | ✅      | ✅      | ❌     |
| Update records     | ✅      | ✅      | ❌     |
| Delete records     | ❌      | ✅      | ❌     |
| Status transitions | Limited | Full    | ❌     |

### Status Transition Rules

```javascript
// Valid transitions by role
const transitions = {
  clerk: {
    'draft': ['proposed']
  },
  council: {
    'proposed': ['reviewed'],
    'reviewed': ['approved', 'archived'],
    'approved': ['archived']
  }
};
```

## 📊 Error Handling

### HTTP Status Codes

- `200` - Success
- `201` - Created
- `400` - Bad Request (validation error)
- `401` - Unauthorized (invalid API key)
- `403` - Forbidden (insufficient permissions)
- `404` - Not Found
- `429` - Too Many Requests (rate limited)
- `500` - Internal Server Error

### Error Response Format

```json
{
  "error": {
    "message": "Invalid record type",
    "details": "Type 'invalid' is not allowed. Valid types: bylaw, policy, proposal, resolution",
    "code": "VALIDATION_ERROR"
  }
}
```

### Common Error Scenarios

```javascript
// Handle rate limiting
try {
  const response = await api.listRecords();
} catch (error) {
  if (error.status === 429) {
    // Wait and retry
    await new Promise(resolve => setTimeout(resolve, 1000));
    return await api.listRecords();
  }
}

// Handle permission errors
try {
  await api.deleteRecord('record-id');
} catch (error) {
  if (error.status === 403) {
    console.log('Insufficient permissions to delete this record');
  }
}

// Handle validation errors
try {
  await api.createRecord({
    title: 'Test',
    type: 'invalid-type' // This will fail
  });
} catch (error) {
  if (error.status === 400) {
    console.log('Validation error:', error.details);
  }
}
```

## 🔄 Workflow Integration

### Status Management

```javascript
// Move record through workflow
async function processRecord(recordId, targetStatus) {
  const record = await api.getRecord(recordId);

  // Validate transition
  const validTransitions = {
    'draft': ['proposed'],
    'proposed': ['reviewed', 'archived'],
    'reviewed': ['approved', 'archived'],
    'approved': ['archived']
  };

  const currentStatus = record.status;
  const allowedTransitions = validTransitions[currentStatus] || [];

  if (!allowedTransitions.includes(targetStatus)) {
    throw new Error(`Invalid transition from ${currentStatus} to ${targetStatus}`);
  }

  return await api.updateRecord(recordId, { status: targetStatus });
}

// Example workflow
await processRecord('new-bylaw', 'proposed');  // clerk submits
await processRecord('new-bylaw', 'reviewed');  // council reviews
await processRecord('new-bylaw', 'approved');  // council approves
```

### Batch Operations

```javascript
// Update multiple records
async function updateMultipleRecords(updates) {
  const results = [];

  for (const update of updates) {
    try {
      const result = await api.updateRecord(update.id, update.changes);
      results.push({ id: update.id, success: true, data: result });
    } catch (error) {
      results.push({ id: update.id, success: false, error: error.message });
    }
  }

  return results;
}

// Example batch update
const updates = [
  { id: 'bylaw-1', changes: { status: 'proposed' } },
  { id: 'bylaw-2', changes: { status: 'approved' } },
  { id: 'policy-1', changes: { content: 'Updated content' } }
];

const results = await updateMultipleRecords(updates);
```

## 📈 Performance & Best Practices

### Pagination

```javascript
// Handle large datasets with pagination
async function getAllRecords(options = {}) {
  const allRecords = [];
  let offset = 0;
  const limit = options.limit || 100;

  while (true) {
    const response = await api.listRecords({
      ...options,
      limit,
      offset
    });

    allRecords.push(...response.records);

    if (response.records.length < limit) {
      break; // No more records
    }

    offset += limit;
  }

  return allRecords;
}
```

### Caching

```javascript
// Simple caching for frequently accessed data
class CachedCivicPressAPI extends CivicPressAPI {
  constructor(baseUrl, apiKey, cacheTimeout = 5 * 60 * 1000) {
    super(baseUrl, apiKey);
    this.cache = new Map();
    this.cacheTimeout = cacheTimeout;
  }

  async getRecord(id, type) {
    const cacheKey = `record:${id}:${type || 'any'}`;
    const cached = this.cache.get(cacheKey);

    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      return cached.data;
    }

    const data = await super.getRecord(id, type);
    this.cache.set(cacheKey, {
      data,
      timestamp: Date.now()
    });

    return data;
  }
}
```

### Error Retry Logic

```javascript
// Retry failed requests
async function withRetry(fn, maxRetries = 3, delay = 1000) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt === maxRetries) {
        throw error;
      }

      if (error.status === 429) {
        // Rate limited - wait longer
        await new Promise(resolve => setTimeout(resolve, delay * attempt));
      } else if (error.status >= 500) {
        // Server error - retry
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        // Client error - don't retry
        throw error;
      }
    }
  }
}

// Usage
const records = await withRetry(() => api.listRecords());
```

## 🧪 Testing

### Unit Tests

```javascript
// Example test using Jest
describe('CivicPress API', () => {
  let api;

  beforeEach(() => {
    api = new CivicPressAPI('http://localhost:3000', 'test-key');
  });

  test('should list records', async () => {
    const records = await api.listRecords();
    expect(records).toHaveProperty('records');
    expect(Array.isArray(records.records)).toBe(true);
  });

  test('should create record', async () => {
    const newRecord = await api.createRecord({
      title: 'Test Record',
      type: 'bylaw',
      content: '# Test\n\nContent'
    });

    expect(newRecord).toHaveProperty('id');
    expect(newRecord.title).toBe('Test Record');
  });
});
```

### Integration Tests

```javascript
// Test complete workflow
test('should handle complete record lifecycle', async () => {
  // Create record
  const record = await api.createRecord({
    title: 'Test Bylaw',
    type: 'bylaw',
    content: '# Test\n\nContent'
  });

  expect(record.status).toBe('draft');

  // Update status
  const updated = await api.updateRecord(record.id, { status: 'proposed' });
  expect(updated.status).toBe('proposed');

  // Verify in list
  const records = await api.listRecords({ status: 'proposed' });
  expect(records.records.some(r => r.id === record.id)).toBe(true);

  // Clean up
  await api.deleteRecord(record.id);
});
```

## 🔧 Configuration

### Environment Variables

```bash
# API Configuration
CIVIC_DATA_DIR=/path/to/civicpress/data
API_PORT=3000
API_HOST=localhost
API_CORS_ORIGIN=*

# Rate Limiting
API_RATE_LIMIT_WINDOW_MS=900000  # 15 minutes
API_RATE_LIMIT_MAX=100

# Authentication
API_ENABLE_AUTH=true
API_JWT_SECRET=your-secret-key
```

### Docker Configuration

```dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY dist ./dist

ENV NODE_ENV=production
ENV CIVIC_DATA_DIR=/data

EXPOSE 3000

CMD ["node", "dist/index.js"]
```

```yaml
# docker-compose.yml
version: '3.8'
services:
  civicpress-api:
    build: ./modules/api
    ports:
      - "3000:3000"
    environment:
      - CIVIC_DATA_DIR=/data
    volumes:
      - ./data:/data
```

## 📚 Additional Resources

- [API Reference Documentation](api.md)
- [CivicPress Core Documentation](../core/README.md)
- [CLI Documentation](../cli/README.md)
- [Workflow Configuration Guide](workflows.md)

## 🤝 Support

For questions or issues:

1. Check the troubleshooting section in the API README
2. Review the error logs and status codes
3. Test with the provided examples
4. Open an issue on the GitHub repository

---

_This guide covers the essential aspects of integrating with the CivicPress API.
For advanced features and detailed specifications, refer to the full API
documentation._
