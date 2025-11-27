# CivicPress Spec: `manifest.md`

---

version: 1.0.0 status: stable created: '2025-07-03' updated: '2025-07-15'
deprecated: false sunset_date: null breaking_changes: [] additions:

- detailed YAML field definitions
- comprehensive field documentation fixes: [] migration_guide: null
 compatibility: min_civicpress: 1.0.0 max_civicpress: 'null' dependencies: []
 authors:
- Sophie Germain <sophie@civicpress.io> reviewers:
- Ada Lovelace
- Irène Joliot-Curie

---

## Name

`manifest` — CivicPress Repository Manifest

## Purpose

Define the structure and role of `.civic/manifest.yml`, which declares metadata
about the town, system configuration, and CivicPress modules in use. This file
acts as the civic identity and initialization anchor for the platform.

---

## Scope & Responsibilities

Responsibilities:

- Declare the municipality's name, timezone, and language
- Define enabled CivicPress modules
- Provide unique ID for federation or sync
- Set civic branding info (logo, town URL, contact)
- Help UIs and dashboards self-configure

Out of scope:

- Git auth, user roles (handled in other specs)
- Module-specific settings (handled in module config)

---

## Inputs & Outputs

| Input | Description |
| ------------------------ | -------------------------------------------- |
| Town information | Municipality name, contact, and metadata |
| CivicPress configuration | Enabled modules, features, and settings |
| Branding assets | Logos, colors, themes, and visual identity |
| Federation settings | Node ID, public keys, and sync configuration |
| System metadata | Population, area, officials, and timestamps |

| Output | Description |
| ---------------------- | -------------------------------------- |
| CivicPress manifest | Validated and structured manifest file |
| System configuration | Module and feature activation settings |
| Branding configuration | Visual identity and theming data |
| Federation identity | Node identification and sync settings |
| Civic metadata | Town information for UI and API use |

---

## File/Folder Location

```
.civic/
├── manifest.yml # Main manifest file
├── branding/ # Branding assets
│ ├── logo.png
│ ├── logo-dark.png
│ ├── favicon.ico
│ └── theme.yml
├── federation/ # Federation configuration
│ ├── node-id.yml
│ ├── public-key.pem
│ └── sync-config.yml
└── metadata/ # Additional metadata
 ├── town-info.yml
 ├── officials.yml
 └── statistics.yml

core/
├── manifest.ts # Manifest loading and validation
├── manifest-validator.ts # Manifest validation logic
├── branding-loader.ts # Branding asset loading
└── federation-manager.ts # Federation configuration

modules/
├── manifest/
│ ├── components/
│ │ ├── ManifestEditor.tsx # Manifest editing UI
│ │ ├── BrandingManager.tsx # Branding management
│ │ └── FederationConfig.tsx # Federation settings
│ ├── hooks/
│ │ └── useManifest.ts # Manifest data hook
│ └── utils/
│ ├── manifest-parser.ts # Manifest parsing utilities
│ └── validation-rules.ts # Validation logic
└── ui/
 └── components/
 └── ManifestProvider.tsx # Manifest context provider

tests/
├── manifest/
│ ├── manifest-validation.test.ts
│ ├── branding-loading.test.ts
│ └── federation-config.test.ts
└── integration/
 └── manifest-integration.test.ts
```

---

## Security & Trust Considerations

### Manifest Integrity

- Manifest files must be cryptographically signed
- Manifest changes must be reviewed and approved
- Manifest validation must be enforced before deployment
- Manifest backups must be maintained for disaster recovery

### Federation Security

- Federation node IDs must be unique and verified
- Public keys must be validated and trusted
- Federation sync must be encrypted and authenticated
- Federation policies must be enforced and audited

### Branding Security

- Branding assets must be validated for malicious content
- Logo files must be scanned for security vulnerabilities
- Theme configurations must be sanitized and validated
- Branding changes must be approved and logged

### Data Protection

- Town metadata must respect privacy requirements
- Contact information must be properly validated
- Official information must be verified and accurate
- Metadata retention policies must be enforced

### Compliance & Audit

- Manifest changes must be logged and auditable
- Federation activities must be monitored and logged
- Branding changes must be tracked and approved
- Regular manifest security audits must be performed

