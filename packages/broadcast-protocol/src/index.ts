/**
 * @civicpress/broadcast-protocol
 *
 * Canonical wire protocol for the CivicPress ↔ BroadcastBox appliance contract.
 * The JSON Schema (schema/broadcast-protocol.schema.json) is the single source
 * of truth; this module exposes a runtime validator + the protocol version.
 * The hardware client generates pydantic from the same schema; the server
 * (Phase 5) generates TS types via `npm run gen:types` (src/types.gen.ts).
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { Ajv2020 } from 'ajv/dist/2020.js';
import type { ErrorObject } from 'ajv';
import addFormatsImport from 'ajv-formats';

// ajv-formats is CJS; under Node's ESM interop the default export is the
// function itself. Cast (without `any`) so tsc sees a callable.
const addFormats = addFormatsImport as unknown as (ajv: Ajv2020) => void;

const here = dirname(fileURLToPath(import.meta.url));
// schema/ sits beside both src/ (tests) and dist/ (built) — one level up from either.
const schemaPath = join(here, '../schema/broadcast-protocol.schema.json');

/** The canonical protocol schema (parsed). */
export const schema: Record<string, unknown> = JSON.parse(
  readFileSync(schemaPath, 'utf-8')
);

/** Protocol version, sourced from the schema's `x-protocol-version`. */
export const PROTOCOL_VERSION: string = String(
  (schema as { 'x-protocol-version'?: string })['x-protocol-version']
);

const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);
const validateFn = ajv.compile(schema);

export interface ValidationResult {
  valid: boolean;
  /** Human-readable error strings (empty when valid). */
  errors: string[];
}

/** Validate a single message against the canonical protocol schema. */
export function validateMessage(message: unknown): ValidationResult {
  const valid = validateFn(message) as boolean;
  if (valid) return { valid: true, errors: [] };
  const errors = (validateFn.errors ?? []).map((e: ErrorObject) =>
    `${e.instancePath || '/'} ${e.message ?? ''}`.trim()
  );
  return { valid: false, errors };
}
