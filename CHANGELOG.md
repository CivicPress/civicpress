# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

<!-- markdownlint-disable MD024 -->

A **contributor DevX + resolution-hardening** pass ahead of v0.4.x. Its keystone
is a single-root instance resolver: "where is this instance?" is now answered
once, instead of independently in a dozen places that each fell back to
`process.cwd()`. Several live bugs fell out of that migration.

**Read the Fixed section even if you skim the rest.** What began as a resolver
migration turned up defects well outside it, because each fix exposed the next.
Most consequential: **anonymous API reads were not gated on publication at all**
— unpublished records were listable, fetchable in full, searchable and countable
by a caller with no credentials, and two of those endpoints had no
authentication middleware on them whatsoever. In the same vein, **a draft
record's attachments were fetchable by anyone holding the file's UUID**, because
editor uploads landed in the `public` folder. Also here: a signing secret
written outside any live instance, the audit trail written to the working
directory, every transcription job leaking its multi-GB source recording, and
the realtime server writing snapshots after shutdown. Nothing was deployed
publicly while these were open.

**One more gate was found open.** `getControlledStatuses` decides whether the
status-write guard runs at all, and it only knew about the global transition
graph — while its caller returns early, skipping validation entirely, for any
status it does not report. A status reachable only through a record type's own
workflow was therefore writable by any role with the transition check never
running. That surfaced while fixing the reason per-type workflows existed on
paper but not in practice.

**And a permission check that could never pass.** `RoleManager` read `roles.yml`
`status_transitions` expecting an object map while the shipped file declared an
array — a shape it explicitly rejects — so on a real instance that check denied
every role, admin included. The suite stayed green because the test fixture
wrote the working shape. Latent rather than live (its only caller was uncalled
and unexported), and now removed rather than repaired, leaving `workflows.yml`
as the single transition authority.

**Legal document numbering is the other thing to read.** In a civic register the
document number IS the citable identity of a record, and all three ways of
getting one were broken: records published from a draft — the primary editor
path — were never numbered **at all**; a caller-supplied number was stored with
no format or uniqueness check; and assignment was a read-then-write race that
could issue one number twice. Numbering now happens on every create path,
through a single authority, against a reservation table that makes uniqueness a
database guarantee rather than a convention.

### Security

- **A record file could execute code.** `gray-matter` ships a JavaScript
  front-matter engine and selects it from the text that follows the opening
  delimiter, so a file beginning `---js` was passed to `eval` by whatever parsed
  it — which includes the indexer, at API startup. Every writer the API owns
  emits a YAML header it builds itself, so this was **not** reachable from a
  request body. It was reachable by a file that arrived in the data directory
  any other way: `civic import`, a restored backup, or a data repository edited
  or merged through Git. Planting such a file and running the indexer against it
  executed the payload; that is now a regression test.

  Front matter is read and written through `parseFrontmatter` /
  `stringifyFrontmatter` (`@civicpress/core`), which refuse that engine instead
  of running it. All 24 call sites were moved — 22 parses, and the two
  `matter.stringify` calls, which parse their argument before serializing it and
  were therefore parse sites too. A refused file is reported as invalid and
  skipped; the rest of the index is unaffected. Importing `gray-matter` anywhere
  else is now a lint error, so the guarantee cannot quietly lapse.

  ⚠️ **If you have ever imported records from a source you do not control, or
  accept contributions to your data repository, check it:**
  `grep -rliE '^---[[:space:]]*(js|javascript)[[:space:]]*$' data/`. A match on
  a file's **first line** is the one that matters. YAML and JSON front matter
  are unaffected.

  The same change fixes a second defect. Called without options, `gray-matter`
  kept every distinct input in a process-wide cache keyed by the whole file
  content, never evicted it, and handed the cached object back by reference: a
  long-running API grew without bound, and a caller that modified the front
  matter it received changed what the next caller got for the same text.
  `stringifyFrontmatter` also stops re-parsing the body it is given, so a
  document whose body begins with `---` is no longer folded into its own
  metadata on save.

- **🔴 A commit parameter could make git write a file.**
  `GET /api/v1/diff/:id?commit1=…&commit2=…` validated the two revisions only as
  non-empty strings and passed them to git as arguments. Git takes an argument
  beginning with `-` as an option, and `git show --output=<path>` writes its
  output to `<path>` — so a caller with `records:view`, which the `public` role
  holds, could make the server create or overwrite a file anywhere the process
  can write. Measured, as a self-registered user: the request created the file.
  A revision is now one name for one commit (a hash, or a ref with `~`/`^`
  ancestry), validated at the route and asserted again where the git command
  line is built. Found beside a scanner alert, not by one.

- **A name could walk out of its directory.** A record type on
  `POST /api/v1/validation/record` (and `GET /validation/record/:id`,
  `/validation/bulk`, `/status/records`, `/templates`) was validated only as "a
  string" and then joined onto the records root. `type=../../outside` made the
  server walk the named directory, recursively and synchronously, and answer
  differently depending on whether `<recordId>.md` existed there — a 500 where
  the name was a file, a 200 where it was not. Existence leaked; no content did.
  The geography listing, which is anonymous, went further and **read** the files
  it found under a traversing `category`; its route's allowlist was the only
  thing in front of it. Every function that turns a caller-supplied name into a
  path now confines the result to its root (`resolveInside` / `resolveChild` in
  `@civicpress/core`), beside the filesystem call, and the routes answer `400`
  for a name that is not one. Also covered: a template's `extends`, which
  resolved one level above the template directory; the record type interpolated
  into a schema-file path; and a `startsWith(root)` check that a sibling
  directory passes.

- **A template variable's name was a regular expression.** The preview route
  (`templates:view` — the clerk) interpolated each variable's name into a
  pattern unescaped: `.*` replaced every placeholder, `a(` was a 500, and a name
  with a nested quantifier was exponential against a line of ordinary text — 28
  characters took 2 s, and the shipped bylaw template has a line of 45. Names
  are escaped; values are supplied through a function so `$&` in a value is
  literal; the partial and `{{#if}}` scans, which were quadratic on a body of
  openings with no closing, are a single linear pass compared against the
  original on 300,000 generated inputs; preview input is bounded (100 variables,
  20 KB) and a template is at most 200 KB.

- **Classifying a device's error message was quadratic.** A device ack that
  fails without an `errorCode` has its `error` text classified by five `/a.*b/`
  patterns, with the 10 MiB frame as the only bound. 1 MB of "device" repeated
  blocked the process for 62 seconds. The text is cut to 2 KB and the five are
  substring checks. Three misclassifications fixed on the way: `ice` matched
  inside "device", so "Device is busy" was a WebRTC failure; "File not found",
  "Preview already active" and "Capture already active" were answered by the
  general test above them.

- **Emails showed a value as markup.** The HTML part of every notification email
  was assembled without encoding, and the password-reset email carries the
  account's username, which registration accepts from anyone. A username of
  `<a href="https://…">sign in here</a>`, registered against someone else's
  address, arrived in that inbox as a link in an email from the municipality.
  The body is encoded now; the assembled document is no longer run through
  variable replacement a second time (a value containing `{{…}}` used to throw
  and stop the email); and the text part is the message rather than the HTML
  with its tags deleted, which began every text email with the stylesheet.
  `validateRequest` now checks the size of the data before scanning it — the
  scan was quadratic and ran first: 169 s for 1 MB.

- **The device-registration rate limiter counted by an address the client
  chose.** It read the first entry of `X-Forwarded-For`; a proxy appends to that
  header. Eight requests with eight values, eight 200s. It keys on `req.ip` now,
  which honours `trust proxy`, and the same helper supplies the `registrationIp`
  stored with a device, which was equally the client's to invent. The per-code
  key is bounded to 64 characters.

- **Repeated query parameters were anonymous 500s.** express-validator's `isIn`,
  `isLength` and `matches` run per element on an array, so `?sort=a&sort=b`
  passed them and then broke a `.toLowerCase()`: 500 on `GET /search` and
  `GET /records` with no login. `isString().bail()` now precedes them;
  `/indexing/search` gained validation it never had; `/validation/bulk` is
  bounded to 100 string ids.

- **The rest of the CodeQL baseline.** 195 alerts had been open since the
  scanner was enabled on 2026-07-30; none had been triaged. Every production
  alert now has a verdict in `docs/audits/2026-09-29-codeql-baseline-triage.md`.
  Beyond the items above: diagnostic-check timers are cleared when the check
  finishes and capped at five minutes in core; realtime client ids come from
  `randomUUID()`; enrollment codes use `crypto.randomInt()`; the search and
  geography parsers' quadratic patterns are linear (compared on generated
  input); upload paths are confined beside each use; a table cell collapses `\r`
  as well as `\n`; two dead sanitizers and three dead helpers are deleted.
  Fourteen production alerts remain by decision, each with its dismissal reason
  in the triage document.

### Added

- **`resolveInstanceContext()`** (`@civicpress/core`) — resolves the instance
  root ONCE (an explicit argument, or a single `.civicrc` walk-up) and derives
  `dataDir` / `systemDataDir` / `modulesDir` / `storageRoot` from it. It
  distinguishes the DATA root from `codeRoot`, the installed-code location, so a
  split deployment (the Docker image ships code at `/app` and runs with WORKDIR
  `/instance`) discovers modules correctly — modules are code, not data. A root
  can also be **installed** via `setInstanceContext()` rather than discovered.