---

## ️ Manifest Schema & Field Definitions

### Complete `.civic/manifest.yml` Example

```yaml
# CivicPress Town Manifest
version: '1.0'
id: 'richmond-qc'
name: 'Ville de Richmond'
language: 'fr'
timezone: 'America/Toronto'
region: 'Québec, Canada'
country: 'CA'

# Contact Information
contact:
 email: 'hello@richmond.ca'
 website: 'https://www.richmond.ca'
 phone: '+1-450-774-2641'
 address:
 street: '1 rue Principale'
 city: 'Richmond'
 province: 'QC'
 postal_code: 'J0B 2H0'
 country: 'Canada'

# Branding & Visual Identity
branding:
 logo: '/assets/logo-town.png'
 logo_dark: '/assets/logo-town-dark.png'
 theme: 'blue-white'
 primary_color: '#1e40af'
 secondary_color: '#f8fafc'
 favicon: '/assets/favicon.ico'

# CivicPress Configuration
civicpress:
 version: '1.0.0'
 modules:
 - 'legal-register'
 - 'public-sessions'
 - 'feedback'
 - 'finances'
 features:
 - 'public-ui'
 - 'admin-ui'
 - 'api'
 - 'workflows'
 settings:
 public_access: true
 require_auth_for_edits: true
 auto_index: true
 audit_logging: true

# Federation & Integration
federation:
 enabled: true
 node_id: 'richmond-qc-001'
 public_key: 'ssh-rsa AAAAB3NzaC1yc2E...'
 sync_enabled: true
 sync_interval: 3600 # seconds

# Metadata
metadata:
 population: 3500
 area_km2: 6.5
 founded: '1861'
 mayor: 'Luc Lapointe'
 clerk: 'Ada Lovelace'
 last_updated: '2025-07-03T10:00:00Z'
 created_by: 'civicpress-init'
```

### Field Definitions & Validation Rules

#### **Core Identity Fields**

| Field | Type | Required | Description | Validation |
| ---------- | ------ | -------- | ----------------------- | ------------------------------------------- |
| `version` | string | | Manifest schema version | Must be "1.0" |
| `id` | string | | Unique town identifier | Lowercase, no spaces, format: `town-region` |
| `name` | string | | Official town name | Human-readable, max 100 chars |
| `language` | string | | Primary language | ISO 639-1 code (en, fr, es, etc.) |
| `timezone` | string | | Town timezone | IANA timezone identifier |
| `region` | string | | State/province | Human-readable region name |
| `country` | string | | Country code | ISO 3166-1 alpha-2 (CA, US, etc.) |

#### **Contact Information Fields**

| Field | Type | Required | Description | Validation |
| ----------------------------- | ------ | -------- | --------------------- | ------------------------ |
| `contact.email` | string | | Primary contact email | Valid email format |
| `contact.website` | string | | Official website | Valid URL format |
| `contact.phone` | string | | Contact phone number | International format |
| `contact.address.street` | string | | Street address | Max 200 chars |
| `contact.address.city` | string | | City name | Max 100 chars |
| `contact.address.province` | string | | State/province | Max 50 chars |
| `contact.address.postal_code` | string | | Postal/ZIP code | Format varies by country |
| `contact.address.country` | string | | Country name | Max 50 chars |

#### **Branding Fields**

