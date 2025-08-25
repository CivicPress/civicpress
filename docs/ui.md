# CivicPress UI Overview

This document provides a high-level overview of the CivicPress UI layer.

- Framework: Nuxt 4 with Nuxt UI Pro
- Location: `modules/ui/`
- Dev server: runs on port 3030

For detailed UI docs and structure, see `modules/ui/README.md`.

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

## Activity Log (Audit)

- Page: `modules/ui/app/pages/settings/activity.vue`
- Access: requires `system:admin`
- Displays recent audit entries from `GET /api/v1/audit`
- Shows timestamp, outcome badge, action, actor, target summary, and optional
  metadata (JSON)
- Includes a Refresh action and breadcrumb under Settings
