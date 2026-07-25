# Security Policy

CivicPress is civic infrastructure — public records, audit trails, and (via
BroadcastBox) public-meeting media. We take security seriously and welcome
responsible disclosure.

## Supported versions

CivicPress is pre-1.0 (v0.2.x, alpha). Security fixes are applied to the latest
release line and the `main` branch only; older alpha tags are not maintained.

| Version        | Supported          |
| -------------- | ------------------ |
| 0.2.x (latest) | :white_check_mark: |
| < 0.2.x        | :x:                |

## Reporting a vulnerability

**Please do not open a public issue, pull request, or discussion for a security
vulnerability** — that discloses it before a fix is available.

Report it privately through one of:

1. **Email** — `hello@civicpress.io` with `SECURITY` in the subject line. If you
   need encrypted transport, send a short low-detail note first and we'll arrange
   a channel (no PGP key is published yet).
2. **GitHub private vulnerability reporting** (if enabled on the repo) — the
   **Security** tab → **Report a vulnerability**, which opens an advisory visible
   only to you and the maintainers.

Please include, as far as you can:

- the affected component and version/commit (core, cli, api, ui, storage,
  realtime, broadcast-box, or the hardware/device code),
- a description of the issue and its impact, and
- reproduction steps or a proof of concept.

## What to expect

- We aim to **acknowledge** your report within **5 business days**.
- We aim to provide an initial severity assessment within **10 business days**.
- We practice **coordinated disclosure**: we'll agree a timeline with you, and
  credit you (if you wish) in the release notes / advisory. As a volunteer-run
  alpha project we do not currently offer a paid bounty.

## Scope

**In scope:** the CivicPress monorepo (core, CLI, API, UI, storage, realtime,
broadcast-box) and the BroadcastBox hardware/device code.

**Out of scope:** findings requiring a already-compromised host or physical
access; self-XSS with no realistic delivery vector; volumetric denial of service;
and vulnerabilities in third-party dependencies (please report those upstream — a
heads-up to us is still welcome so we can pin or patch).
