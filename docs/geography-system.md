# Geography Data System

**Last Updated**: January 2025  
**Status**: ✅ **Fully Implemented and Tested**

## Overview

The Geography Data System provides comprehensive spatial data support for
CivicPress records, enabling users to associate geographic information with
civic records such as bylaws, policies, and resolutions.

## Features

### 🌍 **Spatial Data Types**

- **SRID (Spatial Reference System ID)**: Coordinate system identifier (default:
  4326 for WGS84)
- **Zone Reference**: Human-readable zone identifier (e.g., "mtl:zone:res-R1")
- **Center Coordinates**: Longitude and latitude of the geographic center
- **Bounding Box**: Array of 4 coordinates [minLon, minLat, maxLon, maxLat]
- **Attachments**: Associated files with roles and descriptions

### 🗄️ **Data Persistence**

- **Database Storage**: Geography data stored in SQLite `geography` column
- **Markdown Frontmatter**: Geography data embedded in record Markdown files
- **Automatic Migration**: Existing databases automatically upgraded with
  `ALTER TABLE`
- **Backward Compatibility**: Records without geography data continue to
  function

### 🔧 **Validation & Processing**

- **Coordinate Validation**: Longitude (-180 to 180), Latitude (-90 to 90)
- **Bounding Box Logic**: Ensures min < max for both longitude and latitude
- **SRID Validation**: Supports standard spatial reference systems
- **Optional Fields**: Geography data only saved when meaningful content exists

## Usage

### Frontend Forms

Geography fields are available in the record creation and editing forms:

```vue
<!-- Geography Section -->
<div class="space-y-4">
  <UFormField label="Zone Reference">
    <UInput v-model="form.geography.zone_ref" placeholder="e.g., mtl:zone:res-R1" />
  </UFormField>

  <div class="grid grid-cols-2 gap-4">
    <UFormField label="Center Longitude">
      <UInput v-model.number="form.geography.center.lon" type="number" step="0.000001" />
    </UFormField>
    <UFormField label="Center Latitude">
      <UInput v-model.number="form.geography.center.lat" type="number" step="0.000001" />
    </UFormField>
  </div>

  <UFormField label="Bounding Box">
    <div class="grid grid-cols-4 gap-2">
      <UInput v-model.number="form.geography.bbox[0]" placeholder="Min Lon" />
      <UInput v-model.number="form.geography.bbox[1]" placeholder="Min Lat" />
      <UInput v-model.number="form.geography.bbox[2]" placeholder="Max Lon" />
      <UInput v-model.number="form.geography.bbox[3]" placeholder="Max Lat" />
    </div>
  </UFormField>
</div>
```

### API Integration

Geography data is included in record API requests and responses:

```typescript
// Record creation with geography
const recordData = {
  title: "Noise Control — Residential Zones",
  type: "bylaw",
  content: "Content here...",
  geography: {
    srid: 4326,
    zone_ref: "mtl:zone:res-R1",
    bbox: [-73.65, 45.45, -73.52, 45.55],
    center: { lon: -73.58, lat: 45.50 },
    attachments: []
  }
};

// POST /api/v1/records
const response = await fetch('/api/v1/records', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(recordData)
});
```

### CLI Commands

Three new CLI commands for geography data management:

```bash
# Validate geography data in a record file
civic geography:validate record.md

# Scan all records for geography data
civic geography:scan

# Normalize geography data (fix common issues)
civic geography:normalize record.md
```

## Data Structure

### Geography Object Schema

```typescript
interface Geography {
  srid: number;           // Spatial Reference System ID (default: 4326)
  zone_ref: string;       // Zone reference identifier
  bbox: number[];         // [minLon, minLat, maxLon, maxLat]
  center: {
    lon: number;          // Longitude (-180 to 180)
    lat: number;          // Latitude (-90 to 90)
  };
  attachments: Array<{
    path: string;         // File path
    role: string;         // Attachment role/type
    description?: string; // Optional description
  }>;
}
```

### Database Schema

```sql
-- Geography column added to records table
ALTER TABLE records ADD COLUMN geography TEXT;

-- Geography data stored as JSON string
-- Example: {"srid":4326,"zone_ref":"mtl:zone:res-R1",...}
```

### Markdown Frontmatter

```yaml
---
id: "ca-qc-montreal/bylaws/2025-123"
title: "Noise Control — Residential Zones"
geography:
  srid: 4326
  zone_ref: "mtl:zone:res-R1"
  bbox: [-73.65, 45.45, -73.52, 45.55]
  center:
    lon: -73.58
    lat: 45.50
  attachments:
    - path: "maps/residential-zones.pdf"
      role: "zone-map"
      description: "Residential zone boundaries"
---
Content here...
```

## Implementation Details

### Database Migration

The system automatically handles database schema updates:

```typescript
// In DatabaseAdapter.initialize()
if (!this.hasColumn('records', 'geography')) {
  await this.db.run('ALTER TABLE records ADD COLUMN geography TEXT');
}
```

### Data Flow

1. **Frontend Form** → Geography data entered by user
2. **API Validation** → Server-side validation of geography data
3. **Database Storage** → Geography saved as JSON string in database
4. **Markdown Generation** → Geography included in frontmatter
5. **Record Retrieval** → Geography parsed from database or Markdown

### Error Handling

- **Validation Errors**: Displayed inline in forms
- **Database Errors**: Graceful fallback with user feedback
- **Migration Errors**: Automatic retry and logging
- **Parsing Errors**: Fallback to database data if Markdown parsing fails

## Testing

### Test Coverage

- **Unit Tests**: Geography validation and utility functions
- **Integration Tests**: API endpoints with geography data
- **CLI Tests**: Geography command functionality
- **Database Tests**: Schema migration and data persistence
- **Frontend Tests**: Form validation and data binding

### Test Commands

```bash
# Run geography-specific tests
pnpm run test:run -- tests/cli/geography.test.ts
pnpm run test:run -- tests/core/types/geography.test.ts

# Run all tests
pnpm run test:run
```

## Future Enhancements

### Planned Features

- **Spatial Indexing**: Geographic search and proximity queries
- **Map Integration**: Visual display of geographic data
- **Coordinate Conversion**: Support for additional coordinate systems
- **Geofencing**: Automated actions based on geographic boundaries
- **Import/Export**: Support for standard geographic file formats (GeoJSON, KML)

### Integration Opportunities

- **GIS Systems**: Connect with external geographic information systems
- **Mobile Apps**: Location-based record discovery
- **Analytics**: Geographic distribution analysis of civic records
- **Notifications**: Location-aware civic engagement alerts

## Related Documentation

- [Record Management](records.md)
- [API Reference](api.md)
- [CLI Commands](cli.md)
- [Database Schema](database.md)
- [Frontend Development](ui.md)
