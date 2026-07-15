# FA-BB-002 — closed-session video redaction (hardened design)

**Status:** IMPLEMENTED — Commits A–G all landed (2026-07-13: B `99da16b`,
C `ba9f711`, D `32b53cb`, E `8275a3c`, F `30e68da`, G `782f406`). The live dev
instance is backfilled AND redacted: all 3 pre-redaction public raws re-homed
to `recordings_raw`; the worker published verified blanked variants for the 2
segment-bearing sessions (capstone closed window independently re-verified on
the published bytes: max luma 16 / −91 dB at t=180, public content intact);
the third (no segments) holds pending → `awaiting_visibility`, resolvable via
the manual override. **The FA-BB-002 unfreeze gate is met.**
**Branch:** `refactor/phase-6-audit-remediation-criticals`.

This design was produced by a 6-area code map and a 6-lens adversarial red-team of
an initial reference design; the red-team found 7 blockers in the naive
"just blank the video" approach, all resolved below.

## The finding

A BroadcastBox recording of a council meeting can contain `in_camera`
(closed-door, legally privileged) windows, tracked as `capture.segments` on the
civic `session` record. Today the **transcript** excludes those windows, but the
**video** is recorded in full, uploaded to a `public` storage folder, and served
by `GET /api/v1/storage/files/:id` with no auth — so anyone can watch the closed
portion (live-confirmed on hardware: HTTP 200, full MP4, a frame at t=30s inside
the closed window decoded fine). Amplified by unauthenticated folder enumeration.

## Fail-closed invariant (the spine)

> No in-camera video frame or audio sample is ever served to a caller lacking
> `storage:read_private`.

Public visibility of a recording requires the **simultaneous** truth of:
1. `capture.public_file` present — written **only** by the redaction worker,
   **only** after post-encode verification confirms every in-camera window is
   black + silent; **and**
2. the `public_file` bytes physically residing in the `public` `recordings`
   folder, while the raw resides **only** in the `private` `recordings_raw`
   folder (serve gate requires `storage:read_private`, not held by public/clerk).

The raw never enters a public folder at any instant. `public_file` is absent by
default and every failure path leaves it absent. Publishing an **unblanked** file
additionally requires a **positive attestation** (`capture.all_public === true`
or a full-timeline `[0,duration]` all-public segment cover) — empty/absent
segments are **UNKNOWN → HOLD**, never "all public".

Holds under: worker-off (nothing written), ffmpeg-missing (worker idles, no
false `failed`), manifest-lost (never fires; surfaces as `awaiting_visibility`
for a manual authenticated publish), `segments=[]`-after-crash (treated as
UNKNOWN, no stream-copy of the raw, no whole-file transcript), mid-way failure
(`public_file` set only after verification + successful public upload).

## Data model (`session` record `metadata.capture`, additionalProperties:true)

- `av_file` — UUID of the **raw** original, in `recordings_raw` (private).
  Written only by upload-finalize (`linkFileToSession`); the manifest may **not**
  set it (FA-BB-013). Transcription source + municipal retention.
- `public_file` (**new**) — UUID of the **redacted** MP4 in `recordings`
  (public). Absent until the worker verifies + publishes. What the UI plays.
- `redaction_status` (**new**) — `pending | complete | failed | awaiting_visibility`.
- `segments` — device-supplied, original timeline. Blanking preserves the
  timeline so they describe the redacted file equally.
- attestation for all-public: a full-timeline all-public `segments` cover (no
  device change) now; upgrade to a signed `all_public` when device signing lands.

## Storage (LANDED — Commit A, `a046f73`)

- `recordings_raw`: access `private`, video allowed_types, 4096MB. **New.**
- `recordings`: stays `public` but now holds **only** worker-published redacted
  variants.
- `storage:read_private` permission (admin-only); `checkFileAccess()` three-tier
  gate (public / authenticated→`storage:download` / private→`storage:read_private`)
  on download + `/info` + listing; no anonymous folder listing (FA-STOR-001).
- `saveConfig`/`removeFolder` invariant refuses to weaken/delete `recordings_raw`.

## ffmpeg blanking (VALIDATED on the real capstone MP4)

Timeline-preserving; full re-encode (a filtered range cannot be stream-copied):

```
ffmpeg -nostdin -y -i RAW.mp4 \
  -filter_complex "[0:v]setpts=PTS-STARTPTS,drawbox=x=0:y=0:w=iw:h=ih:color=black:t=fill:enable='between(t,A1,B1)+between(t,A2,B2)'[v];\
                   [0:a]asetpts=PTS-STARTPTS,volume=enable='between(t,A1,B1)+between(t,A2,B2)':volume=0[a]" \
  -map "[v]" -map "[a]" -c:v libx264 -preset veryfast -crf 20 -pix_fmt yuv420p \
  -c:a aac -b:a 128k -movflags +faststart OUT.mp4
```

