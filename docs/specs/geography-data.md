# ️ CivicPress Spec: `geography-data.md`

---

version: 1.0.0 status: draft created: '2025-01-27' updated: '2025-01-27'
deprecated: false sunset_date: null breaking_changes: [] additions:

- centralized geography data management system
- text box input with API validation and file generation
- live preview with Leaflet maps
- public geography file access
- geography data relationships
- standardized geography file structure fixes: [] migration_guide: null
 compatibility: min_civicpress: 1.0.0 max_civicpress: null dependencies: []
 authors:
- 'AI Assistant <ai@civicpress.io>' reviewers:
- 'Development Team'

---

## Name

Geography Data Management System

---

## Purpose

Transform CivicPress from document management to **spatial document management**
by implementing a centralized geography data management system. This system
enables municipalities to manage geographic data (zones, boundaries, districts,
facilities) as first-class citizens, with interactive mapping capabilities and
public transparency.

**Key Goals:**

- Centralize geography file management with public access
- Provide interactive mapping capabilities throughout the platform
- Enable geography data linking to civic records
- Ensure data integrity through validation and standardization
- Support multiple geographic data formats (GeoJSON, KML, GPX)

---

## Scope & Responsibilities

Responsibilities:

- **Centralized Geography Management**: Store and manage geography files in
 `data/geography/`
- **Text Box Input System**: Paste GeoJSON/KML content with API validation and
 file generation
- **Live Preview**: Real-time map preview with Leaflet showing parsed data
- **Public Access**: Geography files accessible at `/geography/` (same level as
 Records)
- **Geography Linking**: Link geography files to civic records (similar to file
 attachments)
- **Data Validation**: Comprehensive validation of geographic data (geometry,
 SRID, bounds)
- **Standardized Structure**: API-enforced consistent data structure and naming
- **Interactive Maps**: Leaflet integration throughout the system
- **Search & Discovery**: Public search by location, category, metadata
- **Role-Based Access**: Public view, admin edit, specialized permissions
- **Git Versioning**: Built-in version control through data/ folder
- **Geography Relationships**: Define relationships between geography files

Out of Scope:

- External GIS system integration (future enhancement)
- Advanced spatial analysis and processing
- Real-time data synchronization with external sources
- Complex cartographic styling and theming
- Mobile-specific mapping features

---

## Inputs & Outputs

| Input | Description | Output | Description |
| ------------------------ | -------------------------------- | ------------------------ | ------------------------------------------------------------------------------------------- |
| GeoJSON content | Pasted GeoJSON data in text box | Validated geography file | Saved to `data/geography/{category}/{name}-{id}.md` (markdown format with YAML frontmatter) |
| KML content | Pasted KML data in text box | Converted markdown file | Converted and saved with metadata in markdown format |
| Geography metadata | Name, category, description | Markdown file | Metadata stored in YAML frontmatter within .md file |
| Manual coordinates | SRID, zone_ref, bbox, center | Record geography data | Linked to geography files |
| Geography file selection | Browse and select existing files | Linked geography | Added to record geography section |

---

## File/Folder Location

```
data/
├── geography/ # Geography files (git versioned, markdown format)
│ ├── zones/ # Zoning data (.md files)
│ ├── boundaries/ # Municipal boundaries (.md files)
│ ├── districts/ # Administrative districts (.md files)
│ ├── facilities/ # Public facilities (.md files)
│ └── routes/ # Route data (.md files)
├── records/ # Existing civic records
└── .civic/ # Platform configuration

modules/
├── ui/
│ └── app/
│ ├── pages/
│ │ └── geography/ # Geography management pages
│ │ ├── index.vue # Geography files list (public)
│ │ ├── create.vue # Create geography file (admin)
│ │ └── [id]/
│ │ ├── index.vue # View geography file with map
│ │ └── edit.vue # Edit geography file (admin)
│ └── components/
│ ├── GeographyForm.vue # Text box input with live preview
│ ├── GeographyBrowser.vue # Browse existing geography files
│ ├── GeographyMap.vue # Leaflet map component
│ └── GeographySummary.vue # Data summary panel
├── api/
│ └── src/
│ ├── routes/
│ │ └── geography.ts # Geography CRUD API endpoints
│ └── services/
│ └── geography-service.ts # Geography data management service
└── core/
 └── src/
 ├── geography/
 │ ├── geography-manager.ts # Core geography management
 │ ├── geography-validator.ts # Data validation logic
 │ └── geography-types.ts # TypeScript interfaces
 └── types/
 └── geography.ts # Geography data types
```

