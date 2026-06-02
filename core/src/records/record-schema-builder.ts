/**
 * Record Schema Builder - Dynamic JSON Schema Construction
 *
 * This module builds JSON schemas dynamically by:
 * - Loading the base schema from record-base-schema.json
 * - Injecting dynamic enum values for type and status from config
 * - Merging type-specific schema extensions (geography, session)
 * - Merging module schema extensions (legal-register)
 * - Caching built schemas for performance
 *
 * @module records/record-schema-builder
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { CentralConfigManager } from '../config/central-config.js';
import { Logger } from '../utils/logger.js';
import { ModuleResolver } from '../modules/module-resolver.js';

/**
 * Loose JSON Schema shape — captures the fields this builder reads and
 * mutates. Mirrors the local type in `record-schema-validator.ts`.
 */
interface JsonSchemaObject {
  $id?: string;
  $ref?: string;
  type?: string | string[];
  properties?: Record<string, JsonSchemaObject>;
  allOf?: JsonSchemaObject[];
  anyOf?: JsonSchemaObject[];
  oneOf?: JsonSchemaObject[];
  items?: JsonSchemaObject | JsonSchemaObject[];
  enum?: unknown[];
  required?: string[];
  if?: JsonSchemaObject;
  then?: JsonSchemaObject;
  else?: JsonSchemaObject;
  additionalProperties?: boolean | JsonSchemaObject;
  [key: string]: unknown;
}

const logger = new Logger();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Schema cache to avoid rebuilding schemas on every validation
 */
const schemaCache = new Map<string, JsonSchemaObject>();

/**
 * Registered plugin schemas (registered at runtime)
 */
const pluginSchemas = new Map<
  string,
  { schema: JsonSchemaObject; appliesTo: (recordType: string) => boolean }
>();

/**
 * Injected ModuleResolver for filesystem-based module discovery.
 * Set by civic-core-services.ts at startup (Phase 2d W1-T2). When unset,
 * mergeModuleExtensions falls back to a process.cwd()-based default for
 * backward compatibility during the migration; production code paths
 * always set this.
 */
let injectedModuleResolver: ModuleResolver | null = null;

export function setModuleResolver(resolver: ModuleResolver): void {
  injectedModuleResolver = resolver;
  // Invalidate schema cache so subsequent builds pick up the new resolver.
  schemaCache.clear();
}

function getModuleResolver(): ModuleResolver {
  if (injectedModuleResolver) {
    return injectedModuleResolver;
  }
  // Fallback for direct test invocations / pre-init contexts. Same shape as
  // the pre-W1-T2 behavior (look under cwd/modules) but routed through the
  // resolver abstraction.
  return new ModuleResolver(join(process.cwd(), 'modules'));
}

/**
 * RecordSchemaBuilder - Builds dynamic JSON schemas for record validation
 */
