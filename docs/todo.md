# CivicPress TODO List

## Current Priority: API Enhancement Phase (v1.3.0)

### Recent Achievements

- **All Tests Passing**: 733+ tests passing - system is stable and healthy
- **CLI User Management**: Fixed JSON parsing issues in simulated authentication
- **Authentication System**: Both simulated and password auth working perfectly
- **Test Suite Stabilization**: Comprehensive test coverage across all modules
- **Recovered Specifications**: Restored comprehensive platform specifications
  (50+ specs)
- **Diff API**: Complete diff API implementation with documentation
- **Backup System**: Full backup and restore functionality implemented
- **Frontend Migration**: Successfully migrated to Nuxt 4
- **Record Editor Refinement**: Complete UI overhaul with simplified button
  system
  - Single "Save changes" split-button with contextual dropdown
  - Status dropdown in Details sidebar
  - Raw YAML preview accordion
  - Word wrap enabled, flat document design
  - Complete internationalization (English/French)
- **Unpublished Changes Badge**: Visual indicator for records with draft
  modifications
  - Badge displays on record list and single record view pages
  - Only visible to authenticated users with `records:edit` permission
  - API includes `hasUnpublishedChanges` flag for efficient draft detection
  - Edit mode support with `?edit=true` query parameter
  - Comprehensive test coverage (13 new tests)
- **Pagination System Overhaul**: Complete page-based pagination implementation
  - Unified server-side pagination across all record listings and search
  - URL state management for page and pageSize parameters
  - Pagination controls with page numbers, page size selector, and result counts
  - Search pagination fixed (Limitation 1 - completed)
  - Pagination scroll-to-top functionality
  - Fixed multiple API calls during pagination on type index pages
  - Removed client-side pagination complexity
- **Search UX Improvements**: Enhanced search user experience
  - Explicit search submission (no list refresh while typing)
  - Search suggestions only visible when input has focus
  - Search suggestions added to home page
  - Improved autocomplete behavior and interaction
- **Code Quality Improvements**: Removed redundant and misleading features
  - Removed kind priority sorting from UI (now handled exclusively by API)
  - Removed sort dropdown from UI (was misleading - only sorted current page)
  - Simplified RecordList component logic
  - Cleaner separation of concerns (API handles sorting, UI handles display)
- **Documentation Cleanup**: Removed outdated analysis and test planning
  documents
  - Merged architecture documents into single source of truth
  - Updated documentation to reflect implemented features
  - Created feature documentation for new capabilities

### Immediate Tasks (Next 1-2 weeks)

#### Sort Options Feature (Removed from UI - TODO: API/DB Implementation)

- [ ] **Implement sort options at API/DB level**
  - **Status**: ⏳ Planned
  - **Context**: Sort dropdown removed from UI because it only sorted current
    page (misleading UX)
  - **Requirements**:
    - Add `sort` parameter to `/api/v1/records` and `/api/v1/search` endpoints
    - Implement database-level sorting in queries (ORDER BY clauses)
    - Ensure kind priority remains primary sort, user sort is secondary
    - Support sort options: `updated_desc`, `created_desc`, `title_asc`,
      `title_desc`, `relevance`
    - **Search Results Relevance**:
      - For search: `relevance` uses existing relevance scoring system
      - Relevance scores include: BM25 score, field match weights (title 10x,
        tags 5x, content 1x), recency score
      - These scores are already calculated in `sqlite-search-service.ts` and
        returned in `_search.relevance_score`
      - Sort by relevance should use these scores:
        `ORDER BY kind_priority ASC, relevance_score DESC`
    - **List Results Relevance**:
      - For listings (non-search): `relevance` maintains default API order (kind
        priority + created_at DESC)
    - **User Sort Options**:
      - `updated_desc`:
        `ORDER BY kind_priority ASC, updated_at DESC, created_at DESC`
      - `created_desc`: `ORDER BY kind_priority ASC, created_at DESC` (same as
        default)
      - `title_asc`: `ORDER BY kind_priority ASC, title ASC, created_at DESC`
      - `title_desc`: `ORDER BY kind_priority ASC, title DESC, created_at DESC`
  - **Database Implementation**:
    - Add CASE statement in ORDER BY for user sort options
    - Ensure kind_priority is always first in ORDER BY (primary sort)
    - User sort becomes secondary sort within same kind priority
    - For search: Include relevance_score in ORDER BY when sort='relevance'
  - **Estimated Effort**: 3-4 hours
  - **Note**: Sort dropdown removed from UI (completed), pending API/DB
    implementation

### Immediate Tasks (Next 1-2 weeks)

#### Centralized Output Patterns Migration

