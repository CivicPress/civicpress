# CivicPress Module Integration Guide

**Status:** authoritative as of Phase 2d (2026-05-19 rewrite)
**Companion contract spec:** [docs/specs/module-contract.md](specs/module-contract.md)
**Worked example:** [`modules/schema-extensions/legal/`](../modules/schema-extensions/legal/)

This guide is the walkthrough for writing a CivicPress module. The formal contract — every field, every shape, every constraint — lives in `docs/specs/module-contract.md`. Start here for the how; consult the spec for the what.

---

## 1. Decide: module or schema-extension?

CivicPress has two module kinds. Pick one before you start.

| Question | If yes → | If no → |
|---|---|---|
| Does the contribution add **only** schema fragments to existing record types (no code, no routes)? | `kind: "schema-extension"`. Lives under `modules/schema-extensions/<name>/`. | continue ↓ |
| Does it have route handlers, CLI commands, audit-channel consumers, or lifecycle hooks? | `kind: "module"`. Lives under `modules/<name>/`. | reconsider — maybe just a config change? |

**`schema-extension`** is the simpler shape. The legal extension is the canonical example (5 record types, ~210 LoC of JSON Schema, no code at all).

**`module`** is the richer shape. It can contribute multiple capabilities; CivicCore wires the relevant entry-point functions into the right lifecycle slots.

---

## 2. Create the directory

```bash
# schema-extension
mkdir -p modules/schema-extensions/<your-name>/schemas

# full module
mkdir -p modules/<your-name>/src
```

Add the path to `pnpm-workspace.yaml` so pnpm treats it as a workspace package:

```yaml
packages:
  - core
  - modules/api
  - modules/schema-extensions/<your-name>   # add this line
```

---

## 3. Write `module.json` (the manifest)

Every module's root MUST contain `module.json`. The full field reference is in the contract spec §2; this section walks through writing one.

### Schema-extension example

`modules/schema-extensions/legal/module.json`:

```json
{
  "$schema": "../../../core/src/modules/module.schema.json",
  "name": "legal-register",
  "version": "0.3.0",
  "kind": "schema-extension",
  "description": "Adds legal-specific metadata to bylaw, ordinance, policy, proclamation, and resolution.",
  "license": "MIT",
  "capabilities": {
    "schemaExtensions": [
      "bylaw",
      "ordinance",
      "policy",
      "proclamation",
      "resolution"
    ]
  }
}
```

### Full-module example

`modules/my-module/module.json`:

```json
{
  "$schema": "../../core/src/modules/module.schema.json",
  "name": "my-module",
  "version": "0.1.0",
  "kind": "module",
  "description": "What this module does.",
  "license": "MIT",
  "capabilities": {
    "routes": true,
    "audit": true,
    "lifecycle": true
  },
  "entry": "./dist/index.js",
  "dependencies": []
}
```

### Naming tips

- `name` is the **canonical identifier** — it appears in `config.yml`'s `modules:` list, in record-frontmatter `module:` fields, and in `ModuleResolver`'s cache. Pick it carefully; renaming later requires migrating existing records.
- `name` SHOULD match the directory name. It MAY differ for migration cases (e.g. `legal-register` keeps its name even after moving to `modules/schema-extensions/legal/`); the contract spec §2 explains.
- Use kebab-case. Single segment (`my-module`) or two-segment grouped (`schema-extensions/my-thing`).

ModuleResolver validates `module.json` against `core/src/modules/module.schema.json` at load time. Invalid manifests throw `ModuleManifestInvalid` with the validation errors in `context.details`.

---

## 4. Schema extension: declare your record types

For `kind: "schema-extension"`, write a JSON Schema fragment at `<module-dir>/schemas/record-schema-extension.json`. The fragment is merged into the effective record schema via JSON Schema's `allOf` keyword.

### Pattern

