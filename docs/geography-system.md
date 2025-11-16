# Geography Data Management System

**Last Updated**: January 2025  
**Status**: ✅ **Fully Implemented and Tested**

## Overview

The Geography Data Management System transforms CivicPress from document
management to **spatial document management** by implementing a centralized
geography data management system. This system enables municipalities to manage
geographic data (zones, boundaries, districts, facilities) as first-class
citizens, with interactive mapping capabilities and public transparency.

## Key Features

### 🌍 **Centralized Geography Management**

- **File Storage**: Geography files stored in `data/geography/` with organized
  category structure
- **Public Access**: Geography files accessible at `/geography/` for citizen
  transparency
- **Git Versioning**: Built-in version control through data/ folder for complete
  audit trail
- **Role-Based Access**: Public view, admin edit, specialized permissions

### 📝 **Text Box Input System**

- **Content Pasting**: Paste GeoJSON/KML content directly into text area
- **API Validation**: Real-time validation of content (JSON structure, geometry
  validity)
- **Metadata Extraction**: Automatic extraction of bounds, SRID, feature count
- **File Generation**: Standardized filename generation based on name + category
- **Live Preview**: Real-time map preview with Leaflet showing parsed data
- **Error Feedback**: Real-time validation with detailed error messages

### 🗺️ **Interactive Mapping**

- **Leaflet Integration**: Interactive maps throughout the system
- **Feature Highlighting**: Visual display of geographic features
- **Bounds Calculation**: Automatic zoom to data bounds
- **Data Summary**: Feature count, bounds, SRID information panels
- **Real-time Updates**: Map updates as content changes

### 🔗 **Record Integration**

- **Geography Linking**: Link geography files to civic records (similar to file
  attachments)
- **Legacy Support**: Maintains backward compatibility with existing geography
  fields
- **Dual System**: Both legacy coordinate fields and new geography file linking
- **Seamless Migration**: Gradual transition from old to new system

## Architecture

### File Structure

```
data/
├── geography/                 # Geography files (git versioned)
│   ├── geojson/              # GeoJSON files (.md with embedded GeoJSON)
│   │   ├── zones/            # Zoning data
│   │   ├── boundaries/       # Municipal boundaries
│   │   ├── districts/        # Administrative districts
│   │   └── facilities/       # Public facilities
│   ├── kml/                  # KML files (.md with embedded KML)
│   │   ├── municipal-boundaries/
│   │   └── service-areas/
│   ├── gpx/                  # GPX files (.md with embedded GPX)
│   │   └── routes/
│   └── shp/                  # Shapefile data (.shp, .dbf, .shx)
│       └── cadastral/
├── records/                  # Existing civic records
└── .civic/                   # Platform configuration
```

**File Format**: Geography files are stored in a hybrid markdown format (`.md`)
with:

- **YAML Frontmatter**: Contains metadata (id, name, type, category,
  description, SRID, bounds, timestamps)
- **Code Block**: Contains the raw GeoJSON/KML/GPX content in a fenced code
  block

This format ensures:

- All metadata is versioned alongside the geographic data
- Files are human-readable and editable
- Consistent with CivicPress record format
- Full Git history and audit trail

### API Endpoints

```typescript
// Geography CRUD operations
GET    /api/v1/geography              // List geography files
POST   /api/v1/geography              // Create geography file
GET    /api/v1/geography/:id          // Get geography file
PUT    /api/v1/geography/:id          // Update geography file
DELETE /api/v1/geography/:id          // Delete geography file

// Geography validation
POST   /api/v1/geography/validate     // Validate geography content

// Geography raw content
GET    /api/v1/geography/:id/raw      // Get raw GeoJSON/KML content (for external tools)

// Geography search
GET    /api/v1/geography/search       // Search geography files
```

### Data Types

```typescript
interface GeographyFile {
  id: string;                    // Unique identifier
  name: string;                 // Human-readable name
  type: 'geojson' | 'kml' | 'gpx' | 'shapefile';
  category: 'zone' | 'boundary' | 'district' | 'facility' | 'route';
  description: string;
  srid: number;                 // Spatial reference system
  bounds: BoundingBox;         // Geographic extent
  metadata: {
    source: string;             // Data source
    created: string;            // Creation date
    updated: string;            // Last modified
    version: string;            // Data version
    accuracy: string;           // Data accuracy level
  };
  file_path: string;           // Path to actual file
  preview_image?: string;       // Thumbnail for admin interface
  content?: string;            // Raw file content for display
  created_at: string;
  updated_at: string;
}

interface LinkedGeography {
  geographyId: string;
  role: string;
  description?: string;
}

interface RecordGeography {
  srid: number;
  zone_ref?: string;
  bbox?: BoundingBox;
  center?: CenterCoordinates;
  linkedGeography?: LinkedGeography[];
}
```

