# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.1] - 2026-08-03

<!-- markdownlint-disable MD024 -->

### Added

- **Self-service password reset that works with zero comms configuration.**
  `POST /api/v1/auth/forgot-password` + `/auth/reset-password` back a real UI
  (`/auth/forgot-password`, `/auth/reset-password`) in place of the previous
  "coming soon" stub. Reset tokens are single-use, hashed at rest, 1-hour TTL,
  and revoke every session on use. The request endpoint is anti-enumeration
  (identical response for any input) and rate-limited by the existing `/auth`
  window.
  - **Channel-by-audience delivery:** a token is minted and a self-service link
    delivered only when a user-facing channel can reach the account — email (if
    configured), else the new **console** dev sink. With no channel (the default
    production posture), no token is minted; instead an actionable task is filed
    in the operator notification center for an admin to fulfill via
    `civic users:set-password`. OAuth-only accounts are ineligible.
- **Operator notification center (the "inbox").** A durable, admin-only,
  channel-free feed for signal that needs an operator's attention: undeliverable
  password-reset requests, backup failures, and account-lockout security alerts.
  - API: `GET /api/v1/admin/notifications` (+ `/unread-count`, `/:id/read`,
    `/:id/dismiss`, `/read-all`), gated by `system:admin`.
  - CLI: `civic notifications:list|read|dismiss|read-all` and
    `civic users:reset-requests`.
  - UI: an admin notifications page (`/settings/alerts`) with a live unread
    badge in the sidebar.
- **Update check.** `civic system:check-updates` compares the running version
  against the newest GitHub release and records a deduped `update_available`
  entry in the operator notification center when a newer version exists. Local
  and cron-friendly (no auth); `--latest` skips the network for offline use.
- **Console notification channel.** A user-facing dev sink (default-on in
  development/test, off in production unless `CIVIC_CONSOLE_NOTIFICATIONS=true`)
  that prints rendered messages and writes a file outbox under the system-data
  dir — so the email-shaped flows are exercisable out of the box without SMTP.
- **Unpublished Changes Badge**: Added visual indicator for records with
  unpublished draft changes
  - Badge displays on record list page and single record view page
  - Only visible to authenticated users with `records:edit` permission
  - Badge shows "Unpublished changes" with edit icon
  - API endpoints now include `hasUnpublishedChanges` flag in responses

- **Draft Detection API**: Added automatic draft detection for listing and
  search endpoints
  - `GET /api/v1/records` now includes `hasUnpublishedChanges` flag for
    authenticated editors
  - `GET /api/v1/search` now includes `hasUnpublishedChanges` flag for
    authenticated editors
  - Efficient batch querying of drafts to minimize database calls
  - Field only included for users with `records:edit` permission

- **Edit Mode Query Parameter**: Added `?edit=true` parameter to single record
  endpoint
  - `GET /api/v1/records/:id?edit=true` returns draft version if available (for
    authenticated editors)
  - `GET /api/v1/records/:id` (default) always returns published version
  - Allows frontend to fetch draft content when editing, published content when
    viewing
  - Public users always receive published version regardless of parameter
- **Drag-and-drop attachment upload in the record editor.** The editor's
  Attachments panel now embeds a real drop/click uploader (multipart
  `POST /api/v1/storage/files`) alongside the existing link-a-file browser, so a
  clerk can attach a new file without leaving the editor. Uploads target a
  storage folder named after the record type (public fallback); the fake dashed
  "dropzone" empty state is gone.
- **Record activity feed backed by Git history.** The editor's Activity panel
  reads `GET /api/v1/diff/:recordId/history` (summary + author + timestamp,
  newest first) in place of a single hardcoded "Record created" row, with
  loading / empty / error states — an unpublished draft with no committed
  history reads as empty, not an error.
- **Undo / redo toolbar buttons** in the record editor (the capability already
  existed on both editing surfaces; only the buttons were missing).
- **EN/FR locale-parity guard** — `pnpm i18n:check` (and a CI test) fails when
  the two message catalogs drift out of key parity.

