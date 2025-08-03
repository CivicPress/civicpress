# 🌐 CivicPress Spec: `translations.md`

---

version: 1.0.0 status: stable created: '2025-07-03' updated: '2025-07-15'
deprecated: false sunset_date: null additions:

- comprehensive translation documentation
- internationalization
- security considerations compatibility: min_civicpress: 1.0.0 max_civicpress:
  'null' dependencies:
  - 'ui.md: >=1.0.0' authors:
- Sophie Germain <sophie@civic-press.org> reviewers:
- Ada Lovelace
- Irène Joliot-Curie

---

## 📛 Name

Translations & Multilingual Support

## 🎯 Purpose

Enable CivicPress to support **multilingual civic records, user interfaces, and
workflows** — so that towns can operate inclusively in regions with multiple
official languages or diverse populations.

CivicPress should be multilingual at its core — not as an afterthought.

---

## 🧩 Scope & Responsibilities

✅ Responsibilities:

- Support translated civic records (`record.fr.md`, `record.en.md`)
- Tag and link translation equivalents in frontmatter
- Localize UI elements, buttons, and labels
- Allow language toggle in public interface
- i18n fallback for system-generated strings (CLI, API)

❌ Out of Scope:

- Real-time machine translation
- Pluralization/grammar for every language (initially)

---

## 🔗 Inputs & Outputs

| Input                      | Result                               |
| -------------------------- | ------------------------------------ |
| `minutes-2024-01-01.fr.md` | Public UI shows French version       |
| `minutes-2024-01-01.en.md` | Public UI shows English version      |
| `language:` in frontmatter | UI toggle inferred                   |
| `i18n/labels.fr.yml`       | Used for translated buttons/messages |

---

## 📂 File/Folder Location

```
records/
├── bylaw-curfew.en.md
├── bylaw-curfew.fr.md
i18n/
├── labels.en.yml
├── labels.fr.yml
.civic/i18n.yml
```

## 📝 Example Internationalization Configuration

```yaml
# .civic/i18n.yml
default_locale: 'en'
fallback_locale: 'en'
available_locales:
  - 'en'
  - 'fr'
  - 'es'

locales:
  en:
    name: 'English'
    native_name: 'English'
    direction: 'ltr'
    date_format: 'MM/DD/YYYY'
    time_format: '12h'
    currency: 'USD'
    number_format:
      decimal: '.'
      thousands: ','
      precision: 2

  fr:
    name: 'French'
    native_name: 'Français'
    direction: 'ltr'
    date_format: 'DD/MM/YYYY'
    time_format: '24h'
    currency: 'CAD'
    number_format:
      decimal: ','
      thousands: ' '
      precision: 2

  es:
    name: 'Spanish'
    native_name: 'Español'
    direction: 'ltr'
    date_format: 'DD/MM/YYYY'
    time_format: '24h'
    currency: 'USD'
    number_format:
      decimal: ','
      thousands: '.'
      precision: 2

translation_files:
  - 'common.yml'
  - 'navigation.yml'
  - 'forms.yml'
  - 'errors.yml'
  - 'notifications.yml'
  - 'legal.yml'

namespaces:
  common:
    description: 'Common UI elements and actions'
    files:
      - 'i18n/en/common.yml'
      - 'i18n/fr/common.yml'
      - 'i18n/es/common.yml'

  navigation:
    description: 'Navigation and menu items'
    files:
      - 'i18n/en/navigation.yml'
      - 'i18n/fr/navigation.yml'
      - 'i18n/es/navigation.yml'

  legal:
    description: 'Legal terms and civic documents'
    files:
      - 'i18n/en/legal.yml'
      - 'i18n/fr/legal.yml'
      - 'i18n/es/legal.yml'

auto_translation:
  enabled: false # For MVP, manual translations only
  provider: 'google' # Future: google, deepl, azure
  api_key: '${TRANSLATION_API_KEY}'

pluralization:
  rules:
    en:
      one: '1'
      other: 'other'
    fr:
      one: '1'
      other: 'other'
    es:
      one: '1'
      other: 'other'

interpolation:
  variables:
    - 'town_name'
    - 'current_year'
    - 'user_name'
    - 'record_title'

  examples:
    welcome_message: 'Welcome to {{town_name}}'
    copyright: '© {{current_year}} {{town_name}}'
    user_greeting: 'Hello, {{user_name}}'

quality:
  review_required: true
  reviewer_role: 'translator'
  auto_detect_missing: true
  fallback_strategy: 'key_or_default'
```

---

## 🔐 Security & Trust Considerations

### Translation Integrity & Accuracy

- Cryptographic verification of translation authenticity and authorship
- Digital signatures required for all official civic translations
- Version control and audit trail for all translation changes
- Automated detection of translation inconsistencies or missing content
- Quality assurance workflows for translation accuracy and completeness

### Content Security & Validation

- Input sanitization and validation for all translation content
- Prevention of malicious code injection through translation fields
- Content Security Policy (CSP) enforcement for translated content
- Automated scanning for inappropriate or offensive content in translations
- Regular security audits of translation management systems

### Access Control & Permissions

- Role-based access control for translation creation and modification
- Multi-factor authentication for translation administrator access
- Approval workflow for official civic translations
- Audit logging of all translation-related activities and changes
- Emergency rollback capability for problematic translations

### Legal Compliance & Governance

- Compliance with official language requirements and regulations
- Legal review process for critical civic translations
- Support for official language minority rights and accessibility
- Compliance with municipal translation policies and standards
- Regular legal audits of translation practices and procedures

### Data Protection & Privacy

- GDPR-compliant handling of personal information in translations
- Encryption of sensitive translation data in transit and at rest
- Data retention policies for translation history and metadata
- Anonymization of personal data in public translation logs
- User consent management for translation-related data processing

### Quality Assurance & Monitoring

- Automated quality checks for translation completeness and accuracy
- Real-time monitoring of translation system performance and reliability
- Automated alerts for translation errors or missing content
- Regular quality audits and user feedback collection
- Performance optimization for multilingual content delivery

---

## 🧪 Testing & Validation

- Toggle language in UI and verify translations load
- Confirm fallback to default language if missing
- Validate `i18n/` YAML parsing in CLI and frontend
- Ensure civic records link to each other via frontmatter

---

## 🛠️ Future Enhancements

- CLI translation sync (`civic translate sync`)
- Translation completeness checks
- Crowdsourced civic translation review flow
- Auto-detect user language preference from browser

---

## 📅 History

- Drafted: 2025-07-04
