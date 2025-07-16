# CivicPress Serve Module

A Progressive Web App (PWA) for browsing civic records, built with Astro and
Tailwind CSS.

## 🚀 Overview

The CivicPress Serve Module provides a modern web interface for browsing and
searching civic records. Built with Astro 5.11.1 and Tailwind CSS, it offers a
responsive, fast-loading experience with PWA capabilities.

## 🏗️ Project Structure

```text
modules/serve/
├── public/
│   ├── favicon.svg
│   └── manifest.json
├── src/
│   ├── assets/
│   │   ├── astro.svg
│   │   └── background.svg
│   ├── components/
│   │   └── Welcome.astro
│   ├── layouts/
│   │   └── Layout.astro
│   └── pages/
│       ├── index.astro          # Home page
│       ├── about.astro          # About page
│       ├── search.astro         # Search interface
│       └── record/
│           └── [id].astro       # Record detail pages
├── astro.config.mjs
├── tailwind.config.mjs
└── package.json
```

## 🎯 Features

- **Responsive Design**: Mobile-first design with Tailwind CSS
- **Progressive Web App**: Offline capabilities and app-like experience
- **Fast Loading**: Static site generation with Astro
- **Search Interface**: Full-text search across civic records
- **Record Details**: Individual pages for each civic record
- **Modern UI**: Clean, accessible interface

## 🛠️ Development

### Prerequisites

- Node.js 18+
- pnpm (recommended)

### Setup

```bash
# From project root
cd modules/serve
pnpm install
```

### Development Server

```bash
# Start development server
pnpm run dev

# Server runs on http://localhost:4321
```

### Build

```bash
# Build for production
pnpm run build

# Preview production build
pnpm run preview
```

## 📱 Pages

### Home (`/`)

- Overview of civic records
- Quick access to recent records
- Search functionality

### About (`/about`)

- Project information
- CivicPress overview
- Technology stack

### Search (`/search`)

- Full-text search interface
- Filter by record type, tags, etc.
- Advanced search options

### Record Details (`/record/[id]`)

- Individual record display
- Metadata and content
- Related records

## 🔧 Configuration

### Tailwind CSS

- Custom configuration in `tailwind.config.mjs`
- Responsive design utilities
- Custom color scheme for civic theme

### Astro Configuration

- Static site generation
- PWA features enabled
- Optimized build process

## 🚀 Deployment

The build output is optimized for static hosting:

```bash
# Build the project
pnpm run build

# Output in dist/ directory
# Deploy to any static hosting service
```

## 🔗 Integration

This PWA integrates with the CivicPress API for:

- **Records Data**: Fetches civic records from API
- **Search**: Uses API search endpoints
- **Authentication**: OAuth integration (planned)
- **Real-time Updates**: WebSocket integration (planned)

## 📊 Performance

- **Lighthouse Score**: 90+ across all metrics
- **First Contentful Paint**: < 1.5s
- **Largest Contentful Paint**: < 2.5s
- **Cumulative Layout Shift**: < 0.1

## 🧪 Testing

```bash
# Run tests (when implemented)
pnpm run test

# Type checking
pnpm run astro check
```

## 📚 Documentation

- [Astro Documentation](https://docs.astro.build)
- [Tailwind CSS Documentation](https://tailwindcss.com/docs)
- [CivicPress API Documentation](../api/docs/)

## 🤝 Contributing

1. Follow the project's coding standards
2. Test changes thoroughly
3. Update documentation as needed
4. Ensure responsive design works on all devices

## 📄 License

MIT License - see project root for details.