---

## ️ Architecture Overview

### Text Box Input System

```
┌─────────────────────────────────────────────────────────────┐
│ Geography File Name: [Residential Zones] │
│ Category: [Zone ▼] │
│ Description: [Residential zoning boundaries...] │
│ │
│ ┌─────────────────────────┐ ┌─────────────────────────┐ │
│ │ Paste GeoJSON/KML here │ │ Live Map Preview │ │
│ │ { │ │ │ │
│ │ "type": "Feature...", │ │ ️ Interactive Map │ │
│ │ "features": [ │ │ │ │
│ │ { │ │ • Shows geometry │ │
│ │ "type": "Feature",│ │ • Real-time updates │ │
│ │ "geometry": { │ │ • Zoom to bounds │ │
│ │ "type": "Polygon│ │ • Feature highlighting │ │
│ │ "coordinates": │ │ │ │
│ │ } │ │ Data Summary │ │
│ │ } │ │ • Features: 3 │ │
│ │ ] │ │ • Bounds: [-73.6, 45.4]│ │
│ │ } │ │ • SRID: 4326 │ │
│ └─────────────────────────┘ └─────────────────────────┘ │
│ │
│ [Validate & Save] [Clear] [Copy to Clipboard] │
└─────────────────────────────────────────────────────────────┘
```

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

---

## Technical Implementation

### Geography File Structure

```typescript
interface GeographyFile {
 id: string; // Unique identifier
 name: string; // Human-readable name
 type: 'geojson' | 'kml' | 'gpx' | 'shapefile';
 category: 'zone' | 'boundary' | 'district' | 'facility' | 'route';
 description: string;
 srid: number; // Spatial reference system
 bounds: BoundingBox; // Geographic extent
 metadata: {
 source: string; // Data source
 created: string; // Creation date
 updated: string; // Last modified
 version: string; // Data version
 accuracy: string; // Data accuracy level
 };
 file_path: string; // Path to actual file
 preview_image?: string; // Thumbnail for admin interface
}

interface GeographyRelationship {
 type: 'contains' | 'overlaps' | 'adjacent' | 'supersedes';
 source: string; // geography file ID
 target: string; // geography file ID
 description: string;
 created: string;
}
```

### Record Integration

```typescript
// OLD: Embedded geography attachments
geography: {
 attachments: [{ id: "uuid", path: "file.pdf", role: "map" }]
}

// NEW: Linked geography files
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
```

### API Endpoints

```typescript
// Geography CRUD operations
GET /api/v1/geography // List geography files
POST /api/v1/geography // Create geography file
GET /api/v1/geography/:id // Get geography file
PUT /api/v1/geography/:id // Update geography file
DELETE /api/v1/geography/:id // Delete geography file

// Geography relationships
GET /api/v1/geography/:id/relationships // Get relationships
POST /api/v1/geography/:id/relationships // Create relationship
DELETE /api/v1/geography/:id/relationships/:relId // Delete relationship

// Geography search
GET /api/v1/geography/search // Search geography files
GET /api/v1/geography/spatial // Spatial search
```

---

## User Interface Design

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

---

## Security & Trust Considerations

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

---

## Testing & Validation

### Geography Data Validation

```typescript
// Test geography data validation
export class GeographyValidationTests {
 async testGeometryValidation(): Promise<TestResult[]> {
 return [
 await this.testValidGeoJSON(),
 await this.testInvalidGeometry(),
 await this.testSRIDValidation(),
 await this.testBoundsValidation(),
 ];
 }

 private async testValidGeoJSON(): Promise<TestResult> {
 const validGeoJSON = {
 type: "FeatureCollection",
 features: [{
 type: "Feature",
 geometry: {
 type: "Polygon",
 coordinates: [[[-73.6, 45.4], [-73.5, 45.4], [-73.5, 45.5], [-73.6, 45.5], [-73.6, 45.4]]]
 },
 properties: { name: "Test Zone" }
 }]
 };

 const validation = await this.validateGeographyData(validGeoJSON);

 return {
 test: 'Valid GeoJSON Validation',
 passed: validation.valid,
 details: { validGeoJSON, validation },
 };
 }

 private async testInvalidGeometry(): Promise<TestResult> {
 const invalidGeoJSON = {
 type: "FeatureCollection",
 features: [{
 type: "Feature",
 geometry: {
 type: "Polygon",
 coordinates: [[[-73.6, 45.4], [-73.5, 45.4]]] // Invalid: not closed
 },
 properties: { name: "Invalid Zone" }
 }]
 };

 const validation = await this.validateGeographyData(invalidGeoJSON);

 return {
 test: 'Invalid Geometry Validation',
 passed: !validation.valid && validation.errors.length > 0,
 details: { invalidGeoJSON, validation },
 };
 }
}
```

