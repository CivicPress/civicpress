#!/usr/bin/env node
/**
 * Run ESLint over staged files, from the package that owns each one.
 *
 * ESLint is not installed at the repo root — every package carries its own
 * binary and its own `eslint.config.cjs`, and the root `lint` script fans out
 * with `pnpm -r --filter ... exec eslint .`. That works for a full sweep but
 * not for lint-staged, which hands us an arbitrary mix of paths from several
 * packages at once. So: group the staged files by owning package, then run
 * each package's own ESLint on its own share.
 *
 * Ownership is discovered by walking UP from each file to the nearest
 * directory that has both an `eslint.config.*` and an installed `eslint`
 * binary, rather than matching against a hard-coded package list. A new
 * package is then linted the day it is created, with nobody having to
 * remember to add it here — the failure mode of a hard-coded list is silence,
 * which is the failure mode this hook exists to avoid.
 *
 * Warnings do not fail the commit; errors do. That matches CI, which requires
 * 0 errors and currently carries 8 known warnings.
 */

import { existsSync } from 'fs'
import path from 'path'
import { spawnSync } from 'child_process'

const CONFIG_NAMES = [
  'eslint.config.cjs',
  'eslint.config.mjs',
  'eslint.config.js',
]

const repoRoot = process.cwd()

/** Nearest ancestor of `file` that can lint it, or null. */
function owningPackage(file) {
  let dir = path.dirname(path.resolve(file))

  while (dir.startsWith(repoRoot)) {
    const hasConfig = CONFIG_NAMES.some((name) =>
      existsSync(path.join(dir, name))
    )
    const hasBinary = existsSync(path.join(dir, 'node_modules/.bin/eslint'))
    if (hasConfig && hasBinary) return dir

    const parent = path.dirname(dir)
    if (parent === dir) break
    dir = parent
  }

  return null
}

const files = process.argv.slice(2)
if (files.length === 0) process.exit(0)

const byPackage = new Map()
const unowned = []

for (const file of files) {
  const pkg = owningPackage(file)
  if (!pkg) {
    unowned.push(path.relative(repoRoot, path.resolve(file)))
    continue
  }
  if (!byPackage.has(pkg)) byPackage.set(pkg, [])
  byPackage.get(pkg).push(path.resolve(file))
}

// Say what was NOT linted. A file in a directory with no ESLint setup (root
// scripts, tests/) is skipped legitimately, but skipping it silently would
// read as "this passed lint" when nothing looked at it.
if (unowned.length > 0) {
  console.log(
    `ℹ️  ESLint skipped ${unowned.length} file(s) in directories with no ESLint config: ${unowned.join(', ')}`
  )
}

let failed = false

for (const [pkg, pkgFiles] of byPackage) {
  const result = spawnSync(
    path.join(pkg, 'node_modules/.bin/eslint'),
    pkgFiles.map((file) => path.relative(pkg, file)),
    { cwd: pkg, stdio: 'inherit' }
  )

  // A signal or a missing binary leaves status null — treat anything that is
  // not a clean 0 as a failure rather than assuming success.
  if (result.status !== 0) failed = true
}

process.exit(failed ? 1 : 0)
