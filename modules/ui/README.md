# CivicPress UI Module

## Overview

The UI module provides a modern, responsive frontend for CivicPress using Nuxt 4
with Nuxt UI. This module serves as the primary user interface for
interacting with the CivicPress API.

## Architecture

### Technology Stack

- **Framework**: Nuxt 4 (Vue 3)
- **UI Library**: Nuxt UI (built on Tailwind CSS)
- **Mode**: SPA (Single Page Application)
- **Port**: 3030
- **API Integration**: RESTful API calls to CivicPress backend

### Key Decisions

1. **Nuxt UI v4**: Single MIT-licensed package that folds the former Pro
   components (Dashboard\*, NavigationMenu, etc.) into the free `@nuxt/ui`
   package as of v4.0.0. Migrated from paid `@nuxt/ui-pro` v3 + free
   `@nuxt/ui` v3 to single `@nuxt/ui ^4.8.0` on 2026-05-28 (closure
   commit `ec5a9a0`; finding `ui-002`).
   - Provides advanced components and better styling out of the box

2. **SPA Mode**: No SSR since we're API-driven
   - Faster development and deployment
   - Simpler architecture for API integration

3. **Port 3030**: Dedicated port to avoid conflicts with API (3000)

4. **API-First Design**: Frontend consumes REST API endpoints
   - Clean separation of concerns
   - Enables multiple frontend implementations

## Current Status

### Working

- Nuxt 4 development server running on port 3030
- Nuxt UI components available
- API server integration fully implemented
- Authentication system (JWT, OAuth, simulated)
- Dynamic content loading
- User interface components
- Record management interface (create, edit, view, delete)
- User dashboard and profile management
- Admin panel with user management
- Record listing and search functionality
- Status transition controls
- Internationalization (i18n) with English and French support
- File attachment system
- Geography file management
- Configuration management UI
- Development tools enabled

### In Progress

- Advanced workflow features
- Real-time notifications
- Plugin registry interface

### Planned

- Advanced analytics dashboard
- Custom report generation
- Multi-tenant support
- Advanced search filters

## Development

### Prerequisites

```bash
# Install dependencies
pnpm install

# Ensure API server is running on port 3000
pnpm dev:api
```

### Running the UI

```bash
# Start UI development server
pnpm dev:ui

# Or from project root
pnpm dev:ui
```

### Available Scripts

- `pnpm dev` - Start development server
- `pnpm build` - Build for production
- `pnpm preview` - Preview production build

## Configuration

### Environment Variables

- `API_BASE_URL` - Backend API URL (default: <http://localhost:3000>)

### Runtime Config

```typescript
runtimeConfig: {
  public: {
    apiBase: 'http://localhost:3000',
    appName: 'CivicPress',
    appVersion: '1.0.0'
  }
}
```

## File Structure

```
modules/ui/
├── app/
│   └── app.vue              # Root app component
├── pages/
│   └── index.vue            # Home page
├── components/              # Vue components
├── composables/            # Nuxt composables
├── assets/                 # Static assets
├── nuxt.config.ts          # Nuxt configuration
└── package.json            # Dependencies
```

## API Integration

### Current Setup

- API proxy configured for `/api` routes
- Base URL configurable via environment
- Ready for REST API consumption

### Planned Integration

- Authentication endpoints
- Record CRUD operations
- User management
- Workflow integration

## Styling

### Current Approach

- Using Nuxt UI components
- Tailwind CSS included via Nuxt UI
- No custom CSS files needed initially

### Future Enhancements

- Custom theme configuration
- Brand-specific styling
- Responsive design improvements

## Authentication

### Planned Implementation

- OAuth 2.0 integration
- User/password authentication
- Role-based access control
- Session management

## Plugin System

### Plugin Architecture

- Complex plugin registry with hooks
- Extensible component system
- Custom workflow integration
- Third-party plugin support

## Testing

### Planned Testing Strategy

- Unit tests for components
- Integration tests for API calls
- E2E tests for user workflows
- Visual regression testing

## Deployment

### Development Environment

- Hot reload enabled
- Development tools available
- API proxy configured

### Production

- Static site generation
- API integration
- CDN deployment ready

## Troubleshooting

### Common Issues

1. **Port conflicts**: Ensure port 3030 is available
2. **API connection**: Verify API server is running on port 3000
3. **Styling issues**: Nuxt UI handles most styling automatically

### Debug Commands

```bash
# Check if servers are running
curl http://localhost:3000/api/v1/health
curl http://localhost:3030

# View logs
pnpm dev:ui --verbose
```

## Next Steps

1. **Immediate**
   - Implement API composables
   - Add authentication flow
   - Create basic record management interface

2. **Short Term**
   - User dashboard
   - Record CRUD operations
   - Search and filtering

3. **Medium Term**
   - Admin panel
   - Plugin registry
   - Advanced workflows

4. **Long Term**
   - Mobile optimization
   - Offline capabilities
   - Advanced analytics

## Contributing

When contributing to the UI module:

1. Follow Vue 3 composition API patterns
2. Use Nuxt UI components when possible
3. Test API integration thoroughly
4. Maintain responsive design
5. Document new features

## Dependencies

### Core

- `nuxt`: ^4.4.5 (Nuxt 4)
- `@nuxt/ui`: ^4.8.0 (Nuxt UI v4 — MIT; includes former Pro components)
- `vue`: ^3.5.18
- `@pinia/nuxt`: ^0.11.3
- `pinia`: ^3.0.4

### Development Tools

- `vue-tsc`: TypeScript checking
- `@nuxt/devtools`: Development tools

### Notes

- `@nuxt/ui` v4 is MIT-licensed and free (Pro components folded into the free package as of v4.0.0)
- Most styling handled by Nuxt UI components; custom theme tokens set via CSS variables in `app/assets/css/main.css`
- Tailwind v4 already wired via CSS-first `@import "tailwindcss"`; no `tailwind.config.ts` needed
