# CivicPress UI Overview

This document provides a high-level overview of the CivicPress UI layer.

- Framework: Nuxt 4 with Nuxt UI Pro
- Location: `modules/ui/`
- Dev server: runs on port 3030

For detailed UI docs and structure, see `modules/ui/README.md`.

## Geography UI

### Geography Management

- **GeographyForm** (`modules/ui/app/components/GeographyForm.vue`): Text box
  input with live preview for creating/editing geography files
- **GeographyMap** (`modules/ui/app/components/GeographyMap.vue`): Interactive
  Leaflet map component for displaying geography data
- **GeographySelector** (`modules/ui/app/components/GeographySelector.vue`):
  Browse and select existing geography files

### Geography Pages

- **Geography Index** (`modules/ui/app/pages/geography/index.vue`): Public
  listing of all geography files with map previews
- **Geography Create** (`modules/ui/app/pages/geography/create.vue`): Admin
  interface for creating new geography files
- **Geography View** (`modules/ui/app/pages/geography/[id]/index.vue`): Public
  view of geography file with full map display
- **Geography Edit** (`modules/ui/app/pages/geography/[id]/edit.vue`): Admin
  interface for editing geography files

### Record Integration

- **GeographyLinkDisplay**
  (`modules/ui/app/components/GeographyLinkDisplay.vue`): Display linked
  geography files in record views
- **GeographyLinkForm** (`modules/ui/app/components/GeographyLinkForm.vue`):
  Form component for linking geography files to records
- **GeographyLinkedRecords**
  (`modules/ui/app/components/GeographyLinkedRecords.vue`): Show records linked
  to a geography file

## Records UI

### Components

- **RecordList** (`modules/ui/app/components/RecordList.vue`): Paginated list
  with search, type/status filters, and sort controls.
- **RecordSearch** (`modules/ui/app/components/RecordSearch.vue`): Search box
  with autocomplete suggestions via `useSearchSuggestions`.
- **RecordForm** (`modules/ui/app/components/RecordForm.vue`): Create/edit
  records with geography, file attachments, templates, and validation.
- **RecordPreview** (`modules/ui/app/components/RecordPreview.vue`): Markdown
  preview of a record.
- **StatusTransitionControls**
  (`modules/ui/app/components/StatusTransitionControls.vue`): Buttons for
  changing record status based on allowed transitions.
- **LinkedRecordList**
  (`modules/ui/app/components/records/LinkedRecordList.vue`): Display linked
  records on a record detail page.
- **RecordLinkSelector**
  (`modules/ui/app/components/records/RecordLinkSelector.vue`): Select records
  to link from a searchable list.

### Pages

- **Records Index** (`pages/records/index.vue`): All records listing with
  filters.
- **Records by Type** (`pages/records/[type]/index.vue`): Records filtered by
  type.
- **New Record** (`pages/records/new.vue`): Type selection for creating records.
- **New Record by Type** (`pages/records/[type]/new.vue`): Create form for a
  specific type.
- **Record View** (`pages/records/[type]/[id]/index.vue`): Record detail with
  markdown preview.
- **Record Edit** (`pages/records/[type]/[id]/edit.vue`): Edit form with
  collaborative editing support.
- **Record Raw** (`pages/records/[type]/[id]/raw.vue`): Raw markdown/YAML view.
- **Drafts** (`pages/records/drafts.vue`): Draft records listing.

## Editor UI

The editor subsystem provides a markdown-based record editor with collaborative
editing support via WebSocket/yjs.

### Components

- **MarkdownEditor** (`components/editor/MarkdownEditor.vue`): CodeMirror 6
  markdown editor with syntax highlighting.
- **PreviewPanel** (`components/editor/PreviewPanel.vue`): Live rendered preview
  of markdown content.
- **EditorToolbar** (`components/editor/EditorToolbar.vue`): Formatting toolbar
  (bold, italic, headings, lists, links, etc.).
- **EditorHeader** (`components/editor/EditorHeader.vue`): Title, metadata, and
  save controls.
- **EditorAttachments** (`components/editor/EditorAttachments.vue`): File
  attachment management in the editor sidebar.
- **EditorRelations** (`components/editor/EditorRelations.vue`): Linked records
  and geography in the editor sidebar.
- **EditorActivity** (`components/editor/EditorActivity.vue`): Activity feed and
  version history in the editor sidebar.
- **RecordSidebar** (`components/editor/RecordSidebar.vue`): Collapsible sidebar
  with attachments, relations, activity, and broadcast-box recording controls.

### Key Composables

- **useAutosave**: Debounced autosave with retry and exponential backoff.
- **useRecordLock**: Acquire/release/poll edit locks for concurrent editing.
- **useMarkdown**: Render markdown to HTML with image URL normalization.

## Broadcast Box UI

The broadcast-box subsystem manages video devices for live recording and
streaming sessions.

### Components

- **DeviceList** (`components/broadcast-box/DeviceList.vue`): List enrolled
  devices with status indicators.
