# 📋 CivicPress Record Format Standard

**Version**: 1.0.0  
**Status**: Official Standard  
**Last Updated**: January 2025

## 🎯 Purpose

This document defines the **official standardized format** for all civic record markdown files in CivicPress. Since markdown files are the **source of truth** for all records, this format ensures consistency, machine-readability, and human-readability across all record types.

## 📌 Core Principles

1. **Source of Truth**: Markdown files take precedence over database entries
2. **Human-Readable**: Clear, logical field organization with section comments
3. **Machine-Parseable**: Valid YAML, consistent data types, standard formats
4. **Extensible**: Optional fields allow for future needs without breaking changes
5. **Consistent**: Same structure applies to all record types

## 📝 Standard Format Structure

All civic records follow this structure:

```yaml
---
# ============================================
# CORE IDENTIFICATION (Required)
# ============================================
id: "record-1757087424779"
title: "Noise Restrictions Bylaw"
type: bylaw|ordinance|policy|proclamation|resolution|geography|session
status: draft|pending_review|under_review|approved|published|rejected|archived|expired

# ============================================
# AUTHORSHIP & ATTRIBUTION (Required)
# ============================================
author: "username"
authors:
  - name: "Marie-Claude Tremblay"
    username: "mc.tremblay"
    role: "clerk"
    email: "mc.tremblay@richmond.qc.ca"

# ============================================
# TIMESTAMPS (Required)
# ============================================
created: "2025-01-15T10:30:00Z"
updated: "2025-01-15T10:30:00Z"

# ============================================
# CLASSIFICATION (Optional but recommended)
# ============================================
tags: ["noise", "nighttime", "curfew"]
module: "legal-register"
slug: "noise-restrictions"
version: "1.0.0"
priority: low|medium|high
department: "planning"

# ============================================
# SOURCE & ORIGIN (Optional - for imported/legacy documents)
# ============================================
source:
  reference: "LEG-2024-001"  # Required: Original document identifier/reference
  original_title: "Original Document Title"  # Optional: Original title from source system
  original_filename: "ORD-2024-001.pdf"  # Optional: Original filename from source system
  url: "https://legacy.example.com/documents/LEG-2024-001"  # Optional: Link to original document
  type: legacy|import|external  # Optional: Source type
  imported_at: "2025-01-15T10:30:00Z"  # Optional: When imported
  imported_by: "admin"  # Optional: Who imported it

# ============================================
# TYPE-SPECIFIC FIELDS (Optional)
# ============================================
# For geography type:
geography_data: {...}
category: zone|boundary|district|facility|route

# For session type:
session_type: regular|emergency|special
date: "2025-07-03T19:00:00Z"
duration: 120
location: "Town Hall Council Chamber"
attendees: [...]
topics: [...]
media: {...}

# ============================================
# RELATIONSHIPS (Optional)
# ============================================
linked_records:
  - id: "record-1234567890"
    type: "policy"
    description: "Related noise policy"
    category: "related"

linked_geography_files:
  - id: "geo-001"
    name: "Residential Zone Boundaries"
    description: "Zone boundaries for this bylaw"

# ============================================
# SPATIAL DATA (Optional)
# ============================================
geography:
  srid: 4326
  zone_ref: "mtl:zone:res-R1"
  bbox: [-73.65, 45.45, -73.52, 45.55]
  center:
    lon: -73.58
    lat: 45.50

# ============================================
# FILE ATTACHMENTS (Optional)
# ============================================
attached_files:
  - id: "uuid-12345"
    path: "storage/reference/noise-study.pdf"
    original_name: "Noise Impact Study.pdf"
    description: "Environmental impact assessment"
    category: "reference"

# ============================================
# SOURCE & ORIGIN (Optional - for imported/legacy documents)
# ============================================
source:
  reference: "LEG-2024-001"  # Required: Original document identifier/reference
  original_title: "Original Document Title"  # Optional: Original title from source system
  original_filename: "ORD-2024-001.pdf"  # Optional: Original filename from source system
  url: "https://legacy.example.com/documents/LEG-2024-001"  # Optional: Link to original document
  type: legacy|import|external  # Optional: Source type
  imported_at: "2025-01-15T10:30:00Z"  # Optional: When imported
  imported_by: "admin"  # Optional: Who imported it

# ============================================
# ADDITIONAL METADATA (Optional)
# ============================================
metadata:
  approval_date: "2025-03-01T00:00:00Z"
  effective_date: "2025-04-01T00:00:00Z"
  expiry_date: null
  review_date: "2026-04-01T00:00:00Z"
  reviewed_by: "council"

---

# Document Content

The markdown content of the record goes here...
```

