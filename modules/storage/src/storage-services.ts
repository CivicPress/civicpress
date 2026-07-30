import { resolveSystemDataDir } from '@civicpress/core';
/**
 * Storage Module Service Registration
 *
 * Registers storage services in the CivicPress DI container following Pattern 2
 * from the Module Integration Guide.
 *
 * @module storage-services
 */

import type { ServiceContainer, CivicPressConfig } from '@civicpress/core';
import type { UnifiedCacheManager } from '@civicpress/core';
import type { DatabaseService } from '@civicpress/core';
import { CloudUuidStorageService } from './cloud-uuid-storage-service.js';
import { StorageConfigManager } from './storage-config-manager.js';

/**
 * Register storage module services in the DI container
 *
 * This function registers:
 * - `storageConfigManager`: Singleton instance of StorageConfigManager
 * - `storage`: Singleton instance of CloudUuidStorageService (lazy initialization)
 *
 * Services are registered following Pattern 2 (Service Registration) from the
 * Module Integration Guide.
 *
 * @param container - Service container to register services in
 * @param config - CivicPress configuration
 *
 * @example
 * ```typescript
 * import { registerStorageServices } from '@civicpress/storage/storage-services';
 *
 * const container = new ServiceContainer();
 * registerStorageServices(container, config);
 *
 * // Later, resolve services:
 * const storageService = container.resolve<CloudUuidStorageService>('storage');
 * const configManager = container.resolve<StorageConfigManager>('storageConfigManager');
 * ```
 */
export function registerStorageServices(
  container: ServiceContainer,
  config: CivicPressConfig
): void {
  // Determine system data directory
  const systemDataDir = resolveSystemDataDir(config);

  // Register StorageConfigManager as singleton (stateless, no initialization needed)
  container.singleton('storageConfigManager', () => {
    return new StorageConfigManager(systemDataDir);
  });

  // Register CloudUuidStorageService as singleton with lazy initialization
  // Note: The service is created synchronously, but initialization happens
  // on first access via a lazy initialization pattern.
  //
  // Since the DI container doesn't support async factories yet, we:
  // 1. Create the service with default config
  // 2. Load actual config and initialize lazily on first use
  container.singleton('storage', (c: ServiceContainer) => {
    // Resolve dependencies from container
    const cacheManager = c.resolve<UnifiedCacheManager>('cacheManager');
    const db = c.resolve<DatabaseService>('database');
    const configManager = c.resolve<StorageConfigManager>(
      'storageConfigManager'
    );

    // Use default config for initial creation (will be reloaded on first use)
    // This allows synchronous service creation
    const defaultConfig = configManager.getDefaultConfig();

    // Create storage service instance with default config
    const storageService = new CloudUuidStorageService(
      defaultConfig,
      systemDataDir,
      cacheManager
    );

    // Set database service
    storageService.setDatabaseService(db);

    // Mark service as needing initialization
    // The actual config loading and initialization will happen lazily
    // when the service is first used (handled in initializeStorageService helper)
    storageService._needsInitialization = true;
    storageService._configManager = configManager;

    return storageService;
  });
}

/**
 * Initialize storage service asynchronously
 *
 * This helper function should be called after the storage service is resolved
 * from the container to ensure it's fully initialized with the correct config.
 *
 * This handles:
 * 1. Loading the actual storage configuration (not just defaults)
 * 2. Re-initializing the service with the correct config
 * 3. Ensuring initialization only happens once
 *
 * @param storageService - Storage service instance to initialize
 * @returns Promise that resolves when initialization is complete
 *
 * @example
 * ```typescript
 * const storageService = container.resolve<CloudUuidStorageService>('storage');
 * await initializeStorageService(storageService);
 * // Now service is ready to use
 * ```
 */
export async function initializeStorageService(
  storageService: CloudUuidStorageService
): Promise<void> {
  // Check if already initialized
  if (storageService._initialized) {
    return;
  }

  // Get config manager (stored during registration)
  const configManager = storageService._configManager;
  if (!configManager) {
    throw new Error(
      'Storage service not properly registered - config manager missing'
    );
  }

  // Load the actual configuration and APPLY it to the service. The service was
  // created with default (local) config at registration; previously the loaded
  // config was discarded and only `initialize()` ran, so the API always used
  // the local provider regardless of storage.yml (S3/GCS/Azure selection and
  // `global.*` tuning were unreachable via the API — the CLI honored them).
  // `updateConfig` merges the loaded config and re-initializes the provider
  // stack from it.
  try {
    const loadedConfig = await configManager.loadConfig();
    await storageService.updateConfig(loadedConfig);
  } catch (error: unknown) {
    // If the config file doesn't exist (fresh install / test env), keep the
    // registration defaults and initialize as-is.
    const errMessage = error instanceof Error ? error.message : String(error);
    if (
      errMessage.includes('not found') ||
      errMessage.includes('Storage configuration not found')
    ) {
      await storageService.initialize();
    } else {
      // Re-throw other errors (permission issues, invalid YAML, etc.)
      throw error;
    }
  }

  // Mark as initialized
  storageService._initialized = true;
  storageService._needsInitialization = false;
}