Use `if/then` to scope rules to specific record types:

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "properties": {
    "metadata": {
      "type": "object",
      "properties": {
        "your_field": {
          "type": "string",
          "description": "What this field means."
        }
      },
      "additionalProperties": true
    }
  },
  "additionalProperties": true,
  "allOf": [
    {
      "if": {
        "properties": { "type": { "enum": ["bylaw", "ordinance"] } }
      },
      "then": {
        "properties": {
          "metadata": {
            "properties": {
              "your_field": {
                "description": "Recommended for legal documents."
              }
            }
          }
        }
      }
    }
  ]
}
```

The fragment is automatically discovered + merged when `module.json` declares `capabilities.schemaExtensions` and the fragment file exists. No code required.

See `modules/schema-extensions/legal/schemas/record-schema-extension.json` for a complete worked example (~210 LoC, 5 record types, audit fields, classification levels, approval chains).

---

## 5. Full module: register with CivicCore

For `kind: "module"`, your `entry` file exports an object matching the `ModuleEntry` interface. Only export the functions for capabilities you declared `true` for.

```ts
import type {
  Express,
  Commander,
  AuditChannel,
  CivicCoreServices,
} from '@civicpress/core';

export async function init(services: CivicCoreServices): Promise<void> {
  // One-time setup. Called once at CivicCore startup, before
  // registerRoutes / registerAuditConsumers / registerCliCommands.
  // Resolve services from the container as needed.
}

export function registerRoutes(app: Express): void {
  // Mount Express routes. Called after init().
  app.get('/my-module/health', (_req, res) => res.json({ ok: true }));
}

export function registerAuditConsumers(channel: AuditChannel): void {
  // Subscribe to audit events.
  channel.subscribe(['record.created'], async (event) => {
    // ...
  });
}

export function registerCliCommands(program: Commander): void {
  // Add CLI subcommands.
  program
    .command('my-module-thing')
    .description('Do the module-specific thing')
    .action(async () => {
      // ...
    });
}

export async function shutdown(): Promise<void> {
  // Tear-down. Called in REVERSE registration order at process shutdown.
}
```

CivicCore's order:
1. `init` (all modules) — DI container fully built; module can resolve any service
2. `registerRoutes` (all modules)
3. `registerAuditConsumers` (all modules)
4. `registerCliCommands` (all modules)
5. ...running...
6. `shutdown` (all modules, reverse load order)

---

## 6. Routes (if `capabilities.routes: true`)

Modules contribute Express routers. Routes are mounted under `/api/<module-name>/` by convention (set by the API module's wiring, not by ModuleResolver).

Route handlers MUST:
- Use the API module's auth/permission middleware (re-exported from `@civicpress/api`).
- Return errors via `coreError(...)` / `handleApiError(...)` (centralized output).
- Never reach into `core/src/` internals — the only stable surface is `@civicpress/core`'s public exports.

```ts
import { authMiddleware, requirePermission } from '@civicpress/api';
import { coreError } from '@civicpress/core';

export function registerRoutes(app: Express): void {
  const router = Router();
  router.get(
    '/',
    authMiddleware,
    requirePermission('my-module:read'),
    async (req, res) => {
      try {
        // ...
        res.json({ ok: true });
      } catch (err) {
        handleApiError(err, req, res);
      }
    }
  );
  app.use('/api/my-module', router);
}
```

---

## 7. Audit-channel consumption (if `capabilities.audit: true`)

CivicCore emits structured audit events through `AuditChannel`. Modules subscribe to relevant events:

```ts
import type { AuditChannel, AuditEvent } from '@civicpress/core';

export function registerAuditConsumers(channel: AuditChannel): void {
  channel.subscribe(['record.created', 'record.updated'], async (event) => {
    if (event.resourceType === 'bylaw') {
      // do something module-specific
    }
  });
}
```

Module-side consumers SHOULD NOT throw — failures must be caught and logged via the injected logger; otherwise an unhandled rejection in a consumer destabilizes the audit pipeline for all consumers.

See `core/src/audit/audit-channel.ts` for the event-shape contract.

---

## 8. CLI commands (if `capabilities.cli: true`)

Modules contribute subcommands under the `civic` CLI:

```ts
import type { Command } from 'commander';