- [x] **Migrate CLI commands to use centralized output functions** - Complete
  - **Status**: ✅ 100% complete - All 28 CLI command files migrated
  - **Result**: 401 violations migrated, 614 centralized output calls added
  - **All commands now support**: `--json`, `--silent`, and consistent
    formatting
  - **Reference**: See `docs/centralized-output-patterns.md` for patterns

- [x] **Migrate Core library to use centralized output functions** - Complete
  - **Status**: ✅ 100% complete - All 13 core files migrated
  - **Result**: 68 violations migrated, 111 centralized output calls added
  - **Note**: `core/src/utils/logger.ts` using console internally is acceptable
    (base logger)
  - **Reference**: See `docs/centralized-output-patterns.md` for patterns

- [x] **Clean up API module debug console.log statements** - Complete
  - **Status**: ✅ 100% complete - All 8 API files migrated
  - **Result**: 21 violations migrated, 313 centralized output calls added
  - **All routes now use**: `sendSuccess()`, `handleApiError()`, proper logging

- [x] **Fix documentation file name mismatch** - Complete
  - **Status**: ✅ Fixed - All references updated to `api-logger.ts`

#### UI Pagination Implementation ✅ COMPLETED

- [x] **Page-based pagination system** - Complete
  - **Status**: ✅ Fully implemented and working
  - **Implementation**: Unified server-side pagination across all record
    listings
  - **Features**:
    - Page-based pagination with URL state management
    - Page size selector (10, 25, 50, 100 records per page)
    - Pagination controls with page numbers
    - Result count display ("Showing X-Y of Z results")
    - Scroll-to-top on page change
    - Works on both main records page and type-specific pages
  - **API Integration**: Both `/api/v1/records` and `/api/v1/search` support
    page-based pagination
  - **Search Pagination**: Fixed Limitation 1 - search now properly paginated
  - **Reference**: `docs/analysis-pagination-limitations-fix.md` (Limitation 1
    marked as complete)

#### Diff API Implementation

- [x] **Design Diff API endpoints** - Complete
  - `GET /api/diff/:recordId` - Compare record versions (Implemented)
  - `GET /api/diff/:recordId/history` - Get commit history (Implemented)
  - `GET /api/diff/:recordId/commits` - Get commits that modified record
    (Implemented)
  - `GET /api/diff/:recordId/versions` - Get all versions (Implemented)
  - `GET /api/diff/commits/:commit1/:commit2` - Compare all records between
    commits (Implemented)
- [x] **Implement diff logic** - Complete
  - Git-based diff generation (Implemented)
  - Frontmatter and content diffing (Implemented)
  - Metadata change tracking (Implemented)
  - Multiple diff formats (unified, side-by-side, json) (Implemented)
- [x] **Create diff documentation** - Complete
  - API endpoint documentation exists (`modules/api/docs/diff-api.md`)
  - Diff format specification documented
  - Integration examples provided

#### Analytics API Implementation

- [x] **Analytics Configuration** - Complete
  - Analytics config system implemented (`/api/info` endpoint provides analytics
    config)
  - Head/body injection support for analytics scripts
  - Configuration management via UI
  - **Note**: Frontend analytics handled via Plausible.io or other external
    tracking tools
- [ ] **Design Backend Analytics API** - Low Priority (Deferred)
  - **Status**: Requires specific specifications before implementation
  - **Note**: Frontend analytics is covered externally. Backend analytics would
    focus on:
    - Internal system metrics (`GET /api/analytics/system` - System performance)
    - API usage statistics (`GET /api/analytics/usage` - Usage statistics)
    - Record/User analytics (if needed for internal dashboards)
  - **Action**: Create detailed specifications before starting implementation
  - **Priority**: Low - defer until specifications are defined

#### Bulk Operations API

- [ ] **Design bulk operations endpoints**
  - `POST /api/records/bulk` - Bulk record operations
  - `POST /api/validation/bulk` - Bulk validation (Done)
  - `POST /api/export/bulk` - Bulk export
  - `POST /api/import/bulk` - Bulk import
- [ ] **Implement bulk operation logic**
  - Transaction handling
  - Progress tracking
  - Error handling and rollback
  - Performance optimization
- [ ] **Create bulk operations documentation**
  - API endpoint documentation
  - Performance considerations
  - Error handling guide

#### Advanced Search API (Future Enhancements)

**Current Status**: ✅ Core search functionality is fully implemented (Search
V2)

- ✅ Full-text search with FTS5 (`GET /api/v1/search`)
- ✅ Search suggestions/autocomplete (`GET /api/v1/search/suggestions`)
- ✅ Relevance ranking (BM25 + composite scoring)
- ✅ Multi-word queries and phrase matching
- ✅ Typo tolerance (JavaScript Levenshtein)
- ✅ Basic faceting (type/status counts)
- ✅ Result caching

**Remaining Enhancements** (from `docs/specs/search.md`):

