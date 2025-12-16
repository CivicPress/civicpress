# CivicPress Governance Model

_A transparent, community-driven governance structure designed to protect the
public good._

**Version:** v0.1.4 (Alpha)  
**Audience:** Municipalities, contributors, advisors, and partner organizations

---

# 1. Purpose of This Document

CivicPress is an open-source civic infrastructure project.  
Its mission is to provide municipalities with durable, transparent, and
accessible digital tools built on open standards.

This document explains how the project is governed today and how governance will
expand as CivicPress grows.

---

# 2. Guiding Principles

CivicPress governance is built on the following principles:

### **1. Public Good First**

The platform must always serve citizens, democratic transparency, and municipal
autonomy.

### **2. Open and Inspectable**

All core decisions, specifications, and changes remain visible in public
repositories.

### **3. Neutrality**

CivicPress does not promote any political ideology and must remain
institutionally neutral.

### **4. Long-Term Stewardship**

Municipal data and civic processes require a platform designed to last for
decades.

### **5. Community Collaboration**

The project thrives on collaboration between technologists, clerks, archivists,
designers, accessibility experts, and civic innovators.

### **6. Commitment to Open Formats & Data Longevity**

CivicPress explicitly commits that municipal records will always be stored in
open, human-readable formats. Municipal data will never be locked into
proprietary binary systems.

**Supported formats:**

- **Markdown** for all civic records (human-readable, future-proof, editable
  with any text editor)
- **YAML/JSON** for structured metadata (widely supported, tool-agnostic)
- **CSV** for tabular data exports (universal compatibility)
- **GeoJSON** for geographic data (open standard, interoperable)
- **Git** for version history (distributed, auditable, reversible)

**Core principles:**

- No proprietary formats in core functionality
- No vendor lock-in or closed-source dependencies for data storage
- Emphasis on durability and archivability
- Municipal data must remain accessible and usable even if CivicPress disappears

This commitment ensures that municipalities maintain full control and access to
their civic records for decades to come.

---

# 3. Current Governance (Founding Phase)

During the v0.1.4 (Alpha) phase, CivicPress is stewarded by a **Founding
Maintainer** who oversees:

- technical architecture
- roadmap direction
- code review
- documentation standards
- community coordination
- early municipal relationships

This ensures:

- fast iteration
- a unified technical vision
- coherent early architecture
- a clear point of responsibility

While the project is young, this model keeps decision-making efficient and
focused.

**All decisions are transparent and versioned through GitHub issues, pull
requests, specs, and releases.**

---

# 4. Transition to a Formal Organization (OSBL / Cooperative)

As CivicPress grows, stewardship will transition from a single maintainer to an
**independent legal entity** to guarantee long-term neutrality and public trust.

Two models are planned for evaluation:

## **A. OSBL (Non-Profit Organization)**

A non-profit structure ensures:

- independence from any private vendor
- transparent financial management
- eligibility for grants and public funding
- long-term stewardship of the platform

This model is common in major open-source projects (Linux Foundation, Mozilla
Foundation, OpenStreetMap Foundation).

## **B. Municipal Cooperative (Town-Owned Digital Infrastructure)**

A cooperative model where participating municipalities become members:

- each member town has a vote
- shared funding of common improvements
- shared ownership of civic digital infrastructure
- collaborative governance across regions

This option aligns strongly with digital sovereignty and public-sector
collaboration.

**The final organizational model will be chosen based on the needs of early
pilot municipalities and contributors.**

---

# 4a. Vendor Neutrality & Conflict of Interest

CivicPress will never be controlled by a private vendor. The platform's
governance structure is designed to ensure institutional independence and
municipal autonomy.

## **Core Principles**

- **No vendor control**: CivicPress governance cannot be controlled by any
  single private company or vendor
- **Disclosure requirement**: Contributors with commercial interests (employment
  by vendors, consulting relationships, financial stakes) must disclose them
  when participating in governance decisions
- **Neutral decision-making**: Governance decisions cannot favor a single
  private company over others or over the public interest
- **Municipal autonomy**: Municipalities retain full autonomy over their data
  and can migrate away from CivicPress if needed

