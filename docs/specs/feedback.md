# CivicPress Spec: `feedback.md`

---

version: 0.3.x-scope status: planned created: '2025-07-03' updated: '2025-07-15'
deprecated: false sunset_date: null breaking_changes: [] additions:

- comprehensive feedback documentation
- feedback workflows
- security considerations fixes: [] migration_guide: null compatibility:
 min_civicpress: 1.0.0 max_civicpress: 'null' dependencies:
 - 'ui.md: >=1.0.0'
 - 'auth.md: >=1.0.0'
 - 'permissions.md: >=1.0.0' authors:
- Sophie Germain <sophie@civicpress.io> reviewers:
- Ada Lovelace
- Irène Joliot-Curie

---

## Name

`feedback` — CivicPress Feedback Module (Civic Input, Comments, and Concerns)

## Purpose

Enable citizens and contributors to submit feedback, concerns, suggestions, or
reactions on civic matters — in a Git-native, traceable, and auditable way.

---

## Scope & Responsibilities

Responsibilities:

- Accept and store feedback as Markdown records
- Enable review, triage, tagging, and linking to other records
- Provide workflow triggers for new or reviewed feedback
- Facilitate resolution status and transparency

Out of scope:

- Authentication or identity verification (see `auth.md`)
- Real-time chat or discussion threads
- Upvotes/downvotes (future extension)

---

## Inputs & Outputs

| Input | Description |
| ------------------- | ---------------------------------------------------- |
| User feedback | Text submissions from citizens and contributors |
| Feedback metadata | Title, tags, related records, submitter info |
| Review actions | Status changes, comments, and resolutions |
| Authentication data | User identity and role permissions |
| Related records | Links to bylaws, resolutions, or other civic records |

| Output | Description |
| --------------------- | ------------------------------------------- |
| Feedback records | Markdown files in `records/feedback/` |
| Feedback index | Searchable index of all feedback items |
| Notification triggers | Workflow events for new or updated feedback |
| Audit logs | History of feedback submissions and reviews |
| Status updates | Feedback lifecycle state changes |

---

## File/Folder Location

```
records/
└── feedback/
 ├── 2025-07-03/
 │ ├── noise-complaint.md
 │ └── bike-lane-suggestion.md
 ├── 2025-07-04/
 │ └── park-maintenance.md
 └── index.yml

.civic/
├── feedback.yml # Feedback configuration
└── feedback-templates/
 ├── complaint.md
 ├── suggestion.md
 └── question.md

core/
├── feedback.ts # Feedback processing logic
├── feedback-validation.ts # Feedback validation rules
└── feedback-workflow.ts # Feedback workflow automation

modules/
├── feedback/
│ ├── components/
│ │ ├── FeedbackForm.tsx
│ │ ├── FeedbackList.tsx
│ │ └── FeedbackDetail.tsx
│ ├── hooks/
│ │ └── useFeedback.ts
│ └── utils/
│ ├── feedback-parser.ts
│ └── feedback-indexer.ts
└── ui/
 └── components/
 └── FeedbackProvider.tsx

tests/
├── feedback/
│ ├── feedback-submission.test.ts
│ ├── feedback-review.test.ts
│ └── feedback-workflow.test.ts
└── integration/
 └── feedback-integration.test.ts
```

---

## Security & Trust Considerations

### Feedback Submission Security

- Validate all feedback submissions for malicious content
- Rate limiting to prevent spam and abuse
- CAPTCHA or similar anti-bot measures for anonymous submissions
- Content filtering for inappropriate or harmful content
- Sanitization of user input to prevent XSS attacks

### Privacy & Data Protection

- Anonymous feedback options for sensitive concerns
- GDPR-compliant data handling for feedback metadata
- Optional email verification for feedback tracking
- Data retention policies for feedback records
- User consent management for feedback processing

### Moderation & Content Control

- Role-based moderation capabilities for clerks and administrators
- Automated content filtering for common abuse patterns
- Manual review workflows for flagged content
- Appeal process for rejected feedback
- Transparency in moderation decisions

### Access Control & Permissions

- Public read access to approved feedback
- Role-based write access for feedback submission
- Administrative access for feedback moderation and management
- Audit logging of all feedback-related activities
- Granular permissions for feedback review and resolution

### Compliance & Legal Requirements

- Compliance with local government transparency requirements
- Support for public records laws and access requests
- Legal review process for feedback policies and procedures
- Compliance with data protection regulations
- Regular legal audits of feedback practices

---

## File Structure

```
records/
└── feedback/
 ├── 2025-07-03/
 │ └── noise-complaint.md
 ├── 2025-07-04/
 │ └── bike-lane-suggestion.md
```

---

## Record Format

Each feedback file is a standalone civic record.

```yaml
---
title: 'Noise at night'
status: 'submitted'
submitted_by: 'anonymous'
tags: ['noise', 'events']
related_to:
 - 'bylaw-quiet-hours.md'
created: '2025-07-03'
module: 'feedback'
---
Park events are playing music past 11pm. Please enforce a curfew.
```

---

## Feedback Lifecycle

| Status | Description |
| ----------- | ----------------------------------------- |
| `submitted` | Submitted by citizen or contributor |
| `in-review` | Triage started by clerk |
| `addressed` | Included in motion, record, or fix |
| `rejected` | Considered invalid, abusive, or off-topic |
| `archived` | Stored but no action taken |

---

## ️ CLI Commands

```bash
civic feedback submit --title "..." --body "..." --tags noise,safety
civic feedback review noise-complaint.md
civic feedback resolve noise-complaint.md --status addressed
```

---

## Hook Triggers

- `onFeedbackSubmit` → notify team, tag dashboard
- `onFeedbackReview` → notify related record authors
- `onFeedbackResolve` → update timeline or log

---

## Trust & Moderation

- All feedback is Git-tracked
- Status determines visibility (public by default, filterable by role)
- Reviewers must be listed in `.civic/roles.yml`
- Editors may hide rejected feedback from dashboards but not delete it

---

## Index Example

`records/feedback/index.yml`:

```yaml
- file: '2025-07-03/noise-complaint.md'
 status: submitted
 tags: ['noise']
 related_to: ['bylaw-quiet-hours.md']
 submitted_by: 'anonymous'
```

---

## Testing & Validation

- Test feedback submission flow
- Verify status transitions work correctly
- Ensure proper role-based visibility
- Test workflow triggers on feedback events
- Validate index generation and filtering

---

## ️ Future Enhancements

- Sentiment scoring
- Upvotes / signal amplification
- Verified submissions (email, Civic ID)
- Timeline heatmaps by tag
- Linking to elections or ballot items

---

## History

- Drafted: 2025-07-03