### Changed

- **Auto-indexing now runs through the workflow engine (core-002).** The hook
  system is wired to the `WorkflowEngine`: a record update fires the
  `update-index` workflow (fire-and-forget) to refresh search indexes. The
  former log-only `approval` / `publication` / `archival` workflow stubs —
  registered as if functional — were removed.
- **Record View Behavior**: Single record endpoint now differentiates between
  view and edit modes
  - View mode (default): Always returns published record, includes
    `hasUnpublishedChanges` flag for editors
  - Edit mode (`?edit=true`): Returns draft if available for authenticated
    editors with permission
  - Ensures published content is always shown to public users and in view
    contexts
- **Test Coverage**: Added comprehensive test suite for unpublished changes
  feature
  - 13 new tests covering draft detection, edit mode, and permission handling
  - Tests verify proper behavior for authenticated and public users
  - All existing tests remain passing
- **Removed the no-op `civic index --rebuild` flag** (and the underlying
  `IndexingOptions.rebuild`). It was never wired to any behavior — every index
  generation already performs a full scan — so it was dropped rather than left
  as a misleading switch.
- **Removed the never-wired storage failover, retry, metrics, and health-check
  subsystems.** Their configuration setters had no callers, so the managers were
  never constructed and those code paths were unreachable — and once failover
  was gone, the health checker just ran a background probe timer whose output
  nothing read. Dropped the advertised-but-inert config keys (`retry_*`,
  `failover_providers`, `health_checks`, `health_check_interval`,
  `health_check_timeout`) from the default `storage.yml` and the storage config
  type. The live circuit breaker, timeouts, quota, usage reporting, and
  lifecycle management are unaffected.
- **Localized the interactive `aria-label`s** (clear-search, draft actions, and
  editor chrome) so screen readers follow the UI locale (EN/FR).
- **The editor upload dropzone (`FileUpload`) is theme-aware** — no more white
  box in the dark editor; also improves Settings → Storage.
- **Reconciled seven drifted specs with implementation reality.** `storage`,
  `workflows`, `geography-data`, `notifications`, `accessibility`,
  `testing-framework`, and `realtime-architecture` gained a top-of-file
  implementation-status note (and `storage` was re-tagged `partial`), per the
  v0.3.x "specs match reality" gate.

### Fixed

- **Published records no longer leak into the drafts list.** Publishing a draft
  now clears its internal editorial `workflowState`. Previously a first-publish
  stored `workflow_state = 'draft'`, so the freshly-published record surfaced in
  the unpublished/drafts listing; the read path also coerced a cleared (`null`)
  workflowState back to `'draft'`. Both are fixed.
- **Record locks no longer expire mid-edit.** A lock holder can now reacquire
  (renew) their own lock. Previously the atomic acquire rejected the same
  holder, so the editor's periodic lock-refresh silently 409'd and the lock
  lapsed after its timeout while the user was still editing. Different-user
  conflict detection is unchanged.
- **`civic cleanup --force` now works and targets the real data locations.** The
  `--force` path requires `--yes-i-know`, but an option-name mismatch meant the
  acknowledgement was never detected, so every non-interactive run was refused.
  Cleanup also deleted hardcoded repo-relative paths; it now resolves the data
  dir, system-data dir, and `.civicrc` through the core config (honoring a
  relocated `dataDir` / `CIVIC_DATA_DIR`) and removes the whole `.system-data`
  (database plus secret and storage credentials), not just `civic.db`.
- **`GET /diff/:recordId/commits` no longer 500s on the default call.** It
  passed `author: undefined` / `since: undefined` straight into simple-git's
  `git.log()`, which builds malformed git arguments and throws whenever those
  filters are omitted (the common case). The optional filters are now only
  included when supplied.
- **`403 Forbidden` responses now include `success: false`.** The
  `requirePermission` middleware's 403 body omitted the standard envelope flag
  that every other error response sets, so clients keying on
  `body.success === false` misread permission denials.
