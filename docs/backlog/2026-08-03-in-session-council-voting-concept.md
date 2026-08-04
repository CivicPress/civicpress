# In-session council voting — concept note

> **Status: concept only. Not scheduled, not designed, not market-tested.**
> Nothing here is committed work. This exists so the idea does not evaporate;
> the current priority is shipping the existing feature set to v1.0, and this
> note explicitly does **not** add scope to that. Revisit after v1.0.

**Date:** 2026-08-03 · **Origin:** design conversation, not a requirements
gathering exercise with any municipality. Every claim about clerk workflow and
value below is a **hypothesis** that has not been validated with a real council.

Roadmap linkage: this fleshes out three bullets that already exist under
`docs/roadmap.md` §9 "Long-Term Vision (Beyond v1.0)" — _"Voting module with
digital signatures"_, _"Decision workflows (e.g., resolutions, motions)"_, and
_"Auto-generated agendas and packets"_. It is not a new track.

---

## 1. The concept

While BroadcastBox records a council session, council members use CivicPress on
their own devices to record their own participation in the proceedings: who
moved a motion, who seconded it, and how each member voted — captured live, by
the members themselves, rather than reconstructed afterward by the clerk.

## 2. The actual value is the join, not the voting

Digital voting on its own is unremarkable and well-served by incumbents. The
thing CivicPress would have that others do not is that **a vote captured
in-session is timestamped against the recording**.

That gives:

- **Motion → video timecode.** Every motion links to the exact second of the
  recording where it happened. Click the resolution, watch the debate.
- **Minutes that largely fall out for free.** Motion text + mover + seconder +
  roll call + result + timecode is most of a minutes document. This is hours of
  clerk work per meeting.
- **Public per-member voting records.** "How did my councillor vote on the
  rezoning" — with the video. This is the citizen-facing payoff and the piece
  that is genuinely on-mission for CivicPress rather than being an internal
  productivity tool.

If only one of these ships, it should be the video-linked minutes. That is the
differentiator; the voting UI is the means, not the end.

## 3. What already exists (verified from source, 2026-08-03)

Encouragingly little would be net-new infrastructure:

| Need               | Already present                                                                                                                                              |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Meeting entity     | `meeting` record type — _"Scheduled civic meetings; a meeting owns its session recording(s)"_ (`core/src/config/record-types.ts`)                            |
| Session + minutes  | `session` record type — _"Meeting sessions and minutes"_, with `session_type` (regular/emergency/special) validated in `record-validator.ts`                 |
| Session metadata   | `session` frontmatter already carries `date`, `duration`, `location`, `attendees`, `topics`, `media`, `linked_records` (`core/src/records/record-parser.ts`) |
| Motion outcome doc | `resolution` record type                                                                                                                                     |
| Identity + roles   | Auth, roles, permissions, session revocation                                                                                                                 |
| Live coordination  | Realtime server with per-record authz and session rooms                                                                                                      |
| Recording + media  | BroadcastBox capture → upload → session record + transcript, Ed25519-signed manifests                                                                        |
| Tamper-evidence    | Git-backed records + audit trail + existing Ed25519 signing                                                                                                  |

A vote is, structurally, **a record type plus a small chair-driven state machine
plus a realtime room**. The `attendees` and `topics` fields on `session` are
already the shape that attendance and agenda items would need.

⚠️ Do not read the table as "it's nearly built." It says the _substrate_ exists.
The product surface (agenda authoring, in-room UX, minutes generation, the
public voting-record view) is all new, and the in-room reliability bar is far
higher than anything CivicPress ships today.

### 3.1 Prior art in-repo: `docs/specs/votes.md`

**This is not greenfield.** A voting spec already exists —
`docs/specs/votes.md`, drafted 2025-07-04, `status: planned`, scoped
`0.3.x-scope`. It has never been built.

It models a **different shape of the problem**: _asynchronous_ voting on a
record. `civic vote --yes bylaw.md`, a GitHub PR comment parsed as `vote: no`,
`civic tally`, a vote log at `.civic/votes/<record>.json` carrying
`threshold`/`outcome`/per-voter entries, and a record `status:` transition
(`proposed → adopted`) when the vote passes.

This concept note is the _synchronous_ shape: motions, movers, seconders and a
roll call bound to a live meeting and a video timecode. **The two are not the
same product and should not be forced into one model** — but they overlap enough
that picking one up without reconciling the other would create two competing
vote representations in the same repo.

What genuinely carries over: voter authorization, vote-log immutability,
threshold/quorum rules, and abstain + conflict-of-interest handling and
verifiable vote receipts (both already listed as "Future Enhancements" in the
spec). The vote _record_ format is plausibly shared even though the capture
mechanism is not.

⚠️ **One direct conflict to resolve before either is built.** The spec says
_"Update record `status:` if vote passes"_ — the vote itself mutates the record
into its adopted state. That contradicts §5.1 below: if the system cannot be the
authoritative record on day one, it cannot unilaterally adopt a bylaw on the
strength of its own tally. Either the spec's auto-transition needs a
clerk-attestation gate, or this note's §5.1 constraint is wrong. It is not
obvious which, and it should be decided deliberately rather than by whichever
gets implemented first.

