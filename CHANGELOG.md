# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.3] - 2025-01-XX

### Added

- **Account Creation**: User registration page and workflow implemented
  - User registration page (`/auth/register`)
  - Account creation workflow with validation
  - Integration with authentication system

### Changed

- **Documentation**: Updated project documentation to reflect account creation
  completion
  - Updated UI completion status from 95% to 98%
  - Updated goals and context files

## [0.1.2] - 2025-11-20

<!-- markdownlint-disable MD024 -->

### Fixed

- **API ES Module Migration**: Fixed critical API startup issues
  - Migrated API module to ES modules with `type: module` in package.json
  - Updated all API route imports to include `.js` extensions (required for ES
    modules)
  - Replaced CommonJS `require()` calls with ES module `import` statements
  - Fixed `findProjectRoot` to use ES module syntax instead of `require()`
  - Resolves "require is not defined" errors that prevented API from starting
- **Production Start Script**: Added unified production start command
  - New `pnpm run start` script to start both API (port 3000) and UI (port 3030)
  - Configured Nuxt preview server to listen on correct port and host
  - Enables easy production deployment with a single command
- **Flaky Geography Test**: Fixed intermittent test failure
  - Added explicit `return` statements in geography preset route handler
  - Added defensive error handling in `getGeographyPreset()` function
  - Ensures response is always sent and errors are handled gracefully
  - Test now passes consistently without "socket hang up" errors
- **Nuxt Build Error**: Fixed TypeScript compilation error in UI build
  - Removed invalid `port` property from nitro configuration
  - Port is now correctly controlled via `PORT` environment variable
  - UI production builds now complete successfully

### Changed

- **Configuration Resilience**: Improved central config handling
  - Enhanced `CentralConfigManager` to handle missing `.civicrc` gracefully
  - Added `.civicrc.example` template for new developers
  - Better default path resolution for data directory and database
- **UI Build Configuration**: Updated Nuxt configuration
  - Fixed nitro devServer configuration
  - Updated `.gitignore` to exclude compiled `.js` files from app directory

## [0.1.1] - 2025-11-19

### Added

- **Internationalization (i18n)**: Added full i18n support to Nuxt UI module
  - Installed and configured `@nuxtjs/i18n` v10.2.1
  - Added English (en) and French (fr) language support
  - Created translation files in `i18n/locales/` with organized namespaces
    (common, home)
  - Implemented language switcher in UserMenu component (next to Appearance
    menu)
  - Auto-detects browser language on first visit
  - Persists language preference to localStorage
  - Translated home page (`index.vue`) with all user-facing strings
  - Uses `no_prefix` strategy (no URL prefix for now, can be extended later)
  - All translations working correctly for both languages
- **Geography Markdown Format**: Geography files now stored in hybrid markdown
  format (`.md`) with YAML frontmatter and embedded GeoJSON/KML content
  - All metadata (name, description, category, bounds, timestamps) versioned
    alongside geographic data
  - Consistent with CivicPress record format for unified Git versioning
  - Human-readable and editable format

### Changed

- **Nuxt 4 Upgrade**: Successfully upgraded UI module from Nuxt 3 to Nuxt 4.2.1
  - Updated all dependencies to Nuxt 4 compatible versions
  - Fixed 114+ TypeScript errors across all UI components
  - Migrated from `UFormGroup` to `UFormField` (Nuxt UI 4 breaking change)
  - Updated import paths (`#app` → `#imports`)
  - Fixed color type system to use Nuxt UI 4 compatible values
  - Updated documentation references (Nuxt 3 → Nuxt 4)
  - All features tested and working correctly
  - Production build successful with 0 TypeScript errors
- **Geography File Format**: Migrated from raw GeoJSON/KML files to hybrid
  markdown format for better metadata management and Git versioning
- Enhanced geography data system from simple coordinate storage to full spatial
  document management
- Updated record forms to support both legacy geography fields and new geography
  file linking
- Improved geography validation with comprehensive geometry and metadata
  checking

### Fixed

- **Storage Path Detection**: Fixed storage configuration path detection in API
  routes
  - Production: Uses `.system-data/storage.yml` at project root (checks if file
    exists)
  - Tests: Uses `{testDir}/data/.system-data/storage.yml` for complete isolation
  - Fixed issue where production was incorrectly using `data/.system-data`
    instead of project root
  - Fixed issue where tests were incorrectly using production storage config
  - Storage operations now correctly isolated in test environments
  - Detection logic: checks project root first, then falls back to test
    directory if in test environment
- **Icons Folder Access**: Changed icons folder from `authenticated` to `public`
  access
  - Icons can now be loaded without authentication for public-facing features
  - Updated storage configuration and test expectations
  - All storage tests updated and passing
- **Test Storage Isolation**: Fixed storage operations in tests to use isolated
  directories
  - Storage paths in tests now use absolute paths within test directories
    (`{testDir}/storage`)
  - Prevents test interference and ensures complete isolation between test runs
  - Storage service updated to handle absolute paths correctly
  - Request context enhanced to pass `dataDir` to avoid `CentralConfigManager`
    cache issues
  - All storage tests now pass reliably without affecting working directory

  - Migration script (`scripts/migrate-geography-to-markdown.mjs`) to convert
    existing raw files
  - New API endpoint `/api/v1/geography/:id/raw` for raw content access

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
- **Geography Styling Presets**: Pre-configured color and icon mapping presets
  for common geography use cases
  - Three default presets: land use zones, zones by name, and municipal
    facilities
  - Preset management API endpoints (`/api/v1/geography/presets`)
  - Apply presets to existing geography files with one-click styling
  - Configurable presets stored in `core/src/defaults/geography-presets.yml`
