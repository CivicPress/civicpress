/**
 * initializeStorageService — the loaded storage.yml config must be APPLIED to
 * the service, not discarded.
 *
 * The service is created with default (local) config at registration.
 * Previously initializeStorageService loaded storage.yml into the config
 * manager but never applied it to the service, so the API always ran the local
 * provider regardless of storage.yml (S3/GCS/Azure selection + global tuning
 * were unreachable via the API; the CLI honored them). The fix applies the
 * loaded config via `updateConfig`, which re-initializes the provider stack.
 */

import { describe, it, expect, vi } from 'vitest';
import { initializeStorageService } from '../storage-services.js';

function makeFakeService(loadConfigImpl: () => Promise<unknown>) {
  const updateConfig = vi.fn(async () => {});
  const initialize = vi.fn(async () => {});
  // Duck-typed stand-in exposing exactly the surface initializeStorageService
  // touches (no cacheManager/db needed).
  const service = {
    _initialized: false,
    _needsInitialization: true,
    _configManager: { loadConfig: vi.fn(loadConfigImpl) },
    updateConfig,
    initialize,
  } as any;
  return { service, updateConfig, initialize };
}

describe('initializeStorageService — applies storage.yml', () => {
  it('applies the loaded config to the service (updateConfig), not just defaults', async () => {
    const loadedConfig = {
      active_provider: 'local',
      global: { max_file_size: 12345 },
    };
    const { service, updateConfig, initialize } = makeFakeService(
      async () => loadedConfig
    );

    await initializeStorageService(service);

    expect(service._configManager.loadConfig).toHaveBeenCalledTimes(1);
    // The fix: the loaded config is applied to the service.
    expect(updateConfig).toHaveBeenCalledWith(loadedConfig);
    // updateConfig re-initializes internally, so the bare initialize() is not
    // also called on the config-present path.
    expect(initialize).not.toHaveBeenCalled();
    expect(service._initialized).toBe(true);
    expect(service._needsInitialization).toBe(false);
  });

  it('falls back to defaults (initialize only) when storage.yml is absent', async () => {
    const { service, updateConfig, initialize } = makeFakeService(async () => {
      throw new Error(
        'Storage configuration not found at: /nowhere/storage.yml'
      );
    });

    await initializeStorageService(service);

    expect(updateConfig).not.toHaveBeenCalled();
    expect(initialize).toHaveBeenCalledTimes(1);
    expect(service._initialized).toBe(true);
  });

  it('re-throws non-not-found config errors (e.g. invalid YAML)', async () => {
    const { service, updateConfig, initialize } = makeFakeService(async () => {
      throw new Error('Invalid YAML at line 3');
    });

    await expect(initializeStorageService(service)).rejects.toThrow(
      /Invalid YAML/
    );
    expect(updateConfig).not.toHaveBeenCalled();
    expect(initialize).not.toHaveBeenCalled();
  });

  it('is a no-op when the service is already initialized', async () => {
    const { service, updateConfig, initialize } = makeFakeService(
      async () => ({})
    );
    service._initialized = true;

    await initializeStorageService(service);

    expect(service._configManager.loadConfig).not.toHaveBeenCalled();
    expect(updateConfig).not.toHaveBeenCalled();
    expect(initialize).not.toHaveBeenCalled();
  });
});