export function registerCliCommands(program: Command): void {
  program
    .command('my-module:do-thing <arg>')
    .description('Module-specific action')
    .option('--dry-run', 'Preview without making changes')
    .action(async (arg, options) => {
      // ...
    });
}
```

Use `module-name:command-name` namespacing for CLI commands — keeps the top-level `civic <command>` namespace tidy and signals provenance.

---

## 9. Testing your module

### Schema-extension tests

For schema-only contributions, the test surface is JSON Schema validation:

```ts
import { describe, it, expect } from 'vitest';
import { RecordSchemaBuilder } from '@civicpress/core';

describe('your schema-extension', () => {
  it('merges into the bylaw schema', () => {
    const schema = RecordSchemaBuilder.buildSchema('bylaw');
    // Walk schema.allOf and assert your fragment is present
    expect(schema.allOf?.some((f) => f.properties?.metadata?.properties?.your_field))
      .toBe(true);
  });

  it('validates a record with your field', async () => {
    const validator = RecordSchemaValidator.fromSchema('bylaw');
    const result = await validator.validate({
      type: 'bylaw',
      metadata: { your_field: 'value' }
    });
    expect(result.valid).toBe(true);
  });
});
```

### Module tests

For full modules, write characterization tests pinning the integration surface:
- ModuleResolver discovers your manifest
- `registerRoutes` mounts the expected endpoints (use supertest)
- `registerAuditConsumers` reacts to expected events
- `init`/`shutdown` complete without throwing

See `tests/core/modules/discovery-characterization.test.ts` for the discovery test pattern (Phase 2d W1-T2). Adapt to your module's surface.

---

## 10. Common pitfalls

| Pitfall | Why it bites | Fix |
|---|---|---|
| Reaching into `core/src/` internals | Internal paths change without notice; future core refactor breaks you. | Use only `@civicpress/core`'s public exports. |
| Hardcoding sibling module names | Tight coupling; can't swap implementations. | Resolve via ModuleResolver or DI container. |
| Bypassing ModuleResolver to find modules | `process.cwd()`-based traversal was the pre-2d antipattern. | Always go through `ModuleResolver.loadByName(...)`. |
| Throwing from `registerAuditConsumers` callbacks | Crashes other consumers. | Catch, log via injected logger, swallow. |
| Writing the schema fragment outside `<module-dir>/schemas/` | ModuleResolver only looks at the canonical path. | Place it at `<module-dir>/schemas/record-schema-extension.json`. |
| Forgetting `capabilities.schemaExtensions` array | Fragment exists on disk but isn't merged. | Declare every applicable record type in the manifest. |
| `kind: "module"` without `entry` field | Manifest validation fails fast. | Always set `entry` for full modules. |
| Mismatched `name` and config | Module is loaded but config doesn't activate it (or vice-versa). | Verify `data/.civic/config.yml`'s `modules:` list matches `manifest.name`. |

---

## 11. Configuration — opt the module in

ModuleResolver discovers manifests on disk, but a module is only **active** when its name appears in `data/.civic/config.yml`'s `modules:` array (or the legacy `.civicrc`'s `modules:` field as fallback):

```yaml
modules:
  - legal-register      # manifest.name (not directory path)
  - my-module
```

This split is deliberate: the filesystem is the catalog; the config is the activation list. The same module can be present on disk but disabled in config (and vice-versa).

---

## Reference

- **Contract spec:** `docs/specs/module-contract.md` — the formal field reference and discovery semantics
- **Worked example (schema-extension):** `modules/schema-extensions/legal/`
- **ModuleResolver source:** `core/src/modules/module-resolver.ts`
- **Manifest types:** `core/src/modules/module-manifest.ts`
- **Manifest JSON Schema:** `core/src/modules/module.schema.json`
- **Characterization tests:** `tests/core/modules/discovery-characterization.test.ts`

For questions about the contract itself (rather than how to use it), open an issue. For questions about a specific module, check its own README or schema.