_Also worth noting the spec already puts "secret or anonymous voting" out of
scope — consistent with the transparency-first argument in §5.2._

## 4. Where the concept as first stated needs to change

**Self-service "moved by / seconded by" is the weakest piece.** In a real
meeting the chair recognizes a member — the mover is not whoever taps first.
Racing to tap is a good demo and wrong procedurally.

Model it **chair-mediated**: a member raises a hand in the app, the chair
recognizes them, the system records it. Seconding can reasonably be first-tap
(it genuinely is first-come and low-stakes), but **the chair and clerk need
override on every field, always**.

## 5. Three constraints that decide whether this is adoptable

### 5.1 It cannot be the authoritative record on day one

In most jurisdictions the official record of a vote is what the clerk enters and
what council approves at the following meeting. A tool cannot unilaterally
become the record of decision.

Ship it as a **clerk-attested capture layer** — framed as a "minutes assistant",
not an "electronic voting system". This is not just positioning: it determines
the data model (every captured item has an attestation state) and it sidesteps
most of the legal review that would otherwise gate a pilot.

_Unverified:_ the specific statutory requirements for Québec municipalities and
the relevant Ontario/other provincial regimes have not been checked. That
research is a prerequisite to any real design.

### 5.2 Voting is the highest-stakes surface CivicPress would ever ship

Accepting a vote from a member's device inherits a threat model the rest of the
product does not have: repudiation ("I never pressed that"), device compromise,
coercion, and — just as damaging as any real attack — the **appearance** of
manipulability.

The mitigation is not primarily cryptographic. It is that council votes are
**public and non-secret**: the tally is on screen, in the room, contestable by
any member or member of the public in the second it happens. Design for
**transparency-first**, and treat "could a member notice and object immediately"
as the primary control.

Signed vote receipts are cheap given the existing Ed25519 work and worth having,
but they are defense in depth, not the answer.

### 5.3 It must degrade to paper instantly

Wifi drops. A tablet dies. A member steps out mid-vote. **If a software bug can
prevent a public body from conducting business, that is a governance failure and
a legal exposure, not a P2 bug.**

Manual clerk entry must be permanently visible and one click away — never a
fallback flow someone has to discover under pressure. A related trap: "abstained
explicitly" and "did not vote" are legally different outcomes and must never be
collapsed into one state by a timeout.

## 6. Suggested sequencing (post-1.0)

Deliberately ordered so the risky part is last and each step is independently
useful.

- **1.1 — Meetings, agenda, attendance/quorum. No voting at all.** Roll call at
  the start, agenda items on the meeting record. Low stakes, immediately useful,
  and it establishes the habit of members having CivicPress open on a tablet in
  the room. Adoption is the hard part of this whole idea, and this step buys it
  at near-zero risk.
- **1.2 — Clerk-driven vote capture.** One screen; the clerk enters motion,
  mover, seconder, and result. Members touch nothing. Output: a minutes draft
  plus video timecodes. This delivers the **entire value proposition of §2 with
  zero new threat model** — it is just a faster clerk UI over existing record
  types.
- **1.3 — Member self-service voting** layered on top. Opt-in per municipality,
  chair-confirmed, manual fallback always present, live public tally.
- **Later —** signed vote receipts; public per-member voting history; recusal
  and conflict-of-interest declarations (legally loaded, genuinely valuable, and
  mostly just a well-modeled text field).

If 1.2 does not earn enthusiasm from a real clerk, **stop** — 1.3 is not worth
building on an unvalidated premise.

## 7. Strategic caveat: this is a scope expansion

This moves CivicPress from "civic records system" toward "civic meeting system".
That is a natural adjacency — the video is already there, and
`meeting`/`session` record types already exist — but it roughly doubles the
product surface and pulls in a competitive field: Granicus/Legistar, eScribe,
CivicClerk.

The counter-argument is that agenda-and-minutes management is exactly the
expensive proprietary software small municipalities resent paying for, and
open-source, self-hostable, git-backed, video-linked is a real wedge against it.
But it is a deliberate strategic choice and should be made as one, not drifted
into.

## 8. Open questions before any of this is designed

- What does the statutory record actually require, per province? (blocking)
- Would a real clerk use §6 step 1.2? Has anyone asked one? (blocking)
- Does this extend, supersede, or coexist with the planned `docs/specs/votes.md`
  (§3.1)? And does its "vote passing flips record `status:`" rule survive the
  §5.1 clerk-attestation constraint? (blocking — resolving this after
  implementation would mean two competing vote models)
- Does the chair want a device in front of them at all, or is chair-mediation
  better expressed through the clerk's screen?
- How are in-camera / closed sessions handled — presumably captured but not
  published, which interacts with the existing record-path guard and redaction
  pipeline.
- Amendments and procedural motions (table, refer, call the question) make the
  state machine much larger than "motion → second → vote". How much of Robert's
  Rules is in scope before the model collapses?
- Does the public voting-record view create a per-member data-protection or
  defamation surface worth reviewing?

---

_No work is scheduled against this note. If it is picked up, it should start
with the two blocking questions in §8, not with code._
