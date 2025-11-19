# 🎨 CivicPress Spec: `themes.md`

---

version: 1.0.0 status: stable created: '2025-07-03' updated: '2025-07-15'
deprecated: false sunset_date: null additions:

- comprehensive theme documentation
- customization patterns
- security considerations compatibility: min_civicpress: 1.0.0 max_civicpress:
  'null' dependencies:
  - 'ui.md: >=1.0.0' authors:
- Sophie Germain <sophie@civicpress.io> reviewers:
- Ada Lovelace
- Irène Joliot-Curie

---

## 📛 Name

Theming & Municipal Branding

## 🎯 Purpose

Enable towns using CivicPress to customize the **visual appearance** of their
public UI — including logos, colors, fonts, and layout presets — to reflect
their civic identity without modifying core code.

---

## 🧩 Scope & Responsibilities

✅ Responsibilities:

- Allow custom logo, colors, and fonts
- Support multiple themes per town (e.g. light/dark, bilingual)
- Store town-wide brand config in `.civic/theme.yml`
- Expose theme data to frontend at build/runtime
- Offer default CivicPress theme fallback

❌ Out of Scope:

- Full white-labeling of core logic
- JavaScript runtime theming (handled by framework)

---

## 🔗 Inputs & Outputs

| Input                       | Result                              |
| --------------------------- | ----------------------------------- |
| `.civic/theme.yml`          | Loads logo, brand colors, town name |
| `public/theme/logo.svg`     | Overrides default CivicPress logo   |
| Frontend calls `useTheme()` | UI reflects town's visual identity  |

---

## 📂 File/Folder Location

```
.civic/theme.yml
public/theme/
  └── logo.svg
  └── favicon.png
  └── hero.jpg
```

## 📝 Example Theme Configuration

```yaml
# .civic/theme.yml
town:
  name: 'Richmond'
  province: 'Quebec'
  country: 'Canada'
  website: 'https://richmond.ca'
  contact:
    email: 'info@richmond.ca'
    phone: '+1-450-000-0000'
    address: '123 Main Street, Richmond, QC'

branding:
  logo:
    primary: '/theme/logo.svg'
    favicon: '/theme/favicon.ico'
    hero_image: '/theme/hero.jpg'
    alt_text: 'Richmond Municipality Logo'

  colors:
    primary: '#1a4d80' # Municipal blue
    secondary: '#e67e22' # Orange accent
    success: '#27ae60' # Green
    warning: '#f39c12' # Orange
    error: '#e74c3c' # Red
    info: '#3498db' # Blue

    background:
      primary: '#ffffff'
      secondary: '#f8f9fa'
      tertiary: '#e9ecef'

    text:
      primary: '#212529'
      secondary: '#6c757d'
      muted: '#adb5bd'
      inverse: '#ffffff'

  typography:
    font_family: 'Inter, system-ui, sans-serif'
    font_size_base: '16px'
    line_height_base: '1.5'
    headings:
      h1: '2.5rem'
      h2: '2rem'
      h3: '1.75rem'
      h4: '1.5rem'
      h5: '1.25rem'
      h6: '1rem'

  spacing:
    unit: '8px'
    container_max_width: '1200px'
    gutter: '24px'

  components:
    buttons:
      border_radius: '6px'
      padding: '12px 24px'
      font_weight: '500'

    cards:
      border_radius: '8px'
      shadow: '0 2px 4px rgba(0,0,0,0.1)'
      padding: '24px'

    forms:
      border_radius: '4px'
      border_color: '#ced4da'
      focus_color: '#1a4d80'

themes:
  default: 'light'
  available:
    - 'light'
    - 'dark'
    - 'high_contrast'

  light:
    name: 'Richmond Light'
    description: 'Default light theme'
    colors:
      background: '#ffffff'
      text: '#212529'

  dark:
    name: 'Richmond Dark'
    description: 'Dark theme for accessibility'
    colors:
      background: '#1a1a1a'
      text: '#ffffff'

  high_contrast:
    name: 'High Contrast'
    description: 'High contrast for accessibility'
    colors:
      background: '#ffffff'
      text: '#000000'
    accessibility:
      contrast_ratio: 7.0

accessibility:
  contrast_ratio: 4.5
  focus_visible: true
  reduced_motion: true
  keyboard_navigation: true

responsive:
  breakpoints:
    sm: '576px'
    md: '768px'
    lg: '992px'
    xl: '1200px'
    xxl: '1400px'

customization:
  allow_user_override: true
  allow_custom_css: false # Security consideration
  footer:
    text: '© 2025 Richmond Municipality'
    links:
      - text: 'Privacy Policy'
        url: '/privacy'
      - text: 'Terms of Service'
        url: '/terms'
```

---

## 🔐 Security & Trust Considerations

### Asset Security & Validation

- All theme assets (images, fonts, CSS) scanned for malicious content
- File type validation and size limits enforced for uploaded theme assets
- Content Security Policy (CSP) headers configured for theme resources
- Subresource Integrity (SRI) checks for external theme dependencies
- Automated scanning for embedded scripts or executable content in theme files

### Brand Protection & Compliance

- Trademark and copyright verification for uploaded logos and branding
- Automated detection of inappropriate or offensive content in theme assets
- Compliance with municipal branding guidelines and accessibility standards
- Version control and audit trail for all theme configuration changes
- Legal review process for custom branding and municipal identity

### Code Injection Prevention

- Strict sanitization of user-provided CSS and theme configuration
- Sandboxed execution environment for custom theme components
- Input validation and output encoding for all theme configuration fields
- Prevention of XSS attacks through theme customization features
- Regular security audits of theme rendering and customization systems

### Access Control & Permissions

- Role-based access control for theme modification and deployment
- Approval workflow for theme changes affecting public-facing interfaces
- Multi-factor authentication for theme administration access
- Audit logging of all theme-related activities and configuration changes
- Emergency rollback capability for problematic theme deployments

### Performance & Stability

- Resource usage limits for theme assets to prevent performance degradation
- Automated testing of theme compatibility across different devices and browsers
- Fallback mechanisms for missing or corrupted theme assets
- Monitoring and alerting for theme-related performance issues
- Regular backup and recovery procedures for theme configurations

### Compliance & Accessibility

- WCAG 2.1 AA compliance verification for all theme configurations
- Automated accessibility testing for color contrast and navigation
- Support for assistive technologies and screen readers
- Compliance with municipal accessibility policies and requirements
- Regular accessibility audits and user testing for theme implementations

---

## 🧪 Testing & Validation

- Load theme config and confirm branding applies
- Test dark/light mode switches (if available)
- Validate fallback if assets missing
- Ensure mobile and WCAG compliance with themes

---

## 🛠️ Future Enhancements

- Visual theming wizard in UI
- Upload branding kit via admin panel
- Support town-specific print templates (e.g. PDF export)
- Custom theme marketplace or preset sharing

---

## 📅 History

- Drafted: 2025-07-04