**Short Term (3-6 months)**:

- [ ] PostgreSQL implementation with native typo tolerance (`pg_trgm`)
- [ ] Advanced faceting (date ranges, numeric ranges)
- [ ] Search analytics and popular queries tracking
- [ ] Custom ranking weights per instance configuration
- [ ] `GET /api/v1/search/history` - Search history endpoint (user query
      tracking)

**Medium Term (6-12 months)**:

- [ ] Multi-language stemming (French/English)
- [ ] Search result personalization
- [ ] Query suggestions based on past searches
- [ ] Advanced filters (geography, date ranges, numeric ranges)
- [ ] `GET /api/v1/search/advanced` - Advanced search endpoint with complex
      filters

**Long Term (12+ months)**:

- [ ] Optional Meilisearch integration (for advanced features)
- [ ] Federated search across instances
- [ ] Machine learning relevance tuning
- [ ] Voice search support

#### Templates API Implementation

- [ ] **Implement Templates API endpoints**
  - **Current Status**: API endpoints exist but are stubbed (return empty
    arrays/mock data)
  - **Files**: `modules/api/src/routes/templates.ts` (all endpoints return
    placeholders)
  - **UI Integration**: `modules/ui/app/composables/useTemplates.ts` has TODOs
    to use API
  - **Priority**: Medium - affects template functionality
  - **Action**: Implement actual template loading from `data/.civic/templates/`
    directory
  - **Action**: Update UI to fetch templates from API instead of hardcoded
    defaults
  - **Reference**: `core/src/utils/template-engine.ts` has file system loading
    logic

#### Configuration Export/Import

- [ ] **Implement configuration export API endpoint**
  - **Current Status**: Not implemented - UI shows "coming soon" message
  - **File**: `modules/ui/app/pages/settings/configuration/index.vue` (line 321)
  - **Priority**: Low - nice to have feature
  - **Action**: Create `POST /api/v1/config/export` endpoint to export all
    configs as ZIP
  - **Action**: Implement UI download functionality

- [ ] **Implement configuration import UI**
  - **Current Status**: Not implemented - UI shows "coming soon" message
  - **File**: `modules/ui/app/pages/settings/configuration/index.vue` (line 340)
  - **Priority**: Low - nice to have feature
  - **Action**: Create file upload UI for configuration import
  - **Action**: Validate and apply imported configurations

#### Core Library Enhancements

- [ ] **Implement document number generator database query**
  - **Current Status**: Returns placeholder (always 1)
  - **File**: `core/src/utils/document-number-generator.ts` (line 183)
  - **Priority**: Medium - affects document numbering accuracy
  - **Action**: Query database to find highest sequence number for record
    type/year
  - **Action**: Ensure proper sequence number generation

- [ ] **Implement workflow engine integration in hooks**
  - **Current Status**: Hook system logs workflow execution but doesn't
    integrate with workflow engine
  - **File**: `core/src/hooks/hook-system.ts` (line 410)
  - **Priority**: Medium - affects workflow functionality
  - **Action**: Integrate hook system with workflow engine for actual workflow
    execution

- [ ] **Implement geography database persistence**
  - **Current Status**: Geography saves to files only, not database
  - **Files**: `core/src/geography/geography-manager.ts` (lines 112, 285)
  - **Priority**: Low - file-based storage works, database would enable better
    querying
  - **Action**: Add database persistence for geography files alongside file
    storage
  - **Action**: Update geography manager to save/update in database

- [ ] **Use auth store for current user in templates**
  - **Current Status**: RecordForm uses translation key instead of actual user
  - **File**: `modules/ui/app/components/RecordForm.vue` (line 450)
  - **Priority**: Low - minor enhancement (auth store has `currentUser`
    available)
  - **Action**: Replace `t('records.currentUser')` with
    `useAuth().user.value?.name` or similar

### Short Term Tasks (v1.4.0 - Next 1-2 months)

#### Plugin System Foundation

- [ ] **Design plugin architecture** (based on `docs/specs/plugins.md`)
  - Plugin registration and management
  - Plugin API interfaces
  - Plugin development guidelines
  - Plugin security and validation
- [ ] **Implement core plugin system**
  - Plugin loading and initialization
  - Plugin API endpoints
  - Plugin development tools
  - Plugin documentation

#### Workflow Engine Enhancement

- [ ] **Design advanced workflow system** (based on `docs/specs/workflows.md`)
  - Configurable approval processes
  - Status transition management
  - Workflow templates
  - Workflow analytics
- [ ] **Implement workflow endpoints**
  - `GET /api/workflows` - List workflows
  - `POST /api/workflows` - Create workflow
  - `PUT /api/workflows/:id` - Update workflow
  - `DELETE /api/workflows/:id` - Delete workflow