## User Interface

### Public Geography Access (`/geography/`)

- **Geography Files List**: Browse all geography files with map previews
- **Search & Filter**: By location, category, metadata, date
- **Map Integration**: Interactive Leaflet maps showing geography data
- **File Details**: View geography file with full map display
- **Download Options**: Export geography data in various formats

### Admin Geography Management

- **Create Geography File**: Text box input with live preview
- **Edit Geography File**: Modify metadata and relationships
- **Delete Geography File**: Remove with confirmation
- **Relationship Management**: Define relationships between geography files
- **Bulk Operations**: Import/export multiple geography files

### Record Form Integration

- **Geography Browser**: Browse and select existing geography files
- **Map Widget**: Show selected geography files on map
- **Manual Coordinates**: Still allow manual SRID, zone_ref, bbox, center entry
- **Linked Geography Display**: Show linked geography files in record view

## Implementation Details

### Core Components

#### GeographyManager (`core/src/geography/geography-manager.ts`)

- **File Management**: Create, read, update, delete geography files
- **Validation Engine**: Comprehensive content validation
- **Metadata Extraction**: Automatic bounds and feature analysis
- **File Organization**: Category-based file structure management

#### API Routes (`modules/api/src/routes/geography.ts`)

- **CRUD Operations**: Complete REST API for geography management
- **Validation Endpoints**: Real-time content validation
- **Search Functionality**: Public search capabilities
- **Error Handling**: Comprehensive error responses

#### UI Components

- **GeographyForm**: Text box input with live preview
- **GeographyMap**: Leaflet-based interactive maps
- **GeographySelector**: Browse and select geography files
- **GeographyBrowser**: File browser for record forms
- **GeographySummary**: Data summary panels

### Data Flow

```
1. User pastes GeoJSON/KML content
   ↓
2. Debounced parsing (500ms delay)
   ↓
3. JSON/KML validation and parsing
   ↓
4. Geometry validation (check for valid geometries)
   ↓
5. Map update with new data
   ↓
6. Summary update with statistics
   ↓
7. Error display if validation fails
   ↓
8. Save to data/geography/ with metadata
   ↓
9. Create database record with relationships
```

### Validation System

```typescript
interface GeographyValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  metadata?: {
    featureCount: number;
    bounds: BoundingBox;
    srid: number;
    geometryTypes: string[];
  };
}
```

## Usage Examples

### Creating a Geography File

```typescript
// Frontend form submission
const geographyData = {
  name: "Residential Zones",
  type: "geojson",
  category: "zone",
  description: "Residential zoning boundaries for the city",
  content: `{
    "type": "FeatureCollection",
    "features": [
      {
        "type": "Feature",
        "geometry": {
          "type": "Polygon",
          "coordinates": [[[-73.6, 45.4], [-73.5, 45.4], [-73.5, 45.5], [-73.6, 45.5], [-73.6, 45.4]]]
        },
        "properties": { "name": "R1 Zone" }
      }
    ]
  }`,
  srid: 4326
};

// POST /api/v1/geography
const response = await fetch('/api/v1/geography', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(geographyData)
});
```

### Linking Geography to Records

```typescript
// Record with linked geography
const recordData = {
  title: "Noise Control — Residential Zones",
  type: "bylaw",
  content: "Content here...",
  geography: {
    srid: 4326,
    zone_ref: "mtl:zone:res-R1",
    bbox: [-73.65, 45.45, -73.52, 45.55],
    center: { lon: -73.58, lat: 45.50 },
    linkedGeography: [
      {
        geographyId: "geo-001",
        role: "zone-boundary",
        description: "Residential zone boundaries"
      }
    ]
  }
};
```

### Frontend Form Integration

