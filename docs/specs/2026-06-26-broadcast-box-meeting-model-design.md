# BroadcastBox — create-on-demand session record + the Meeting model

Status: **DECIDED + scaffolded (2026-06-27).** Maintainer chose **Both**
(create-on-demand now + scaffold the Meeting model) with auto-created records as
**Draft**. See **Implemented** below for what landed and what's deferred. Builds
on `2026-06-20-broadcast-box-architecture-design.md` (core = source of truth; A/V
always public; AI = optional service).

## Implemented (2026-06-27)

- **Create-on-demand (D1=yes, D4=draft).** `POST /api/v1/broadcast-box/sessions/quick-start`
  `{ deviceId, title?, meetingId? }` → `SessionController.quickStartSession`:
  pre-flights the device, creates a **draft** `session` record (`status: draft` —
  a clerk reviews + publishes; A/V is public regardless), optionally links it to a
  meeting, then `startSession`s against it. Returns `{ session, civicpressSessionId }`.
- **Meeting model (D2 — as a core type).** A new core record type `meeting`
  (`core/src/config/record-types.ts` priority 8 +
  `core/src/schemas/record-type-schemas/meeting-schema.json`: meeting_type,
  scheduled_start/end, location, chair, agenda[]). Modules can only *extend*
  types, so a new type is necessarily core — but a meeting is first-class civic
  data, so that's correct.
- **meeting ↔ session relationship** via the built-in `linked_records` (no schema
  change): a session links to its meeting (`type:'meeting'`).
  `GET /api/v1/broadcast-box/sessions/by-meeting/:meetingId` lists a meeting's
  recordings (`SessionController.getSessionsForMeeting` — scans broadcast_sessions,
  resolving each session record's links; handles draft + published).
- Meeting CRUD reuses the **core records API** (it's a core type) — no bb-specific
  create endpoint.
- Covered by an in-process e2e (`tests/broadcast-box/device-ws-e2e.test.ts`):
  meeting → quick-start (draft, linked) → device receives start_session → listed
  by meeting.

**Deferred (D3 + the heavier Meeting bits):** `schedule.push` to the device +
scheduled/autonomous recording; recurring meetings; agenda ↔ transcript `topics[]`
alignment; a dedicated meetings router/UI + a meeting→session back-link index
(today's listing is a small scan); a bb schema *extension* on `meeting` for
appliance fields (assigned_device). Permissions still TODO (any authenticated
user; a clerk/recorder role check).

## Current state (what works today)

The operator starts a recording with `POST /api/v1/broadcast-box/sessions`
→ `SessionController.startSession({ deviceId, civicpressSessionId })`, which:

1. verifies the device is active + connected;
2. **verifies a CivicPress `session` record already exists** for
   `civicpressSessionId` (published, or a draft) — it does NOT create one;
3. creates the `broadcast_sessions` row linking recording → device → record;
4. delivers `start_session` to the device.

So an operator must **pre-create the `session` record** (via the records API/UI),
then reference its id. The `session` record type already carries the write-back
target: `capture`, `media.transcript`, `transcript_status`, `topics[]`,
`visibility`, `minutes_status` (a broadcast-box schema extension on core `session`).

## The gap

1. **No create-on-demand.** "Walk up to the device and start recording this
   meeting" requires a pre-existing record — friction for the common case.
2. **No Meeting model.** There is no first-class notion of a *meeting* (a
   scheduled civic event, possibly recurring, with an agenda, that produces
   one-or-more session recordings). The architecture notes flag this as
   "entirely missing / net-new."
3. **No schedule push.** The canonical protocol has `schedule.push` (CP → device,
   "here's the upcoming meeting schedule"); the device does not handle it. This is
   the hook for scheduled / autonomous (offline) recording.

## Decisions for the maintainer

- **D1 — create-on-demand?** Should a session record be auto-created when an
  operator starts a recording without an existing one? Trade-off: one-step UX vs.
  recording before any clerk curation (title/agenda).
- **D2 — Meeting vs session.** Is the existing `session` record sufficient (a
  recording *is* the meeting record), or does a distinct **Meeting** type warrant
  existence (a scheduled event that owns 0..N session recordings — recurring
  council meetings, an agenda template, a room, attendees)?
- **D3 — scheduling scope.** Is scheduled/autonomous recording (`schedule.push` +
  the device acting on a schedule offline) in scope now, or deferred?
- **D4 — record status on create.** `draft` (clerk publishes after review) or
  `published` immediately? A/V is public regardless; the *record* curation is the
  question.

## Recommendation (smallest civic-safe step)

**Do D1 minimally, defer D2/D3.** Add a thin operator entry that creates a
**draft** `session` record then starts — no new data model:

```
POST /api/v1/broadcast-box/sessions/quick-start
  { deviceId, title?, startedAt? }
→ recordManager.createRecord({ type:'session', status:'draft', title })  // D4 = draft
→ SessionController.startSession({ deviceId, civicpressSessionId: <newId> })
→ { sessionId, civicpressSessionId }
```

Rationale: it removes the pre-create friction, keeps the clerk in control of
curation (draft → review → publish), reuses the existing `session` type +
extension (no schema churn), and leaves the Meeting model + scheduling as a
separate, deliberate decision rather than something smuggled in via the device
path. A full **Meeting** type (D2) is a larger civic-records design — recurring
schedules, agenda alignment, the `topics[]` ↔ agenda mapping the transcription
service already anticipates — and should be specced on its own.

## Open questions

- Multi-session meetings: a meeting with a recess → one record with two `capture`
  blocks, or two records under one Meeting? (argues for D2 eventually).
- Who owns title/agenda when D1 auto-creates — the device operator, or a clerk
  pre-fills and the operator just picks?
- Permissions: who may quick-start a recording (today any authenticated user; a
  `clerk`/`recorder` role check is a TODO on the operator routes).