- **Storage Icons Folder**: New dedicated storage folder for map icons and
  geography-related images
  - Authenticated access with image type restrictions
  - 2MB max file size limit
  - Integrated with geography icon mapping system
  - UUID-based file references for map markers
- **Geography API Tests**: Comprehensive test coverage for geography endpoints
  - CRUD operations testing
  - Color and icon mapping validation
  - Preset management and application
  - Raw content retrieval
  - Error handling and edge cases
- **Storage Icons Tests**: Test coverage for icons folder functionality
  - Upload, list, and download operations
  - Access control validation
  - File type and size restrictions
  - Storage configuration API integration

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
  and UUID-based icon support
- **Search System**: Public search by location, category, metadata, and date
- **Access Control**: Granular permissions for different user roles
- **Testing**: Comprehensive API test suite for geography and storage systems
  using Vitest and Supertest

## [0.1.1] - 2025-11-19

<!-- markdownlint-disable MD024 -->

### Added

- **Backup Compression**: Added tarball compression support for backups
  - Backups now create `.tar.gz` archives by default alongside backup
    directories
  - Compression enabled by default, can be disabled with `--no-compress` flag
  - Significantly reduces backup size and simplifies demo data distribution
  - Restore automatically detects and extracts tarballs when present
  - Maintains backward compatibility with uncompressed backups
- **Demo Data Archives**: Created compressed demo data backups for quick
  onboarding
  - Richmond, QC, Canada demo data (French) - `richmond-quebec.tar.gz`
  - Springfield, VA, USA demo data (English) - `springfield-usa.tar.gz`
  - Both archives include complete data, Git history, storage files, and
    metadata
  - Clean Git history with single initial commit for each demo dataset
  - `civic init` now uses these compressed archives for demo data loading
- **Developer Bootstrap Documentation**: Enhanced README with comprehensive
  setup instructions
  - Added step-by-step developer bootstrap section
  - Included `chmod +x` command to fix CLI permission issues
  - Updated development commands documentation (watch mode defaults)
  - Added Hoppscotch API collections section with usage instructions
  - Removed outdated branch checkout instructions

### Changed

- **Backup/Restore System**: Enhanced backup and restore functionality
  - Restore now correctly resolves storage paths from active configuration
  - Improved storage file metadata restoration during backup restore
  - Better error handling and warning messages during restore operations
  - Storage configuration path detection improved for production instances
- **CLI Init Command**: Streamlined initialization process
  - Removed `repo_url` prompt (feature not yet implemented)
  - Updated demo data labels for clarity:
    - "Richmond, QC, Canada - Francais"
    - "Springfield, VA, USA - English"
  - Improved environment detection for file path resolution
- **Storage Configuration**: Updated default storage settings
  - Icons folder access changed from `authenticated` to `public` by default
  - Prevents 401 errors on fresh installs for map icons
  - Updated in both default templates and StorageConfigManager
- **Development Workflow**: Improved developer experience
  - `pnpm run dev` now starts both API and UI in watch mode by default
  - `pnpm run dev:api` runs in watch mode by default
  - Removed redundant watch-specific commands from documentation
- **Home Page Customization**: Added guidance for users
  - Default home page text now includes note about customization
  - Directs users to `data/.civic/org-config.yml` for customization
  - Updated both default config and UI display text

### Fixed

- **Build System**: Fixed TypeScript compilation issues
  - Removed `composite: true` from `modules/storage/tsconfig.json` to fix build
    errors
  - Added `*.tsbuildinfo` to `.gitignore` to prevent merge conflicts
  - Fixed module resolution for `@civicpress/storage` package
- **Git Tracking**: Improved repository hygiene
  - Added `.civicrc` to `.gitignore` (local configuration file)
  - Added `*.tsbuildinfo` to `.gitignore` (build artifacts)
  - Prevents machine-specific files from being committed
- **Storage Path Resolution**: Fixed storage configuration loading
  - Corrected storage path detection in API routes for production instances
  - Fixed issue where `civicpress-test` was incorrectly identified as test
    environment
  - Storage operations now correctly use `.system-data/storage.yml` at project
    root
- **UI Localization**: Fixed untranslated UI elements
  - Breadcrumbs in records type pages now use translation keys
  - Properly localized with `t('common.home')` and `t('records.allRecords')`
- **Backup Restore**: Fixed storage restoration during backup restore
  - Correctly uses configured storage path from `storage.yml` instead of
    hardcoded path
  - Properly handles storage file metadata restoration
  - Fixed TypeScript error where `provider` was possibly undefined

### Documentation

- **Domain Migration**: Updated all documentation with new domain and email
  - Changed `civic-press.org` → `civicpress.io` throughout all docs
  - Changed `hello@civic-press.org` → `hello@civicpress.io` throughout all docs
  - Updated 61+ files including specs, contributing guide, code of conduct
  - Added website and contact email to README, project status, and agent
    documentation
- **Project Status**: Updated project status and agent documentation
  - Added website and contact information to all agent documentation files
  - Updated project status document with current information
  - Enhanced developer onboarding documentation

## [1.0.0] - 2025-07-02

### Initial Release

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

## Version History

- **0.1.2**: Hotfix for API ES module migration, production start script, and
  build fixes
- **0.1.1**: Backup compression, demo data improvements, developer experience
  enhancements
- **1.0.0**: Initial release with core platform architecture
- **Unreleased**: Development and feature additions

## Links

- [Contributing Guide](CONTRIBUTING.md)
- [Code of Conduct](CODE_OF_CONDUCT.md)
- [Full Manifesto](https://github.com/CivicPress/manifesto/blob/master/manifesto.md)

---

**For detailed development history, see the
[Git commit log](https://github.com/CivicPress/civicpress/commits/main).**
