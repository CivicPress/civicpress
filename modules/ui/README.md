# CivicPress UI Module

## Overview

The UI module provides a modern, responsive frontend for CivicPress using Nuxt 4
with Nuxt UI Pro. This module serves as the primary user interface for
interacting with the CivicPress API.

## Architecture

### Technology Stack

- **Framework**: Nuxt 4.2.1 (Vue 3.5)
- **UI Library**: Nuxt UI Pro 3.3 (built on Tailwind CSS)
- **State Management**: Pinia 3.0 with localStorage persistence
- **i18n**: @nuxtjs/i18n 10.2 (English + French)
- **Markdown**: CodeMirror 6 editor + marked renderer
- **Maps**: Leaflet 1.9
- **Utilities**: @vueuse/core 13.5
- **Mode**: SPA (Single Page Application, no SSR)
- **Port**: 3030 (dev), configurable via `PORT` or `NUXT_PORT`

### Key Decisions

1. **SPA Mode**: No SSR since the app is API-driven with JWT authentication.
2. **Port 3030**: Dedicated port to avoid conflicts with the API (3000) and
   realtime server (3001).
3. **API-First Design**: Frontend consumes REST API endpoints. A Nitro dev proxy
   routes `/api` requests to the backend during development.

## Development

### Prerequisites

```bash
# Install dependencies from project root
pnpm install

# Ensure API server is running on port 3000
pnpm dev:api
```

### Running the UI

```bash
# Start UI development server
pnpm dev:ui
```

### Available Scripts

- `pnpm dev` — Start development server (port 3030)
- `pnpm build` — Build for production
- `pnpm preview` — Preview production build

## Configuration

### Environment Variables

| Variable                                 | Purpose            | Default                 |
| ---------------------------------------- | ------------------ | ----------------------- |
| `API_BASE_URL`                           | Backend API URL    | `http://localhost:3000` |
| `PORT` / `NUXT_PORT`                     | UI dev server port | `3030`                  |
| `NUXT_DEFAULT_LOCALE` / `DEFAULT_LOCALE` | Default locale     | `en`                    |

### Runtime Config

```typescript
runtimeConfig: {
  public: {
    civicApiUrl: process.env.API_BASE_URL || 'http://localhost:3000',
    appName: 'CivicPress',
    appVersion: '0.1.3'
  }
}
```

## File Structure

```
modules/ui/
├── app/
│   ├── app.vue                 # Root app component
│   ├── error.vue               # Error page
│   ├── assets/css/main.css     # Global CSS
│   ├── components/             # 56 Vue components
│   │   ├── broadcast-box/      #   17 broadcast-box components
│   │   ├── editor/             #   8 editor components
│   │   ├── records/            #   2 record-linking components
│   │   ├── storage/            #   5 storage components
│   │   └── *.vue               #   24 top-level components
│   ├── composables/            # 28 composables
│   ├── layouts/default.vue     # Default layout
│   ├── middleware/             # 4 route guards
│   ├── pages/                  # 36 page files
│   │   ├── auth/               #   6 auth pages
│   │   ├── geography/          #   4 geography pages
│   │   ├── records/            #   8 record pages
│   │   └── settings/           #   17 settings pages
│   ├── plugins/                # 2 plugins (civicApi, auth-init)
│   ├── stores/                 # 3 Pinia stores (auth, app, records)
│   ├── types/                  # 2 type definition files
│   └── utils/                  # 3 utility files + 1 test
├── i18n/locales/               # en.json, fr.json
├── nuxt.config.ts              # Nuxt configuration
├── package.json                # Dependencies
└── public/                     # Static assets (favicon, logos, PWA manifest)
```

## API Integration

- **Plugin**: `01-civicApi.ts` creates a `$civicApi` fetch instance with base
  URL, Bearer token injection, CSRF headers, and error interceptors.
- **Composable**: `useApi.ts` wraps Nuxt `useFetch` with the civic API client.
- **Dev Proxy**: Nitro proxies `/api` to `API_BASE_URL` during development.
- **Auth**: JWT tokens stored in localStorage, injected via request interceptor.
  CSRF tokens fetched from `/api/v1/auth/csrf-token` for state-changing
  requests.

## Authentication

- OAuth login (GitHub, Google, Microsoft) via `/api/v1/auth/login`
- Password login via `/api/v1/auth/password`
- Simulated auth for development via `/api/v1/auth/simulated`
- Public registration via `/api/v1/users/register`
- JWT stored in localStorage with expiration validation
- Route guards: `requireAuth`, `requireAdmin`, `requireConfigManage`,
  `requireUsersManage`

## Features

- **Records**: Create, edit (with CodeMirror markdown editor), view, delete,
  status transitions, draft management, record locking.
- **Geography**: Create, edit, view geography files with Leaflet map display,
  presets, and record linking.
- **Users**: Admin user management (create, edit, delete, role assignment),
  self-service password and email changes.
- **Configuration**: View and edit system configs (raw YAML and metadata form),
  setup wizard, validation.
- **Storage**: UUID-based file upload/download with media preview.
- **Broadcast Box**: Device enrollment, live WebRTC preview, source selection,
  PiP, RTMP streaming, manual recording, watermarks.
- **Diagnostics**: System health checks and auto-fix.
- **Activity Log**: Audit trail viewer (admin).
- **i18n**: Full English and French translations.
- **Collaborative Editing**: Record locking with autosave (yjs-based realtime
  editing via the realtime module).

## Troubleshooting

1. **Port conflicts**: Ensure port 3030 is available.
2. **API connection**: Verify API server is running on port 3000
   (`curl http://localhost:3000/api/v1/health`).
3. **Auth issues**: Clear localStorage keys `civic_auth_token`,
   `civic_auth_user`, `civic_auth_expires_at`.

## Dependencies

### Core

- `nuxt` ^4.2.1
- `vue` ^3.5.18
- `@nuxt/ui-pro` ^3.3.7
- `@pinia/nuxt` ^0.11.3 / `pinia` ^3.0.4
- `@nuxtjs/i18n` ^10.2.1
- `@vueuse/core` ^13.5.0
- `@codemirror/lang-markdown` ^6.0.2
- `marked` ^16.1.1
- `leaflet` ^1.9.4