- **Real document-number sequencing.** `RecordStore.getDocumentNumbers()` plus a
  format-aware matcher, so legal numbering continues from what has actually been
  issued.
- **A `document_numbers` reservation table**, and one authority
  (`resolveDocumentNumber`) that every record-creating path now goes through. A
  number is CLAIMED — insert against a PRIMARY KEY — before the record row
  exists, which is what makes it safe under concurrency; the sequence is read
  from issued numbers and reservations together, so a database predating the
  table needs no backfill. Saga compensation hands a number back rather than
  burning it.

### Security

- **Being logged in no longer counts as clearance to read unpublished records.**
  The published-only gate on anonymous reads asked one question — "is there a
  user?" — while `POST /users/register` hands anyone a `public` account with no
  verification and no switch. Measured before the fix: a self-registered account
  listed every status, read a draft's full body where the anonymous request got
  a 404, and got the same set back from search and the summary histogram. The
  line is now a permission, **`records:view_unpublished`**, granted to `admin`
  and `clerk` in the shipped roles and held by nobody else; every read path
  (list, by id, frontmatter, search, summary, linked records) asks it through
  one function, and the realtime handshake asks the same question: joining a
  draft's collaboration room by id used to need only `records:view`. ⚠️ **An
  instance with its own `roles.yml`** keeps working, but its reviewer roles see
  only public statuses until the line is added — that is the fail-closed side of
  the change, and the intended one.
- **Self-registration has a switch.** `auth.registration.enabled: false` in
  `.civicrc` closes `POST /users/register` (`403 REGISTRATION_DISABLED`, before
  the body is read), `GET /auth/providers` says so, and the web UI hides the
  link and the form. On by default, so an upgrade changes nothing; `civic init`
  writes the key so it can be found.
- **A 404 no longer lists the record tree.** The not-found bodies of `/diff/*`
  and `/validation/record/*` carried `availableRecords`: every record file on
  disk, in every status, to any caller with `records:view` — the published-only
  gate defeated by an error message. Removed.

### Fixed

- **The built-in workflow default had no `admin` role.** `WorkflowConfigManager`
  falls back to an inline configuration when `workflows.yml` is absent — and
  that copy knew clerk, council and public only, so a default instance answered
  "Role 'admin' not found" to every admin transition. It now mirrors the shipped
  file. The API test fixture, meanwhile, had written `workflow.yml` (singular)
  for its whole life, so every API test ran on that inline default rather than
  on the fixture's own configuration; it writes the file core reads now.
- **A draft that was never published had no transitions.**
  `GET /records/:id/transitions` looked the record up in `records` only, and a
  record still in review exists only in `record_drafts` — so the editor's status
  menu was empty for exactly the records that were moving. It falls back to the
  draft row.

- **The editor decided for itself what "published" means.** `EditorHeader` kept
  its own list — `['published', 'active', 'approved']` — while the authority
  since 2026-08-09 has been the `public` flag on each record status, which is
  what the read gate enforces. They disagreed: `approved` is not public, but the
  editor called an approved record published, offered to "unpublish" it, and
  warned that it would "no longer be publicly accessible". It also could not
  know about a status a municipality had declared public itself.

  `GET /api/v1/system/record-statuses` now serves `public` for every status, and
  the editor asks. Three dialogs made claims about public visibility that the
  configuration did not back, and now follow it:
  - **Publish** promised the record "will become publicly accessible" whatever
    status it was being published in. For a status that is not public it now
    says so, and names the status.
  - **Archive** said archived records are "not publicly accessible". They have
    been public by default since 2026-08-09 — a repealed bylaw stays part of the
    public record — so the dialog said the opposite of what happens.
  - **Unpublish** is worded as unpublishing only when the record is public;
    otherwise it is "Return to draft".

  ⚠️ **Two changes to what the status menu offers.** "Return to draft" is now
  offered from any status the workflow allows it from; it used to appear for the
  hardcoded statuses only, while `draft` was also filtered out of the generic
  list, so other statuses had no way back from this menu. And the menu no longer
  hides a transition for looking "published-like": it lists what the workflow
  allows, leaving out only `draft` and `archived`, which have their own items.
  In a default instance that adds "Change status to Approved" for a reviewed
  record.

  The same endpoint's `editable` field was computed from a literal
  `['published', 'archived', 'expired']` — the default public set, written out a
  second time. It now follows the configuration; a default instance sees no
  difference.

- **🔴 `roles.yml` shipped a permission check that could never pass — and the
  test fixture hid it.** `RoleManager` consulted `status_transitions` whenever a
  permission check carried a from/to status, and required an object map,
  explicitly returning `false` for the other shape. The shipped `roles.yml`
  declared it as an **array** for every role, so on a real instance that check
  denied **everyone, including admin**. The suite never caught it because the
  test fixture wrote the object form: the tests proved the feature against
  configuration no instance had.

  Nothing reached it in practice — the only caller, `userCanTransition`, had
  zero call sites and was never exported — so this was latent rather than live.
  It is now **removed rather than repaired**: status transitions are governed by
  `workflows.yml` `can_transition` (via `WorkflowConfigManager`, which also
  honours per-record-type workflows), and making `roles.yml` a second authority
  would have needed a precedence rule that does not exist. Gone with it: the
  `RoleConfig.status_transitions` field, the branch in `RoleManager`, the dead
  helper, and `fromStatus`/`toStatus` from the `userCan` context — keeping those
  would have left a silently-ignored way to ask the question.

- **Per-record-type workflows were silently ignored.** `docs/specs/workflows.md`
  documents "Department-Specific Workflows" — a bylaw and a policy having
  different lifecycles via `recordTypes.<type>.transitions` — and
  `RecordTypeConfig` has declared `transitions` and `roles` all along. Only
  `statuses` was ever read: `validateTransition` and `getAvailableTransitions`
  took **no record type** and judged every record against the **global** graph,
  so an instance configuring a per-type lifecycle exactly as documented got the
  global one instead, with nothing reporting that its configuration had been
  dropped. Both now accept an optional trailing record type, and all seven call
  sites pass it — `assertStatusWritableByRole` was already **receiving** the
  type and discarding it.

  A type that declares its own `transitions` (or `roles`) **replaces** the
  global set rather than merging, matching how per-type `statuses` already
  behaved and how the spec's example writes each lifecycle out in full.

  ⚠️ **This closed a hole as well as a gap.** `getControlledStatuses` — which
  decides whether the status-write guard runs at all — collected targets from
  the global graph only, and its caller returns **early**, skipping validation
  entirely, for any status it does not report. A status reachable only through
  some type's own graph was therefore writable by any role with the transition
  check never running. It now unions every type's graph, deliberately
  over-inclusive: more statuses gated, each then judged per type.

- **Legal document numbers were always `1`.** `getNextSequence` was a stub that
  returned 1, and both call sites fed it straight into the generator, so every
  legal-type record they created came out as `<PREFIX>-<YEAR>-001` — silent
  duplicates of the record's own citable identity. Numbering now continues from
  the highest issued number, scoped by prefix AND year, and honours custom
  `document_number_formats` (a prefix containing a digit, or a `.` / `_`
  separator, previously matched nothing and restarted the sequence).
- **🔴 Records published from a draft were never numbered at all.** Numbering
  lived at two of the three create paths; the draft → publish saga goes through
  `RecordManager.createRecordWithId`, which had no numbering block — so a bylaw
  published the way the editor publishes bylaws was stored with **no
  `document_number`**. Permanently unnumbered, missing from
  `getDocumentNumbers()`, and therefore invisible to the sequence of every
  record numbered after it. Numbering now happens at publish, which is also the
  right moment for a legal register: abandoned drafts do not burn sequences.
- **A caller-supplied `document_number` bypassed every check.** It was stored
  verbatim — `DocumentNumberGenerator.validate()` existed with zero call sites
  and the schema declared no pattern — so a record could carry another record's
  number, or anything at all. A supplied number is now checked against the
  type's CONFIGURED format (`ValidationError`) and claimed for uniqueness
  (`ConflictError`). `validate()` itself was broken for the case it would first
  be used in: it compared against the BUILT-IN prefix, so on any instance with
  custom `document_number_formats` it rejected precisely what the generator
  emits.
- **Document-number assignment was a read-then-write race.** Two concurrent
  creates of the same type and year computed the same next sequence and both
  kept it — nothing locked, and with the number inside the metadata JSON there
  is no column to constrain. Reservation closes it; pinned by a concurrency test
  that fails against the old shape.
- **The orphaned-file cleaner could delete the wrong tree.** It resolved a
  relative local provider path against the literal `.system-data` — i.e.
  `process.cwd()` — so when run from anywhere but the instance root it scanned a
  different tree than the database it compared against, and every file it found
  there looked like an orphan. `cleanupOrphanedFiles` deletes those, so this was
  a live data-loss path rather than a harmless empty scan.
- **Cloud storage credentials were read from the working directory.**
  `CredentialManager` was constructed with no path and fell back to
  `<cwd>/.system-data/storage.yml`, making file-configured credentials invisible
  outside the instance root. A relative GCS `keyFilename` now resolves against
  the instance root too.
- **The storage CLI read a different `storage.yml` than core and the API.** It
  computed its own systemDataDir from cwd behind a test heuristic that sniffed
  the data path (`dataDir.includes('/tmp/') || dataDir.includes('test')`), so a
  production instance whose dataDir merely contained "test" took the test
  branch.
