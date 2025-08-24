#!/usr/bin/env node
import { readFileSync, writeFileSync, copyFileSync, existsSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import yaml from 'js-yaml';

const projectRoot = process.cwd();
const sysPath = join(projectRoot, '.system-data', 'notifications.yml');
const defPath = join(projectRoot, 'core', 'src', 'defaults', 'notifications.yml');

function loadYaml(path) {
  return yaml.load(readFileSync(path, 'utf8'));
}

function normalize(schemaNode, currentNode) {
  // If schema leaf with value, keep shape and fill value from current
  if (schemaNode && typeof schemaNode === 'object' && !Array.isArray(schemaNode) && Object.prototype.hasOwnProperty.call(schemaNode, 'value')) {
    const next = { ...schemaNode };
    const currentValue = (currentNode && typeof currentNode === 'object' && Object.prototype.hasOwnProperty.call(currentNode, 'value'))
      ? currentNode.value
      : currentNode;
    next.value = currentValue !== undefined ? currentValue : next.value ?? null;
    return next;
  }

  // Recurse objects
  if (schemaNode && typeof schemaNode === 'object' && !Array.isArray(schemaNode)) {
    const out = {};
    for (const key of Object.keys(schemaNode)) {
      out[key] = normalize(schemaNode[key], currentNode ? currentNode[key] : undefined);
    }
    return out;
  }

  // Fallback: prefer current, otherwise schema
  return currentNode !== undefined ? currentNode : schemaNode;
}

function main() {
  if (!existsSync(defPath)) {
    console.error('Default notifications schema not found at', defPath);
    process.exit(1);
  }
  const schema = loadYaml(defPath);
  let current = {};
  if (existsSync(sysPath)) {
    try {
      current = loadYaml(sysPath) || {};
    } catch {
      current = {};
    }
  }

  const merged = normalize(schema, current);

  // Preserve top-level _metadata from current if present
  if (current && current._metadata) {
    merged._metadata = { ...schema._metadata, ...current._metadata };
  }

  // Backup and write
  mkdirSync(dirname(sysPath), { recursive: true });
  if (existsSync(sysPath)) {
    const backup = sysPath + '.bak-' + Date.now();
    copyFileSync(sysPath, backup);
    console.log('Backup written to', backup);
  }
  writeFileSync(sysPath, yaml.dump(merged, { noRefs: true, lineWidth: 0 }), 'utf8');
  console.log('Normalized', sysPath);
}

main();


