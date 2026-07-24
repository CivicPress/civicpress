# Manual-test runbook — `withCli()` interactive paths

**Date:** 2026-07-22
**Scope:** the CLI commands whose *interactive prompts* no automated test drives.

All 69 CLI command registrations now run through `withCli()`
(`cli/src/utils/with-cli.ts`). The subprocess suites in `tests/cli/` cover the
commands end-to-end, but they always pass `--yes` / `--token` / `--force` to
**skip the prompts** — so the inquirer/readline branches are the one thing a
green test run does *not* exercise. This runbook walks those branches by hand.

## Why these need a human

`withCli()` owns the operation span, the error envelope, and `process.exit(1)`
on failure. It deliberately does **not** own the CivicPress lifecycle or reorder
the handler body, so the prompts sit exactly where they did. The risk this
runbook retires is that the wrapper's preamble/exit handling interacts badly
with a live TTY prompt — something a piped, non-interactive test can't see.

## Setup

```bash
cd cli && npm run build          # ALWAYS rebuild first — dist is gitignored and
                                 # drifts behind src. (This bit us once mid-migration.)
cd "$(mktemp -d)"                # a throwaway workspace; init/cleanup write here
export CIVIC_ALLOW_SIMULATED_AUTH=true
alias civic="node /home/claude/civicpress/civicpress/cli/dist/index.js"
```

Run each block in a **real terminal** (not piped) so the prompts appear.

---

## 1. `login` — inquirer username/password + GitHub token

Requires an initialized workspace with a user. Easiest: `civic init --yes` then
create a user, or point at an existing data dir.

```bash
civic login                      # method defaults to 'password'
```
- [ ] Prompts `Username:` then `Password:` (password masked).
- [ ] Empty username → inline validation `Username is required` (does not crash).
- [ ] Wrong credentials → **one** clear failure. Note: login prints an
      `AUTHENTICATION_FAILED` line from its own helper AND the wrapper's
      `Login failed` / `LOGIN_FAILED` — this double message is **pre-existing**,
      not introduced by the migration. Flag if you want it cleaned up separately.
- [ ] Correct credentials → `Successfully authenticated as <user>`, token saved,
      exit 0. Immediately run any authenticated command to confirm the saved
      token works.

```bash
civic login --method github      # GitHub OAuth path
```
- [ ] Prompts `Enter your GitHub OAuth token:` (masked). Empty → validation.

```bash
civic login --username admin --password wrong   # non-interactive, still errors cleanly
```
- [ ] No prompt (both flags supplied); fails with the envelope, exit 1.

**Migration-specific:** the top-level failure message is now the fixed
`Login failed` (was the raw error text); the real error is under
`error.details.error`. Confirm that reads acceptably.

---

## 2. `cleanup` — readline double-confirmation + fail-closed guard

**Destructive.** Only run in the throwaway workspace. First seed something to
delete: `civic init --yes`.

```bash
civic cleanup                    # interactive path
```
- [ ] Warns, then prompts `Organization name:` (the FA-CLI-002 challenge).
- [ ] Typing the WRONG name → `Incorrect organization name`, nothing deleted,
      exit 1.
- [ ] Typing the RIGHT name → second prompt `Are you sure? (y/N):`.
      - [ ] `n` / empty → aborts, nothing deleted, exit 1.
      - [ ] `y` → deletes, `cliSuccess`, exit 0.

```bash
civic init --yes && civic cleanup --force          # fail-closed guard
```
- [ ] Refuses: `--force requires --yes-i-know`, code
      `FORCE_REQUIRES_CONFIRMATION`, exit 1, **nothing deleted**.
      (This one IS covered by a hand-check already, but re-confirm live.)

```bash
civic init --yes && civic cleanup --force --yes-i-know
```
- [ ] Deletes without prompting, exit 0.

**Migration-specific:** confirm the readline prompts still block and read input
correctly — the wrapper runs `initializeCliOutput` before the handler, and we
want the prompt to still appear on the TTY.

---

## 3. `init` — the full interactive setup (8+ prompts, 3 CivicPress instances)

Run in an empty throwaway dir.

```bash
civic init                       # no --yes: full interactive wizard
```
Walk the whole wizard:
- [ ] Each prompt appears in order (name, city, state, country, timezone,
      modules, record types, …) and accepts input.
- [ ] Defaults (just pressing Enter) are accepted.
- [ ] At the end: `.civicrc` + `data/` created, `cliSuccess`, exit 0.
- [ ] Re-running `init` in an already-initialized dir behaves as before
      (overwrite/skip prompt as designed).

```bash
civic init --yes                                   # non-interactive (also test-covered)
civic init --data-dir ./somedir                    # non-interactive, custom dir
civic init --yes --demo-data richmond-quebec       # demo data path
```
- [ ] All three: no prompts, exit 0, expected files created.

**Force the failure path** (this is what exercises the migrated catch):
```bash
# e.g. point at an unwritable data dir, or corrupt .civicrc mid-run
civic init --data-dir /proc/nonwritable   # or similar guaranteed failure
```
- [ ] Human mode: prints `❌ Failed to initialize repository:` + the message +
      stack (the handler's own detail print), THEN the wrapper's `INIT_FAILED`.
      exit 1.
- [ ] `--json` mode (`civic init --json --data-dir /proc/nonwritable`): stdout
      stays clean; the `INIT_FAILED` envelope with `error.details.error` and
      `error.details.stack` is on **stderr**; the handler's human print is
      suppressed (Logger is silent under `--json`).

**Migration-specific:** init keeps an inner `try/catch` that does the human
detail print and re-throws — verify both the human double-print (expected) and
the clean `--json` stderr envelope.

---

## 4. `diagnose --fix` — readline auto-fix confirmation

Needs an initialized workspace with a fixable issue (or just confirm the prompt
appears and declining is safe).

```bash
civic diagnose --fix
```
- [ ] If fixable issues exist, prompts for confirmation before applying.
- [ ] Declining → no fixes applied, exit follows the normal path.
- [ ] `diagnose --fix --dry-run` → lists what WOULD be fixed, prompts nothing,
      applies nothing.

---

## Sign-off

- [ ] login (password + github + non-interactive)
- [ ] cleanup (challenge, double-confirm, --force guard)
- [ ] init (wizard, --yes, --data-dir, --demo-data, failure human + --json)
- [ ] diagnose --fix confirmation

If all boxes pass, the interactive surface is verified and the `withCli()`
migration is complete end-to-end. Anything that reads wrong — especially a
prompt that fails to appear, or `--json` stdout contamination — is worth a
follow-up commit; note it against the specific command above.

## Known, deliberately-unchanged oddities (do not file as migration bugs)

- **login** prints two failure envelopes (helper + wrapper). Pre-existing.
- **hook `<unknown-action>`** exits 0 and prints nothing. Pinned by a
  characterization test; fix belongs in its own commit.
- **init** prints the human error twice on failure (handler detail + wrapper
  envelope). Pre-existing shape, preserved.
