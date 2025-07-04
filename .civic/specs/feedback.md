# 💬 CivicPress Spec: `feedback.md`

## 📛 Name

`feedback` — CivicPress Feedback Module (Civic Input, Comments, and Concerns)

## 🎯 Purpose

Enable citizens and contributors to submit feedback, concerns, suggestions, or
reactions on civic matters — in a Git-native, traceable, and auditable way.

---

## 🧩 Scope & Responsibilities

✅ Responsibilities:

- Accept and store feedback as Markdown records
- Enable review, triage, tagging, and linking to other records
- Provide workflow triggers for new or reviewed feedback
- Facilitate resolution status and transparency

❌ Out of scope:

- Authentication or identity verification (see `auth.md`)
- Real-time chat or discussion threads
- Upvotes/downvotes (future extension)

---

## 📁 File Structure

```
records/
└── feedback/
    ├── 2025-07-03/
    │   └── noise-complaint.md
    ├── 2025-07-04/
    │   └── bike-lane-suggestion.md
```

---

## 🧠 Record Format

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

## 🔁 Feedback Lifecycle

| Status      | Description                               |
| ----------- | ----------------------------------------- |
| `submitted` | Submitted by citizen or contributor       |
| `in-review` | Triage started by clerk                   |
| `addressed` | Included in motion, record, or fix        |
| `rejected`  | Considered invalid, abusive, or off-topic |
| `archived`  | Stored but no action taken                |

---

## 🛠️ CLI Commands

```bash
civic feedback submit --title "..." --body "..." --tags noise,safety
civic feedback review noise-complaint.md
civic feedback resolve noise-complaint.md --status addressed
```

---

## 🔔 Hook Triggers

- `onFeedbackSubmit` → notify team, tag dashboard
- `onFeedbackReview` → notify related record authors
- `onFeedbackResolve` → update timeline or log

---

## 🔐 Trust & Moderation

- All feedback is Git-tracked
- Status determines visibility (public by default, filterable by role)
- Reviewers must be listed in `.civic/roles.yml`
- Editors may hide rejected feedback from dashboards but not delete it

---

## 📊 Index Example

`records/feedback/index.yml`:

```yaml
- file: '2025-07-03/noise-complaint.md'
  status: submitted
  tags: ['noise']
  related_to: ['bylaw-quiet-hours.md']
  submitted_by: 'anonymous'
```

---

## 🧪 Testing & Validation

- Test feedback submission flow
- Verify status transitions work correctly
- Ensure proper role-based visibility
- Test workflow triggers on feedback events
- Validate index generation and filtering

---

## 🛠️ Future Enhancements

- Sentiment scoring
- Upvotes / signal amplification
- Verified submissions (email, Civic ID)
- Timeline heatmaps by tag
- Linking to elections or ballot items

---

## 📅 History

- Drafted: 2025-07-03
