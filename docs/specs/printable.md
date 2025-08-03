# 🖨️ CivicPress Spec: `printable.md`

---

version: 1.0.0 status: stable created: '2025-07-03' updated: '2025-07-15'
deprecated: false sunset_date: null additions:

- comprehensive printable documentation
- print formats
- accessibility considerations compatibility: min_civicpress: 1.0.0
  max_civicpress: 'null' dependencies:
  - 'ui.md: >=1.0.0'
  - 'accessibility.md: >=1.0.0' authors:
- Sophie Germain <sophie@civic-press.org> reviewers:
- Ada Lovelace
- Irène Joliot-Curie

---

## 📛 Name

Civic Record Printing & PDF Export

## 🎯 Purpose

Ensure that any civic record in CivicPress — such as bylaws, minutes, permits,
or feedback — can be printed or exported to PDF in a clean, legible, and
archival-friendly format.

Printing is essential for legal compliance, offline access, and civic
transparency.

---

## 🧩 Scope & Responsibilities

✅ Responsibilities:

- Provide print stylesheets for Markdown-rendered content
- Enable export to PDF via CLI (`civic print`) or UI button
- Include metadata (title, date, page number, logo)
- Support batch export of folders (e.g. entire meeting)

❌ Out of Scope:

- WYSIWYG editing of print layout
- Color printing or complex desktop publishing

---

## 🔗 Inputs & Outputs

| Input                 | Output                         |
| --------------------- | ------------------------------ |
| Markdown file         | Print-friendly HTML + CSS      |
| `civic print file.md` | PDF saved to `exports/` folder |
| UI print button       | Browser-native print flow      |

---

## 📂 File/Folder Location

```
core/print.ts
public/print.css
exports/
.civic/print.yml
```

## 📝 Example Print Configuration

```yaml
# .civic/print.yml
defaults:
  format: 'A4'
  orientation: 'portrait'
  margins:
    top: '1in'
    bottom: '1in'
    left: '1in'
    right: '1in'

  font:
    family: 'Times New Roman, serif'
    size: '12pt'
    line_height: '1.5'

header:
  enabled: true
  logo: true
  title: true
  date: true
  page_number: true

  content:
    logo_url: '/theme/logo.svg'
    title_format: '{{record_title}}'
    date_format: '{{record_date}}'
    page_format: 'Page {{page}} of {{total}}'

footer:
  enabled: true
  content:
    left: '{{town_name}}'
    center: '{{record_type}}'
    right: '{{record_id}}'

metadata:
  include_frontmatter: true
  include_author: true
  include_status: true
  include_tags: true

export:
  formats:
    - 'pdf'
    - 'html'
    - 'txt'

  quality:
    pdf_dpi: 300
    image_quality: 'high'
    compress: true

  naming:
    pattern: '{{record_title}}-{{date}}'
    date_format: 'YYYY-MM-DD'

batch:
  enabled: true
  max_files: 50
  output_format: 'zip'

  templates:
    meeting_minutes:
      description: 'Complete meeting package'
      includes:
        - 'agenda'
        - 'minutes'
        - 'attachments'
        - 'votes'

    bylaw_package:
      description: 'Bylaw with supporting documents'
      includes:
        - 'bylaw'
        - 'background'
        - 'votes'
        - 'signatures'

accessibility:
  high_contrast: true
  large_font: false
  screen_reader_friendly: true
  alt_text_included: true
```

---

## 🔐 Security & Trust Considerations

- PDFs should reflect committed content only (not drafts)
- File metadata should include civic record origin and date
- Only approved users may print private records

---

## 🧪 Testing & Validation

- Print records from UI and confirm visual integrity
- Run `civic print` on single and batch folders
- Confirm pagination and headers in PDF
- Ensure printed content matches Git version

---

## 🛠️ Future Enhancements

- PDF/A archival mode
- Clerk seal overlays or print-watermarks
- Full agenda export as multi-doc bundle
- Public "Print as PDF" link with timestamp

## 🔗 Related Specs

- [`accessibility.md`](./accessibility.md) — Accessible print formats
- [`themes.md`](./themes.md) — Print branding and styling
- [`manifest.md`](./manifest.md) — Record metadata for print
- [`archive-policy.md`](./archive-policy.md) — Long-term print preservation

---

## 📅 History

- Drafted: 2025-07-04