- **`civic init` produced an instance that nagged about its own config.** All
  three `.civicrc` writers seeded top-level `modules` and `record_types`, both
  deprecated there, so every freshly-initialised instance warned "Deprecated: …
  Prefer data/.civic/config.yml" on every command. `modules` now lives only in
  `data/.civic/config.yml`; `record_types` had no reader at all.
- **Notification config and audit log followed the working directory.** Both
  defaulted to a relative `.system-data`, and the DI container read
  `notifications.yml` from `dataDir` — the location the configuration service
  migrates the file OUT of, leaving a pointer stub — so the notification config
  silently fell back to defaults on any migrated instance.
- **Template base paths, the diagnostics config checker and `civic diagnose`**
  all resolved `.system-data` from the working directory.
- **Every transcription job leaked its source recording to disk.**
  `prepareAudio` stages the meeting's A/V in a temp directory for the engine to
  decode and returns the path; nothing ever removed it. The whisper engine
  cleaned its own scratch directory, so the staged container — "single-digit GB
  is normal", against a 16 GiB upload cap — was left in `os.tmpdir()` after
  every completed job, filling the disk of a long-running instance one meeting
  at a time. `AudioRef` now carries a `cleanup()` the worker calls in a
  `finally`, so the staging is released on the failure path too. `prepareAudio`
  also releases the directory itself when the fetch throws: it creates the
  staging before anything can fail, and a caller that gets an exception never
  receives the `AudioRef` — so it never receives the `cleanup()` either. A
  session whose A/V could not be fetched was stranding one directory per retry,
  every cycle, indefinitely.
- **The realtime server could write snapshots after `shutdown()` returned.**
  Three paths escaped teardown: the periodic snapshot pass was fire-and-forget
  so `clearInterval` could not stop one already running; room finalization was
  likewise fire-and-forget, and cancelling the grace timer does not cancel a
  finalize in flight; and `shutdown()` closes client sockets _after_ its final
  snapshot pass, so each disconnect armed a fresh finalize once the server was
  already down. Shutdown now waits for the in-flight periodic pass and for every
  outstanding finalization, and a client leaving during shutdown no longer arms
  one — the final pass already covers it, so this also drops a duplicate
  snapshot write per room.
- **Anonymous readers could see unpublished records.** The public read path
  applied no status filter, on the stated grounds that location implies
  publication — everything in the `records` table is published "by definition".
  Nothing enforced that: `RecordStore.createRecord` inserts `status || 'draft'`
  and the indexer syncs every on-disk entry in whatever status it carries. In
  practice an anonymous caller listing records received every status present —
  draft, pending_review, approved, rejected included — `GET /records/<id>`
  returned an unpublished record in full, `/records/<id>/frontmatter` served its
  entire markdown body, `GET /search` returned unpublished records in full,
  `GET /records/summary` published a per-status histogram of them, and both
  `/geography/:id/linked-records` and `/records/summary` had no authentication
  on them at all. Visibility is now a property of the status:
  `RecordStatusConfig` gains `public`, defaulting to **not public**, with
  `published`, `archived` and `expired` declared public. Every anonymous read
  path — list, by-id, frontmatter, search, summary and linked-records — goes
  through one gate, and an unpublished record answers 404 rather than 403 so its
  existence is not disclosed either. Authenticated callers are unaffected.
  **Municipalities running a custom `record_statuses_config` should confirm
  which of their statuses need `public: true`.**
- **A draft record's attachments were readable by anyone with the file's UUID.**
  Editor uploads landed in the `public` storage folder, so an attachment was
  fetchable from the moment it was uploaded — before the record carrying it was
  ever published. Simply moving them somewhere private would have broken the
  opposite case, since citizens must be able to read a published record's
  attachments anonymously. The record is now the source of truth for its
  attachments' visibility: uploads land in a new `attachments` folder
  (`access: authenticated`, unioned into existing `storage.yml` files by
  `mergeWithDefaults`, so existing instances pick it up), and the single-file
  read gate serves a file the folder tier would refuse when a **published**
  record references it — via `attached_files` or as a bare UUID embedded in the
  Markdown body, which is how a dragged-in image is stored.
- **Editor attachments ignored the configured storage folder**, and **bundled
  config defaults resolved from the working directory** rather than from the
  package — the same cwd-resolution class as the entries above.
- **Search and its facets ignored a multi-status filter.** `search/sqlite`'s
  query builder, its facet counts, and the LIKE fallback in `RecordStore` each
  accepted only a bare `status = ?`, while the list path had supported
  `status IN (...)` for years. Passing a list matched nothing at all rather than
  matching any of them — invisible until the published-only gate started
  expressing "any publicly-visible status" as a list, at which point it would
  have emptied public search entirely.
- **The secrets manager kept writing to the previous instance.**
  `SecretsManager` is a process-wide singleton, and it resolved its
  `secrets.yml` path once in the constructor from the first caller's `dataDir` —
  so `getInstance()` silently ignored the location every later caller asked for.
  A process that moves between instances therefore read and wrote the wrong
  one's secret, and when that directory no longer existed it was **re-created**
  to hold a freshly minted key: a signing secret persisted outside the lifecycle
  of any live instance (1186 stray directories in the test suite, each holding
  nothing but `.system-data/secrets.yml`). The path now resolves per use,
  `getInstance()` re-points to the instance actually requested, and the cached
  root secret and derived keys are dropped with it rather than carried across.
- **The API wrote its audit trail to the working directory.** `AuditLogger`
  defaulted to the relative `'.system-data'`, joined once in the constructor, so
  the destination was `<process.cwd()>/.system-data/activity.log` — decided by
  wherever the process was launched. Five API route modules build one at import
  time, before any instance exists, so records/users/config/notification audit
  entries landed outside the instance whenever the server was started from
  anywhere but its own root. Core meanwhile passed `config.dataDir` and wrote
  `<dataDir>/activity.log`, a third location, so one trail lived in two files
  and `GET /api/v1/audit` agreed with the writer only by coincidence. The path
  is now resolved per use from the instance context, and all three callers
  converge on `<systemDataDir>/activity.log` — the location that already held
  the history. An orphaned `data/activity.log` may remain on older instances.
- **The test suite failed CI while every test passed.** `build-test` exited 1 on
  `Error: [vitest-worker]: Timeout calling "onTaskUpdate"` with 201/201 files
  and 1845/1845 tests green. Vitest's worker↔main RPC has a hard 60s timeout,
  and a worker can only read the reply when its event loop reaches the poll
  phase. CLI tests drive the product through `execSync`, which blocks the loop
  for the whole subprocess, and the `await`s in between resolve from cache —
  draining only microtasks, never advancing the loop. `tests/cli/users.test.ts`
  ran 44s on an idle machine, and 64s under contention, as one unbroken block;
  the reply sat unread in the channel until the expired timer fired ahead of it.
  Introduced here, by replacing this pass's `await simpleGit().init()` (a real
  async child process, and the only thing yielding the loop per `beforeEach`)
  with a synchronous `execSync('git init')`. The CLI fixture now awaits its
  subprocesses, and a global setup hook gives every test one real event-loop
  turn, bounding the worst-case block to a single test's synchronous work.

- **`GET /api/v1/diff/:id` returned an empty diff unless every option was
  spelled out, and its history filters always failed.** `showMetadata`,
  `showContent` and `includeStats` defaulted to the boolean `true` and were then
  compared with the string `'true'`; the documented defaults now apply. `author`
  and `since` reached simple-git as `{ author: 'x' }`, which it passed to git as
  the argument `author=x` — a revision that does not exist — so both were a 500
  whenever used. `limit` is validated (1–200). The one compare test had never
  compared anything: it returned early when the fixture's record had fewer than
  two commits, which it always did.
- **`GET /api/v1/status/records` has always reported `byStatus: {}`.** It joined
  the data directory to each record path with the `records/` prefix removed,
  looked one directory too high, and counted nothing. The status is now read
  from the record's front matter rather than from the first `status:` anywhere
  in the file, which for a recorded session is `redaction_status`.
- **The raw configuration routes depended on the working directory.**
  `notifications` was read and written under `./.system-data`, and the shipped
  defaults under `./core/src/defaults`, which exists in a source checkout and
  nowhere else — so in a container a raw read of a file the operator had not
  customised was a 404. They ask the configuration service now, which is given
  the instance's system-data directory.

- **🔴 No notification could be sent on an instance created by `civic init`.**
  Every writer the project owns produces `notifications.yml` in the _field_
  shape, where a setting is `enabled: { value: false, type: 'boolean', … }` so
  the settings page can render a form from the file: the shipped defaults that
  `civic init` copies in, the config editor, reset-to-defaults, and the
  migration. The reader cast the parsed file straight to its typed plain shape.
  Nothing failed. It was simply wrong wherever a scalar was declared:
  - `isChannelEnabled('email')` returned the field object, which is truthy — so
    a channel that was switched **off** read as on.
  - The hourly limit was an object, `limit - count` was `NaN`, and `NaN > 0` is
    false — so **every send was refused as rate-limited**, with an error
    advising a retry in an hour.

  Verification emails and password-reset emails therefore never left, whatever
  the file said and whatever the operator configured. And because "off" read as
  on, a forgot-password request **minted a reset token that nothing could
  deliver** — the opposite of the documented rule that a token is minted only
  when a channel can reach the user. The token was not exposed; it should not
  have existed.

  The reader now unwraps the file once, at load, and accepts either shape. On a
  default instance email reads as off, as the file says, and a forgot-password
  request files an operator task without minting anything. With email switched
  on, mail is sent and the configured limit applies.

  The suite could not see any of this: every notification test loads
  `tests/fixtures/notifications.yml`, which is written in the plain shape no
  tool produces. The new tests load the shipped file byte for byte. Against the
  old reader, 10 of 11 fail.