## 📊 Field Definitions

### Core Identification (Required)

| Field | Type | Required | Description | Validation |
|-------|------|----------|-------------|------------|
| `id` | string | ✅ | Unique record identifier | Alphanumeric, hyphens, underscores |
| `title` | string | ✅ | Human-readable title | Non-empty, max 500 chars |
| `type` | string | ✅ | Record type | One of: `bylaw`, `ordinance`, `policy`, `proclamation`, `resolution`, `geography`, `session` |
| `status` | string | ✅ | Current status | One of: `draft`, `pending_review`, `under_review`, `approved`, `published`, `rejected`, `archived`, `expired` |

### Authorship & Attribution (Required)

| Field | Type | Required | Description | Validation |
|-------|------|----------|-------------|------------|
| `author` | string | ✅ | Primary author username | Non-empty string |
| `authors` | array | ❌ | Detailed author information | Array of author objects |

**Author Object Structure:**
```yaml
authors:
  - name: "Full Name"        # Required
    username: "username"      # Required
    role: "clerk"            # Optional
    email: "email@example.com"  # Optional
```

### Timestamps (Required)

| Field | Type | Required | Format | Description |
|-------|------|----------|--------|-------------|
| `created` | string | ✅ | ISO 8601 | Creation timestamp (e.g., `"2025-01-15T10:30:00Z"`) |
| `updated` | string | ✅ | ISO 8601 | Last update timestamp (e.g., `"2025-02-01T14:20:00Z"`) |

**Format**: ISO 8601 with timezone (`YYYY-MM-DDTHH:mm:ssZ`)

### Classification (Optional)

| Field | Type | Required | Description | Example |
|-------|------|----------|-------------|---------|
| `tags` | array | ❌ | Array of tag strings | `["noise", "nighttime"]` |
| `module` | string | ❌ | Module identifier | `"legal-register"` |
| `slug` | string | ❌ | URL-friendly identifier | `"noise-restrictions"` |
| `version` | string | ❌ | Version number | `"1.0.0"` |
| `priority` | string | ❌ | Priority level | `low`, `medium`, `high` |
| `department` | string | ❌ | Department name | `"planning"` |

### Source & Origin (Optional - for imported/legacy documents)

| Field | Type | Required | Description | Example |
|-------|------|----------|-------------|---------|
| `source` | object | ❌ | Source information for imported/legacy documents | See below |

**Source Object Structure:**
```yaml
source:
  reference: "LEG-2024-001"  # Required: Original document identifier/reference
  url: "https://..."  # Optional: Link to original document
  type: legacy|import|external  # Optional: Source type
  imported_at: "2025-01-15T10:30:00Z"  # Optional: ISO 8601 import timestamp
  imported_by: "admin"  # Optional: Username who imported it
```

**Source Types:**
- `legacy` - Imported from legacy system
- `import` - Imported from another system
- `external` - External reference/document

### Type-Specific Fields (Optional)

#### Geography Type

| Field | Type | Description |
|-------|------|-------------|
| `geography_data` | object | GeoJSON/KML content object |
| `category` | string | Category: `zone`, `boundary`, `district`, `facility`, `route` |

#### Session Type

| Field | Type | Description |
|-------|------|-------------|
| `session_type` | string | Type: `regular`, `emergency`, `special` |
| `date` | string | ISO 8601 meeting date/time |
| `duration` | number | Duration in minutes |
| `location` | string | Meeting location |
| `attendees` | array | Array of attendee objects |
| `topics` | array | Array of topic/discussion items |
| `media` | object | Media links (livestream, recording, etc.) |

### Relationships (Optional)

| Field | Type | Description |
|-------|------|-------------|
| `linked_records` | array | Array of linked record objects |
| `linked_geography_files` | array | Array of linked geography file objects |

**Linked Record Object:**
```yaml
linked_records:
  - id: "record-1234567890"      # Required
    type: "policy"               # Required
    description: "Related policy" # Required
    category: "related"          # Optional: relationship category
```

**Linked Geography File Object:**
```yaml
linked_geography_files:
  - id: "geo-001"                # Required
    name: "Zone Boundaries"      # Required
    description: "Optional description"  # Optional
```

### Spatial Data (Optional)

