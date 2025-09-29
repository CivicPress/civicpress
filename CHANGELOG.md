# 📋 Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Geography Data Management System**: Complete centralized geography file
  management
  - Text box input system for pasting GeoJSON/KML content with API validation
  - Live preview with Leaflet maps showing parsed data in real-time
  - Public access to geography files at `/geography/` for citizen transparency
  - Geography file linking to civic records (similar to file attachments)
  - Comprehensive data validation (geometry, SRID, bounds, feature count)
  - Interactive maps with Leaflet integration throughout the system
  - Standardized file structure with API-enforced consistency
  - Git versioning through data/ folder for complete audit trail
  - Role-based access control (public view, admin edit, specialized permissions)
  - Support for multiple geography file types (GeoJSON, KML, GPX, Shapefile)
  - Geography file categories (zone, boundary, district, facility, route)
  - Geography relationships management (contains, overlaps, adjacent,
    supersedes)
  - Search and discovery capabilities for geography data
  - Data summary panels with feature counts, bounds, and SRID information
  - Debounced parsing with real-time validation and error feedback
  - File generation with standardized naming and metadata extraction

### Changed

- Enhanced geography data system from simple coordinate storage to full spatial
  document management
- Updated record forms to support both legacy geography fields and new geography
  file linking
- Improved geography validation with comprehensive geometry and metadata
  checking

### Technical Details

- **Core Implementation**: `core/src/geography/geography-manager.ts` with
  complete file management
- **API Endpoints**: `/api/v1/geography/*` for CRUD operations and validation
- **UI Components**: GeographyForm, GeographyMap, GeographySelector,
  GeographyBrowser
- **Database Schema**: New geography files table with metadata and relationships
- **File Storage**: Organized structure in `data/geography/` with category-based
  subdirectories
- **TypeScript Types**: Complete type safety for all geography operations
- **Validation Engine**: Real-time content validation with detailed error
  reporting
- **Map Integration**: Leaflet-based interactive maps with feature highlighting
- **Search System**: Public search by location, category, metadata, and date
- **Access Control**: Granular permissions for different user roles

## [1.0.0] - 2025-07-02

### Fixed

- Initial CivicPress platform foundation
- Monorepo structure with pnpm workspaces
- Core platform modules
- Legal register module
- Agent development context system
- Comprehensive documentation
- Community guidelines and contribution standards
- MIT License
- Development setup scripts
- Prettier formatting configuration
- VS Code/Cursor workspace settings

---

## 📝 Version History

- **1.0.0**: Initial release with core platform architecture
- **Unreleased**: Development and feature additions

## 🔗 Links

- [Contributing Guide](CONTRIBUTING.md)
- [Code of Conduct](CODE_OF_CONDUCT.md)
- [Full Manifesto](https://github.com/CivicPress/manifesto/blob/master/manifesto.md)

---

**For detailed development history, see the
[Git commit log](https://github.com/CivicPress/civicpress/commits/main).**