- `A_i/B_i` = each in-camera range **padded** by margin `m` and clamped to
  `[0, ffprobe_duration]`. Device `t0` is anchored ~1.5–2.5s **after** the MP4's
  first frame, so true in-camera content sits **later** in the MP4 than the raw
  segment says — pad the trailing edge ≥ skew (default lead 3s / trail 5s;
  configurable). Over-blanking public edges is acceptable; leaking is not.
- Disjoint ranges → summed `between()` terms are 0/1 (truthy), no double-apply.
- Verified: solid-black frames (8.6KB) + −91 dB audio across the window; public
  frames + audio intact; duration 53.037≈53.033s. `drawbox t=fill` overwrites
  every pixel; `volume=0` zeroes every sample.
- **All-public fast path** (attested): `-c copy -movflags +faststart` (seconds).
- Runs on the **server** (likely GPU-less) → default software x264; optional
  `decode→drawbox(sw)→format=nv12,hwupload→h264_vaapi` if `/dev/dri` present.
- **Post-encode verification before latching `complete`:** decode a frame (must
  be black) + measure audio RMS (must be ~0) at the **midpoint of each** in-camera
  window in OUT.mp4. Any window not black+silent → hold/retry, never publish.
  (A mis-mapped audio track exits 0 while leaking — the exit code is not enough.)
- Never `getFileContent` a >2GB recording into a Buffer (crashes + temp leak) —
  ffmpeg/ffprobe operate on the local `provider_path` / a streamed temp with
  try/finally cleanup.

## Commit plan (B–G — NOT yet built)

- **B — upload fail-closed:** finalize `folder: 'recordings' → 'recordings_raw'`;
  `linkFileToSession` writes `av_file` + `redaction_status:'pending'` and does
  NOT push a public `attached_files` entry at the raw; `applySessionManifest`
  drops the `av_file` overlay (FA-BB-013).
- **C — redaction worker + transcription fix:** new in-process poll worker
  (clone the transcription gate *shape*, not its buffer). Also change
  `computePublicRanges`: `[]`/absent **without** attestation → HOLD (fixes the
  **existing live transcription fail-open**); share one padded-range helper
  between redaction and transcription (transcription shrinks public ranges by
  `m`). Worker appends the `attached_files` 'Recording' entry at `public_file`
  on verified completion.
- **D — streaming serve:** serve public folders via `downloadFileStream` with
  `Accept-Ranges`/206 + inline disposition for video (the whole-file buffer path
  can't deliver a multi-hour redacted MP4 > ~2GB / seek).
- **E — concurrency:** field-level `mergeCapture(recordId, partialCapture)` in
  core (re-read + compare-and-set on a capture version), routed through by both
  the redaction and transcription write-backs (top-level shallow merge from
  independent stale snapshots clobbers the security-critical latch).
- **F — backfill:** re-home every existing public raw (incl. the 3 live dev
  MP4s) into `recordings_raw` via the storage service + redact + delete the
  public object. **origin/main unfreeze gates on this**, not just new-upload
  routing.
- **G — availability escape hatch:** `awaiting_visibility` after a timeout with
  a `storage:manage`-gated manual publish/re-redact; bounded retry instead of a
  permanent `failed` latch; UI "recording is being processed" state.
- **Out of scope (follow-ups):** device-side capture gating + `in_camera ⇒ no
  RTMP/preview` (HW repo); cryptographic segment/attestation signing (FA-BB-001
  residual); FA-HW-001 device `0.0.0.0` bind.

## Product/legal decisions (asked; proceed on the recommended default if unanswered)

1. **Retain the raw original?** → *Retain privately* (retention/legal; enables
   re-redaction). Alt: TTL-delete or delete-after-redaction (forecloses re-redaction).
2. **Who reads the raw?** → *admin-only* (`storage:read_private`). Alt: clerk+admin.
3. **Is device gating required for closure?** → *No, server-side is sufficient*;
   device gating is defense-in-depth follow-up.
4. **FA-BB-001 scope here?** → ownership check (done) + remove manifest `av_file`
   (Commit B); signed segments deferred.
5. **Attestation source?** → full-timeline all-public cover now (no device
   change); signed later.
6. **Unfreeze gating?** → after the **backfill** completes.

## Tests (closure proof)

Seed a session with a real MP4 with a known in-camera window; run redaction;
assert: (a) anon `GET public_file` → 200 but a frame at the closed-window
midpoint is BLACK + audio RMS ~0; (b) a public-segment frame decodes normally;
(c) anon `GET raw av_file` → 401; (d) public-role token → 403. Plus:
`segments=[]`-no-attestation HOLDS (no publish, no whole-file transcript);
ffmpeg-missing idles; fully-in-camera publishes nothing; manifest-never-arrives
→ `awaiting_visibility` then manual publish plays; concurrency (both latches
persist); the three-tier gate matrix; Range 206; the config invariant; backfill.