#### Audit Trail System

- [ ] **Design audit trail system** (based on `docs/specs/audit.md`)
  - Comprehensive change tracking
  - User action logging
  - Audit trail querying
  - Audit trail export
- [ ] **Implement audit trail endpoints**
  - `GET /api/audit` - Get audit trail
  - `GET /api/audit/:recordId` - Get record audit trail
  - `GET /api/audit/user/:userId` - Get user audit trail
  - `POST /api/audit/export` - Export audit trail

### Medium Term Tasks (v1.5.0 - Next 3-6 months)

#### Civic Modules Implementation

- [ ] **Legal Register Module** (based on `docs/specs/legal-register.md`)
  - Bylaw management and versioning
  - Policy creation and approval
  - Resolution tracking and compliance
  - Legal document templates

- [ ] **Voting Systems Module** (based on `docs/specs/votes.md`)
  - Ballot creation and management
  - Referendum and election support
  - Vote counting and verification
  - Election result reporting

- [ ] **Feedback Systems Module** (based on `docs/specs/feedback.md`)
  - Public comment systems
  - Survey and petition tools
  - Feedback moderation and review
  - Citizen engagement analytics

#### Advanced Security Features

- [ ] **Cryptographic Signatures** (based on `docs/specs/signatures.md`)
  - Digital signature implementation
  - Document verification
  - Signature validation
  - Certificate management

- [ ] **Advanced Security Framework** (based on `docs/specs/security.md`)
  - Enhanced authentication
  - Role-based security policies
  - Security audit logging
  - Compliance monitoring

#### Federation System

- [ ] **Design federation architecture** (based on `docs/specs/manifest.md`)
  - Multi-node synchronization
  - Data sharing protocols
  - Federation security
  - Node management

### Long Term Tasks (v1.6.0 - Next 6-12 months)

#### Multi-tenant Support

- [ ] **Design multi-tenant architecture**
  - Tenant isolation and security
  - Shared infrastructure optimization
  - Tenant-specific configurations
  - Resource management

#### Advanced UI/UX

- [x] **Frontend Migration** - Complete
  - Migrated from Astro to Nuxt 4 (Completed)
  - Nuxt UI Pro integration (Completed)
  - Admin interface (Completed)
  - Modern user experience (Completed)
- [ ] **PWA Features** - Planned
  - Implement PWA features
  - Offline support
  - Service worker integration

#### Enterprise Features

- [ ] **Advanced Monitoring** (based on `docs/specs/observability.md`)
  - System health monitoring
  - Performance analytics
  - Alert systems
  - Capacity planning

- [x] **Backup and Recovery** - Core Implementation Complete
  - Backup system implemented (`core/src/backup/backup-service.ts`)
  - CLI backup commands (`civic backup create/restore`)
  - Tarball compression support
  - Storage file restoration
  - Demo data loading via backups
  - **Remaining**: Automated scheduled backups, advanced retention policies,
    recovery testing

### Documentation and Standards

- [ ] **Update all documentation** to reflect recovered specifications
- [ ] **Create implementation guides** for each major feature
- [ ] **Develop testing standards** based on `docs/specs/testing-framework.md`
- [ ] **Establish deployment procedures** based on `docs/specs/deployment.md`

### Quality Assurance

- [ ] **Maintain test coverage** at 90%+ for all new features
- [ ] **Implement security testing** based on `docs/specs/security.md`
- [ ] **Add performance testing** for all API endpoints
- [ ] **Create compliance testing** for civic requirements

---

## Platform Vision Summary

Based on the recovered specifications, CivicPress is designed as a **complete
civic technology platform** with:

### Core Principles

- **Transparency by default** — Government should work in daylight
- **Trust through traceability** — Every record, every change, every action is
  inspectable
- **Open-source and auditable** — No black boxes, no hidden logic
- **Equity and accessibility** — Built for everyone, not just the tech-savvy
- **Local-first resilience** — Works offline, in small towns, or at scale
- **Markdown as civic format** — Legible, versionable, future-proof civic
  records

### Current Status

- **Foundation Complete**: Core CLI, API, and database functionality
- **Testing Stable**: 600+ tests passing with comprehensive coverage
- **Documentation Restored**: 50+ specifications providing clear roadmap
- **Diff API Complete**: Full diff functionality with documentation
- **Backup System Complete**: Core backup and restore functionality
- **Frontend Complete**: Nuxt 4 migration and modern UI
- **Ready for Enhancement**: Solid foundation for advanced features

### Next Phase Focus

- **API Enhancement**: Analytics, Bulk Operations, Advanced Search
- **Plugin System**: Extensible architecture for civic modules
- **Workflow Engine**: Advanced approval processes and status management
- **Security Framework**: Cryptographic verification and audit trails