| Field | Type | Required | Description | Validation |
| -------------------------- | ------ | -------- | --------------------- | --------------------------- |
| `branding.logo` | string | | Primary logo path | Relative path to image file |
| `branding.logo_dark` | string | | Dark mode logo | Relative path to image file |
| `branding.theme` | string | | Default theme | Predefined theme name |
| `branding.primary_color` | string | | Primary brand color | Hex color code (#RRGGBB) |
| `branding.secondary_color` | string | | Secondary brand color | Hex color code (#RRGGBB) |
| `branding.favicon` | string | | Favicon path | Relative path to .ico file |

#### **CivicPress Configuration Fields**

| Field | Type | Required | Description | Validation |
| -------------------------------------------- | ------- | -------- | ----------------------- | --------------------------- |
| `civicpress.version` | string | | CivicPress version | Semantic versioning |
| `civicpress.modules` | array | | Enabled modules | List of valid module names |
| `civicpress.features` | array | | Enabled features | List of valid feature names |
| `civicpress.settings.public_access` | boolean | | Public read access | true/false |
| `civicpress.settings.require_auth_for_edits` | boolean | | Auth required for edits | true/false |
| `civicpress.settings.auto_index` | boolean | | Auto-rebuild indexes | true/false |
| `civicpress.settings.audit_logging` | boolean | | Enable audit logs | true/false |

#### **Federation Fields**

| Field | Type | Required | Description | Validation |
| -------------------------- | ------- | -------- | ------------------------ | --------------------------- |
| `federation.enabled` | boolean | | Enable federation | true/false |
| `federation.node_id` | string | | Unique node identifier | Alphanumeric, max 50 chars |
| `federation.public_key` | string | | SSH public key | Valid SSH public key format |
| `federation.sync_enabled` | boolean | | Enable data sync | true/false |
| `federation.sync_interval` | integer | | Sync interval in seconds | Positive integer |

#### **Metadata Fields**

| Field | Type | Required | Description | Validation |
| ----------------------- | ------- | -------- | --------------------- | ---------------- |
| `metadata.population` | integer | | Town population | Positive integer |
| `metadata.area_km2` | float | | Town area in km² | Positive float |
| `metadata.founded` | string | | Year founded | YYYY format |
| `metadata.mayor` | string | | Current mayor | Max 100 chars |
| `metadata.clerk` | string | | Current clerk | Max 100 chars |
| `metadata.last_updated` | string | | Last update timestamp | ISO 8601 format |
| `metadata.created_by` | string | | Creation source | Max 50 chars |

### Validation Rules

#### **Required Field Validation**

```yaml
# These fields must be present and valid
required_fields:
 - version
 - id
 - name
 - language
 - timezone
 - civicpress.modules
```

#### **Format Validation**

```yaml
# Field format requirements
format_rules:
 id: "^[a-z0-9-]+$" # lowercase, alphanumeric, hyphens only
 language: "^[a-z]{2}$" # 2-letter ISO code
 timezone: "^[A-Za-z_]+/[A-Za-z_]+$" # IANA format
 email: "^[^@]+@[^@]+\.[^@]+$" # basic email format
 website: "^https?://.+$" # URL format
 color: "^#[0-9A-Fa-f]{6}$" # hex color
```

#### **Content Validation**

```yaml
# Content validation rules
content_rules:
 name_max_length: 100
 id_max_length: 50
 modules_must_exist: true # modules must be installed
 logo_must_exist: true # logo file must exist
 timezone_must_be_valid: true # must be valid IANA timezone
```

---

## Usage

- Used by CivicPress CLI during `init`
- Referenced by civic dashboard for theming + context
- Required by module loaders to detect supported features
- May be exported or syndicated in federated setups

---

## Validation

- `id` must be unique and lowercase (`town-region`)
- `modules` list must match installed module folders
- If `logo` is provided, ensure file exists at path
- Run `civic lint:manifest` to verify

---

## Trust & Security

- This file must be committed and versioned in Git
- It defines the **identity of the civic instance**
- External systems may use this to verify a town's legitimacy or sync

---

## Testing & Validation

- Test manifest validation with valid and invalid examples
- Verify module detection works correctly
- Test branding and theming integration
- Ensure federation ID uniqueness
- Validate timezone and language settings

---

## ️ Future Enhancements

- Federation ID + signature
- CivicPress instance version and upgrade notice
- Optional `public-key` for town authentication
- Decentralized registry sync (via civic federation)
- Advanced branding customization and themes
- Multi-language manifest support
- Automated manifest validation and linting
- Integration with municipal registries and databases

## Related Specs

- [`auth.md`](./auth.md) — Authentication and authorization
- [`permissions.md`](./permissions.md) — Role-based access control
- [`federation.md`](./federation.md) — Inter-town federation
- [`branding.md`](./branding.md) — Visual identity and theming
- [`deployment.md`](./deployment.md) — System deployment and configuration

---

## History

- Drafted: 2025-07-03
- Last updated: 2025-07-15