export class RecordSchemaBuilder {
  /**
   * Get the base schema from file
   */
  private static getBaseSchema(): JsonSchemaObject {
    const schemaPath = join(__dirname, '../schemas/record-base-schema.json');
    try {
      const schemaContent = readFileSync(schemaPath, 'utf-8');
      return JSON.parse(schemaContent);
    } catch (error) {
      logger.error('Failed to load base schema', error);
      throw new Error(
        `Failed to load base schema from ${schemaPath}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Build a complete schema for a specific record type
   *
   * @param recordType - The record type (e.g., 'bylaw', 'geography', 'session')
   * @param options - Options for schema building
   * @returns Complete JSON schema object
   */
  static buildSchema(
    recordType?: string,
    options: {
      includeModuleExtensions?: boolean;
      includeTypeExtensions?: boolean;
      includePluginExtensions?: boolean;
    } = {}
  ): JsonSchemaObject {
    const cacheKey = `${recordType || 'base'}-${JSON.stringify(options)}`;

    // Check cache first
    const cached = schemaCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    try {
      // Start with base schema
      const schema = this.getBaseSchema();

      // Inject dynamic enums for type and status
      this.injectDynamicEnums(schema);

      // Add type-specific extensions if requested
      if (options.includeTypeExtensions && recordType) {
        this.mergeTypeExtension(schema, recordType);
      }

      // Add module extensions if requested
      if (options.includeModuleExtensions) {
        this.mergeModuleExtensions(schema, recordType);
      }

      // Add plugin extensions if requested
      if (options.includePluginExtensions !== false) {
        this.mergePluginExtensions(schema, recordType);
      }

      // Cache the built schema
      schemaCache.set(cacheKey, schema);

      return schema;
    } catch (error) {
      logger.error('Failed to build schema', error);
      throw error;
    }
  }

  /**
   * Inject dynamic enum values for type and status from config
   */
  private static injectDynamicEnums(schema: JsonSchemaObject): void {
    try {
      // Inject valid record types
      const recordTypes = CentralConfigManager.getRecordTypesConfig();
      const typeEnum = Object.keys(recordTypes);

      if (schema.properties?.type) {
        schema.properties.type.enum = typeEnum;
      }

      // Inject valid record statuses
      const recordStatuses = CentralConfigManager.getRecordStatusesConfig();
      const statusEnum = Object.keys(recordStatuses);

      if (schema.properties?.status) {
        schema.properties.status.enum = statusEnum;
      }
    } catch (error) {
      logger.warn(
        'Failed to inject dynamic enums, using schema defaults',
        error
      );
      // Schema will use its default validation if config loading fails
    }
  }

  /**
   * Merge type-specific schema extension (geography, session)
   */
  private static mergeTypeExtension(schema: JsonSchemaObject, recordType: string): void {
    const typeSchemaPath = join(
      __dirname,
      '../schemas/record-type-schemas',
      `${recordType}-schema.json`
    );

    try {
      const typeSchemaContent = readFileSync(typeSchemaPath, 'utf-8');
      const typeSchema = JSON.parse(typeSchemaContent);

      // Merge using allOf pattern
      if (!schema.allOf) {
        schema.allOf = [];
      }
      schema.allOf.push({
        if: { properties: { type: { const: recordType } } },
        then: typeSchema,
      });
    } catch {
      // Type-specific schema doesn't exist, that's okay
      logger.debug(
        `No type-specific schema found for ${recordType}, using base schema only`
      );
    }
  }

  /**
   * Merge module schema extensions (e.g., legal-register)
   *
   * As of Phase 2d W1-T2, discovery is routed through `ModuleResolver` so
   * the `process.cwd()`-based traversal is gone. The W1-T3 follow-up
   * removes the remaining hardcoded `moduleName === 'legal-register'`
   * check by reading `manifest.capabilities.schemaExtensions` from the
   * loaded module.
   */
  private static mergeModuleExtensions(schema: JsonSchemaObject, recordType?: string): void {
    try {
      const modules = CentralConfigManager.getModules();
      const resolver = getModuleResolver();

      for (const moduleName of modules) {
        // Check if this record type should use this module's schema
        if (
          recordType &&
          !this.shouldApplyModuleSchema(moduleName, recordType)
        ) {
          continue;
        }

        const loaded = resolver.loadByName(moduleName);
        if (!loaded || !loaded.schemaPath) {
          logger.debug(`No schema extension found for module ${moduleName}`);
          continue;
        }

        try {
          const moduleSchemaContent = readFileSync(loaded.schemaPath, 'utf-8');
          const moduleSchema = JSON.parse(moduleSchemaContent);

          if (!schema.allOf) {
            schema.allOf = [];
          }
          schema.allOf.push(moduleSchema);
        } catch (error) {
          logger.debug(
            `Failed to read schema extension for module ${moduleName}: ${error}`
          );
        }
      }
    } catch (error) {
      logger.warn('Failed to merge module extensions', error);
    }
  }

  /**
   * Determine if a module schema should be applied to a record type.
   *
   * Reads `capabilities.schemaExtensions` from the module's manifest
   * (loaded via ModuleResolver). The prior hardcoded
   * `moduleName === 'legal-register'` check was replaced by this
   * manifest-driven lookup in Phase 2d W1-T3 (closes legal-register-002).
   * Future modules opt into record types by declaring them in their
   * `module.json` — no core code changes required.
   */
  private static shouldApplyModuleSchema(
    moduleName: string,
    recordType: string
  ): boolean {
    const loaded = getModuleResolver().loadByName(moduleName);
    if (!loaded) return false;
    const types = loaded.manifest.capabilities.schemaExtensions ?? [];
    return types.includes(recordType);
  }

  /**
   * Clear the schema cache (useful for testing or config changes)
   */
  static clearCache(): void {
    schemaCache.clear();
  }

  /**
   * Merge plugin schema extensions (registered at runtime)
   */
  private static mergePluginExtensions(schema: JsonSchemaObject, recordType?: string): void {
    for (const [pluginName, pluginSchema] of pluginSchemas.entries()) {
      // Check if this plugin schema applies to this record type
      if (recordType && !pluginSchema.appliesTo(recordType)) {
        continue;
      }

      try {
        // Merge using allOf pattern
        if (!schema.allOf) {
          schema.allOf = [];
        }
        schema.allOf.push(pluginSchema.schema);
      } catch (error) {
        logger.warn(`Failed to merge plugin schema from ${pluginName}`, error);
      }
    }
  }

  /**
   * Register a plugin schema extension
   *
   * @param pluginName - Name of the plugin
   * @param schema - JSON Schema object to merge
   * @param appliesTo - Function that determines if schema applies to a record type
   */
  static registerPluginSchema(
    pluginName: string,
    schema: JsonSchemaObject,
    appliesTo: (recordType: string) => boolean
  ): void {
    pluginSchemas.set(pluginName, { schema, appliesTo });
    // Clear cache to force rebuild with new plugin schema
    schemaCache.clear();
    logger.info(`Registered schema extension for plugin: ${pluginName}`);
  }

  /**
   * Unregister a plugin schema extension
   *
   * @param pluginName - Name of the plugin to unregister
   */
  static unregisterPluginSchema(pluginName: string): void {
    if (pluginSchemas.delete(pluginName)) {
      // Clear cache to force rebuild without plugin schema
      schemaCache.clear();
      logger.info(`Unregistered schema extension for plugin: ${pluginName}`);
    }
  }

  /**
   * Get list of registered plugin schemas
   */
  static getRegisteredPluginSchemas(): string[] {
    return Array.from(pluginSchemas.keys());
  }

  /**
   * Get cache statistics (for debugging)
   */
  static getCacheStats(): { size: number; keys: string[]; plugins: string[] } {
    return {
      size: schemaCache.size,
      keys: Array.from(schemaCache.keys()),
      plugins: Array.from(pluginSchemas.keys()),
    };
  }
}