- **DeviceRegistrationForm**
  (`components/broadcast-box/DeviceRegistrationForm.vue`): Enrollment code
  entry.
- **DeviceConfigurationForm**
  (`components/broadcast-box/DeviceConfigurationForm.vue`): Device metadata
  editing.
- **DevicePreview** (`components/broadcast-box/DevicePreview.vue`): WebRTC live
  preview from a device.
- **DeviceSourceControl** (`components/broadcast-box/DeviceSourceControl.vue`):
  Video/audio source selector.
- **DevicePiPControl** (`components/broadcast-box/DevicePiPControl.vue`):
  Picture-in-Picture configuration.
- **DeviceStreamingControl**
  (`components/broadcast-box/DeviceStreamingControl.vue`): RTMP streaming
  controls.
- **DeviceConfigControl** (`components/broadcast-box/DeviceConfigControl.vue`):
  Device-level configuration.
- **DeviceManualRecording**
  (`components/broadcast-box/DeviceManualRecording.vue`): Manual recording
  start/stop with duration timer.
- **DeviceWatermarkControl**
  (`components/broadcast-box/DeviceWatermarkControl.vue`): Watermark overlay
  configuration.
- **DeviceStatusBadge** (`components/broadcast-box/DeviceStatusBadge.vue`):
  Online/offline badge.
- **DeviceStatusControl** (`components/broadcast-box/DeviceStatusControl.vue`):
  Device status management.
- **BroadcastBoxControls**
  (`components/broadcast-box/BroadcastBoxControls.vue`): Combined device
  controls panel.
- **ConnectionStatusIndicator**
  (`components/broadcast-box/ConnectionStatusIndicator.vue`): WebSocket
  connection state indicator.
- **RecordingControls** (`components/broadcast-box/RecordingControls.vue`):
  Session-based recording controls.
- **SessionStatusBadge** (`components/broadcast-box/SessionStatusBadge.vue`):
  Session status badge.

### Key Composables

- **useBroadcastBox**: REST API operations for devices, sessions, uploads.
- **useDeviceCommands**: Send commands to devices via the API.
- **useDeviceConnectionStatus**: WebSocket connection to the realtime server for
  device status, health, and event streaming.
- **useDevicePreview**: WebRTC peer connection for live video preview.
- **useManualRecording**: Manual recording with duration tracking.

### Pages

- **Device List** (`pages/settings/broadcast-box/index.vue`): Enrolled device
  overview.
- **Device Detail** (`pages/settings/broadcast-box/[id]/index.vue`): Device
  controls, preview, source selection, recording, and streaming.

## Storage UI

### Components

- **FileBrowser** (`components/storage/FileBrowser.vue`): Browse, search,
  upload, and manage files with UUID tracking.
- **FileBrowserPopover** (`components/storage/FileBrowserPopover.vue`): Compact
  file browser in a popover for selecting attachments.
- **FileUpload** (`components/storage/FileUpload.vue`): Drag-and-drop file
  upload with progress.
- **MediaPlayer** (`components/storage/MediaPlayer.vue`): Preview audio, video,
  images, and PDFs from UUID storage.

### Pages

- **Storage** (`pages/settings/storage/index.vue`): File management dashboard.

## Settings UI

- Users: create/edit forms via `UserForm.vue` (inline validation; role + basic
  fields).
- Configuration: edit via metadata form and raw YAML editor; validation surfaced
  via toasts.
- Notifications: test email sender at `Settings > Notifications` (admin-only),
  uses `POST /api/v1/notifications/test` with SendGrid/SMTP from config.

### Setup Wizard

- Banner on `/settings` (admin-only) appears when any required config in
  `data/.civic/*.yml` is missing.
- Wizard page: `/settings/setup` (admin-only)
  - Lists configuration status via `GET /api/v1/config/status`.
  - “Create from defaults” uses `POST /api/v1/config/:type/reset`.
  - “Validate” uses `POST /api/v1/config/:type/validate` and
    `GET /api/v1/config/validate/all`.
  - All actions show inline toasts and are audit-logged by the API.

## Activity Log (Audit)

- Page: `modules/ui/app/pages/settings/activity.vue`
- Access: requires `system:admin`
- Displays recent audit entries from `GET /api/v1/audit`
- Shows timestamp, outcome badge, action, actor, target summary, and optional
  metadata (JSON)
- Includes a Refresh action and breadcrumb under Settings

## Authentication UI

### Account Creation

- **Registration Page** (`modules/ui/app/pages/auth/register.vue`): User
  registration form with validation
- **Account Creation Workflow**: Complete user registration with role assignment
- **Form Validation**: Inline validation with API error handling
- **Integration**: Seamless integration with authentication system

### Password Reset

- **Status**: Not yet implemented
- **Planned**: Password reset page and email-based reset workflow

## Internationalization (i18n)

CivicPress UI is fully internationalized with support for English and French.

### Implementation

- **Framework**: `@nuxtjs/i18n` with `vue-i18n` for Vue 3
- **Translation Files**: JSON-based files in `modules/ui/i18n/locales/`
  - `en.json` - English translations
  - `fr.json` - French translations
