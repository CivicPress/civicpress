# 🎨 CivicPress Spec: `branding.md`

---
version: 1.0.0
status: stable
created: '2025-07-03'
updated: '2025-07-15'
deprecated: false
sunset_date: null
additions:

- comprehensive branding documentation
- brand compliance
- security considerations
compatibility:
  min_civicpress: 1.0.0
  max_civicpress: 'null'
  dependencies:
  - 'ui.md: >=1.0.0'
  - 'themes.md: >=1.0.0'
authors:
- Sophie Germain <sophie@civic-press.org>
reviewers:
- Ada Lovelace
- Irène Joliot-Curie

---

## 📛 Name

Organizational Branding Layer

## 🎯 Purpose

Allow each CivicPress instance (town, region, organization) to define its own
visual identity and civic presence — without altering core functionality.

This supports civic trust, consistency, and optional white-label deployments.

---

## 🧩 Scope & Responsibilities

✅ Responsibilities:

- Define brand name, logo, and visual identity
- Configure favicon, app icon, splash image
- Set organization metadata (slogan, links, meta tags)
- Enable white-label mode (CivicPress-free branding)
- Support per-module or per-page overrides (e.g., events, tourism)

❌ Out of Scope:

- Core UI theming (see `themes.md`)
- Per-user personalization (handled in `ui.md`)

---

## 🔗 Inputs & Outputs

| Input                               | Output                                |
| ----------------------------------- | ------------------------------------- |
| `branding.yml`                      | Global civic identity and brand logic |
| `public/logo.svg`                   | Used in headers, PDFs, share previews |
| `.env` or config                    | Toggles white-label, custom copyright |
| Meta tags (og:title, favicon, etc.) | Populated on build                    |

---

## 📁 File/Folder Location

```
public/logo.svg
public/favicon.ico
public/manifest.webmanifest
public/splash.png

.civic/branding.yml
core/branding.ts
```

---

## 📄 Example `branding.yml`

```yaml
name: 'Ville de Richmond'
slug: 'richmond'
slogan: 'Transparence. Participation. Confiance.'
logo: '/logo.svg'
favicon: '/favicon.ico'
meta:
  og_title: 'Richmond Civic Records'
  twitter_card: 'summary_large_image'
white_label: true
```

## 📝 Example Advanced Branding Configuration

```yaml
# .civic/branding.yml
branding:
  name: 'Ville de Richmond'
  slug: 'richmond'
  slogan: 'Transparence. Participation. Confiance.'
  logo:
    url: '/logo.svg'
    alt: 'Richmond Official Logo'
    width: 180
    height: 60
  favicon: '/favicon.ico'
  splash: '/splash.png'
  meta:
    og_title: 'Richmond Civic Records'
    og_description: 'Official civic records and public data for Richmond.'
    og_image: '/og-image.png'
    twitter_card: 'summary_large_image'
    theme_color: '#1a4d80'
  white_label: true
  copyright:
    text: '© 2025 Ville de Richmond'
    url: 'https://richmond.ca'
  links:
    - text: 'Official Website'
      url: 'https://richmond.ca'
    - text: 'Contact'
      url: 'mailto:info@richmond.ca'
    - text: 'Transparency Policy'
      url: '/policies/transparency'
  overrides:
    events:
      logo: '/events-logo.svg'
      color: '#e67e22'
    tourism:
      logo: '/tourism-logo.svg'
      color: '#27ae60'
```

---

## 🔐 Security & Trust Considerations

- White-labeling should be intentional (not hidden CivicPress use)
- Organizations must own or verify domain/logo
- Protect against spoofing (signed branding.yml?)

---

## 🧪 Testing & Validation

- Validate proper favicon and OpenGraph injection
- Test email header and meta branding
- Check fallback branding in white-label mode
- Confirm override behavior for modules or themes

---

## 🛠️ Future Enhancements

- Custom print headers/footers (logo + QR code)
- Branding presets for reuse (Quebec MRC, Canada Gov, etc.)
- Brand audit checker for compliance
- Dynamic brand switching (multi-tenant)

---

## 📅 History

- Drafted: 2025-07-04