| Field | Type | Description |
|-------|------|-------------|
| `geography` | object | Geography data object |

**Geography Object Structure:**
```yaml
geography:
  srid: 4326                     # Spatial Reference ID (number)
  zone_ref: "mtl:zone:res-R1"   # Zone reference (string)
  bbox: [-73.65, 45.45, -73.52, 45.55]  # Bounding box [minLon, minLat, maxLon, maxLat]
  center:                        # Center point
    lon: -73.58
    lat: 45.50
```

### File Attachments (Optional)

| Field | Type | Description |
|-------|------|-------------|
| `attached_files` | array | Array of file attachment objects |

**Attachment Object Structure:**
```yaml
attached_files:
  - id: "uuid-12345"             # Required: File UUID
    path: "storage/reference/file.pdf"  # Required: Storage path
    original_name: "Original Name.pdf"  # Required: Original filename
    description: "Optional description"  # Optional
    category: "reference"         # Optional: string or object
```

**Category as Object:**
```yaml
category:
  label: "Financial Documents"
  value: "financial"
  description: "Budget and financial planning documents"
```

### Source & Origin (Optional)

| Field | Type | Required | Description | Example |
|-------|------|----------|-------------|---------|
| `source` | object | ❌ | Source information for imported/legacy documents | See below |

**Source Object Structure:**
```yaml
source:
  reference: "LEG-2024-001"  # Required: Original document identifier/reference
  original_title: "Original Document Title"  # Optional: Original title from source system
  original_filename: "ORD-2024-001.pdf"  # Optional: Original filename from source system
  url: "https://..."  # Optional: Link to original document
  type: legacy|import|external  # Optional: Source type
  imported_at: "2025-01-15T10:30:00Z"  # Optional: ISO 8601 import timestamp
  imported_by: "admin"  # Optional: Username who imported it
```

**Field Details:**
- `reference` - Required unique identifier from source system (e.g., document number, case ID)
- `original_title` - Optional original title (useful when title is changed during import)
- `original_filename` - Optional original filename (helps locate document in legacy systems)
- `url` - Optional direct link to original document location
- `type` - Optional categorization of source (`legacy`, `import`, `external`)
- `imported_at` - Optional timestamp of when import occurred
- `imported_by` - Optional username of person who performed import

**Source Types:**
- `legacy` - Imported from legacy system
- `import` - Imported from another system  
- `external` - External reference/document

**Use Cases:**
- Tracking original document references when importing legacy documents
- Linking to external documents
- Maintaining audit trail of document origin
- Enabling verification and cross-reference to source systems

### Additional Metadata (Optional)

| Field | Type | Description |
|-------|------|-------------|
| `metadata` | object | Additional metadata object |

Common metadata fields:
- `approval_date`: ISO 8601 approval date
- `effective_date`: ISO 8601 effective date
- `expiry_date`: ISO 8601 expiry date (null if none)
- `review_date`: ISO 8601 review date
- `reviewed_by`: Who reviewed the record
- Any other custom fields as needed

## 📚 Record Types

### Supported Record Types

1. **`bylaw`** - Municipal bylaws and regulations
2. **`ordinance`** - Local ordinances and municipal codes
3. **`policy`** - Organizational policies and procedures
4. **`proclamation`** - Official proclamations and declarations
5. **`resolution`** - Resolutions and formal decisions
6. **`geography`** - Geographic data files (GeoJSON/KML)
7. **`session`** - Meeting sessions and minutes

## 📋 Examples

### Minimal Record (Required Fields Only)

```yaml
---
id: "record-1234567890"
title: "Simple Policy"
type: policy
status: draft
author: "admin"
created: "2025-01-15T10:30:00Z"
updated: "2025-01-15T10:30:00Z"
---

# Simple Policy

Content goes here...
```

### Imported/Legacy Record Example

```yaml
---
id: "record-1234567890"
title: "Historical Noise Ordinance"
type: ordinance
status: archived
author: "admin"
created: "2025-01-15T10:30:00Z"
updated: "2025-01-15T10:30:00Z"
source:
  reference: "ORD-1995-042"
  original_title: "Ordinance No. 1995-042 - Noise Control"
  original_filename: "ORD-1995-042-Noise-Control.pdf"
  url: "https://legacy-city-council.example.com/ordinances/1995/ORD-1995-042"
  type: legacy
  imported_at: "2025-01-15T10:30:00Z"
  imported_by: "admin"
tags: ["noise", "legacy", "historical"]
---

# Historical Noise Ordinance

Content imported from legacy system...
```

