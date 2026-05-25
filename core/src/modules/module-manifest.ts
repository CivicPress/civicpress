/**
 * CivicPress Module Manifest Types
 *
 * See docs/specs/module-contract.md §2 for the formal contract.
 *
 * The runtime JSON Schema lives at module.schema.json (same directory) and
 * is the source of truth for validation. These TypeScript types are a
 * developer-facing mirror; ModuleResolver validates manifests against the
 * JSON Schema at load time.
 */

export type ModuleKind = 'module' | 'schema-extension';

export interface ModuleCapabilities {
  /**
   * Record types this module contributes a JSON Schema fragment to.
   * Fragment must live at `<module-dir>/schemas/record-schema-extension.json`.
   * Used by RecordSchemaBuilder.mergeModuleExtensions.
   */
  schemaExtensions?: string[];

  /** If true, entry exports `registerRoutes(app)`. */
  routes?: boolean;

  /** If true, entry exports `registerAuditConsumers(channel)`. */
  audit?: boolean;

  /** If true, entry exports `registerCliCommands(program)`. */
  cli?: boolean;

  /** If true, entry exports `init(services)` and/or `shutdown()`. */
  lifecycle?: boolean;
}

export interface ModuleManifest {
  $schema?: string;
  name: string;
  version: string;
  kind: ModuleKind;
  description?: string;
  license?: string;
  capabilities: ModuleCapabilities;
  /** Required when `kind: 'module'`; ignored for `kind: 'schema-extension'`. */
  entry?: string;
  /** Names of modules this module depends on. */
  dependencies?: string[];
}

export interface LoadedModule {
  manifest: ModuleManifest;
  /** Absolute path to the module directory. */
  path: string;
  /**
   * Resolved schema-fragment path (only set if manifest declares
   * `capabilities.schemaExtensions` AND the schema file exists). The
   * fragment itself is loaded lazily by consumers (avoids JSON parsing
   * cost for modules whose fragments aren't needed in the current run).
   */
  schemaPath?: string;
}
