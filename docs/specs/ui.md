# CivicPress Spec: `ui.md`

---

version: 1.0.0 status: stable created: '2025-07-03' updated: '2025-07-15'
deprecated: false sunset_date: null breaking_changes: [] additions:

- comprehensive UI documentation
- accessibility considerations
- testing patterns fixes: [] migration_guide: null compatibility:
 min_civicpress: 1.0.0 max_civicpress: 'null' dependencies:
 - 'auth.md: >=1.0.0'
 - 'permissions.md: >=1.0.0' authors:
- Sophie Germain <sophie@civicpress.io> reviewers:
- Ada Lovelace
- Irène Joliot-Curie

---

## Name

`ui` — CivicPress User Interface Architecture

## Purpose

Define the structure, responsibilities, and separation of concerns between
CivicPress's public-facing UI and admin/editor tools.

## Scope & Responsibilities

Responsibilities:

- Define UI structure and separation of concerns
- Document public and admin UI responsibilities
- Ensure accessibility and responsive design
- Provide UI testing and validation guidelines

Out of Scope:

- Implementation-specific UI code
- Third-party UI libraries

---

## Inputs & Outputs

| Input | Description |
| -------------------------- | ----------------------------------------- |
| CivicPress data | Records, bylaws, feedback, and civic data |
| User authentication | GitHub OAuth and role-based access |
| UI components | Reusable Vue components and layouts |
| Design system | Tailwind CSS and design tokens |
| Accessibility requirements | WCAG compliance and responsive design |

| Output | Description |
| --------------------- | ---------------------------------- |
| Public UI | Static-exportable civic portal |
| Admin interface | Authenticated management tools |
| Responsive layouts | Mobile and desktop optimized views |
| Accessible components | WCAG compliant UI elements |
| Static exports | Deployable public-facing sites |

---

## File/Folder Location

```
ui/
├── public/ # Public-facing UI
│ ├── components/
│ │ ├── BylawViewer.vue
│ │ ├── TimelineNavigator.vue
│ │ ├── FeedbackExplorer.vue
│ │ └── SessionViewer.vue
│ ├── layouts/
│ │ ├── DefaultLayout.vue
│ │ └── PublicLayout.vue
│ ├── pages/
│ │ ├── index.vue
│ │ ├── bylaws/
│ │ ├── timeline/
│ │ ├── feedback/
│ │ └── sessions/
│ └── assets/
│ ├── styles/
│ └── images/
├── admin/ # Admin interface
│ ├── components/
│ │ ├── MarkdownEditor.vue
│ │ ├── FeedbackInbox.vue
│ │ ├── SubmissionReview.vue
│ │ └── RoleSettings.vue
│ ├── layouts/
│ │ └── AdminLayout.vue
│ ├── pages/
│ │ ├── index.vue
│ │ ├── editor/
│ │ ├── feedback/
│ │ └── settings/
│ └── composables/
│ ├── useAuth.ts
│ └── usePermissions.ts
├── shared/ # Shared components
│ ├── components/
│ │ ├── CivicHeader.vue
│ │ ├── CivicFooter.vue
│ │ └── SearchBar.vue
│ ├── composables/
│ │ ├── useCivicData.ts
│ │ └── useNavigation.ts
│ └── utils/
│ ├── formatters.ts
│ └── validators.ts
└── tests/ # UI tests
 ├── public/
 │ ├── BylawViewer.test.ts
 │ └── TimelineNavigator.test.ts
 ├── admin/
 │ ├── MarkdownEditor.test.ts
 │ └── FeedbackInbox.test.ts
 └── e2e/
 ├── public-journey.test.ts
 └── admin-workflow.test.ts

core/
├── ui.ts # UI framework integration
├── auth-provider.ts # Authentication provider
├── permission-checker.ts # Permission validation
└── static-exporter.ts # Static site generation

modules/
├── ui/
│ ├── components/
│ │ ├── UIManager.tsx # UI management
│ │ ├── ThemeProvider.tsx # Theme management
│ │ └── LayoutManager.tsx # Layout management
│ ├── hooks/
│ │ └── useUI.ts # UI state management
│ └── utils/
│ ├── responsive-utils.ts # Responsive design utilities
│ └── accessibility-utils.ts # Accessibility helpers
└── auth/
 └── components/
 └── AuthProvider.tsx # Authentication context

.civic/
├── ui.yml # UI configuration
├── themes/ # Theme definitions
│ ├── default.yml
│ └── civic.yml
└── layouts/ # Layout templates
 ├── public.yml
 └── admin.yml
```

