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

const logger = new Logger();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Schema cache to avoid rebuilding schemas on every validation
 */
const schemaCache = new Map<string, any>();

/**
 * Registered plugin schemas (registered at runtime)
 */
const pluginSchemas = new Map<
  string,
  { schema: any; appliesTo: (recordType: string) => boolean }
>();

/**
 * RecordSchemaBuilder - Builds dynamic JSON schemas for record validation
 */
export class RecordSchemaBuilder {
  /**
   * Get the base schema from file
   */
  private static getBaseSchema(): any {
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
  ): any {
    const cacheKey = `${recordType || 'base'}-${JSON.stringify(options)}`;

    // Check cache first
    if (schemaCache.has(cacheKey)) {
      return schemaCache.get(cacheKey);
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
  private static injectDynamicEnums(schema: any): void {
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
  private static mergeTypeExtension(schema: any, recordType: string): void {
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
    } catch (error) {
      // Type-specific schema doesn't exist, that's okay
      logger.debug(
        `No type-specific schema found for ${recordType}, using base schema only`
      );
    }
  }

  /**
   * Merge module schema extensions (e.g., legal-register)
   */
  private static mergeModuleExtensions(schema: any, recordType?: string): void {
    try {
      const modules = CentralConfigManager.getModules();

      for (const moduleName of modules) {
        // Check if this record type should use this module's schema
        if (
          recordType &&
          !this.shouldApplyModuleSchema(moduleName, recordType)
        ) {
          continue;
        }

        const moduleSchemaPath = join(
          process.cwd(),
          'modules',
          moduleName,
          'schemas',
          'record-schema-extension.json'
        );

        try {
          const moduleSchemaContent = readFileSync(moduleSchemaPath, 'utf-8');
          const moduleSchema = JSON.parse(moduleSchemaContent);

          // Merge using allOf pattern
          if (!schema.allOf) {
            schema.allOf = [];
          }
          schema.allOf.push(moduleSchema);
        } catch (error) {
          // Module schema doesn't exist, that's okay
          logger.debug(`No schema extension found for module ${moduleName}`);
        }
      }
    } catch (error) {
      logger.warn('Failed to merge module extensions', error);
    }
  }

  /**
   * Determine if a module schema should be applied to a record type
   *
   * For example, legal-register applies to bylaw, ordinance, policy, etc.
   */
  private static shouldApplyModuleSchema(
    moduleName: string,
    recordType: string
  ): boolean {
    // legal-register applies to legal document types
    if (moduleName === 'legal-register') {
      return [
        'bylaw',
        'ordinance',
        'policy',
        'proclamation',
        'resolution',
      ].includes(recordType);
    }

    // Add other module logic here as needed
    return false;
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
  private static mergePluginExtensions(schema: any, recordType?: string): void {
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
    schema: any,
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