- **Pluralization**: ICU MessageFormat support for proper plural forms
- **Coverage**: All UI components, pages, forms, modals, and messages are
  translated

### Translation Structure

Translation keys are organized by feature area:

- `common.*` - Common UI elements (buttons, labels, actions)
- `auth.*` - Authentication pages and messages
- `records.*` - Record management UI
- `geography.*` - Geography file management
- `settings.*` - Settings pages (profile, users, configuration, etc.)
- `storage.*` - File storage management
- `footer.*` - Footer component

### Usage in Components

```vue
<script setup lang="ts">
const { t } = useI18n();
</script>

<template>
  <h1>{{ t('records.title') }}</h1>
  <UButton>{{ t('common.save') }}</UButton>
</template>
```

### Pluralization

```vue
{{ (t as any)('records.filesSelected', count, { count }) }}
```

### Dynamic Content Translation

For configuration-driven content (record types, statuses), use the
`useConfigTranslations` composable:

```typescript
const { translateConfigValue } = useConfigTranslations();
const translatedLabel = translateConfigValue('recordType', 'bylaw');
```

### Current Status

All UI components and pages are fully translated:

- Records management (listing, detail, create, edit, raw view)
- Geography management (listing, detail, create, edit)
- Settings pages (profile, users, configuration, notifications, storage,
  activity, broadcast-box, diagnostics)
- Authentication pages (login, register, logout, verify email)
- All form components and selectors
- All modals, alerts, and toast notifications
- Navigation and breadcrumbs
- Footer component

## Composables

The UI module has 28 composables in `app/composables/`:

| Composable                  | Purpose                                              |
| --------------------------- | ---------------------------------------------------- |
| `useApi`                    | Wrapper for `useFetch` with `$civicApi`              |
| `useAuth`                   | Authentication wrapper for auth store                |
| `useAttachmentTypes`        | Fetch attachment type configs from API               |
| `useAutosave`               | Debounced autosave with retry                        |
| `useBroadcastBox`           | Broadcast Box REST API operations                    |
| `useCsrf`                   | CSRF token fetch/store/ensure                        |
| `useConfigTranslations`     | Translate config-driven content via i18n             |
| `useDeviceCommands`         | Device command execution via API                     |
| `useDeviceConnectionStatus` | WebSocket connection to realtime server              |
| `useDevicePreview`          | WebRTC live preview from device                      |
| `useDiagnostics`            | Run system diagnostics via API                       |
| `useErrorHandler`           | Centralized error handling with toasts               |
| `useIcons`                  | Central Lucide icon registry (200+ icons)            |
| `useLinkCategories`         | Fetch link categories from API                       |
| `useLoading`                | Loading state management with global flag            |
| `useManualRecording`        | Manual recording with duration tracking              |
| `useMarkdown`               | Render markdown to HTML (marked + custom renderer)   |
| `useRecordLock`             | Record edit lock acquire/release/poll                |
| `useRecordQueryState`       | URL query param management for record listings       |
| `useRecordStatuses`         | Fetch and cache record status metadata               |
| `useRecordTypes`            | Fetch and cache record type metadata                 |
| `useRecordUtils`            | Date formatting, status/type display helpers         |
| `useSearchSuggestions`      | Debounced search autocomplete from API               |
| `useSecurity`               | User security operations (password, email)           |
| `useTemplates`              | Template fetch, preview, and client-side processing  |
| `useUserRoles`              | Fetch and cache role configs with permission helpers |
| `broadcast-box-types`       | TypeScript type definitions for broadcast-box        |

## Plugins

- **01-civicApi.ts**: Creates the `$civicApi` fetch instance with base URL, auth
  token injection, CSRF headers, and error interceptors (401 redirect,
  403/422/5xx toast handling).
- **02-auth-init.client.ts**: Client-side plugin that validates stored tokens
  and refreshes user data on app load.

## Middleware

- **requireAuth**: Redirects to `/auth/login` if not authenticated.
- **requireAdmin**: Requires `system:admin` permission.
- **requireConfigManage**: Requires `config:manage` permission.
- **requireUsersManage**: Requires `users:manage` permission.

## State Management (Pinia)

Three stores in `app/stores/`:

- **auth**: User, token, session expiration, login/logout/refresh actions.
  Persisted to localStorage (`civic_auth_token`, `civic_auth_user`,
  `civic_auth_expires_at`).
- **app**: Sidebar state, theme preference, transient notifications. Persisted
  to localStorage (`civic_app_state`).
- **records**: Record list state and caching.

## Pages Summary

36 page files across 5 route groups:

- **/** — Home/dashboard
- **/auth/** — Login, logout, register, forgot-password, verify-email (6 pages)
- **/records/** — List, new, drafts, by-type, view, edit, raw (8 pages)
- **/geography/** — List, create, view, edit (4 pages)
- **/settings/** — Profile, activity, diagnostics, notifications, setup,
  broadcast-box, configuration, storage, users (17 pages)
