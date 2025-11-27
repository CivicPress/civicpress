# Municipal Onboarding Guide

_A practical introduction to CivicPress for clerks, directors general, and
municipal staff._

**Audience:** Municipal clerks, archives staff, DGs, communications officers,
and IT managers  
**Version:** v0.1.3 (Alpha)

---

# 1. What CivicPress Is

CivicPress is an open-source platform that helps municipalities manage their
public records in a structured, transparent, and durable way.

It replaces folders full of PDFs, Word documents, and email chains with:

- structured bylaws and policies
- consolidated amendments
- searchable meeting minutes
- navigable geography layers
- unified public access

CivicPress is built on open standards (Markdown, YAML, JSON, Git) to ensure
**long-term durability**, **legally reliable change history**, and **consistent
access for the public**.

---

# 2. What CivicPress Replaces — and What It Does Not

CivicPress focuses on **public information and civic records**.

### Replaces:

- PDF repositories and SharePoint folders
- Word documents used for bylaws, resolutions, minutes, or policies
- Manual archives or local drive structures
- Confusing public portals spread across multiple websites
- Difficulty searching across decades of documents

### Does _not_ replace:

- Accounting, taxation, or ERP systems
- Permitting or licensing platforms
- Ticketing or enforcement systems
- Election systems

CivicPress complements existing tools by handling the part of municipal work
that must be **public, durable, searchable, and transparent**.

---

# 3. Core Concepts

CivicPress introduces a structured system that mirrors how municipal governance
already works.

### **Records**

A record is a civic document such as:

- bylaws
- resolutions
- meeting minutes
- policies
- plans
- public notices
- maps and geographies

Each record is stored as a Markdown file enriched with metadata.

### **Articles**

Bylaws and large documents are broken into discrete, numbered articles.  
This allows:

- Clear amendment history
- Cross-references
- Easier search
- Reusable building blocks

### **Attachments**

Any file (PDF, image, spreadsheet, map) can be attached to a record with
metadata and categories.

### **Public vs. Internal**

CivicPress supports:

- Public content
- Restricted drafts
- Staff-only metadata (future versions)

### **Change History**

Every change is tracked automatically through Git versioning:

- Who changed what
- When
- Exactly what text changed

This creates a transparent, tamper-evident audit trail.

### **Workflows**

CivicPress supports configurable workflows for record lifecycle management:

- Draft → Proposed → Reviewed → Approved → Published → Archived
- Role-based status transitions (clerks, council, mayor can perform different actions)
- Automated workflows triggered by events (e.g., auto-indexing on record changes)
- Custom workflow definitions via `data/.civic/workflows.yml`

Workflows are fully implemented and configurable to match each municipality's approval processes.

---

# 4. Daily Workflow for Clerks

This section explains how municipal staff use CivicPress for daily record management.

### **1. Create or update a record**

New bylaw, amendment, or policy is entered in a structured form or via the
editor.

### **2. Add articles and metadata**

Staff add:

- title
- categories
- language
- dates
- geographic scope
- attachments
- cross-references

### **3. Proceed through draft → review → approval**

CivicPress supports configurable status transitions:

- Records move through statuses defined in `data/.civic/workflows.yml`
- Role-based permissions control who can perform which transitions
- Status changes are automatically tracked in Git with audit trails
- Workflows can be triggered automatically on status changes

### **4. Publish**

Once approved, records instantly appear on the public portal:

- fully searchable
- mobile-friendly
- durable links

### **5. Automatic versioning**

No extra actions required: all changes are recorded.

---

# 5. Migrating Existing Municipal Documents

Municipal archives often include:

- Scanned multi-page PDFs
- Word files
- Inconsistent formats across decades
- Amendments buried inside unrelated documents

CivicPress provides tools to help transition into structured civic records.

### What can be imported automatically today:

- PDFs (converted to text with OCR)
- Existing Markdown or text documents
- Folder structures of bylaws and minutes
- Geographical data (GeoJSON, KML, Shapefile → GeoJSON)

### What requires manual review:

- Accuracy of OCR for scanned PDFs
- Splitting bylaws into articles
- Consolidating amendments
- Verifying metadata and categorization

### Recommended migration process:

1. **Identify** the 5–10 most important bylaws or policies
2. **Convert** them with CivicPress tools
3. **Review and approve** the structure
4. **Publish** to the demo or pilot instance
5. Expand to older records as staff becomes comfortable

---

# 6. Backups, Safety, and Transparency

CivicPress ensures the long-term safety of municipal records.

### **Automatic Versioning**

Every change creates a new version, with full diff history.

### **Backups**

CivicPress supports:

- Local backups
- Cloud backups (S3, Azure)
- Export and restore commands
- Multi-provider file storage (local, S3, Azure)

### **Open Formats**

All content is stored in:

- Markdown
- YAML
- JSON
- GeoJSON

This means the town always owns its data and can export everything at any time.

### **No Vendor Lock-In**

Any municipality can:

- self-host
- migrate to another host
- download the full archive
- browse Git history indefinitely

---

# 7. Pilot Project Guide

Municipalities exploring CivicPress can begin with a structured pilot.

### Suggested pilot scope (4–6 weeks)

- Import 10–20 bylaws and their amendments
- Add 6–12 months of council minutes
- Add 1–3 geography layers (zones, districts, boundaries)
- Train 1–2 clerks
- Publish a fully navigable public demo

### Pilot roles

- **Municipality:** provides documents and validates content
- **CivicPress:** provides setup, conversion tools, and support

Municipal pilots help shape CivicPress’ features and priorities.

---

# 8. Technical Requirements (Plain Language)

### Hosting

Two options:

- hosted by CivicPress (simplest)
- hosted by the municipality’s IT department

### Hardware

Very light:

- a single small Linux server
- SQLite database (PostgreSQL/RDS support planned for larger deployments)
- optional cloud file storage (S3, Azure supported)

### Access

- Browser-based (Chrome, Firefox, Edge, Safari)
- No installation required for staff

### Data Portability

At any moment:

- the town can export everything
- content remains readable decades into the future
- no proprietary formats are used

---

# 9. Accessibility, Transparency, and Compliance

CivicPress helps municipalities meet obligations related to:

- access to information
- open data
- public notice requirements
- record retention
- inclusivity and web accessibility (WCAG)

Upcoming versions will include:

- PDF exports
- improved accessibility tooling
- redaction support
- retention schedules

---

# 10. Support & Contact

For more information, pilot participation, or support inquiries:

**Email:** hello@civicpress.io  
**Website:** https://civicpress.io  
**Demo:** https://demo.civicpress.io  
**GitHub:** https://github.com/CivicPress/civicpress

---

_CivicPress is built in collaboration with municipalities, civic innovators,
archivists, and public servants. Your feedback shapes the platform’s future._