### Live Preview Testing

```typescript
// Test live preview functionality
export class LivePreviewTests {
 async testLivePreview(): Promise<TestResult[]> {
 return [
 await this.testDebouncedParsing(),
 await this.testMapUpdates(),
 await this.testErrorHandling(),
 await this.testDataSummary(),
 ];
 }

 private async testDebouncedParsing(): Promise<TestResult> {
 const testContent = '{"type": "FeatureCollection", "features": []}';
 const startTime = Date.now();

 await this.triggerDebouncedParsing(testContent);
 const endTime = Date.now();

 const delay = endTime - startTime;
 const expectedDelay = 500; // 500ms debounce

 return {
 test: 'Debounced Parsing',
 passed: delay >= expectedDelay && delay < expectedDelay + 100,
 details: { delay, expectedDelay },
 };
 }
}
```

### Integration Testing

```typescript
// Test integration with record system
export class IntegrationTests {
 async testRecordIntegration(): Promise<TestResult[]> {
 return [
 await this.testGeographyLinking(),
 await this.testRecordFormIntegration(),
 await this.testMapDisplay(),
 ];
 }

 private async testGeographyLinking(): Promise<TestResult> {
 const geographyFile = await this.createTestGeographyFile();
 const record = await this.createTestRecord();

 const linkResult = await this.linkGeographyToRecord(record.id, geographyFile.id);

 return {
 test: 'Geography Linking',
 passed: linkResult.success,
 details: { geographyFile, record, linkResult },
 };
 }
}
```

---

## Implementation Phases

### Phase 1: Core Text Box System

1. **Create `/geography` section** (public access)
2. **Build text box interface** for pasting GeoJSON/KML
3. **Implement API validation** and file generation
4. **Add basic map preview** with Leaflet
5. **Create geography file listing** page

### Phase 2: Enhanced Features

1. **Add geography relationships** management
2. **Implement search and filtering**
3. **Add role-based permissions**
4. **Create geography browser** for record forms
5. **Update record forms** to use geography linking

### Phase 3: Advanced Features

1. **Add geography data analytics**
2. **Implement advanced search** (spatial, temporal)
3. **Add geography data validation** tools
4. **Create geography data templates**

### Phase 4: Future Enhancements

1. **Import/export functionality**
2. **External system integration**
3. **Advanced analytics and reporting**
4. **Disaster recovery features**

---

## Future Enhancements

### Import/Export Capabilities

- **Bulk Import**: Upload multiple geography files at once
- **Format Conversion**: Convert between GeoJSON, KML, Shapefile
- **Data Export**: Export geography data for external systems
- **API Integration**: Import from external municipal data sources

### Advanced Analytics

- **Coverage Analysis**: What areas are covered by which regulations
- **Gap Analysis**: Identify areas without regulations
- **Impact Analysis**: How new geography data affects existing records
- **Usage Statistics**: Which geography data is most referenced

### External System Integration

- **GIS Integration**: Connect with existing municipal GIS systems
- **CAD Integration**: Import from CAD systems
- **Survey Data**: Import from survey systems
- **Real-time Updates**: Sync with external data sources

---

## Related Specs

- [`storage.md`](./storage.md) — File storage and management
- [`records.md`](./records.md) — Civic record management
- [`api.md`](./api.md) — REST API design
- [`ui.md`](./ui.md) — User interface architecture
- [`permissions.md`](./permissions.md) — Role-based access control

---

## History

- **Drafted**: 2025-01-27
- **Status**: Draft - Ready for implementation
- **Next Review**: After Phase 1 implementation
