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
- **GeographyBrowser** (`modules/ui/app/components/GeographyBrowser.vue`): File
  browser for record forms to link geography files
- **GeographySummary** (`modules/ui/app/components/GeographySummary.vue`): Data
  summary panels with feature counts and bounds

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

- RecordList (`modules/ui/app/components/RecordList.vue`): paginated list with
  search and basic filters.
- RecordSearch (`modules/ui/app/components/RecordSearch.vue`): search box and
  helpers.
- RecordForm (`modules/ui/app/components/RecordForm.vue`): create/edit records;
  shows save success/error feedback.

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

✅ **Complete**: All UI components and pages are fully translated

- Records management (listing, detail, create, edit, raw view)
- Geography management (listing, detail, create, edit)
- Settings pages (profile, users, configuration, notifications, storage,
  activity)
- Authentication pages (login, register, logout, verify email)
- All form components and selectors
- All modals, alerts, and toast notifications
- Navigation and breadcrumbs
- Footer component
