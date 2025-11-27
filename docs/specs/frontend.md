# ️ CivicPress Spec: `frontend.md`

---

version: 1.0.0 status: stable created: '2025-07-03' updated: '2025-07-15'
deprecated: false sunset_date: null breaking_changes: [] additions:

- comprehensive frontend documentation
- UI patterns
- security considerations fixes: [] migration_guide: null compatibility:
 min_civicpress: 1.0.0 max_civicpress: 'null' dependencies:
 - 'ui.md: >=1.0.0'
 - 'api.md: >=1.0.0' authors:
- Sophie Germain <sophie@civicpress.io> reviewers:
- Ada Lovelace
- Irène Joliot-Curie

---

## Name

`frontend` — CivicPress User Interface Layer

## Purpose

Define the core user experience for navigating, viewing, and submitting civic
records through a modern, web-accessible interface.

---

## Scope & Responsibilities

Responsibilities:

- Serve Markdown records as readable civic documents
- Provide feedback submission interface
- Display civic modules, timelines, and indexes
- Surface role-based tools (e.g. propose, review, approve)
- Enable light editing for permitted users

Out of scope:

- Real-time multi-user editing (see `collaborative-editing.md`)
- Full CMS backend (Tina/Decap = optional enhancements)

---

## Inputs & Outputs

| Input | Description |
| ------------------- | ----------------------------------------------------- |
| Civic records | Markdown files from `records/` directory |
| User authentication | Role and permission data from auth system |
| Brand configuration | Logo, colors, and branding from `.civic/branding.yml` |
| Theme settings | UI theme and styling configuration |
| Search queries | User search requests and filters |

| Output | Description |
| ----------------- | ------------------------------------- |
| Rendered pages | HTML pages with civic content |
| User interactions | Form submissions, navigation events |
| API requests | Calls to backend services and APIs |
| Client-side state | User session and UI state management |
| Analytics data | User behavior and interaction metrics |

---

## File/Folder Location

```
frontend/
├── pages/
│ ├── index.vue # Home page and dashboard
│ ├── bylaws/
│ │ ├── index.vue # Bylaws listing
│ │ └── [slug].vue # Individual bylaw view
│ ├── feedback/
│ │ ├── index.vue # Feedback listing
│ │ ├── submit.vue # Feedback submission form
│ │ └── [id].vue # Individual feedback view
│ ├── timeline/
│ │ └── index.vue # Chronological activity view
│ └── records/
│ └── [path].vue # Generic record viewer
├── components/
│ ├── ui/
│ │ ├── Header.vue # Site header with navigation
│ │ ├── Footer.vue # Site footer
│ │ ├── Search.vue # Search component
│ │ └── ThemeToggle.vue # Theme switching
│ ├── civic/
│ │ ├── RecordViewer.vue # Markdown record display
│ │ ├── FeedbackForm.vue # Feedback submission
│ │ └── Timeline.vue # Activity timeline
│ └── layout/
│ ├── DefaultLayout.vue # Default page layout
│ └── AdminLayout.vue # Admin-specific layout
├── composables/
│ ├── useAuth.ts # Authentication composable
│ ├── useRecords.ts # Record data composable
│ ├── useFeedback.ts # Feedback composable
│ └── useSearch.ts # Search functionality
├── utils/
│ ├── markdown.ts # Markdown rendering utilities
│ ├── validation.ts # Form validation
│ └── api.ts # API client utilities
├── assets/
│ ├── css/
│ │ ├── main.css # Global styles
│ │ └── themes.css # Theme definitions
│ ├── images/
│ │ └── logo.svg # Default logo
│ └── icons/
│ └── civic.svg # CivicPress icon
├── middleware/
│ ├── auth.ts # Authentication middleware
│ └── permissions.ts # Permission checking
├── plugins/
│ ├── markdown.ts # Markdown plugin
│ └── analytics.ts # Analytics plugin
└── tests/
 ├── unit/
 │ ├── components/
 │ └── composables/
 ├── integration/
 │ └── pages/
 └── e2e/
 └── navigation.test.ts
```

---

## Security & Trust Considerations

### Frontend Security

- Content Security Policy (CSP) headers to prevent XSS attacks
- Input validation and sanitization for all user inputs
- Secure handling of authentication tokens and session data
- Protection against CSRF attacks with proper token validation
- Regular security audits of frontend dependencies

### User Privacy & Data Protection

- Minimal data collection and transparent privacy policies
- GDPR-compliant cookie consent and data handling
- Anonymous browsing options for sensitive civic records
- Secure transmission of user data over HTTPS
- User control over personal data and account deletion

### Access Control & Permissions

- Role-based UI rendering and feature access
- Client-side permission validation with server-side verification
- Secure handling of administrative interfaces and tools
- Audit logging of user interactions and access attempts
- Protection of sensitive civic records and administrative functions

### Content Integrity & Trust

- Cryptographic verification of civic record authenticity
- Tamper-evident display of civic record metadata
- Clear indication of record status and modification history
- Protection against content manipulation and spoofing
- Transparent display of record sources and verification status

### Performance & Reliability

- Progressive enhancement for accessibility and reliability
- Graceful degradation when JavaScript is disabled
- Fast loading times and responsive design
- Offline capability for critical civic information
- Error handling and user-friendly error messages

---

## ️ Key Screens

| Page | Purpose |
| ------------------- | --------------------------------- |
| `/` | Welcome + Town Dashboard |
| `/bylaws/` | List of bylaws by section/status |
| `/feedback/` | Recent feedback with filters |
| `/timeline/` | Chronological civic activity |
| `/sessions/` | Public meeting archives |
| `/records/XYZ.md` | Rendered Markdown civic record |
| `/submit-feedback/` | Form to submit comment/suggestion |
| `/login` (future) | GitHub or Civic ID auth |

---

## Features

- Responsive layout (mobile-friendly)
- Theme based on local identity (flag, colors)
- Auto-index from `index.yml`
- Read-only unless authenticated
- Markdown rendered with syntax highlighting + YAML badge

---

## ️ Editing Behavior

- Light inline editor for small edits (if authorized)
- "Propose edit" opens in new Git branch
- Optional integration with TinaCMS/Decap later
- Lockfile notice if record is in use

---

## Permissions Enforcement

- UI respects `.civic/roles.yml` and `permissions.md`
- Non-editors can only view and submit feedback
- Drafts, archived, or rejected records only visible to clerks unless flagged
 `public: true`

---

## Powered By

- Framework: **Nuxt** (or Next) — supports SSR and static export
- Editor: Basic Markdown textarea (extendable)
- API: Reads from Git or filesystem (eventually via `serve.md`)
- CLI: `civic dev` spins up local instance

---

## Testing & Validation

- Test responsive design across devices
- Verify role-based access controls
- Ensure Markdown rendering works correctly
- Test feedback submission flow
- Validate search and filtering functionality

---

## ️ Future Enhancements

- Search by tag, date, role, or status
- Filterable dashboards for clerks and council
- Commenting thread per record (Git-based)
- Interactive timeline graph

---

## History

- Drafted: 2025-07-03