### Complete Record Example

See the full format structure above for a complete example with all optional fields.

### Geography Record Example

```yaml
---
id: "geo-001"
title: "Residential Zone R1 Boundaries"
type: geography
status: published
author: "admin"
created: "2025-01-15T10:30:00Z"
updated: "2025-01-15T10:30:00Z"
category: zone
geography_data:
  type: "FeatureCollection"
  features:
    - type: "Feature"
      geometry:
        type: "Polygon"
        coordinates: [[[-73.65, 45.45], [-73.52, 45.45], [-73.52, 45.55], [-73.65, 45.55], [-73.65, 45.45]]]
      properties:
        zone: "R1"
        name: "Residential Zone 1"
---

# Residential Zone R1 Boundaries

This geography file defines the boundaries of Residential Zone R1.
```

### Session Record Example

```yaml
---
id: "session-2025-07-03"
title: "Regular Council Meeting - July 3, 2025"
type: session
status: approved
author: "clerk"
created: "2025-07-03T19:00:00Z"
updated: "2025-07-04T10:00:00Z"
session_type: regular
date: "2025-07-03T19:00:00Z"
duration: 120
location: "Town Hall Council Chamber"
attendees:
  - name: "Luc Lapointe"
    role: "Mayor"
    present: true
  - name: "Ada Lovelace"
    role: "Town Clerk"
    present: true
topics:
  - title: "Budget Review 2025"
    decisions: ["Approved with amendments"]
  - title: "Noise Ordinance Amendment"
    decisions: ["Referred to committee"]
media:
  livestream: "https://youtube.com/watch?v=abc123"
  recording: "/storage/sessions/2025-07-03.mp4"
tags: ["budget", "ordinance", "council-meeting"]
---

# Regular Council Meeting - July 3, 2025

## Meeting Minutes

[Meeting content here...]
```

## ✅ Validation Rules

### Required Fields

The following fields are **always required**:
- `id`
- `title`
- `type`
- `status`
- `author`
- `created`
- `updated`

### Field Validation

1. **ID Format**: Alphanumeric, hyphens, underscores only
2. **Timestamps**: Must be valid ISO 8601 format with timezone
3. **Status Values**: Must be one of the allowed status values
4. **Type Values**: Must be one of the supported record types
5. **Arrays**: Must be valid YAML arrays (use `[]` for empty)
6. **Objects**: Must be valid YAML objects (use `{}` for empty)

### Type-Specific Validation

- **Geography records**: Must have `geography_data` or `category`
- **Session records**: Should have `session_type`, `date`, and `location`
- **Linked records**: Must have `id`, `type`, and `description`
- **Attachments**: Must have `id`, `path`, and `original_name`

## 🔄 Migration Notes

### From Old Format

When migrating existing records:

1. **Date Fields**: Convert `created`/`updated` date strings to ISO 8601 timestamps
2. **Author Fields**: Normalize `author` to string format, move detailed info to `authors` array
3. **Status Values**: Standardize status values to approved list
4. **Metadata**: Move custom fields into `metadata` object
5. **Complex Fields**: Ensure geography, attachments, and linked records are properly structured

### Backward Compatibility

The system should:
- Accept old formats during transition period
- Auto-convert old formats to new format when saving
- Provide migration tools to batch-convert existing records

## 🛠️ Implementation Notes

### Parsing

- Use standard YAML parser (e.g., `js-yaml`, `gray-matter`)
- Validate frontmatter against schema
- Handle missing optional fields gracefully
- Preserve order of fields when writing

### Writing

- Always write in the standard format
- Use logical field ordering (as shown)
- Include section comments for human readability
- Format timestamps consistently (ISO 8601)
- Use proper YAML quoting for strings with special characters

### Database Sync

- Markdown file is source of truth
- Database should sync FROM markdown files
- Updates to database should be written back to markdown
- Conflicts should be resolved in favor of markdown file

## 📖 Related Documentation

- [File Attachment System](./file-attachment-system.md)
- [Linked Records System](./linked-records-system.md)
- [Geography System](./geography-system.md)
- [Validation System](./validation.md)

## 🔗 Changelog

### Version 1.0.0 (January 2025)

- Initial standard format definition
- Support for 7 record types
- Standardized field definitions
- ISO 8601 timestamp format
- Clear field organization with comments

---

**Note**: This is the authoritative specification for CivicPress record formats. All code that reads or writes records must conform to this standard.

