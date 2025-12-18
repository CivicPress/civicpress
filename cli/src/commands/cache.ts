/**
 * Cache CLI Commands
 *
 * Commands for viewing cache metrics and managing caches
 */

import { CAC } from 'cac';
import {
  getGlobalOptionsFromArgs,
  initializeCliOutput,
} from '../utils/global-options.js';
import {
  cliSuccess,
  cliError,
  cliInfo,
  cliStartOperation,
} from '../utils/cli-output.js';
import { CivicPress, loadConfig, CentralConfigManager } from '@civicpress/core';

export function registerCacheCommand(cli: CAC): void {
  cli
    .command('cache:metrics', 'Show cache metrics')
    .option('--json', 'Output as JSON')
    .option('--name <name>', 'Show metrics for specific cache')
    .action(async (options: { json?: boolean; name?: string }) => {
      const globalOptions = getGlobalOptionsFromArgs();
      initializeCliOutput(globalOptions);
      const endOperation = cliStartOperation('cache:metrics');

      try {
        const config = await loadConfig();
        if (!config) {
          cliError(
            'No CivicPress configuration found. Run "civic init" first.',
            'NOT_INITIALIZED'
          );
          process.exit(1);
        }

        const dataDir = config.dataDir;
        if (!dataDir) {
          throw new Error('dataDir is not configured');
        }

        const dbConfig = CentralConfigManager.getDatabaseConfig();
        const civicPress = new CivicPress({
          database: dbConfig,
          dataDir,
        });
        await civicPress.initialize();

        const cacheManager = civicPress.getCacheManager();

        if (options.name) {
          // Get specific cache metrics
          const cache = cacheManager.getCache(options.name);
          const stats = await cache.getStats();

          if (options.json) {
            console.log(
              JSON.stringify(
                {
                  success: true,
                  data: {
                    name: options.name,
                    ...stats,
                  },
                },
                null,
                2
              )
            );
          } else {
            cliSuccess(`Cache: ${options.name}`);
            cliInfo(`Size: ${stats.size}/${stats.maxSize}`);
            cliInfo(`Hit Rate: ${(stats.hitRate * 100).toFixed(1)}%`);
            cliInfo(`Hits: ${stats.hits}, Misses: ${stats.misses}`);
            if (stats.memoryUsage) {
              cliInfo(
                `Memory: ${(stats.memoryUsage / 1024 / 1024).toFixed(2)}MB`
              );
            }
          }
        } else {
          // Get all cache metrics
          const globalStats = await cacheManager.getGlobalStats();

          if (options.json) {
            console.log(
              JSON.stringify(
                {
                  success: true,
                  data: globalStats,
                },
                null,
                2
              )
            );
          } else {
            cliSuccess('Cache Metrics');
            cliInfo(`Total Caches: ${Object.keys(globalStats.caches).length}`);
            cliInfo(
              `Global Hit Rate: ${(globalStats.global.totalHitRate * 100).toFixed(1)}%`
            );
            cliInfo(`Total Size: ${globalStats.global.totalSize} entries`);
            if (globalStats.global.totalMemoryUsage) {
              cliInfo(
                `Total Memory: ${(globalStats.global.totalMemoryUsage / 1024 / 1024).toFixed(2)}MB`
              );
            }
            cliInfo('');
            cliInfo('Per-Cache Stats:');
            for (const [name, stats] of Object.entries(globalStats.caches)) {
              cliInfo(
                `  ${name}: ${stats.size}/${stats.maxSize} entries, ${(stats.hitRate * 100).toFixed(1)}% hit rate`
              );
            }
          }
        }

        await civicPress.shutdown();
        endOperation();
      } catch (error) {
        cliError('Error getting cache metrics', undefined, error);
        endOperation();
        process.exit(1);
      }
    });

  cli
    .command('cache:health', 'Show cache health status')
    .option('--json', 'Output as JSON')
    .action(async (options: { json?: boolean }) => {
      const globalOptions = getGlobalOptionsFromArgs();
      initializeCliOutput(globalOptions);
      const endOperation = cliStartOperation('cache:health');

      try {
        const config = await loadConfig();
        if (!config) {
          cliError(
            'No CivicPress configuration found. Run "civic init" first.'
          );
          process.exit(1);
        }

        const dataDir = config.dataDir;
        if (!dataDir) {
          throw new Error('dataDir is not configured');
        }

        const dbConfig = CentralConfigManager.getDatabaseConfig();
        const civicPress = new CivicPress({
          database: dbConfig,
          dataDir,
        });
        await civicPress.initialize();

        const cacheManager = civicPress.getCacheManager();
        const globalStats = await cacheManager.getGlobalStats();

        const health: Record<string, any> = {};
        let overallHealthy = true;

        for (const [name, stats] of Object.entries(globalStats.caches)) {
          const cacheStats = stats as {
            hitRate: number;
            errors: number;
            size: number;
            maxSize: number;
            memoryUsage?: number;
          };
          const isHealthy =
            cacheStats.hitRate >= 0.5 && // At least 50% hit rate
            cacheStats.errors === 0 && // No errors
            (cacheStats.memoryUsage || 0) < cacheStats.maxSize * 1024 * 1024; // Memory within limits

          health[name] = {
            healthy: isHealthy,
            hitRate: cacheStats.hitRate,
            errors: cacheStats.errors,
            size: cacheStats.size,
            maxSize: cacheStats.maxSize,
          };

          if (!isHealthy) {
            overallHealthy = false;
          }
        }

        if (options.json) {
          console.log(
            JSON.stringify(
              {
                success: true,
                data: {
                  healthy: overallHealthy,
                  caches: health,
                  global: {
                    totalHitRate: globalStats.global.totalHitRate,
                    totalSize: globalStats.global.totalSize,
                    totalMemoryUsage: globalStats.global.totalMemoryUsage,
                  },
                },
              },
              null,
              2
            )
          );
        } else {
          if (overallHealthy) {
            cliSuccess('Cache Health: Healthy');
          } else {
            cliError('Cache Health: Degraded');
          }
          cliInfo(
            `Global Hit Rate: ${(globalStats.global.totalHitRate * 100).toFixed(1)}%`
          );
          cliInfo('');
          cliInfo('Per-Cache Health:');
          for (const [name, cacheHealth] of Object.entries(health)) {
            const h = cacheHealth as {
              healthy: boolean;
              hitRate: number;
              errors: number;
            };
            const status = h.healthy ? '✓' : '✗';
            cliInfo(
              `  ${status} ${name}: ${(h.hitRate * 100).toFixed(1)}% hit rate, ${h.errors} errors`
            );
          }
        }

        await civicPress.shutdown();
        endOperation();
      } catch (error) {
        cliError('Error getting cache health', undefined, error);
        endOperation();
        process.exit(1);
      }
    });

  cli
    .command('cache:list', 'List all registered caches')
    .option('--json', 'Output as JSON')
    .action(async (options: { json?: boolean }) => {
      const globalOptions = getGlobalOptionsFromArgs();
      initializeCliOutput(globalOptions);
      const endOperation = cliStartOperation('cache:list');

      try {
        const config = await loadConfig();
        if (!config) {
          cliError(
            'No CivicPress configuration found. Run "civic init" first.'
          );
          process.exit(1);
        }

        // TODO: Get UnifiedCacheManager from CivicPress
        if (options.json) {
          console.log(
            JSON.stringify(
              {
                error:
                  'Cache list not yet available - UnifiedCacheManager needs to be exposed through CivicPress',
              },
              null,
              2
            )
          );
        } else {
          cliInfo('Cache list not yet available.');
          cliInfo(
            'UnifiedCacheManager needs to be exposed through CivicPress to enable this feature.'
          );
        }

        endOperation();
      } catch (error) {
        cliError('Error listing caches', undefined, error);
        endOperation();
        process.exit(1);
      }
    });
}