## **Current Phase (v0.1.4 Alpha)**

During the founding phase, maintainers must disclose any vendor relationships
that could influence technical or governance decisions. All major technology
choices are documented with rationale in public specifications.

## **Future Organization (v1.0+)**

When the OSBL/coop is established, formal conflict of interest policies will be
implemented:

- Board members must recuse themselves from decisions involving their employers
  or financial interests
- Vendor relationships are transparently disclosed in public meeting minutes
- Technology decisions are made by the Technical Steering Committee based on
  technical merit, not vendor relationships

---

# 4b. Financial Oversight (Future OSBL/Coop)

Financial transparency is essential for public trust in civic infrastructure.

## **Current Phase (v0.1.4 Alpha)**

During the founding phase, CivicPress has minimal financial structure. Funding
sources are disclosed publicly when they exist, and expenses are tracked
transparently. The project operates with minimal overhead to focus on
development and community building.

## **Future Organization (v1.0+)**

When the OSBL/coop is established, formal financial governance will be
implemented:

- **Annual financial reports** are published publicly with full transparency
- **Public budgets** are published in advance, showing planned expenditures
  across categories (infrastructure, development, community support, legal,
  etc.)
- **Budget allocation** is decided by the Board with community input and
  municipal partner consultation
- **Funding sources** are diversified to prevent single-vendor influence
- **Grant applications** and public funding are prioritized over private vendor
  funding

The future nonprofit/coop will manage budgets through transparent processes that
ensure CivicPress remains sustainable without compromising its independence or
mission.

---

# 5. Future Governance Structure (Planned v1.0+)

When the OSBL/coop is created, CivicPress will transition to a multi-layer
governance system:

## **1. Board of Directors**

Responsible for:

- strategic direction
- budget allocation
- long-term stewardship

Includes representatives from:

- municipal partners
- technical maintainers
- civic/academic advisors
- community representatives

## **2. Technical Steering Committee (TSC)**

The TSC handles **technical steering** (architecture, APIs, security policies,
release cycle), while the Board handles **governance** (strategic direction,
budget, organizational structure). This separation ensures technical decisions
are made by technical experts, while governance decisions are made by the
broader community and municipal partners.

Maintains:

- the architecture
- security policies
- module API and specifications
- the release cycle