```vue
<template>
  <div class="space-y-6">
    <!-- Legacy Geography Fields -->
    <div class="space-y-4">
      <h3 class="text-lg font-medium">Manual Geography Data</h3>
      <UFormField label="Zone Reference">
        <UInput v-model="form.geography.zone_ref" placeholder="e.g., mtl:zone:res-R1" />
      </UFormField>
      <!-- ... other legacy fields ... -->
    </div>

    <!-- New Geography File Linking -->
    <div class="space-y-4">
      <h3 class="text-lg font-medium">Linked Geography Files</h3>
      <GeographyBrowser
        v-model="form.geography.linkedGeography"
        :categories="['zone', 'boundary', 'district']"
      />
    </div>
  </div>
</template>
```

## Security & Access Control

### Access Control

- **Public Access**: Geography files visible to citizens for transparency
- **Admin Permissions**: Only admins can create/edit/delete geography files
- **Role-Based Access**: Different permissions for different user roles
- **Data Validation**: Comprehensive validation prevents malicious data

### Data Integrity

- **Git Versioning**: All geography files version controlled through git
- **Validation**: Geometry validation prevents invalid data
- **Standardization**: API enforces consistent data structure
- **Audit Trail**: Complete history of geography data changes

### Privacy Considerations

- **Public Data**: Geography data is public by nature (municipal boundaries)
- **Sensitive Data**: No personal or sensitive information in geography files
- **Data Source**: Track data source and accuracy for transparency

## Testing

### Test Coverage

- **Unit Tests**: Geography validation and utility functions
- **Integration Tests**: API endpoints with geography data
- **UI Tests**: Component behavior and user interactions
- **Database Tests**: Schema migration and data persistence
- **Validation Tests**: Content validation and error handling

### Test Commands

```bash
# Run geography-specific tests
pnpm run test:run -- tests/core/geography.test.ts
pnpm run test:run -- tests/api/geography.test.ts
pnpm run test:run -- tests/ui/geography.test.ts

# Run all tests
pnpm run test:run
```

## Migration to Markdown Format

Geography files are now stored in a hybrid markdown format (`.md`) instead of
raw GeoJSON/KML files. This ensures all metadata (name, description, category,
bounds, etc.) is versioned alongside the geographic data.

### Migration Script

A migration script is available to convert existing raw geography files to the
new markdown format:

```bash
# Dry run to see what would be migrated
node scripts/migrate-geography-to-markdown.mjs --dry-run

# Run the migration
node scripts/migrate-geography-to-markdown.mjs

# Use custom data directory
node scripts/migrate-geography-to-markdown.mjs --data-dir /path/to/data
```

**What the migration does:**

- Converts `.geojson`, `.kml`, and `.gpx` files to `.md` format
- Extracts metadata from filenames and directory paths
- Preserves all geographic content in code blocks
- Calculates bounds from GeoJSON data
- Generates proper YAML frontmatter with all required fields

**After migration:**

- Old raw files are deleted (backup recommended)
- New `.md` files are created with complete metadata
- Files are ready for Git versioning
- API and UI continue to work seamlessly

## Migration from Legacy System

### Backward Compatibility

The new geography system maintains full backward compatibility with the legacy
geography fields:

- **Legacy Fields**: SRID, zone_ref, bbox, center, attachments continue to work
- **Dual Support**: Records can use both legacy fields and new geography file
  linking
- **Gradual Migration**: Organizations can migrate at their own pace
- **Data Preservation**: No existing geography data is lost

### Migration Strategy

1. **Phase 1**: Deploy new system alongside legacy system
2. **Phase 2**: Create geography files for existing geographic data
3. **Phase 3**: Update records to link to geography files
4. **Phase 4**: Deprecate legacy fields (future enhancement)

## Future Enhancements

### Planned Features

- **Import/Export**: Bulk import/export of geography files
- **Format Conversion**: Convert between GeoJSON, KML, Shapefile
- **Advanced Search**: Spatial search and proximity queries
- **Analytics**: Usage statistics and coverage analysis
- **External Integration**: Connect with existing GIS systems

### Advanced Capabilities

- **Spatial Analysis**: Coverage analysis and gap identification
- **Real-time Updates**: Sync with external data sources
- **Mobile Support**: Mobile-specific mapping features
- **Advanced Styling**: Custom cartographic styling and theming

## Related Documentation

- [Geography Data Spec](specs/geography-data.md) - Complete specification
- [API Reference](api.md) - REST API documentation
- [UI Components](ui.md) - Frontend development guide
- [Record Management](records.md) - Record system integration
- [Security System](security-system.md) - Access control and permissions
