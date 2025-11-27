# CivicPress Linked Records System

**Version**: 1.0.0  
**Status**: Production Ready  
**Last Updated**: September 2025

## Overview

The CivicPress Linked Records System allows users to create relationships
between civic records, enabling powerful document linking and reference
management. This system supports various relationship types and provides an
intuitive interface for managing record connections.

## Key Features

### Complete Implementation

- **Record Integration**: Link any record to any other record type
- **Relationship Categorization**: Organize links by relationship type (related,
  supersedes, amends, etc.)
- **Dynamic Categories**: API-driven category loading with configuration support
- **Inline Editing**: Edit descriptions and categories directly in the record
  view
- **Database Persistence**: Links stored in both database and markdown
  frontmatter
- **TypeScript Support**: Full type safety for linked record data structures

### Technical Architecture

- **Database Schema**: New `linked_records` JSON column with automatic migration
- **API Endpoints**: REST endpoints with validation for linked record operations
- **UI Components**: Vue.js components for record selection and link management
- **Configuration**: link-categories.yml for customizable relationship types
- **Authentication**: Secure record access with JWT token validation

## Architecture

### Database Schema

```sql
-- New column added to records table
ALTER TABLE records ADD COLUMN linked_records TEXT;
```

The `linked_records` column stores JSON data with the following structure:

```json
[
  {
    "id": "record-1757087424779",
    "type": "bylaw",
    "description": "This bylaw supersedes the previous version",
    "path": "/records/bylaw/record-1757087424779",
    "category": "supersedes"
  },
  {
    "id": "record-1757095466063",
    "type": "resolution",
    "description": "Related budget resolution",
    "path": "/records/resolution/record-1757095466063",
    "category": "related"
  }
]
```

### API Endpoints

#### Update Record with Linked Records

```http
PUT /api/v1/records/{id}
Content-Type: application/json
Authorization: Bearer {token}

{
  "title": "Updated Record",
  "content": "Record content...",
  "linkedRecords": [
    {
      "id": "record-1757087424779",
      "type": "bylaw",
      "description": "Related bylaw",
      "path": "/records/bylaw/record-1757087424779",
      "category": "related"
    }
  ]
}
```

#### Get Record with Linked Records

```http
GET /api/v1/records/{id}
Authorization: Bearer {token}
```

Response includes the `linkedRecords` array in the record data.

### Configuration System

#### Link Categories Configuration

The system uses `core/src/defaults/link-categories.yml` for relationship types:

```yaml
_metadata:
  name: 'Record Link Categories'
  description: 'Define relationship types between records'
  version: '1.0.0'
  editable: true

categories:
  related:
    label: 'Related'
    description: 'Generally related records'
    value: 'related'
  supersedes:
    label: 'Supersedes'
    description: 'This record replaces another record'
    value: 'supersedes'
  superseded_by:
    label: 'Superseded By'
    description: 'This record is replaced by another record'
    value: 'superseded_by'
  amends:
    label: 'Amends'
    description: 'This record modifies another record'
    value: 'amends'
  amended_by:
    label: 'Amended By'
    description: 'This record is modified by another record'
    value: 'amended_by'
  references:
    label: 'References'
    description: 'This record references another record'
    value: 'references'
  referenced_by:
    label: 'Referenced By'
    description: 'This record is referenced by another record'
    value: 'referenced_by'
  implements:
    label: 'Implements'
    description: 'This record implements another record'
    value: 'implements'
  implemented_by:
    label: 'Implemented By'
    description: 'This record is implemented by another record'
    value: 'implemented_by'
  follows:
    label: 'Follows'
    description: 'This record follows another record chronologically'
    value: 'follows'
  precedes:
    label: 'Precedes'
    description: 'This record precedes another record chronologically'
    value: 'precedes'
  other:
    label: 'Other'
    description: 'Other relationship type'
    value: 'other'
```

## UI Components

### RecordLinkSelector

A modal component for selecting and adding linked records:

```vue
<RecordLinkSelector
  v-model:open="isOpen"
  :existing-links="linkedRecords"
  @update:linked-records="updateLinkedRecords"
/>
```

**Features:**

- Search and filter existing records
- Add multiple records at once
- Set default category for new links
- Validation and error handling

### LinkedRecordList

A component for displaying and managing linked records:

```vue
<LinkedRecordList
  v-model="linkedRecords"
  :editable="true"
  @update:linked-records="updateLinkedRecords"
/>
```

**Features:**

- Display linked records with categories and descriptions
- Inline editing of descriptions and categories
- Dynamic category loading from API
- Remove links functionality
- Responsive design

## Implementation Details

### TypeScript Interfaces

```typescript
interface LinkedRecord {
  id: string;
  type: string;
  description: string;
  path: string;
  category: string;
}

interface CreateRecordRequest {
  title: string;
  content: string;
  type: string;
  status: string;
  linkedRecords?: LinkedRecord[];
  // ... other fields
}

interface UpdateRecordRequest {
  title?: string;
  content?: string;
  status?: string;
  linkedRecords?: LinkedRecord[];
  // ... other fields
}
```

### Core Integration

The `RecordManager` class handles linked records in all CRUD operations:

```typescript
// Create record with linked records
const record = await recordManager.createRecord({
  title: "New Bylaw",
  content: "Bylaw content...",
  linkedRecords: [
    {
      id: "record-123",
      type: "bylaw",
      description: "Related bylaw",
      path: "/records/bylaw/record-123",
      category: "related"
    }
  ]
});

// Update record with linked records
await recordManager.updateRecord(recordId, {
  linkedRecords: updatedLinkedRecords
});
```

### Data Persistence

Linked records are stored in both:

1. **Database**: JSON column for fast querying and API responses
2. **Markdown Frontmatter**: For file-based storage and Git versioning

```yaml
---
id: "record-1757095466063"
title: "New Record"
type: "bylaw"
status: "draft"
linkedRecords: [{"id":"record-1757087424779","type":"bylaw","description":"Related bylaw","path":"/records/bylaw/record-1757087424779","category":"related"}]
---
```

## Usage Examples

### Adding Linked Records via API

```bash
# Create a record with linked records
curl -X POST 'http://localhost:3000/api/v1/records' \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer {token}' \
  -d '{
    "title": "New Bylaw",
    "type": "bylaw",
    "content": "Bylaw content...",
    "linkedRecords": [
      {
        "id": "record-123",
        "type": "bylaw",
        "description": "This bylaw supersedes the previous version",
        "path": "/records/bylaw/record-123",
        "category": "supersedes"
      }
    ]
  }'
```

### Updating Linked Records

```bash
# Update linked records
curl -X PUT 'http://localhost:3000/api/v1/records/record-456' \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer {token}' \
  -d '{
    "linkedRecords": [
      {
        "id": "record-123",
        "type": "bylaw",
        "description": "Updated description",
        "path": "/records/bylaw/record-123",
        "category": "amends"
      }
    ]
  }'
```

## Testing

### Test Coverage

- **API Tests**: Linked record CRUD operations
- **UI Tests**: Component behavior and user interactions
- **Integration Tests**: End-to-end record linking workflows
- **Database Tests**: Data persistence and migration

### Manual Testing

1. **Create Record with Links**: Add linked records during record creation
2. **Edit Links**: Modify descriptions and categories inline
3. **Remove Links**: Delete linked records from records
4. **Category Loading**: Verify dynamic category loading from API
5. **Data Persistence**: Confirm links are saved to database and markdown

## Security Considerations

- **Authentication**: All linked record operations require valid JWT tokens
- **Authorization**: Users can only link records they have access to
- **Validation**: Input validation prevents malicious data injection
- **Audit Trail**: All linked record changes are logged for compliance

## Performance

- **Database**: JSON column provides fast querying and updates
- **API**: Efficient serialization/deserialization of linked records
- **UI**: Lazy loading and pagination for large record lists
- **Caching**: Category data cached for improved performance

## Future Enhancements

### Planned Features

- **Bidirectional Links**: Automatic reverse relationship creation
- **Link Validation**: Prevent circular references and invalid links
- **Bulk Operations**: Link multiple records at once
- **Link Analytics**: Track relationship patterns and usage
- **Advanced Search**: Search by linked record relationships

### Potential Integrations

- **Workflow Engine**: Trigger actions based on record relationships
- **Notification System**: Alert users when linked records change
- **Export Features**: Export relationship maps and diagrams
- **API Webhooks**: Notify external systems of relationship changes

---

**The Linked Records System provides a powerful foundation for managing civic
document relationships, enabling better organization, discovery, and
understanding of how civic records connect and influence each other.**