- **A failed test email was reported as sent.**
  `POST /api/v1/notifications/test` answered `{ success: true, data: result }`
  whatever `result.success` said, so the settings page showed "Test email sent"
  for mail that never left. The raw channel errors — which carry hosts, ports
  and credential hints — also went out in `data.errors`, which is what the
  handler's own error path is careful not to do. A failed send is now a `500`
  with the generic message; the detail stays in the audit log.

### Changed

- **The shipped review chain can be walked, and it ends on a public status.**
  The project shipped two status vocabularies that did not agree: the workflow's
  `draft → proposed → reviewed → approved → archived` and the record schema's
  `draft, pending_review, under_review, approved, published, …`. On a default
  instance a record saved as `proposed` was accepted and then **500'd on
  publish** (`/status must be one of …`), publishing straight to `approved` was
  refused ("Allowed transitions: proposed"), and the one route to a public
  record — `published` — lay outside the workflow entirely, reachable by anyone
  with `records:edit`. Now `proposed` and `reviewed` are record statuses
  (non-public), and the shipped `workflows.yml` adds `approved → published`
  (plus `draft → published` for admin and clerk, so direct publishing keeps
  working, and `published → archived`). ⚠️ **Behaviour change on new
  instances:** `published` is now a transition _target_, which makes it
  workflow-controlled — a role may publish only where its `can_transition` says
  so, and a record sitting in a status the graph never names (`pending_review`,
  `under_review`, `rejected`, `expired`) cannot be published until the graph is
  edited to say how. An existing instance keeps the `workflows.yml` it copied at
  init and is unaffected until it adopts the new file; the two new statuses
  reach it through the defaults merge.

- **Configuration that did nothing is no longer shipped.** A deliberate sweep
  for declared-but-unread config keys, run after the same class turned up three
  times by accident, found two:
  - `civic init` no longer writes `hooks.enabled`, `workflows.enabled` or
    `audit.enabled` into `.civicrc`. All three were emitted into every instance
    and read by **nothing**. They are removed rather than implemented — for a
    system of record, making the audit trail switchable from configuration is a
    capability to add deliberately, not to inherit from a template. Existing
    `.civicrc` files keep their copies: still inert, and safe to delete. The two
    shipped demo profiles are cleaned too — they additionally carried
    `pre_commit`, `post_commit`, `auto_index`, `approval_process` and
    `log_changes`, none of which appear in the config type at all.
  - `can_edit`, `can_delete` and `can_view` are gone from the shipped
    `workflows.yml` defaults, and **`roles.yml` is documented as the authority**
    for record permissions. Their only reader had a single call site that asks
    exclusively about `create`, so the other three were dead everywhere. ⚠️
    `can_view` was the misleading one: it reads as though it controls what the
    public may see, while anonymous visibility is actually decided by the
    `public` flag on each record status — fail-closed and independent of that
    file. Nothing was over-exposed; the belief would simply have been wrong.
    `workflows.yml` now states that it governs status transitions only.
- **Configuring a `document_number_format` now enables numbering for that
  type.** Which types got an official number was a hard-coded list, so an
  instance could define a perfectly good format for `meeting` or `permit` and
  never see a single number issued, with nothing saying why. It is now the
  built-in legal types OR any type with a configured format — writing the format
  down is how you ask for numbering. ⚠️ **Behaviour change on upgrade:** an
  instance already configuring a format for a non-legal type starts issuing
  numbers for it at the next create. Nothing backfills, so that type's sequence
  begins at 001 from the upgrade rather than renumbering its history. A format
  entry is ignored unless it has a usable prefix, since honouring a malformed
  one would mint `undefined-2026-001`.
- **The pre-commit hook actually gates something now.** It ran Prettier and the
  registry check — no lint — so no lint error could fail a commit, including
  `no-explicit-any`, which is an _error_ in `core`/`cli` source. ESLint now runs
  over staged JS/TS/Vue through `scripts/lint-staged-eslint.mjs`, which groups
  staged files by owning package (ESLint is installed per package, so one
  invocation cannot cover a spanning change) and discovers ownership by walking
  up to the nearest `eslint.config.*` rather than a hard-coded list. Errors
  block, warnings do not, and a clean commit through the whole hook takes ~2s.
  Tests and `tsc` stay out deliberately — both need built output and fail on a
  fresh clone for reasons unrelated to the commit, which is what trained the
  `--no-verify` habit. Contract documented in `CONTRIBUTING.md`.
- **Module discovery follows one rule.** Three independent answers to "where are
  the modules?" (the schema builder's fallback, the DI resolver, and the
  storage-module import) are now a single `resolveModulesDir()`. When they
  disagreed, schema-extension lookup validated against a different module set
  than it discovered — the shape of the BroadcastBox redaction bug.
- **The API no longer calls `process.chdir()` during `initialize()`** — a
  process-wide side effect from a library init, previously needed so
  cwd-relative database paths resolved. Paths now come from the instance
  context.
- **Two duplicate `.civicrc` walk-ups removed** (the diagnostics one silently
  gave up after 10 levels, so it could report on a different config file than
  the one actually loaded); one implementation remains.
- **`module.json` no longer advertises capabilities that do not exist.** The
  manifest's `routes`, `audit`, `cli` and `lifecycle` flags were declared in the
  public `ModuleCapabilities` type, documented in the module contract, and read
  by nothing — no dispatch for any of them was ever built. They are removed from
  the type, the JSON schema and the contract; a manifest describes schema
  extensions only. ⚠️ **A manifest that still sets one of the four now fails
  validation** (`ModuleManifestInvalid`, naming the key) instead of being
  silently ignored — delete the line. Neither shipped manifest set any. The
  contract also now says that a module's `entry` is declared, not loaded:
  nothing in core, the API or the CLI imports it, and the `ModuleEntry`
  interface that described a call order is withdrawn until module loading is
  designed with a threat model.
- **The `/api/v1/workflows` and `/api/v1/hooks` stubs stop naming a release.**
  Both still answer `501 NOT_IMPLEMENTED`, but the message no longer says
  "planned for v0.4.x" and the `retry_after_milestone` detail is gone — the
  programmable workflow engine they would manage was split out of v0.4.x into
  its own, unscheduled milestone on 2026-09-30 (`docs/roadmap.md` §5a). The
  OpenAPI text says the same.
- **CodeQL no longer scans tests.** `.github/codeql/codeql-config.yml` excludes
  `tests/`, `e2e/`, `__tests__/` and `*.test.ts`; `scripts/` stays scanned
  because it runs with repository privileges. 116 of the 195 baseline alerts
  were in test code, 111 of them one rule fired by CLI tests building a shell
  command from a temp path; they close on the next default-branch scan rather
  than being dismissed by hand forever. The workflow's header comment also stops
  calling the analysis "report-only": GitHub's per-PR "CodeQL" status check goes
  red on any new alert, and has caught real defects twice.
- **Hermetic test harness.** `createTestInstance()` builds an isolated instance
  and installs it, replacing fixtures that had to `process.chdir()` into their
  own directory to be discovered. Test runs no longer write a stray
  `.system-data` into the repository checkout.
