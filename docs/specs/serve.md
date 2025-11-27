# CivicPress Spec: `serve.md`

---

version: 1.0.0 status: stable created: '2025-07-03' updated: '2025-07-15'
deprecated: false sunset_date: null additions:

- comprehensive serve documentation
- hosting patterns
- security considerations compatibility: min_civicpress: 1.0.0 max_civicpress:
 'null' dependencies:
 - 'deployment.md: >=1.0.0'
 - 'static-export.md: >=1.0.0' authors:
- Sophie Germain <sophie@civicpress.io> reviewers:
- Ada Lovelace
- Irène Joliot-Curie

---

## Name

`serve` — CivicPress Static & Live Preview Server

## Purpose

Enable towns, clerks, and citizens to preview civic records locally or on hosted
platforms without requiring a full frontend app.

`civic serve` provides a universal, portable viewer for CivicPress records —
using static HTML or local Nuxt rendering.

---

## Scope & Responsibilities

Responsibilities:

- Render Markdown records as HTML
- Read from local Git repo (`records/`)
- Support Git history view, change tracking
- Allow filtered browsing (`/bylaws`, `/timeline`, etc.)
- Serve `.civic/index.yml` for navigation

Not responsible for:

- Admin UI
- Approvals, publishing, or writing actions

---

## Inputs & Outputs

| Input | Description |
| ------------------- | ---------------------------------------- |
| Civic records | Markdown files from `records/` directory |
| Git repository | Local Git repo with civic history |
| Configuration files | `.civic/index.yml` and theme settings |
| HTTP requests | Browser requests for civic content |
| Authentication data | Optional user authentication info |

| Output | Description |
| --------------- | ---------------------------------------- |
| Rendered HTML | Civic records rendered as web pages |
| API responses | JSON data for civic records and metadata |
| Static assets | CSS, JavaScript, and theme files |
| Navigation data | Index and search results |
| Audit logs | Server access and request logs |

---

## File/Folder Location

```
serve/
├── server.ts # Main server entry point
├── routes/
│ ├── index.ts # Main route handlers
│ ├── records.ts # Record serving routes
│ ├── api.ts # API endpoint routes
│ └── assets.ts # Static asset routes
├── lib/
│ ├── render.ts # Markdown rendering utilities
│ ├── git.ts # Git integration utilities
│ ├── auth.ts # Authentication utilities
│ └── cache.ts # Caching utilities
├── views/
│ ├── layout.html # Base HTML template
│ ├── record.html # Record display template
│ ├── index.html # Index page template
│ └── error.html # Error page template
├── themes/
│ ├── default.css # Default theme styles
│ ├── classic.css # Classic theme styles
│ └── modern.css # Modern theme styles
├── middleware/
│ ├── auth.ts # Authentication middleware
│ ├── cors.ts # CORS configuration
│ └── logging.ts # Request logging middleware
└── config/
 ├── serve.yml # Server configuration
 └── themes.yml # Theme configuration

tests/
├── serve/
│ ├── server.test.ts
│ ├── rendering.test.ts
│ └── routing.test.ts
└── integration/
 └── serve-integration.test.ts
```

---

## Security & Trust Considerations

### Server Security

- All server endpoints must validate input and sanitize output
- Rate limiting to prevent abuse and denial of service attacks
- Request size limits to prevent memory exhaustion
- Secure headers and CORS configuration for web security
- Regular security audits of server code and dependencies

### Access Control & Authentication

- Read-only access to civic records by default
- Optional authentication for sensitive or internal records
- Role-based access control for different record types
- Session management and timeout for authenticated users
- Audit logging of all server access and requests

### Data Protection & Privacy

- No personal data collection or storage in server logs
- GDPR-compliant request handling and data processing
- Secure transmission of civic data over HTTPS
- User privacy protection in access logs and analytics
- Data retention policies for server logs and cache

### Content Integrity & Trust

- Cryptographic verification of served civic record authenticity
- Tamper-evident display of record metadata and sources
- Protection against content manipulation and spoofing
- Transparent display of record sources and verification status
- Immutable audit trails for all served content

### Performance & Reliability

- Graceful degradation when Git or file system is unavailable
- Efficient caching strategies for frequently accessed content
- Resource usage monitoring and limits
- Error handling and user-friendly error messages
- Backup and disaster recovery for server configuration

### Compliance & Legal Requirements

- Compliance with municipal web serving requirements
- Support for public records laws and access requirements
- Legal review process for server configuration and policies
- Compliance with web accessibility standards (WCAG)
- Regular legal audits of server practices and policies

---

## ️ Architecture

- Lightweight Express or Hono server
- Uses `markdown-it`, `highlight.js`, `gray-matter`, and civic theming
- Local `.env` config for port, root path, theme
- Compatible with `public/` folder (Nuxt optional)

---

## Folder Example

```
serve/
├── server.ts # Entry file
├── routes/
│ └── *.ts # Markdown and asset routes
├── lib/
│ └── render.ts # Markdown to HTML
├── views/
│ └── layout.html # Templated renderer
└── themes/
 └── default.css
```

---

## Preview Modes

| Mode | Description |
| ------- | ------------------------------------------ |
| Static | Previews Markdown only, fast load |
| Dynamic | Enables search, tags, Git log view |
| API | Acts as API fallback if `api/` not running |

---

## ️ Usage

```bash
civic serve
```

Options:

- `--port 4000`
- `--theme ./themes/classic.css`
- `--records ./records/`
- `--index .civic/index.yml`

---

## Permissions & Security

- Read-only mode
- Optional `.htpasswd` or GitHub auth
- Log IP, requests, and headers for audit

---

## Testing & Validation

- Test Markdown rendering with various content types
- Verify theme switching works correctly
- Test different preview modes (static, dynamic, API)
- Ensure proper error handling for missing files
- Validate security restrictions in read-only mode

---

## ️ Future Enhancements

- Export static build (`civic export`)
- Mobile-friendly theme
- Timeline visualization (e.g. `/timeline`)
- QR code civic document preview

---

## History

- Drafted: 2025-07-03

breaking_changes: [] fixes: [] migration_guide: null
