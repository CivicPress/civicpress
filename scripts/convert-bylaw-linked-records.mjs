#!/usr/bin/env node

/**
 * Convert bylaw metadata.relationships into linked_records arrays.
 *
 * For each bylaw markdown file:
 *  - Extract parent/child/next/previous relationships from metadata.relationships
 *  - Merge them into linked_records entries (preserving existing links)
 *  - Remove the legacy metadata.relationships block
 *
 * After running, re-run civic index & validate to refresh derived data.
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import matter from 'gray-matter';

const RECORD_ROOT = path.resolve('data/records/bylaw');

const walkMarkdownFiles = (dirPath) => {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      return walkMarkdownFiles(fullPath);
    }
    if (entry.isFile() && entry.name.endsWith('.md')) {
      return [fullPath];
    }
    return [];
  });
};

const ensureArray = (value) => {
  if (Array.isArray(value)) {
    return value;
  }
  if (value === undefined || value === null) {
    return [];
  }
  return [value];
};

const toLinkEntry = (input, category, description) => {
  if (!input) return null;
  if (typeof input === 'string') {
    return {
      id: input,
      type: 'bylaw',
      category,
      description,
    };
  }
  if (typeof input === 'object' && input.id) {
    return {
      id: input.id,
      type: input.type || 'bylaw',
      category,
      description,
      path: input.path,
    };
  }
  return null;
};

const sanitizeEntry = (entry) => {
  const cleaned = {};
  Object.entries(entry).forEach(([key, value]) => {
    if (value === undefined || value === null) {
      return;
    }
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed.length === 0) {
        return;
      }
      cleaned[key] = trimmed;
      return;
    }
    cleaned[key] = value;
  });
  return cleaned;
};

const mergeLinkedRecords = (existing = [], additions = []) => {
  const map = new Map();
  const push = (entry) => {
    if (!entry || !entry.id) return;
    const key = `${entry.id}|${entry.category || ''}`;
    if (!map.has(key)) {
      map.set(key, sanitizeEntry(entry));
    } else {
      const current = map.get(key);
      const merged = { ...current };
      Object.entries(entry).forEach(([field, value]) => {
        if (value === undefined || value === null) return;
        if (typeof value === 'string' && value.trim() === '') return;
        if (merged[field]) return;
        merged[field] = value;
      });
      map.set(key, sanitizeEntry(merged));
    }
  };

  existing.forEach(push);
  additions.forEach(push);

  return Array.from(map.values()).map(sanitizeEntry);
};

const main = () => {
  if (!fs.existsSync(RECORD_ROOT)) {
    console.error(`Unable to locate bylaw records at ${RECORD_ROOT}`);
    process.exit(1);
  }

  const files = walkMarkdownFiles(RECORD_ROOT);
  let updatedCount = 0;

  for (const filePath of files) {
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = matter(raw);
    const metadata = parsed.data?.metadata;
    const relationships = metadata?.relationships;

    if (!relationships || typeof relationships !== 'object') {
      continue;
    }

    const existingLinked =
      Array.isArray(parsed.data.linked_records) && parsed.data.linked_records.length > 0
        ? parsed.data.linked_records
        : [];

    const additions = [];

    if (relationships.parents) {
      ensureArray(relationships.parents).forEach((parent) => {
        const entry = toLinkEntry(parent, 'references', 'Parent record');
        if (entry) additions.push(entry);
      });
    }

    if (relationships.children) {
      ensureArray(relationships.children).forEach((child) => {
        const entry = toLinkEntry(child, 'referenced_by', 'Child record');
        if (entry) additions.push(entry);
      });
    }

    if (relationships.previous) {
      ensureArray(relationships.previous).forEach((prev) => {
        const entry = toLinkEntry(prev, 'follows', 'Previous record in sequence');
        if (entry) additions.push(entry);
      });
    }

    if (relationships.next) {
      ensureArray(relationships.next).forEach((next) => {
        const entry = toLinkEntry(next, 'precedes', 'Next record in sequence');
        if (entry) additions.push(entry);
      });
    }

    if (relationships.related) {
      ensureArray(relationships.related).forEach((related) => {
        const entry = toLinkEntry(related, 'related', 'Related record');
        if (entry) additions.push(entry);
      });
    }

    const merged = mergeLinkedRecords(existingLinked, additions);

    if (merged.length === 0 && !existingLinked.length) {
      // Nothing to add; remove relationships to avoid empty metadata?
      delete metadata.relationships;
      const output = matter.stringify(parsed.content, parsed.data);
      fs.writeFileSync(filePath, output.endsWith('\n') ? output : `${output}\n`, 'utf8');
      continue;
    }

    parsed.data.linked_records = merged;
    if (metadata) {
      delete metadata.relationships;
    }

    const output = matter.stringify(parsed.content, parsed.data);
    fs.writeFileSync(filePath, output.endsWith('\n') ? output : `${output}\n`, 'utf8');
    updatedCount += 1;
  }

  console.log(`Processed ${files.length} bylaw records; updated ${updatedCount} files.`);
};

main();

