#!/usr/bin/env node
/**
 * CivicPress Registry Check
 * Fails if duplicate CLI commands, endpoints, or components are declared.
 */

import fs from 'fs'
import path from 'path'
import YAML from 'yaml'

// Resolve registries path from project root
const base = path.resolve(process.cwd(), 'agent/coding-assistant/registries')

function loadYaml(file) {
  try {
    const fullPath = path.join(base, file)
    const raw = fs.readFileSync(fullPath, 'utf8')
    return YAML.parse(raw) || {}
  } catch (err) {
    console.error(`Failed to read ${file}:`, err.message)
    return {}
  }
}

function checkDuplicates(items, key, label) {
  const seen = new Map()
  const dupes = []
  for (const item of items) {
    const val = item[key]
    if (!val) continue
    if (seen.has(val)) dupes.push(val)
    seen.set(val, true)
  }
  if (dupes.length) {
    console.error(`❌ Duplicate ${label}:`, dupes.join(', '))
    process.exit(1)
  }
}

// --- CLI commands
const cli = loadYaml('cli.yml')
if (cli.commands) checkDuplicates(cli.commands, 'id', 'CLI command IDs')

// --- Endpoints
const endpoints = loadYaml('endpoints.yml')
if (endpoints.endpoints) checkDuplicates(endpoints.endpoints, 'id', 'endpoint IDs')

// --- Components
const comps = loadYaml('components.yml')
if (comps.components) checkDuplicates(comps.components, 'name', 'component names')

console.log('✅ Registries OK (no duplicates found)')