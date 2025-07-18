# CivicPress UI Module

The web interface for CivicPress, built with Nuxt 4 and Nuxt UI.

## 🏗️ Architecture

### Technology Stack

- **Framework:** Nuxt 4 (SPA mode)
- **UI Library:** Nuxt UI (built on Tailwind CSS)
- **Authentication:** JWT-based (OAuth + user/password)
- **API Integration:** Direct connection to CivicPress API

### Module Structure

```
modules/ui/
├── pages/                   # File-based routing
├── components/              # Vue components
├── composables/             # Composables
├── plugins/                 # Nuxt plugins
├── utils/                   # Utilities
├── types/                   # TypeScript types
└── assets/                  # Static assets
```

### Plugin Architecture

- **Plugin Registry:** Extensible plugin system
- **Hook System:** Lifecycle events and customization points
- **Theme Engine:** Configurable theming system
- **Replaceable Components:** Modular component architecture

## 🚀 Development

### Setup

```bash
cd modules/ui
npm install
npm run dev
```

### Configuration

- **Port:** 3030 (to avoid conflicts with API on 3000)
- **API Base:** http://localhost:3000
- **Mode:** SPA (no SSR)

### Authentication

- **OAuth:** GitHub integration
- **User/Password:** Simulated authentication
- **JWT Tokens:** Both methods return valid tokens

## 🎯 Features

### User Journey

```
Home → Login → Sign Up → Record List → Single Record → Search → User CRUD
```

### Role-Based Interface

- **Single UI** for all users
- **Edit panels** only for authenticated users
- **Permission-based** feature visibility

### API Integration

- **Real data** from Day 1
- **No mock data** or development mode
- **Direct API calls** to CivicPress backend

## 🔧 Plugin System

### Hook Points

- `beforeRecordView` - Before displaying a record
- `afterRecordEdit` - After editing a record
- `onAuthChange` - When authentication state changes
- `onThemeChange` - When theme is changed

### Extension Points

- **Components:** Replaceable UI components
- **Themes:** Customizable theme system
- **Authentication:** Pluggable auth providers
- **API Clients:** Extensible API integration

## 📝 Development Status

- [ ] Module initialization
- [ ] Authentication system
- [ ] Record browsing
- [ ] Search functionality
- [ ] Admin features
- [ ] Plugin architecture
- [ ] Theme system
- [ ] PWA features
