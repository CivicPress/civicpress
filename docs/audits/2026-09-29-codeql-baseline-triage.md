# CodeQL baseline triage — 2026-09-29

CodeQL was switched on for this repository on 2026-07-30, in report-only mode.
The alerts it raised that day were never looked at. There were 195 of them still
open on 2026-09-29, and none of them appears in any document in this repository:
the pull-request gate reports only what a change introduces, so a finding that
was already there when the scanner started was invisible to every check the
project runs.

This is the triage. Every production alert has a verdict, and every verdict was
checked against the source or, where the claim was about time or reachability,
measured. Three read-only passes did the first reading; each verdict below was
then re-verified by hand, and several were corrected. What was fixed is in the
pull request that carries this file; what was not is listed with the reason, so
that it can be dismissed on the Security tab by someone with the permission to
do so — the helper account cannot.

## The numbers

| Where                         | Alerts | Outcome                                                                     |
| ----------------------------- | ------ | --------------------------------------------------------------------------- |
| Production source             | 79     | 65 fixed or closed by a code change; 14 remain, each a documented dismissal |
| Tests, fixtures, scripts, e2e | 116    | Not triaged individually; see the last section                              |

Only **one** production alert described something a caller could exploit as the
scanner described it: the code-injection sink in the template validator, which
was the `gray-matter` JavaScript engine (fixed in #39). The path-injection
findings were real in three places, but blind. Several of the most serious
defects this review found were **not** alerts at all — they were beside the
alerts, in the same files, found while establishing whether the alert was right.
They are in the second half of this document.

## Production alerts, by rule

### `js/path-injection` — 43

A caller-supplied name joined onto a directory. Verdicts, by the source of the
name:

| Sink                                                                                                                      | Source                                                                | Verdict                                                                       | Now                                                                                                                                                             |
| ------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- | ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `core/src/utils/record-paths.ts` (7)                                                                                      | `type` on `/validation/*`, `/status/records`; `recordId` on `/diff/*` | **Real, blind** (3 sites); guarded on POSIX (id)                              | Confined in core (`resolveChild` / `resolveInside`); routes validate the name                                                                                   |
| `core/src/utils/template/loader.ts` (4)                                                                                   | `type` on `GET /templates`                                            | **Real, blind**                                                               | Confined in core                                                                                                                                                |
| `core/src/geography/geography-manager.ts` (6)                                                                             | list: `type`/`category` (anonymous); create: body                     | List: route allowlist only — **read files it found**; create: guarded         | Both confined in core                                                                                                                                           |
| `core/src/config/configuration-service.ts` (9)                                                                            | `:type` on `/config/*`                                                | Guarded (regex)                                                               | Resolved inside the directory, so the guard is where the join is                                                                                                |
| `modules/api/src/routes/config.ts` (4)                                                                                    | `:type` on `/config/raw/*`                                            | Guarded (regex) — but two of the paths were relative to the working directory | Paths come from the service                                                                                                                                     |
| `core/src/templates/template-service.ts` (1)                                                                              | body on `POST /templates`                                             | Guarded — by a `startsWith(root)` a sibling directory passes                  | Containment on the file written                                                                                                                                 |
| `modules/broadcast-box/src/services/upload-processor.ts` (10)                                                             | `req.params.id` (device token)                                        | Guarded (UUID validator + owned row)                                          | Confined beside each use, incl. the recursive delete                                                                                                            |
| `modules/api/src/routes/uuid-storage/single-file-handlers.ts:136` (#150), `modules/storage/…/streaming-ops.ts:146` (#164) | `req.file.path`                                                       | **False positive**                                                            | Dismiss: the path is generated by multer (`randomBytes(16)` under a server-chosen directory); the client controls `originalname`, which is sanitized separately |

"Blind" means: `existsSync` / `readdirSync` ran on a directory the caller named,
and the response differed with what was found (a 500 where the name was a file;
a body with or without `availableRecords`). No file content left the server
through these. What leaked was existence.

### `js/polynomial-redos` — 12

| Sink                                                      | Input                                          | Measured (old code)                   | Now                                 |
| --------------------------------------------------------- | ---------------------------------------------- | ------------------------------------- | ----------------------------------- |
| `modules/broadcast-box/src/types/errors.ts` (5)           | a device's ack `error`, up to 10 MiB           | **62 s for 1 MB**, synchronous        | Input cut to 2 KB; substring checks |
| `core/src/utils/template/generator.ts:104` (1)            | template body (`templates:manage`)             | 2.8 s for 50 KB                       | Linear scan; body capped at 200 KB  |
| `core/src/utils/template/record-validator.ts:391` (1)     | template frontmatter (CLI only)                | 4.5 s for 100 KB                      | Split on the operator, then trim    |
| `core/src/search/query-parser.ts` (3)                     | `q`, capped at 512 by the route                | 0.46 ms at the cap; exported function | Linear, compared on 100k inputs     |
| `core/src/geography/geography-parser.ts:188` (1)          | a geography file (API always closes the fence) | 2.2 s for 300 KB if placed by hand    | Linear, compared on 200k inputs     |
| `core/src/notifications/notification-security.ts:137` (1) | none — no caller                               | —                                     | Deleted                             |

### Hand-rolled sanitizers — 15

`js/incomplete-multi-character-sanitization` (8), `js/bad-tag-filter` (3),
`js/incomplete-url-scheme-check` (2), `js/double-escaping` (1),
`js/incomplete-sanitization` (1).

| Sink                                                                  | What it guards                                                    | Verdict                                                                                                                       | Now                                                                                                                                                                                      |
| --------------------------------------------------------------------- | ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `notification-template.ts` `sanitizeHtml` (5)                         | nothing — no caller                                               | Dead code                                                                                                                     | Deleted                                                                                                                                                                                  |
| `notification-template.ts` `htmlToText` (2)                           | the text part of an email, derived from the HTML part             | Bypassable, output never rendered as HTML                                                                                     | Deleted; the text part is the message                                                                                                                                                    |
| `notification-security.ts` `sanitizeString` (#181, #186)              | reachable only through `sanitizeContent`, which only a test calls | Dead in production                                                                                                            | **Left** — `sanitizeContent` is the `filter_pii` decision (backlog); dismiss as "won't fix" or delete with it                                                                            |
| `generator.ts` `sanitizeVariableValue` (#170, #182, #183, #184, #187) | values substituted into a **Markdown** template                   | Bypassable (`<scr<script>ipt>`), and it **corrupts text**: `on\w+\s*=` turns "The condition = approved" into "The c approved" | **Left; needs a decision** (backlog). Every in-repo HTML render runs DOMPurify, so no active payload survives today                                                                      |
| `markdown-serializer.ts:81` (#175)                                    | table-cell pipes                                                  | **False positive**                                                                                                            | Dismiss: not an HTML sanitizer. Backslashes must not be escaped — markdown-it reads `\|` by removing exactly that backslash. A real fidelity bug beside it (`\r` not collapsed) is fixed |

### The tail — 9

| Alert                                                                                   | Verdict                                                                                                                                                   | Now                           |
| --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| `js/code-injection` `template-validator.ts:198` (#118)                                  | **Real** — `gray-matter` evaluates `---js` front matter; not HTTP-reachable, reachable by any file that arrives another way                               | Fixed in #39                  |
| `js/insufficient-password-hash` `idempotency.ts:179` (#172)                             | False positive — SHA-256 of user id + record id + request, as a dedup key; nothing authenticates by presenting it                                         | Dismiss                       |
| `js/insufficient-password-hash` `secrets.ts:324` (#173)                                 | False positive — HMAC-SHA256 with an HKDF-derived key over a `randomBytes(32)` token; passwords go to bcrypt cost 12 (verified at every hash site)        | Dismiss                       |
| `js/insecure-randomness` `realtime-server.ts:1168` (#1)                                 | Defence in depth — a routing key, never read from a client; uniqueness is load-bearing                                                                    | `randomUUID()`                |
| `js/biased-cryptographic-random` `device-manager.ts:844` (#168)                         | False positive as flagged — 256 % 32 = 0, so unbiased, by the accident of the alphabet's length                                                           | `crypto.randomInt()`          |
| `js/type-confusion-through-parameter-tampering` `query-parser.ts:87` (#174)             | False positive at the route (`isString()` is a whole-value check)                                                                                         | Guard added in the function   |
| `js/resource-exhaustion` `check-executor.ts:186`, `circuit-breaker.ts:218` (#189, #190) | Defence in depth — admin-only and route-validated, but the timer was never cleared and the clamp lived only in the route                                  | Timer cleared; capped in core |
| `js/missing-rate-limiting` `broadcast-box/src/api/index.ts:282` (#192)                  | False positive — the sink is the device-token middleware; the application-level limiter runs before it, in another package, which the analyser cannot see | Dismiss                       |

## What was beside the alerts

Found while establishing whether an alert was right. None is an alert. Each is
measured, and each is in the pull request unless marked otherwise.

| Finding                                                                                                                                                                                                                                            | Reachable by                                                 | Fixed                                                                            |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| **`commit1` / `commit2` on `GET /diff/:id` were passed to git as arguments.** `--output=<path>` made git write a file wherever the process can.                                                                                                    | `records:view` — the `public` role, and registration is open | Yes                                                                              |
| **Registering an account bypasses the published-only gate.** `statusFilterFor` treats any authenticated user as staff; registration needs no verification and gives `public`. A self-registered user listed every status and read a draft in full. | Anyone                                                       | **No — needs a decision** (which permission grants sight of unpublished records) |
| Template preview: variable **names** went into a `RegExp` unescaped — exponential on ordinary text; `.*` replaced every placeholder; `a(` was a 500. Values as replacement strings interpreted `$&`.                                               | `templates:view` (clerk)                                     | Yes                                                                              |
| The HTML part of every email was built without encoding; the reset email carries the username.                                                                                                                                                     | Anyone, when email is on                                     | Yes                                                                              |
| The device-registration rate limiter keyed on the first `X-Forwarded-For` entry — the client's.                                                                                                                                                    | Anyone                                                       | Yes                                                                              |
| `NotificationSecurity.validateRequest` scanned data of any size before checking its size: **169 s for 1 MB**.                                                                                                                                      | Anyone, when email is on                                     | Yes                                                                              |
| `/diff/:id/commits?author=` and `?since=` answered 500 whenever used; compare returned an **empty diff** by default; `limit` unvalidated.                                                                                                          | `records:view`                                               | Yes                                                                              |
| `GET /status/records` has always reported `byStatus: {}` (looked one directory too high).                                                                                                                                                          | admin                                                        | Yes                                                                              |
| The raw config routes read `core/src/defaults` and `.system-data` relative to the working directory.                                                                                                                                               | admin                                                        | Yes                                                                              |
| `inferErrorCode`: `ice` matched inside "device", so "Device is busy" was a WebRTC failure; three codes were unreachable.                                                                                                                           | device                                                       | Yes                                                                              |
| A username has no length limit at registration.                                                                                                                                                                                                    | Anyone                                                       | No — recorded                                                                    |
| Repeated query parameters (`?sort=a&sort=b`) were anonymous 500s on `/search`, `/records`; arrays reached `/geography`, `/indexing/search`.                                                                                                        | Anyone                                                       | Yes                                                                              |

## Dismissing what remains

Fourteen production alerts remain open on purpose. The reasons are above; the
identifiers are here. Dismissal needs the Security tab or an admin token —
`gh api -X PATCH repos/CivicPress/civicpress/code-scanning/alerts/<n> -f state=dismissed -f dismissed_reason=<reason> -f dismissed_comment=<why>`.

| Alerts                       | Reason                | Comment                                                                               |
| ---------------------------- | --------------------- | ------------------------------------------------------------------------------------- |
| #150, #164                   | `false positive`      | `req.file.path` is generated by multer under a server-chosen directory                |
| #172, #173                   | `false positive`      | Fast hash of a random token / HMAC with a derived key; passwords use bcrypt           |
| #174                         | `false positive`      | Route validates `q` as a whole-value string; the function now refuses non-strings too |
| #175                         | `false positive`      | Escapes pipes in Markdown, not HTML; backslashes must not be doubled                  |
| #192                         | `false positive`      | Application-level limiter precedes this middleware                                    |
| #181, #186                   | `won't fix` (pending) | Reachable only from a test; tied to the `filter_pii` decision                         |
| #170, #182, #183, #184, #187 | `won't fix` (pending) | `sanitizeVariableValue` needs a decision; DOMPurify guards every render today         |

The rest should close on their own when CodeQL next scans `main` with these
changes in it. If any does not, its guard is one the analyser does not
recognise, and the alert can be dismissed with a pointer to this file.

## The 116 in tests, fixtures and scripts

111 are one rule, `js/shell-command-injection-from-environment`, raised by CLI
tests that build a shell command from a temporary-directory path
(`tests/cli/**`, `tests/fixtures/test-setup.ts`). The other five: three
`js/missing-rate-limiting` (two in a CSRF test, one in the BroadcastBox live e2e
server), one `js/bad-tag-filter` in a one-off lint-rollout script, one
`js/unnecessary-use-of-cat`.

None of this runs in production, and none was read individually. Two ways to
make the count honest, both a maintainer's call:

1. Exclude `tests/**`, `**/__tests__/**`, `scripts/**` and `e2e/**` from the
   CodeQL analysis (a `paths-ignore` in `.github/workflows/codeql.yml`). The
   alerts close as "no longer detected". This narrows what the scanner covers,
   and `scripts/` runs on developer machines and in CI.
2. Dismiss them as `used in tests`, in bulk, with the API command above.

Whichever is chosen, the number on the Security tab should afterwards mean
something. On 2026-09-29 it did not.