Members are nominated from active contributors with proven expertise. See
[Contributor → Maintainer → TSC Path](#5a-contributor--maintainer--tsc-path) for
progression details.

## **3. Contributor Community**

Open to:

- developers
- designers
- clerks
- archivists
- accessibility experts
- translators

Contributors gain influence through active participation, issue triage, PRs, and
community discussions.

## **4. Municipal Advisory Council**

Comprised of clerks, DGs, archivists, and civic administrators.

Responsibilities:

- ensure CivicPress remains usable for real local governments
- identify administrative needs
- review workflow features
- validate accessibility and record-keeping requirements

---

# 5a. Contributor → Maintainer → TSC Path

CivicPress recognizes contributors who demonstrate sustained commitment,
technical expertise, and alignment with project values. This progression ladder
will activate as the project grows and the Technical Steering Committee is
established.

## **Progression Path**

1. **Contributor**
   - Regular code, documentation, or design contributions
   - Helpful code reviews and community engagement
   - Activity: Multiple accepted PRs or meaningful contributions

2. **Core Contributor**
   - Sustained contributions over 6+ months
   - Maintains a module, feature area, or documentation section
   - Mentors new contributors and participates in technical discussions
   - Expertise: Deep knowledge in their contribution area

3. **Maintainer**
   - Sustained contributions over 12+ months
   - Proven technical judgment and architectural understanding
   - Alignment with project values and community trust
   - Responsibility: Review and merge pull requests, maintain code quality
     standards, participate in technical decision-making

4. **Technical Steering Committee (TSC)**
   - Nominated from active maintainers with proven expertise
   - Responsibility: Maintain architecture, security policies, module APIs, and
     release cycle
   - Selected by existing TSC members and Board approval (when OSBL/coop exists)

## **Activation Timeline**

This progression path will be formalized as the project grows beyond the alpha
phase. During v0.1.4 (Alpha), the founding maintainer handles these
responsibilities. As the community expands, the Contributor → Maintainer → TSC
path will activate to distribute governance and technical leadership.

---

# 6. Security Governance & Vulnerability Disclosure

Security is critical for civic infrastructure that handles public records and
municipal data.

## **Vulnerability Reporting**

Security vulnerabilities must be reported privately. **Do not post security
issues in public GitHub issues or discussions.**

Report security vulnerabilities to: **<security@civicpress.io>** (or
**<hello@civicpress.io>** as fallback)

Include as much detail as possible about the vulnerability, including steps to
reproduce if applicable.

## **Responsible Disclosure Process**

CivicPress commits to responsible disclosure practices:

1. **Initial Report** - Reporter submits vulnerability details privately to
   <security@civicpress.io>
2. **Acknowledgment** - Maintainers acknowledge receipt within 48 hours
3. **Assessment** - Security team evaluates severity and impact
4. **Fix Development** - Patch developed and tested
5. **Coordinated Disclosure** - Fix released with security advisory before
   public disclosure
6. **Public Disclosure** - Vulnerability details published after patch is
   available and deployed

This process protects municipalities while allowing time for fixes to be
developed and deployed.

## **Severity Levels**

- **Critical** - Remote code execution, data breach, authentication bypass
- **High** - Privilege escalation, data exposure, denial of service
- **Medium** - Information disclosure, limited privilege escalation
- **Low** - Minor information leaks, configuration issues

## **Security Governance (v1.0+)**

When the OSBL/coop is established:

- **Security Advisory Board** reviews all vulnerabilities
- **Responsible disclosure** policy is formalized
- **Security audit schedule** is established
- **Incident response plan** is documented and tested

See [docs/security-system.md](security-system.md) for technical security
details.

---

# 7. Release Governance (Versioning & Stability Policy)

CivicPress follows semantic versioning (SemVer) for all releases:
`MAJOR.MINOR.PATCH[-PRERELEASE]`

## **Version Numbering**

- **MAJOR** (1.0.0 → 2.0.0) - Breaking changes, incompatible API changes
- **MINOR** (1.0.0 → 1.1.0) - New features, backward-compatible additions
- **PATCH** (1.0.0 → 1.0.1) - Bug fixes, backward-compatible patches
- **PRERELEASE** (1.0.0-alpha.1) - Alpha, beta, or release candidate versions

## **Release Policy: Alpha Phase (v0.1.x)**

During the alpha phase, releases are frequent and fast:

- Releases happen as features are completed and tested
- Breaking changes are acceptable but documented in CHANGELOG.md
- Community input via GitHub issues and discussions informs release timing
- Founding Maintainer decides release timing and version numbers

The alpha phase prioritizes rapid iteration and feature development over
stability guarantees.

## **Release Policy: Stable Phase (v1.0+)**

Post-v1.0, CivicPress commits to a stable release cycle with municipal
compatibility guarantees:

- **Stable release schedule**: Regular, predictable release cycles (e.g.,
  quarterly minor releases, annual major releases)
- **Breaking changes require proposals/RFCs**: Major breaking changes must go
  through a formal proposal process and receive Technical Steering Committee
  approval
- **Migration guides**: All breaking changes include migration guides and
  deprecation notices
- **Municipal compatibility guarantees**: Municipalities can expect backward
  compatibility within major versions, with clear upgrade paths between major
  versions
- **Long-term support (LTS)**: Designated LTS versions provide extended support
  for municipalities requiring stability

The stable phase prioritizes reliability and municipal trust over rapid feature
development.

See [docs/specs/spec-versioning.md](specs/spec-versioning.md) for detailed
versioning policies and [docs/roadmap.md](roadmap.md) for release planning.

---

# 8. Decision-Making Process

### **Short Term (v0.1–0.3)**

Maintainer-led, with decisions tracked through GitHub:

- Issues → discussion
- Pull requests → review
- Specs → approval

Transparent, collaborative, and open to all contributors.

### **Medium Term (v0.4–0.9)**

Hybrid governance:

- Maintainer + early municipal partners
- More formal review process
- Lightweight RFC system for large features
- Quarterly roadmap updates

### **Long Term (v1.0+)**

Governance shifts to the organization:

- Board oversight
- TSC technical approval
- Contributor voting for major changes
- Municipal Advisory Council for civic-impact features

---

# 9. How Decisions Are Logged

All governance actions are recorded publicly:

- Project roadmap ([docs/roadmap.md](roadmap.md))
- GitHub issues + discussions
- Pull request reviews
- Architectural decision records (ADRs)
- Release notes and changelog ([CHANGELOG.md](../../CHANGELOG.md))
- Governance meeting minutes (future OSBL)

Municipalities evaluating the platform can always trace how and why decisions
were made.

---

# 10. Code of Conduct

CivicPress adopts a standard, respectful Code of Conduct based on major
open-source projects and civic values.

## **Key Requirements**

- Be respectful, constructive, and inclusive
- No harassment or discriminatory behavior
- Accept feedback gracefully
- Follow maintainers' guidance during conflict
- Prioritize the public good over individual interests

## **Civic-First Values**

As a civic technology project, we hold ourselves to additional standards:

- **Transparency** - We operate in the open and explain our decisions
- **Accessibility** - We ensure our community is welcoming to people of all
  abilities and backgrounds
- **Public Service** - We prioritize the public good over individual gain
- **Trust** - We build and maintain trust through consistent, ethical behavior
- **Equity** - We actively work to include and amplify marginalized voices

## **Reporting**

If you experience or witness unacceptable behavior, or have any other concerns,
please report it by contacting the project team at
[hello@civicpress.io](mailto:hello@civicpress.io) or through our
[community form](https://tally.so/r/wAYBvN).

All reports will be handled with discretion. You may report anonymously or with
your name. If you report with your name, we will acknowledge receipt within 24
hours.

**Full Code of Conduct:**
[`.github/CODE_OF_CONDUCT.md`](../../.github/CODE_OF_CONDUCT.md)

---

# 11. Intellectual Property & Licensing Clarification

## **Code Contributions**

All code contributions to CivicPress are licensed under the **MIT License**, the
same license that governs the project. By contributing code, you agree that your
contributions will be made available under this license.

## **Documentation Contributions**

Documentation contributions are licensed under the **MIT License** or
**CC-BY-4.0** (whichever is more permissive), ensuring maximum reuse and
accessibility.

## **Specification Contributions**

Specifications and architectural documents are part of the project and are
covered by the MIT License, ensuring they remain open and accessible.

## **Trademark Policy**

"CivicPress" is a trademark. Use of the CivicPress name and logo is governed by
a separate trademark policy (to be established with the OSBL/coop). In general:

- **Permitted**: Using CivicPress name to describe your use of the software
- **Permitted**: Contributing to CivicPress and identifying as a contributor
- **Requires Permission**: Using CivicPress name/logo for commercial products or
  services
- **Requires Permission**: Implying endorsement or official partnership

## **Third-Party Dependencies**

CivicPress uses open-source dependencies, each with their own licenses. All
dependencies are compatible with the MIT License. A full list of dependencies
and their licenses is maintained in the project repository.

## **Data Ownership**

Municipal data stored in CivicPress remains the property of the municipality.
CivicPress does not claim ownership of civic records, only the software platform
itself.

---

# 12. How to Participate

- Join GitHub discussions
- Open issues or proposals
- Contribute PRs (features, tests, docs, UX)
- Help review accessibility or civic workflows
- Pilot the platform in your municipality
- Provide feedback on clerk workflows
- Sign up for future advisory groups
- Review the [Contributing Guide](../CONTRIBUTING.md) for detailed guidelines
- Review the [Project Roadmap](roadmap.md) for current priorities and direction

For inquiries or pilot participation:  
**Email:** <hello@civicpress.io>  
**Website:** <https://civicpress.io>

---

# 13. Evolution of This Document

This governance document will evolve as CivicPress transitions from:

- a founding-maintainer phase →
- a community-supported project →
- a formal OSBL/coop stewardship model.

Updates will be logged in version control and discussed publicly.