- **The structured configuration editor is reachable again.** Each config card
  on the settings page now offers a primary **Edit** (form-based) action
  alongside **Edit Raw** — previously the cards linked only to the raw YAML
  editor, orphaning the structured one. Its array/select fields also render
  their options again (they used `USelect :options`, but `@nuxt/ui` v4 expects
  `:items`, so those dropdowns were empty).
- **The record-list page-size selector shows its options again** (10 / 25 / 50
  / 100) — same `@nuxt/ui` v4 `:options`→`:items` fix.
- **Dev CORS now allows the Nuxt UI dev origin.** The API's development default
  CORS allowlist was `http://localhost:3000`, but the Nuxt UI dev server runs on
  `:3030`, so direct browser calls were blocked out of the box; `:3030` is now
  included (alongside `:3000`).
- **The collaborative editor's toolbar is no longer inert.** In the TipTap/Yjs
  editing surface, heading / bullet + numbered list / blockquote / horizontal
  rule / link / image buttons were silent no-ops; they now apply via TipTap core
  commands against the editor schema (bold/italic/code already worked).
- **Removed the editor's underline decoy.** The underline button emitted
  `underline`, which the host silently remapped to bold ("Markdown has no
  underline"); the button, its handler, and its i18n key were dropped.
- **Fixed the EN/FR sort-label key desync.** The code calls `records.sort.*`,
  but French only carried the labels under an orphaned `records.sortBy.*`
  scheme, so French users saw raw keys / English sort options.

### Security

- **Remediated known dependency vulnerabilities.** A centralized
  `pnpm.overrides` block takes the dependency tree from 94 osv-scanner
  advisories (3 Critical, 45 High) down to 2 (a brace-expansion DoS not
  reachable from the request surface). Includes major bumps verified against
  their consumers (nodemailer, multer, tar, markdown-it, uuid).
- **Added supply-chain scanning to CI.** osv-scanner (PR diff-gate + weekly
  lockfile scan) and CodeQL SAST (report-only), plus a `SECURITY.md`
  vulnerability-disclosure policy.
- **Hardened the audit carry-forward surfaces (defense-in-depth).** An audit of
  the surfaces the 2026-07-02 pass had deferred found no live vulnerability;
  hardening was applied regardless: a length cap on the public search query; a
  `system:admin` gate keeping credential-bearing config (`notifications`)
  admin-only even if `config:manage` is delegated; fail-closed auth on the
  config router; YAML-parse validation on raw config writes (an invalid file
  could 500 the public `/info`); a core-layer path-segment guard on geography
  `type`/`category`; validation that a broadcast `quick-start` `meetingId`
  references a real meeting; and a single-flight guard on index generation so
  overlapping calls can't launch concurrent full re-scans.

## [0.2.0] - 2025-01-30

### Added

- **Architecture Diagrams**: Comprehensive visual documentation with Mermaid
  diagrams
  - Service dependency diagram showing DI container structure
  - Record creation data flow diagram with Saga pattern
  - Error handling flow diagram
  - Module interaction diagram
  - Security system architecture diagram
  - Saga pattern execution flow diagram
  - Caching strategy flow diagram
  - All diagrams available in `docs/architecture-diagrams.md`

- **Security System**: Production-ready secrets management and CSRF protection
  - SecretsManager with HKDF-SHA256 key derivation from single root secret
  - Scoped key derivation (session, API, CSRF, webhook, JWT, email verification)
  - CSRF Protection service with token generation and validation
  - CSRF middleware for API routes with smart bypass logic
  - UI composable (`useCsrf`) for seamless frontend integration
  - Comprehensive test coverage and documentation

### Changed

- **Version**: Updated to v0.2.0 - Core Maturity and Stability milestone
  complete
- **Documentation**: Moved architecture diagrams to dedicated file for better
  organization
- **Architecture Analysis**: Updated comprehensive analysis document with all
  completed features

### Completed v0.2.x Roadmap Goals

All v0.2.x "Core Maturity and Stability" goals have been completed:

- ✅ **Search Performance**: Search V2 implemented with FTS5, advanced ranking,
  and typo tolerance
- ✅ **Schema Validation**: Comprehensive JSON Schema validation with AJV and
  business rules
- ✅ **Storage Abstraction**: Enhanced with Google Cloud Storage, failover,
  retry, circuit breaker
- ✅ **CLI Improvements**: Diagnostics with `--fix` flag, validation commands,
  comprehensive tooling
- ✅ **Error Handling**: Unified error handling system with type-safe hierarchy
  and correlation IDs
- ✅ **UI Polish**: Page-based pagination, improved search UX, sort options API
- ✅ **Architecture Documentation**: Comprehensive architecture.md with 1,600+
  lines, ADRs, and diagrams

### Technical Improvements

- **Saga Pattern**: All saga steps now compensatable, including hook emission
- **Error Handling**: Complete error normalization and layer-specific handlers
- **Caching**: Unified caching layer with multiple strategies and metrics
- **Module Integration**: Storage module fully integrated with DI container
- **Documentation**: Visual architecture diagrams and comprehensive guides

## [0.1.4] - 2025-01-27

### Added

- **Database-Level Sort Options**: Implemented comprehensive sorting at API and
  database level
  - Added sort parameter support to `/api/v1/records` and `/api/v1/search`
    endpoints
  - Sort options: `updated_desc`, `created_desc`, `title_asc`, `title_desc`,
    `relevance` (search only)
  - Kind priority (record=1, chapter=2, root=3) as primary sort, user-specified
    sort as secondary
  - Database indexes created automatically for optimal sort performance
  - Removed inefficient in-memory sorting in favor of SQL-level sorting

- **Word Extraction in Search Suggestions**: Enhanced search suggestions with
  word extraction
  - Extracts relevant words from record titles and tags (up to 5 words)
  - Filters out common stop words (English and French)
  - Words displayed as badges in UI, titles as list items
  - Typo tolerance using Levenshtein distance for better user experience
  - Separate `words` and `titles` arrays in API response for easier UI
    consumption

- **Enhanced Search Query Parsing**: Improved FTS5 query generation
  - Queries now match both exact words and prefixes: `"word" OR word*`
  - Better handling of multi-word queries
  - Improved relevance scoring with title-match boost

- **Search Cache Improvements**: Enhanced cache invalidation
  - Search cache and suggestions cache cleared when records are removed
  - Prevents stale search results after record deletion
  - Improved cache key generation for better cache hit rates

- **Upgrade Protocol Documentation**: Comprehensive upgrade guide
  - Step-by-step upgrade procedures for demo and production
  - Pre-upgrade backup checklist
  - Post-upgrade verification steps
  - Rollback procedures
  - Version-specific migration notes

- **Record Editor UI Improvements**: Major refinement of the record editor
  interface
  - **Title Bar**: Full-width title input with larger font size, improved
    styling and focus states
  - **Simplified Button System**: Replaced dual buttons with single "Save
    changes" split-button
    - Contextual dropdown menu with state-aware actions (Save, Publish,
      Unpublish, Archive)
    - Confirmation modals for publish, unpublish, archive, and delete actions
    - Enhanced "More" menu with history, duplicate, export, and delete options
  - **Editor & Preview Styling**: Flat document look with border divider, fixed
    double scrollbar
    - Enabled word wrap to remove horizontal scrollbar
    - Consistent background with main content area
    - Removed card wrappers for cleaner appearance
  - **Sidebar Enhancements**: Improved accordion headers with better spacing and
    alignment
    - Status dropdown in Details section (similar to type dropdown)
    - Raw YAML preview accordion item showing formatted frontmatter
    - Date/Time display for creation and last updated timestamps
    - Integrated tag management with UInputTags component
    - Geography accordion moved to its own section
    - Reactive counts that update when items are added/removed
  - **Internationalization**: All editor strings translated (English and French)

### Changed

- **Sort UI Integration**: Re-introduced sort dropdown in RecordSearch component
  - Dynamic sort options based on context (relevance for search, created_desc
    for listings)
  - Automatically switches to relevance sort when searching
  - Sort state synced with URL query parameters
  - Improved UX with clear sort labels and icons

- **API Response Structure**: Enhanced search suggestions API response
  - New structure:
    `{ suggestions: string[], words: string[], titles: string[] }`
  - Maintains backward compatibility with flat `suggestions` array
  - Separate arrays make UI rendering more efficient

- **Database Migrations**: Automatic migration system
  - New indexes created automatically on startup
  - FTS5 table and triggers updated automatically
  - All migrations are additive only (no data loss)
  - Idempotent (safe to run multiple times)

- **Record Editor UX**: Streamlined editing workflow
  - Removed footer from edit page for full-height content
  - More compact sidebar accordion headers with reduced padding
  - Pluralized accordion titles based on item count
  - Better icon and chevron alignment throughout sidebar

### Fixed

- **Search Suggestions**: Fixed empty suggestions issue
  - Fixed substring matching for suggestions (changed from prefix-only to full
    substring)
  - Improved NULL handling for `title_normalized` column
  - Fixed type field consistency in cached suggestions

- **Search Results**: Fixed empty results when not using suggestions
  - Enhanced FTS5 query to match both exact words and prefixes
  - Improved relevance scoring for better result ranking

- **API Call Optimization**: Reduced duplicate API calls
  - Fixed duplicate calls on page load (from 6 calls to 2)
  - Added 200ms cache for `fetchSummaryCounts` and `searchRecords`
  - Added `isLoading` guards to prevent concurrent calls
  - Fixed route watcher firing on initial mount

- **Sort Parameter Validation**: Fixed invalid sort parameter handling
  - Added explicit validation to reject `sort=relevance` on records listing
    endpoint
  - UI sanitizes sort parameter (converts relevance to created_desc for
    non-search contexts)
  - Better error messages for invalid sort options

- **TypeScript Errors**: Fixed CommonJS/ESM interoperability
  - Fixed `fast-levenshtein` import using `createRequire` for ES module context
  - Fixed `workflowState` type errors (null → undefined)
  - Added explicit type annotations where needed

- **Database Corruption**: Fixed FTS5 table definition mismatch
  - Fixed column name mismatch (`metadata_json` vs `metadata`)
  - Recreated FTS5 table and triggers with correct schema
  - Improved database integrity checks

- **Editor Bug Fixes**: Fixed various editor UI issues
  - Fixed `UDropdown` → `UDropdownMenu` component name migration
  - Fixed lifecycle hooks in composables (`useRecordLock`, `useAutosave`)
  - Fixed double scrollbar in editor
  - Fixed content cutoff past line 24
  - Fixed route order conflicts (`/drafts` before `/:id`)
  - Fixed authentication flow for drafts endpoint
  - Fixed TypeScript errors for status dropdown

### Technical Details

- **Core Implementation**: `core/src/database/database-service.ts` with
  `buildOrderByClause` helper
- **Search Service**: `core/src/search/sqlite-search-service.ts` with word
  extraction and enhanced query parsing
- **API Endpoints**: Updated `/api/v1/records` and `/api/v1/search` with sort
  parameter support
- **UI Components**: Enhanced `RecordSearch.vue` with sort dropdown and improved
  suggestions display
- **Database Schema**: New indexes for `records(updated_at)`,
  `records(created_at)`, `records(LOWER(title))`
- **Testing**: Comprehensive unit tests for sort query generation and word
  extraction
- **Documentation**: Complete upgrade protocol and migration guide

## [0.1.3] - 2025-11-26

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

<!-- markdownlint-disable MD024 -->

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

## [1.0.0] - 2025-07-02

> **Note:** this `1.0.0` tag is the original monorepo scaffold. Versioning
> restarted at `0.1.1` afterward, so this is **not** the roadmap's target v1.0
> Stable Release (see `docs/roadmap.md`).

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