- **Dependency advisories refreshed: 87 → 1.** An OSV scan of the lockfile found
  26 package versions carrying 87 advisory hits, accumulated since the last
  override sweep. Every one is closed by a patch or minor bump except
  GHSA-82fw-gwwq-j7x9 on `vitest` 3.2.6 and its `@vitest/mocker` (dev-only; the
  fix is vitest 4, which is its own migration). Notable moves: `nodemailer` 7 →
  10 (Node ≥ 20, an error code renamed, remote-content TLS validated — none used
  by `EmailChannel`, which was also driven end-to-end against a live SMTP
  server), `nuxt` 4.4.7 → 4.5.2, `@nuxtjs/i18n` 10.2 → 10.6, every `@tiptap/*`
  package to 3.31.3 (pinned by override so @nuxt/ui's seventeen copies match the
  editor's), `markdown-it`, `multer`, `postcss`, `undici`, `js-yaml`, `qs`,
  `nanoid`, `devalue`, `brace-expansion`, `fast-uri`, `ip-address`. The tree was
  then deduplicated: it had been carrying two copies each of `vue`,
  `vue-router`, `prosemirror-model` and `prosemirror-view`, which is what broke
  `nuxt typecheck`. `@nuxt/scripts` is removed — a `nuxi init` leftover that was
  never registered as a module or imported, and the source of the only peer
  conflict. `@types/nodemailer` is removed because nodemailer 10 ships its own
  types. `useCivicApi` now types its options as `UseFetchOptions<T>` (Nuxt's own
  recipe) instead of `Parameters<typeof useFetch<T>>[1]`, which picked whichever
  overload Nuxt happened to list last. ⚠️ `vue-i18n` is now declared by
  `modules/ui`, which imports it directly: the UI test config had aliased it to
  a hard-coded pnpm virtual-store directory that only still existed on the
  machine that wrote it, so the suite was green there and red on a clean clone
  the moment the tree moved. The alias now resolves through `modules/ui` like
  its neighbours.
- **Manifests declare what actually runs.** Seventeen `package.json` lines named
  a version the root overrides do not install — `multer` 1.4.5 in three packages
  while 2.4.0 runs, `tar` ^6 while 7.5.21 runs, `vitest` 3.2.4 vs 3.2.6, and
  patch-level drift on `happy-dom`, `ajv`, `diff`, `uuid`. Each now names the
  version that resolves, and `@types/multer` follows multer to 2.x. `yaml` is
  the one whose running version moved: four packages declare `^2.9.0`, but the
  July override had pinned `yaml@2` to 2.8.3 — below the declared range, and a
  downgrade, since 2.9.0 predates the pin and was never in the advisory's range.
  The override is now 2.9.1.
- **The pre-commit hook lints `.mjs` and `.cjs` files.** The lint-staged pattern
  named `ts,tsx,js,jsx,vue`, so those files got neither Prettier nor ESLint at
  commit time — which is how the hard-coded store path above got in. The 25 such
  files that had never been formatted are formatted once, in a commit of their
  own, so the hook does not do it piecemeal inside unrelated changes.

## [0.3.1] - 2026-08-06

<!-- markdownlint-disable MD024 -->

A **deployment & onboarding layer** that stands a CivicPress instance up with
one command, a thin **BroadcastBox operator UI**, and correctness fixes to the
record round-trip and CLI output surfaced while building them. This makes the
BroadcastBox feature demonstrable on a shareable instance.

### Added

- **One-command deployment.** A multi-stage `Dockerfile` and a `deploy/` stack —
  `docker-compose` (api + ui + nginx, Docker secrets), reverse-proxy config, and
  an entrypoint that is a thin wrapper over the CLI — plus a curated demo seed
  (`deploy/seed-demo.sh`) and an operator runbook (`deploy/README.md`) with a
  pre-public security checklist. `.env.example` documents the knobs.
- **First-run CLI.** `civic init --yes` now runs the full pipeline (`--admin-*`
  flags, `--modules` / `--profile demo`) to produce a running-ready, loginable,
  demo-configured instance in a single command; `civic serve` runs the server
  with a subsystem ready-banner (closes FA-CLI-006); `civic doctor` is an
  environment preflight that exits non-zero so it can gate a deploy;
  `civic users:bootstrap-admin` mints a scriptable first admin. The
  signing-secret UX ensures a persisted root secret under production `NODE_ENV`
  and supports `CIVICPRESS_SECRET_FILE` (Docker secrets).
- **BroadcastBox operator UI.** `/settings/broadcast-box` — device enrollment
  (one-time codes), session start/stop, a per-session redaction-status chip, and
  a link to the published record; permission-gated, EN/FR.
- **Post-1.0 concept note** capturing in-session council voting as a future
  direction (docs only).

### Fixed

- **Record metadata round-trips idempotently.** `RecordParser` no longer
  re-nests a top-level `metadata:` frontmatter block on every parse→serialize
  cycle. The old behavior split the BroadcastBox `capture` block across nesting
  levels, so the redaction worker never saw `redaction_status: pending` and
  sessions stalled without publishing the verified redacted variant.
- **CLI `--json` output stays a single parseable document.** Notification
  channel/template registration no longer logs at `info` to stdout during core
  initialization, which had prepended a log line to every command's stdout and
  broken the `--json` machine contract.
- **Configuration editor** edits object-valued fields (e.g. a notifications
  channel's `credentials` block) as JSON instead of rendering `[object Object]`.

### Changed

- `docs/specs/deployment.md` promoted `planned` → `partial` with the corrected
  port table (API 3000 / UI 3030). The security note that **public reads are
  _indexed_, not `status=published`** is documented in the runbook and backlog
  so a public instance curates what it indexes.

## [0.3.0] - 2026-08-04

<!-- markdownlint-disable MD024 -->

Completes the **v0.3.x — Editor, Attachments & Civic UX** milestone. The feature
work (rich editor, drag-and-drop attachments, i18n/equity, spec-reality gate)
shipped in 0.2.1; this release adds the remaining test and documentation
completion, so the milestone's exit criteria are genuinely met.

### Added

- **Browser end-to-end tests (Playwright + Chromium).** A real-browser layer
  that drives the actual Nuxt UI SPA with the API stubbed at the network
  boundary — smoke journeys (the app boots + hydrates, the records browser
  renders a record from the API, the login form renders), plus a SHA-pinned
  `browser-e2e` CI workflow. Run with `pnpm e2e`. Fills the gap the vitest
  component tests and the API-level journey tests couldn't reach.
- **Live cloud-storage integration test.** Exercises the real S3 upload →
  download → delete round-trip against a live S3-compatible server (minio),
  closing the "no live-cloud test" gap behind the mocked SDK boundary. Opt-in
  via `CIVIC_TEST_LIVE_S3=1`; skips otherwise so normal CI stays hermetic.
- **Spec-frontmatter CI guard.** `pnpm specs:check` (and a vitest gate) asserts
  every spec's frontmatter parses and declares a known status.

### Changed

- **Normalized spec metadata into real top-of-file YAML frontmatter** across 68
  specs. They carried a malformed, jammed single-line block after the title (an
  artifact of prettier prose-wrapping metadata that was never real frontmatter);
  they now use proper frontmatter (version / status / created / updated) with
  the AI-authored boilerplate dropped. `spec:validate` is now frontmatter-aware.
  This completes the "every spec matches implementation reality" gate.

## [0.2.1] - 2026-08-03

<!-- markdownlint-disable MD024 -->

### Added

- **Self-service password reset that works with zero comms configuration.**
  `POST /api/v1/auth/forgot-password` + `/auth/reset-password` back a real UI
  (`/auth/forgot-password`, `/auth/reset-password`) in place of the previous
  "coming soon" stub. Reset tokens are single-use, hashed at rest, 1-hour TTL,
  and revoke every session on use. The request endpoint is anti-enumeration
  (identical response for any input) and rate-limited by the existing `/auth`
  window.
  - **Channel-by-audience delivery:** a token is minted and a self-service link
    delivered only when a user-facing channel can reach the account — email (if
    configured), else the new **console** dev sink. With no channel (the default
    production posture), no token is minted; instead an actionable task is filed
    in the operator notification center for an admin to fulfill via
    `civic users:set-password`. OAuth-only accounts are ineligible.
- **Operator notification center (the "inbox").** A durable, admin-only,
  channel-free feed for signal that needs an operator's attention: undeliverable
  password-reset requests, backup failures, and account-lockout security alerts.
  - API: `GET /api/v1/admin/notifications` (+ `/unread-count`, `/:id/read`,
    `/:id/dismiss`, `/read-all`), gated by `system:admin`.
  - CLI: `civic notifications:list|read|dismiss|read-all` and
    `civic users:reset-requests`.
  - UI: an admin notifications page (`/settings/alerts`) with a live unread
    badge in the sidebar.
- **Update check.** `civic system:check-updates` compares the running version
  against the newest GitHub release and records a deduped `update_available`
  entry in the operator notification center when a newer version exists. Local
  and cron-friendly (no auth); `--latest` skips the network for offline use.
- **Console notification channel.** A user-facing dev sink (default-on in
  development/test, off in production unless `CIVIC_CONSOLE_NOTIFICATIONS=true`)
  that prints rendered messages and writes a file outbox under the system-data
  dir — so the email-shaped flows are exercisable out of the box without SMTP.
- **Unpublished Changes Badge**: Added visual indicator for records with
  unpublished draft changes
  - Badge displays on record list page and single record view page
  - Only visible to authenticated users with `records:edit` permission
  - Badge shows "Unpublished changes" with edit icon
  - API endpoints now include `hasUnpublishedChanges` flag in responses

- **Draft Detection API**: Added automatic draft detection for listing and
  search endpoints
  - `GET /api/v1/records` now includes `hasUnpublishedChanges` flag for
    authenticated editors
  - `GET /api/v1/search` now includes `hasUnpublishedChanges` flag for
    authenticated editors
  - Efficient batch querying of drafts to minimize database calls
  - Field only included for users with `records:edit` permission

- **Edit Mode Query Parameter**: Added `?edit=true` parameter to single record
  endpoint
  - `GET /api/v1/records/:id?edit=true` returns draft version if available (for
    authenticated editors)
  - `GET /api/v1/records/:id` (default) always returns published version
  - Allows frontend to fetch draft content when editing, published content when
    viewing
  - Public users always receive published version regardless of parameter
- **Drag-and-drop attachment upload in the record editor.** The editor's
  Attachments panel now embeds a real drop/click uploader (multipart
  `POST /api/v1/storage/files`) alongside the existing link-a-file browser, so a
  clerk can attach a new file without leaving the editor. Uploads target a
  storage folder named after the record type (public fallback); the fake dashed
  "dropzone" empty state is gone.
- **Record activity feed backed by Git history.** The editor's Activity panel
  reads `GET /api/v1/diff/:recordId/history` (summary + author + timestamp,
  newest first) in place of a single hardcoded "Record created" row, with
  loading / empty / error states — an unpublished draft with no committed
  history reads as empty, not an error.
- **Undo / redo toolbar buttons** in the record editor (the capability already
  existed on both editing surfaces; only the buttons were missing).
- **EN/FR locale-parity guard** — `pnpm i18n:check` (and a CI test) fails when
  the two message catalogs drift out of key parity.

### Changed

- **Auto-indexing now runs through the workflow engine (core-002).** The hook
  system is wired to the `WorkflowEngine`: a record update fires the
  `update-index` workflow (fire-and-forget) to refresh search indexes. The
  former log-only `approval` / `publication` / `archival` workflow stubs —
  registered as if functional — were removed.
- **Record View Behavior**: Single record endpoint now differentiates between
  view and edit modes
  - View mode (default): Always returns published record, includes
    `hasUnpublishedChanges` flag for editors
  - Edit mode (`?edit=true`): Returns draft if available for authenticated
    editors with permission
  - Ensures published content is always shown to public users and in view
    contexts
- **Test Coverage**: Added comprehensive test suite for unpublished changes
  feature
  - 13 new tests covering draft detection, edit mode, and permission handling
  - Tests verify proper behavior for authenticated and public users
  - All existing tests remain passing
- **Removed the no-op `civic index --rebuild` flag** (and the underlying
  `IndexingOptions.rebuild`). It was never wired to any behavior — every index
  generation already performs a full scan — so it was dropped rather than left
  as a misleading switch.
- **Removed the never-wired storage failover, retry, metrics, and health-check
  subsystems.** Their configuration setters had no callers, so the managers were
  never constructed and those code paths were unreachable — and once failover
  was gone, the health checker just ran a background probe timer whose output
  nothing read. Dropped the advertised-but-inert config keys (`retry_*`,
  `failover_providers`, `health_checks`, `health_check_interval`,
  `health_check_timeout`) from the default `storage.yml` and the storage config
  type. The live circuit breaker, timeouts, quota, usage reporting, and
  lifecycle management are unaffected.
- **Localized the interactive `aria-label`s** (clear-search, draft actions, and
  editor chrome) so screen readers follow the UI locale (EN/FR).
- **The editor upload dropzone (`FileUpload`) is theme-aware** — no more white
  box in the dark editor; also improves Settings → Storage.
- **Reconciled seven drifted specs with implementation reality.** `storage`,
  `workflows`, `geography-data`, `notifications`, `accessibility`,
  `testing-framework`, and `realtime-architecture` gained a top-of-file
  implementation-status note (and `storage` was re-tagged `partial`), per the
  v0.3.x "specs match reality" gate.

### Fixed

- **Published records no longer leak into the drafts list.** Publishing a draft
  now clears its internal editorial `workflowState`. Previously a first-publish
  stored `workflow_state = 'draft'`, so the freshly-published record surfaced in
  the unpublished/drafts listing; the read path also coerced a cleared (`null`)
  workflowState back to `'draft'`. Both are fixed.
- **Record locks no longer expire mid-edit.** A lock holder can now reacquire
  (renew) their own lock. Previously the atomic acquire rejected the same
  holder, so the editor's periodic lock-refresh silently 409'd and the lock
  lapsed after its timeout while the user was still editing. Different-user
  conflict detection is unchanged.
- **`civic cleanup --force` now works and targets the real data locations.** The
  `--force` path requires `--yes-i-know`, but an option-name mismatch meant the
  acknowledgement was never detected, so every non-interactive run was refused.
  Cleanup also deleted hardcoded repo-relative paths; it now resolves the data
  dir, system-data dir, and `.civicrc` through the core config (honoring a
  relocated `dataDir` / `CIVIC_DATA_DIR`) and removes the whole `.system-data`
  (database plus secret and storage credentials), not just `civic.db`.
- **`GET /diff/:recordId/commits` no longer 500s on the default call.** It
  passed `author: undefined` / `since: undefined` straight into simple-git's
  `git.log()`, which builds malformed git arguments and throws whenever those
  filters are omitted (the common case). The optional filters are now only
  included when supplied.
- **`403 Forbidden` responses now include `success: false`.** The
  `requirePermission` middleware's 403 body omitted the standard envelope flag
  that every other error response sets, so clients keying on
  `body.success === false` misread permission denials.
- **The structured configuration editor is reachable again.** Each config card
  on the settings page now offers a primary **Edit** (form-based) action
  alongside **Edit Raw** — previously the cards linked only to the raw YAML
  editor, orphaning the structured one. Its array/select fields also render
  their options again (they used `USelect :options`, but `@nuxt/ui` v4 expects
  `:items`, so those dropdowns were empty).
- **The record-list page-size selector shows its options again** (10 / 25 / 50
  / 100) — same `@nuxt/ui` v4 `:options`→`:items` fix.
- **Dev CORS now allows the Nuxt UI dev origin.** The API's development default
  CORS allowlist was `http://localhost:3000`, but the Nuxt UI dev server runs on
  `:3030`, so direct browser calls were blocked out of the box; `:3030` is now
  included (alongside `:3000`).
- **The collaborative editor's toolbar is no longer inert.** In the TipTap/Yjs
  editing surface, heading / bullet + numbered list / blockquote / horizontal
  rule / link / image buttons were silent no-ops; they now apply via TipTap core
  commands against the editor schema (bold/italic/code already worked).
- **Removed the editor's underline decoy.** The underline button emitted
  `underline`, which the host silently remapped to bold ("Markdown has no
  underline"); the button, its handler, and its i18n key were dropped.
- **Fixed the EN/FR sort-label key desync.** The code calls `records.sort.*`,
  but French only carried the labels under an orphaned `records.sortBy.*`
  scheme, so French users saw raw keys / English sort options.

### Security

- **Remediated known dependency vulnerabilities.** A centralized
  `pnpm.overrides` block takes the dependency tree from 94 osv-scanner
  advisories (3 Critical, 45 High) down to 2 (a brace-expansion DoS not
  reachable from the request surface). Includes major bumps verified against
  their consumers (nodemailer, multer, tar, markdown-it, uuid).
- **Added supply-chain scanning to CI.** osv-scanner (PR diff-gate + weekly
  lockfile scan) and CodeQL SAST (report-only), plus a `SECURITY.md`
  vulnerability-disclosure policy.
- **Hardened the audit carry-forward surfaces (defense-in-depth).** An audit of
  the surfaces the 2026-07-02 pass had deferred found no live vulnerability;
  hardening was applied regardless: a length cap on the public search query; a
  `system:admin` gate keeping credential-bearing config (`notifications`)
  admin-only even if `config:manage` is delegated; fail-closed auth on the
  config router; YAML-parse validation on raw config writes (an invalid file
  could 500 the public `/info`); a core-layer path-segment guard on geography
  `type`/`category`; validation that a broadcast `quick-start` `meetingId`
  references a real meeting; and a single-flight guard on index generation so
  overlapping calls can't launch concurrent full re-scans.

## [0.2.0] - 2025-01-30

### Added

- **Architecture Diagrams**: Comprehensive visual documentation with Mermaid
  diagrams
  - Service dependency diagram showing DI container structure
  - Record creation data flow diagram with Saga pattern
  - Error handling flow diagram
  - Module interaction diagram
  - Security system architecture diagram
  - Saga pattern execution flow diagram
  - Caching strategy flow diagram
  - All diagrams available in `docs/architecture-diagrams.md`

- **Security System**: Production-ready secrets management and CSRF protection
  - SecretsManager with HKDF-SHA256 key derivation from single root secret
  - Scoped key derivation (session, API, CSRF, webhook, JWT, email verification)
  - CSRF Protection service with token generation and validation
  - CSRF middleware for API routes with smart bypass logic
  - UI composable (`useCsrf`) for seamless frontend integration
  - Comprehensive test coverage and documentation

### Changed

- **Version**: Updated to v0.2.0 - Core Maturity and Stability milestone
  complete
- **Documentation**: Moved architecture diagrams to dedicated file for better
  organization
- **Architecture Analysis**: Updated comprehensive analysis document with all
  completed features

### Completed v0.2.x Roadmap Goals

All v0.2.x "Core Maturity and Stability" goals have been completed:

- ✅ **Search Performance**: Search V2 implemented with FTS5, advanced ranking,
  and typo tolerance
- ✅ **Schema Validation**: Comprehensive JSON Schema validation with AJV and
  business rules
- ✅ **Storage Abstraction**: Enhanced with Google Cloud Storage, failover,
  retry, circuit breaker
- ✅ **CLI Improvements**: Diagnostics with `--fix` flag, validation commands,
  comprehensive tooling
- ✅ **Error Handling**: Unified error handling system with type-safe hierarchy
  and correlation IDs
- ✅ **UI Polish**: Page-based pagination, improved search UX, sort options API
- ✅ **Architecture Documentation**: Comprehensive architecture.md with 1,600+
  lines, ADRs, and diagrams

### Technical Improvements

- **Saga Pattern**: All saga steps now compensatable, including hook emission
- **Error Handling**: Complete error normalization and layer-specific handlers
- **Caching**: Unified caching layer with multiple strategies and metrics
- **Module Integration**: Storage module fully integrated with DI container
- **Documentation**: Visual architecture diagrams and comprehensive guides

## [0.1.4] - 2025-01-27

### Added

- **Database-Level Sort Options**: Implemented comprehensive sorting at API and
  database level
  - Added sort parameter support to `/api/v1/records` and `/api/v1/search`
    endpoints
  - Sort options: `updated_desc`, `created_desc`, `title_asc`, `title_desc`,
    `relevance` (search only)
  - Kind priority (record=1, chapter=2, root=3) as primary sort, user-specified
    sort as secondary
  - Database indexes created automatically for optimal sort performance
  - Removed inefficient in-memory sorting in favor of SQL-level sorting

- **Word Extraction in Search Suggestions**: Enhanced search suggestions with
  word extraction
  - Extracts relevant words from record titles and tags (up to 5 words)
  - Filters out common stop words (English and French)
  - Words displayed as badges in UI, titles as list items
  - Typo tolerance using Levenshtein distance for better user experience
  - Separate `words` and `titles` arrays in API response for easier UI
    consumption

- **Enhanced Search Query Parsing**: Improved FTS5 query generation
  - Queries now match both exact words and prefixes: `"word" OR word*`
  - Better handling of multi-word queries
  - Improved relevance scoring with title-match boost

- **Search Cache Improvements**: Enhanced cache invalidation
  - Search cache and suggestions cache cleared when records are removed
  - Prevents stale search results after record deletion
  - Improved cache key generation for better cache hit rates

- **Upgrade Protocol Documentation**: Comprehensive upgrade guide
  - Step-by-step upgrade procedures for demo and production
  - Pre-upgrade backup checklist
  - Post-upgrade verification steps
  - Rollback procedures
  - Version-specific migration notes

- **Record Editor UI Improvements**: Major refinement of the record editor
  interface
  - **Title Bar**: Full-width title input with larger font size, improved
    styling and focus states
  - **Simplified Button System**: Replaced dual buttons with single "Save
    changes" split-button
    - Contextual dropdown menu with state-aware actions (Save, Publish,
      Unpublish, Archive)
    - Confirmation modals for publish, unpublish, archive, and delete actions
    - Enhanced "More" menu with history, duplicate, export, and delete options
  - **Editor & Preview Styling**: Flat document look with border divider, fixed
    double scrollbar
    - Enabled word wrap to remove horizontal scrollbar
    - Consistent background with main content area
    - Removed card wrappers for cleaner appearance
  - **Sidebar Enhancements**: Improved accordion headers with better spacing and
    alignment
    - Status dropdown in Details section (similar to type dropdown)
    - Raw YAML preview accordion item showing formatted frontmatter
    - Date/Time display for creation and last updated timestamps
    - Integrated tag management with UInputTags component
    - Geography accordion moved to its own section
    - Reactive counts that update when items are added/removed
  - **Internationalization**: All editor strings translated (English and French)

### Changed

- **Sort UI Integration**: Re-introduced sort dropdown in RecordSearch component
  - Dynamic sort options based on context (relevance for search, created_desc
    for listings)
  - Automatically switches to relevance sort when searching
  - Sort state synced with URL query parameters
  - Improved UX with clear sort labels and icons

- **API Response Structure**: Enhanced search suggestions API response
  - New structure:
    `{ suggestions: string[], words: string[], titles: string[] }`
  - Maintains backward compatibility with flat `suggestions` array
  - Separate arrays make UI rendering more efficient

- **Database Migrations**: Automatic migration system
  - New indexes created automatically on startup
  - FTS5 table and triggers updated automatically
  - All migrations are additive only (no data loss)
  - Idempotent (safe to run multiple times)

- **Record Editor UX**: Streamlined editing workflow
  - Removed footer from edit page for full-height content
  - More compact sidebar accordion headers with reduced padding
  - Pluralized accordion titles based on item count
  - Better icon and chevron alignment throughout sidebar

### Fixed

- **Search Suggestions**: Fixed empty suggestions issue
  - Fixed substring matching for suggestions (changed from prefix-only to full
    substring)
  - Improved NULL handling for `title_normalized` column
  - Fixed type field consistency in cached suggestions

- **Search Results**: Fixed empty results when not using suggestions
  - Enhanced FTS5 query to match both exact words and prefixes
  - Improved relevance scoring for better result ranking

- **API Call Optimization**: Reduced duplicate API calls
  - Fixed duplicate calls on page load (from 6 calls to 2)
  - Added 200ms cache for `fetchSummaryCounts` and `searchRecords`
  - Added `isLoading` guards to prevent concurrent calls
  - Fixed route watcher firing on initial mount

- **Sort Parameter Validation**: Fixed invalid sort parameter handling
  - Added explicit validation to reject `sort=relevance` on records listing
    endpoint
  - UI sanitizes sort parameter (converts relevance to created_desc for
    non-search contexts)
  - Better error messages for invalid sort options

- **TypeScript Errors**: Fixed CommonJS/ESM interoperability
  - Fixed `fast-levenshtein` import using `createRequire` for ES module context
  - Fixed `workflowState` type errors (null → undefined)
  - Added explicit type annotations where needed

- **Database Corruption**: Fixed FTS5 table definition mismatch
  - Fixed column name mismatch (`metadata_json` vs `metadata`)
  - Recreated FTS5 table and triggers with correct schema
  - Improved database integrity checks

- **Editor Bug Fixes**: Fixed various editor UI issues
  - Fixed `UDropdown` → `UDropdownMenu` component name migration
  - Fixed lifecycle hooks in composables (`useRecordLock`, `useAutosave`)
  - Fixed double scrollbar in editor
  - Fixed content cutoff past line 24
  - Fixed route order conflicts (`/drafts` before `/:id`)
  - Fixed authentication flow for drafts endpoint
  - Fixed TypeScript errors for status dropdown

### Technical Details

- **Core Implementation**: `core/src/database/database-service.ts` with
  `buildOrderByClause` helper
- **Search Service**: `core/src/search/sqlite-search-service.ts` with word
  extraction and enhanced query parsing
- **API Endpoints**: Updated `/api/v1/records` and `/api/v1/search` with sort
  parameter support
- **UI Components**: Enhanced `RecordSearch.vue` with sort dropdown and improved
  suggestions display
- **Database Schema**: New indexes for `records(updated_at)`,
  `records(created_at)`, `records(LOWER(title))`
- **Testing**: Comprehensive unit tests for sort query generation and word
  extraction
- **Documentation**: Complete upgrade protocol and migration guide

## [0.1.3] - 2025-11-26

### Changed

- **Documentation**: Updated project documentation to reflect account creation
  completion
  - Updated UI completion status from 95% to 98%
  - Updated goals and context files

## [0.1.2] - 2025-11-20

<!-- markdownlint-disable MD024 -->

### Fixed

- **API ES Module Migration**: Fixed critical API startup issues
  - Migrated API module to ES modules with `type: module` in package.json
  - Updated all API route imports to include `.js` extensions (required for ES
    modules)
  - Replaced CommonJS `require()` calls with ES module `import` statements
  - Fixed `findProjectRoot` to use ES module syntax instead of `require()`
  - Resolves "require is not defined" errors that prevented API from starting
- **Production Start Script**: Added unified production start command
  - New `pnpm run start` script to start both API (port 3000) and UI (port 3030)
  - Configured Nuxt preview server to listen on correct port and host
  - Enables easy production deployment with a single command
- **Flaky Geography Test**: Fixed intermittent test failure
  - Added explicit `return` statements in geography preset route handler
  - Added defensive error handling in `getGeographyPreset()` function
  - Ensures response is always sent and errors are handled gracefully
  - Test now passes consistently without "socket hang up" errors
- **Nuxt Build Error**: Fixed TypeScript compilation error in UI build
  - Removed invalid `port` property from nitro configuration
  - Port is now correctly controlled via `PORT` environment variable
  - UI production builds now complete successfully

### Changed

- **Configuration Resilience**: Improved central config handling
  - Enhanced `CentralConfigManager` to handle missing `.civicrc` gracefully
  - Added `.civicrc.example` template for new developers
  - Better default path resolution for data directory and database
- **UI Build Configuration**: Updated Nuxt configuration
  - Fixed nitro devServer configuration
  - Updated `.gitignore` to exclude compiled `.js` files from app directory

## [0.1.1] - 2025-11-19

<!-- markdownlint-disable MD024 -->

### Added

- **Internationalization (i18n)**: Added full i18n support to Nuxt UI module
  - Installed and configured `@nuxtjs/i18n` v10.2.1
  - Added English (en) and French (fr) language support
  - Created translation files in `i18n/locales/` with organized namespaces
    (common, home)
  - Implemented language switcher in UserMenu component (next to Appearance
    menu)
  - Auto-detects browser language on first visit
  - Persists language preference to localStorage
  - Translated home page (`index.vue`) with all user-facing strings
  - Uses `no_prefix` strategy (no URL prefix for now, can be extended later)
  - All translations working correctly for both languages
- **Geography Markdown Format**: Geography files now stored in hybrid markdown
  format (`.md`) with YAML frontmatter and embedded GeoJSON/KML content
  - All metadata (name, description, category, bounds, timestamps) versioned
    alongside geographic data
  - Consistent with CivicPress record format for unified Git versioning
  - Human-readable and editable format
- **Backup Compression**: Added tarball compression support for backups
  - Backups now create `.tar.gz` archives by default alongside backup
    directories
  - Compression enabled by default, can be disabled with `--no-compress` flag
  - Significantly reduces backup size and simplifies demo data distribution
  - Restore automatically detects and extracts tarballs when present
  - Maintains backward compatibility with uncompressed backups
- **Demo Data Archives**: Created compressed demo data backups for quick
  onboarding
  - Richmond, QC, Canada demo data (French) - `richmond-quebec.tar.gz`
  - Springfield, VA, USA demo data (English) - `springfield-usa.tar.gz`
  - Both archives include complete data, Git history, storage files, and
    metadata
  - Clean Git history with single initial commit for each demo dataset
  - `civic init` now uses these compressed archives for demo data loading
- **Developer Bootstrap Documentation**: Enhanced README with comprehensive
  setup instructions
  - Added step-by-step developer bootstrap section
  - Included `chmod +x` command to fix CLI permission issues
  - Updated development commands documentation (watch mode defaults)
  - Added Hoppscotch API collections section with usage instructions
  - Removed outdated branch checkout instructions

### Changed

- **Nuxt 4 Upgrade**: Successfully upgraded UI module from Nuxt 3 to Nuxt 4.2.1
  - Updated all dependencies to Nuxt 4 compatible versions
  - Fixed 114+ TypeScript errors across all UI components
  - Migrated from `UFormGroup` to `UFormField` (Nuxt UI 4 breaking change)
  - Updated import paths (`#app` → `#imports`)
  - Fixed color type system to use Nuxt UI 4 compatible values
  - Updated documentation references (Nuxt 3 → Nuxt 4)
  - All features tested and working correctly
  - Production build successful with 0 TypeScript errors
- **Geography File Format**: Migrated from raw GeoJSON/KML files to hybrid
  markdown format for better metadata management and Git versioning
- Enhanced geography data system from simple coordinate storage to full spatial
  document management
- Updated record forms to support both legacy geography fields and new geography
  file linking
- Improved geography validation with comprehensive geometry and metadata
  checking
- **Backup/Restore System**: Enhanced backup and restore functionality
  - Restore now correctly resolves storage paths from active configuration
  - Improved storage file metadata restoration during backup restore
  - Better error handling and warning messages during restore operations
  - Storage configuration path detection improved for production instances
- **CLI Init Command**: Streamlined initialization process
  - Removed `repo_url` prompt (feature not yet implemented)
  - Updated demo data labels for clarity:
    - "Richmond, QC, Canada - Francais"
    - "Springfield, VA, USA - English"
  - Improved environment detection for file path resolution
- **Storage Configuration**: Updated default storage settings
  - Icons folder access changed from `authenticated` to `public` by default
  - Prevents 401 errors on fresh installs for map icons
  - Updated in both default templates and StorageConfigManager
- **Development Workflow**: Improved developer experience
  - `pnpm run dev` now starts both API and UI in watch mode by default
  - `pnpm run dev:api` runs in watch mode by default
  - Removed redundant watch-specific commands from documentation
- **Home Page Customization**: Added guidance for users
  - Default home page text now includes note about customization
  - Directs users to `data/.civic/org-config.yml` for customization
  - Updated both default config and UI display text

### Fixed

- **Storage Path Detection**: Fixed storage configuration path detection in API
  routes
  - Production: Uses `.system-data/storage.yml` at project root (checks if file
    exists)
  - Tests: Uses `{testDir}/data/.system-data/storage.yml` for complete isolation
  - Fixed issue where production was incorrectly using `data/.system-data`
    instead of project root
  - Fixed issue where tests were incorrectly using production storage config
  - Storage operations now correctly isolated in test environments
  - Detection logic: checks project root first, then falls back to test
    directory if in test environment
- **Icons Folder Access**: Changed icons folder from `authenticated` to `public`
  access
  - Icons can now be loaded without authentication for public-facing features
  - Updated storage configuration and test expectations
  - All storage tests updated and passing
- **Test Storage Isolation**: Fixed storage operations in tests to use isolated
  directories
  - Storage paths in tests now use absolute paths within test directories
    (`{testDir}/storage`)
  - Prevents test interference and ensures complete isolation between test runs
  - Storage service updated to handle absolute paths correctly
  - Request context enhanced to pass `dataDir` to avoid `CentralConfigManager`
    cache issues
  - All storage tests now pass reliably without affecting working directory

  - Migration script (`scripts/migrate-geography-to-markdown.mjs`) to convert
    existing raw files
  - New API endpoint `/api/v1/geography/:id/raw` for raw content access

- **Geography Data Management System**: Complete centralized geography file
  management
  - Text box input system for pasting GeoJSON/KML content with API validation
  - Live preview with Leaflet maps showing parsed data in real-time
  - Public access to geography files at `/geography/` for citizen transparency
  - Geography file linking to civic records (similar to file attachments)
  - Comprehensive data validation (geometry, SRID, bounds, feature count)
  - Interactive maps with Leaflet integration throughout the system
  - Standardized file structure with API-enforced consistency
  - Git versioning through data/ folder for complete audit trail
  - Role-based access control (public view, admin edit, specialized permissions)
  - Support for multiple geography file types (GeoJSON, KML, GPX, Shapefile)
  - Geography file categories (zone, boundary, district, facility, route)
  - Geography relationships management (contains, overlaps, adjacent,
    supersedes)
  - Search and discovery capabilities for geography data
  - Data summary panels with feature counts, bounds, and SRID information
  - Debounced parsing with real-time validation and error feedback
  - File generation with standardized naming and metadata extraction
- **Geography Styling Presets**: Pre-configured color and icon mapping presets
  for common geography use cases
  - Three default presets: land use zones, zones by name, and municipal
    facilities
  - Preset management API endpoints (`/api/v1/geography/presets`)
  - Apply presets to existing geography files with one-click styling
  - Configurable presets stored in `core/src/defaults/geography-presets.yml`
- **Storage Icons Folder**: New dedicated storage folder for map icons and
  geography-related images
  - Authenticated access with image type restrictions
  - 2MB max file size limit
  - Integrated with geography icon mapping system
  - UUID-based file references for map markers
- **Geography API Tests**: Comprehensive test coverage for geography endpoints
  - CRUD operations testing
  - Color and icon mapping validation
  - Preset management and application
  - Raw content retrieval
  - Error handling and edge cases
- **Storage Icons Tests**: Test coverage for icons folder functionality
  - Upload, list, and download operations
  - Access control validation
  - File type and size restrictions
  - Storage configuration API integration
- **Build System**: Fixed TypeScript compilation issues
  - Removed `composite: true` from `modules/storage/tsconfig.json` to fix build
    errors
  - Added `*.tsbuildinfo` to `.gitignore` to prevent merge conflicts
  - Fixed module resolution for `@civicpress/storage` package
- **Git Tracking**: Improved repository hygiene
  - Added `.civicrc` to `.gitignore` (local configuration file)
  - Added `*.tsbuildinfo` to `.gitignore` (build artifacts)
  - Prevents machine-specific files from being committed
- **Storage Path Resolution**: Fixed storage configuration loading
  - Corrected storage path detection in API routes for production instances
  - Fixed issue where `civicpress-test` was incorrectly identified as test
    environment
  - Storage operations now correctly use `.system-data/storage.yml` at project
    root
- **UI Localization**: Fixed untranslated UI elements
  - Breadcrumbs in records type pages now use translation keys
  - Properly localized with `t('common.home')` and `t('records.allRecords')`
- **Backup Restore**: Fixed storage restoration during backup restore
  - Correctly uses configured storage path from `storage.yml` instead of
    hardcoded path
  - Properly handles storage file metadata restoration
  - Fixed TypeScript error where `provider` was possibly undefined

### Documentation

- **Domain Migration**: Updated all documentation with new domain and email
  - Changed `civic-press.org` → `civicpress.io` throughout all docs
  - Changed `hello@civic-press.org` → `hello@civicpress.io` throughout all docs
  - Updated 61+ files including specs, contributing guide, code of conduct
  - Added website and contact email to README, project status, and agent
    documentation
- **Project Status**: Updated project status and agent documentation
  - Added website and contact information to all agent documentation files
  - Updated project status document with current information
  - Enhanced developer onboarding documentation

### Technical Details

- **Core Implementation**: `core/src/geography/geography-manager.ts` with
  complete file management
- **API Endpoints**: `/api/v1/geography/*` for CRUD operations and validation
- **UI Components**: GeographyForm, GeographyMap, GeographySelector,
  GeographyBrowser
- **Database Schema**: New geography files table with metadata and relationships
- **File Storage**: Organized structure in `data/geography/` with category-based
  subdirectories
- **TypeScript Types**: Complete type safety for all geography operations
- **Validation Engine**: Real-time content validation with detailed error
  reporting
- **Map Integration**: Leaflet-based interactive maps with feature highlighting
  and UUID-based icon support
- **Search System**: Public search by location, category, metadata, and date
- **Access Control**: Granular permissions for different user roles
- **Testing**: Comprehensive API test suite for geography and storage systems
  using Vitest and Supertest

## [1.0.0] - 2025-07-02

> **Note:** this `1.0.0` tag is the original monorepo scaffold. Versioning
> restarted at `0.1.1` afterward, so this is **not** the roadmap's target v1.0
> Stable Release (see `docs/roadmap.md`).

### Initial Release

- Initial CivicPress platform foundation
- Monorepo structure with pnpm workspaces
- Core platform modules
- Legal register module
- Agent development context system
- Comprehensive documentation
- Community guidelines and contribution standards
- MIT License
- Development setup scripts
- Prettier formatting configuration
- VS Code/Cursor workspace settings

---

## Version History

- **0.1.2**: Hotfix for API ES module migration, production start script, and
  build fixes
- **0.1.1**: Backup compression, demo data improvements, developer experience
  enhancements
- **1.0.0**: Initial release with core platform architecture
- **Unreleased**: Development and feature additions

## Links

- [Contributing Guide](CONTRIBUTING.md)
- [Code of Conduct](CODE_OF_CONDUCT.md)
- [Full Manifesto](https://github.com/CivicPress/manifesto/blob/master/manifesto.md)

---

**For detailed development history, see the
[Git commit log](https://github.com/CivicPress/civicpress/commits/main).**