---

## Security & Trust Considerations

### Public UI Security

- All public content must be sanitized and validated
- No sensitive data should be exposed in public UI
- Static exports must be thoroughly reviewed
- Public UI must be accessible without authentication
- Content must be properly escaped to prevent XSS

### Admin UI Security

- All admin routes must require authentication
- Role-based access control must be enforced
- Admin actions must be logged and audited
- Session management must be secure
- Input validation must prevent injection attacks

### Accessibility Compliance

- All UI components must meet WCAG 2.1 AA standards
- Keyboard navigation must be fully supported
- Screen reader compatibility must be verified
- Color contrast ratios must meet accessibility guidelines
- Responsive design must work across all devices

### Data Protection

- User data must be properly anonymized in public views
- Admin interfaces must respect data privacy requirements
- Audit logs must be maintained for all admin actions
- Session data must be securely managed
- Cross-site scripting protection must be implemented

---

## Layered UI Architecture

The CivicPress UI is divided into **two layers**:

| Layer | Audience | Description |
| --------- | ---------------- | ------------------------------------------------------- |
| `public/` | Citizens, public | Public-facing civic portal to view and explore records |
| `admin/` | Clerks, council | Authenticated tools to create, edit, and manage records |

---

## ️ `public/` UI Responsibilities

| Feature | Description |
| --------------------- | ------------------------------------------------- |
| Town homepage | `/` with logo, intro, last 3 bylaws, next session |
| Bylaw viewer | `/bylaws/[slug]` or `/bylaws/[section]/[slug]` |
| Timeline navigator | `/timeline/` |
| Feedback explorer | `/feedback/`, `/feedback/2025-07-01.md` |
| Public session viewer | `/sessions/`, linked videos + minutes |
| Search + tag filters | Optional in MVP |

Fully static-exportable (Nuxt `nuxi generate`) 
No login required 
100% safe and public 
Designed to be fast, legible, accessible

---

## `admin/` UI Responsibilities

| Feature | Description |
| ---------------------- | ---------------------------------------- |
| GitHub login (MVP) | Read role from `.civic/roles.yml` |
| Inline Markdown editor | Edit or propose edits to records |
| Feedback inbox | View/respond/approve comments |
| Submission review | Accept or reject proposed edits |
| Index trigger | Re-run civic index manually |
| Role settings (future) | View civic permissions and workflow logs |
| Draft workspace | Unpublished civic work area |

️ Protected by GitHub or Civic ID (later) 
️ Respects roles defined in `permissions.md` 
️ May run only in dev mode or gated route

---

## Frameworks

- **Nuxt 4** (recommended): handles SSR, SSG, file-based routing
- **Tailwind CSS**: styling baseline
- **Headless UI (Vue)**: component logic (dialogs, tabs, etc.)
- Optional: TinaCMS or Decap for file-based visual editing
- Optional: Serve public UI from Netlify/Vercel, admin via `civic dev`

---

## Auth Flow (MVP)

```yaml
- User visits /admin
- Prompted to login via GitHub
- GitHub user is matched to `.civic/roles.yml`
- If role is `clerk`, `reviewer`, or `editor`, access granted
```

Later, support for:

- Civic ID / OIDC
- Group-based permissions
- Branch-based access (via Git)

---

## ️ CLI Support

```bash
civic dev # Launches public + admin UI
civic serve # Public-only viewer
```

---

## Testing & Validation

- Test public UI renders without authentication
- Verify admin routes require proper role access
- Ensure static export works correctly
- Validate responsive design across devices
- Test role-based UI element visibility

---

## ️ Future Enhancements

- Advanced search functionality with fuzzy matching
- Real-time collaboration features for admin editing
- Analytics dashboard for civic engagement metrics
- Mobile-optimized admin interface
- Dark mode and theme customization
- Progressive Web App (PWA) capabilities
- Offline support for public content viewing
- Advanced accessibility features and tools

## Related Specs

- [`auth.md`](./auth.md) — Authentication and authorization
- [`permissions.md`](./permissions.md) — Role-based access control
- [`frontend.md`](./frontend.md) — Frontend architecture and patterns
- [`accessibility.md`](./accessibility.md) — Accessibility requirements
- [`testing-framework.md`](./testing-framework.md) — UI testing strategies

---

## History

- Drafted: 2025-07-03
- Updated: Renamed `frontend/` → `public/`
- Updated: Added comprehensive UI documentation and accessibility considerations
