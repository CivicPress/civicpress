# CivicPress Module Contract — Specification

**Status:** stable v1.0.0 (introduced 2026-05-19 in Phase 2d W1-T1)
**Authoritative for:** all CivicPress modules under `modules/`
**Worked example:** `modules/schema-extensions/legal/` (after W1-T4 rename)
**Companion guide:** `docs/module-integration-guide.md` (walkthrough; this spec is the formal contract)

This document is the **contract** — the interface modules speak to CivicCore. It is NOT a tutorial. The tutorial lives in the integration guide.

---

## 1. What a module is

A CivicPress module is a directory under `modules/` (or `modules/<group>/`) that opts in to the platform through a `module.json` manifest file at the directory root. Modules MAY contribute:

- **Schema extensions** — record-type fragments (JSON Schema `allOf` additions)
- **Route handlers** — Express routers mounted by the API
- **Audit-channel consumers** — subscribers to `AuditChannel` events
- **Lifecycle hooks** — `init` / `shutdown` callbacks
- **CLI commands** — additional subcommands under `civic`

Modules MUST NOT:

- Reach into `core/src/` internals (the only stable surface is `@civicpress/core`'s public exports)
- Modify another module's manifest or runtime state
- Bypass `ModuleResolver` to discover sibling modules
- Hardcode their own name in core (the prior `moduleName === 'legal-register'` antipattern that Phase 2d W1-T3 eliminated)

---

## 2. The `module.json` manifest

Every module directory MUST contain a `module.json` file at its root with the following shape:

```json
{
  "$schema": "https://civicpress.io/schemas/module.schema.json",
  "name": "<module-name>",
  "version": "<semver>",
  "kind": "module" | "schema-extension",
  "description": "<one-line summary>",
  "license": "<SPDX-license-expression>",
  "capabilities": {
    "schemaExtensions": ["<record-type>", "..."],
    "routes": false,
    "audit": false,
    "cli": false,
    "lifecycle": false
  },
  "entry": "./index.ts",
  "dependencies": []
}
```

### Field reference

| Field | Type | Required | Description |
|---|---|---|---|
| `$schema` | string | optional | URL/path to the JSON Schema this manifest validates against. Recommended for IDE autocomplete. |
| `name` | string | **required** | Module's canonical name. MUST match the directory name (or `<group>/<name>` if nested). |
| `version` | string | **required** | Semver-compatible version. |
| `kind` | enum | **required** | `"module"` for full modules with code; `"schema-extension"` for schema-only contributions. |
| `description` | string | optional | One-line description for human readers. |
| `license` | string | optional | SPDX license expression (e.g., `"MIT"`, `"Apache-2.0"`). |
| `capabilities` | object | **required** | What this module contributes (see §3). |
| `entry` | string | conditional | Path to the module's entry file relative to `module.json`. Required when `kind: "module"`; ignored for `kind: "schema-extension"`. |
| `dependencies` | string[] | optional | Names of other modules this module depends on. ModuleResolver validates dependencies are present and load order is satisfied. |

### Full JSON Schema

The authoritative JSON Schema for `module.json` lives at `core/src/modules/module.schema.json`. ModuleResolver validates every manifest against it on load; invalid manifests fail fast with `coreError.ModuleManifestInvalid`.

---

## 3. Capabilities

The `capabilities` object declares what the module contributes. Each capability is **opt-in** — a `schema-extension` typically has only `schemaExtensions` set; a full `module` may set multiple.

### `schemaExtensions: string[]`

Array of record-type names this module contributes a JSON Schema fragment to. The fragment MUST live at `<module-dir>/schemas/record-schema-extension.json` and is merged into the record's effective schema via JSON Schema's `allOf` keyword.

**Example:** the legal schema-extension declares `["bylaw", "ordinance", "policy", "proclamation", "resolution"]` — every record of those types gets the legal fragment applied.

### `routes: boolean`

If `true`, the module's entry exports a `registerRoutes(app: Express)` function that mounts route handlers. CivicCore calls it after core routes are registered.

### `audit: boolean`

If `true`, the module's entry exports a `registerAuditConsumers(channel: AuditChannel)` function that subscribes to relevant audit events.

### `cli: boolean`

If `true`, the module's entry exports a `registerCliCommands(program: Commander)` function that adds subcommands to the `civic` CLI.

### `lifecycle: boolean`

If `true`, the module's entry exports `init(services: CivicCoreServices): Promise<void>` and/or `shutdown(): Promise<void>` functions that CivicCore calls at startup and shutdown.

A `kind: "schema-extension"` module has all capabilities except `schemaExtensions` set to `false` (or omitted) by convention.

---

## 4. Schema extensions (for `kind: "schema-extension"`)

A schema-extension contributes record-type schema fragments without any executable code. The contract is purely declarative:

1. Manifest declares `kind: "schema-extension"` and lists applicable record types in `capabilities.schemaExtensions`.
2. The schema fragment lives at `<module-dir>/schemas/record-schema-extension.json`.
3. CivicCore's `RecordSchemaBuilder.mergeModuleExtensions` walks every loaded module, checks if `capabilities.schemaExtensions` includes the current record type, and (if yes) merges the fragment via JSON Schema `allOf`.

The fragment SHOULD use JSON Schema's `if/then` keyword to apply type-specific rules without affecting other record types. The legal schema-extension is the canonical reference implementation.

**No `entry`, no code execution, no lifecycle.** Schema-extensions are 100% declarative.

---

## 5. Full modules (for `kind: "module"`)

A full module has executable code. Its `entry` file MUST export an object matching the `ModuleEntry` interface:

```ts
export interface ModuleEntry {
  registerRoutes?(app: Express): void;
  registerAuditConsumers?(channel: AuditChannel): void;
  registerCliCommands?(program: Commander): void;
  init?(services: CivicCoreServices): Promise<void>;
  shutdown?(): Promise<void>;
}
```

Only the capabilities the module declares `true` for need to export the corresponding function. CivicCore calls them in the order: `init` → `registerRoutes` → `registerAuditConsumers` → `registerCliCommands`; `shutdown` runs in reverse on shutdown.

---

## 6. Discovery: ModuleResolver

Module discovery is the responsibility of `ModuleResolver`, defined in `core/src/modules/module-resolver.ts`. It replaces the prior `process.cwd()`-based traversal.

### Configuration

ModuleResolver is constructed with a `modulesRoot` path (absolute, resolved at construction). Default: `path.resolve(config.dataDir, '..', 'modules')`. Tests construct it with a fixture path.

### Discovery flow

1. **Listing.** ModuleResolver walks `modulesRoot` and any subdirectories ONE level deep (so `modules/legal-register/` AND `modules/schema-extensions/legal/` both work).
2. **Manifest filter.** Each candidate directory MUST contain `module.json`. Directories without a manifest are ignored (no implicit loading).
3. **Validation.** Each `module.json` is loaded and validated against `core/src/modules/module.schema.json`. Invalid manifests throw `coreError.ModuleManifestInvalid` with the validation errors in `context.details`.
4. **Caching.** Loaded modules are cached by name. Re-discovery does not re-read disk.
5. **Targeted lookup.** `loadByName(name)` returns the cached module or loads it on demand. `findBySchemaExtension(recordType)` returns all loaded modules whose `capabilities.schemaExtensions` includes `recordType`.

### Module list source

Currently CivicCore uses `CentralConfigManager.getModules()` (`data/.civic/config.yml`) to select which modules to load. ModuleResolver respects this: the user-facing config remains the authoritative opt-in list. ModuleResolver's `discoverAll()` returns all manifest-having directories; CivicCore intersects with the configured list before loading.

This split is intentional: ModuleResolver knows the filesystem; CivicCore knows the user's intent. The same module can be present on disk but disabled in config.

---

## 7. Versioning + dependency declaration

`dependencies: string[]` lists module names this module depends on. ModuleResolver:

1. Validates every dependency is present in the loaded set.
2. Topologically sorts modules so dependents load after dependencies.
3. Refuses to load if a dependency cycle is detected (throws `coreError.ModuleDependencyCycle`).

The `version` field is informational in Phase 2d (not enforced for compatibility). Future enhancement: declare `peerCivicPress` version range; ModuleResolver rejects modules built for a different CivicPress major version.

---

## 8. Migration from pre-2d state

The pre-2d state had two issues:

1. **`process.cwd()`-based discovery** in `civic-core-services.ts:289` (storage module loader) and `record-schema-builder.ts:188` (schema-extension loader). Fragile across test/prod environments. Replaced by ModuleResolver in W1-T2.

2. **Hardcoded module-specific behavior** at `record-schema-builder.ts:224` (`if (moduleName === 'legal-register')`). Specific record types were hardcoded in core. Replaced by manifest-declared `capabilities.schemaExtensions` in W1-T3.

The W1-T4 rename of `modules/legal-register/` → `modules/schema-extensions/legal/` signals the directory's `kind: "schema-extension"` status. The "real module" build-out (lifecycle, routes, etc.) is deferred per master plan §9.4.

---

## 9. What this spec is NOT

- **A tutorial.** See `docs/module-integration-guide.md` for the step-by-step walkthrough.
- **A plugin contract.** The runtime-registered `pluginSchemas` path in `record-schema-builder.ts:248` is a separate (older) plugin mechanism. This spec governs filesystem-discovered modules; plugins remain documented separately. A future phase may unify the two.
- **A package-name contract.** Modules MAY publish to npm under any name; ModuleResolver only cares about the directory structure and `module.json`. Package-name convention is recommended (`@civicpress/<name>` for first-party, `civicpress-<name>` for community), not enforced.

---

## 10. Backward compatibility

During W1-T2 implementation:

- Modules without a `module.json` manifest continue to work via the legacy hardcoded path until W1-T3 lands. After W1-T3, every module MUST have a manifest; legacy modules without one are not discovered.
- The `process.cwd()` fallback in `civic-core-services.ts:289` (storage module loader) is replaced by ModuleResolver; the public `import('@civicpress/storage')` path is preserved as the primary mechanism.
- `CentralConfigManager.getModules()` still drives the active-module list. No config change required for existing installs.

After W1-T4 (rename), the directory layout is:

```
modules/
  schema-extensions/
    legal/                 # was modules/legal-register/
      module.json
      schemas/record-schema-extension.json
      README.md
  storage/                 # full module, unchanged
    module.json            # added in W1-T4
    ...
  notifications/
    module.json
    ...
```

`modules/<name>/` continues to work for full modules; `modules/<group>/<name>/` is the new pattern for grouped contributions (schema-extensions first, others as needed).
