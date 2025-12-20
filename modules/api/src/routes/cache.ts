/**
 * Cache Metrics API Routes
 *
 * Provides endpoints for cache metrics and monitoring
 */

import { Router, Request, Response } from 'express';
import { UnifiedCacheManager } from '@civicpress/core';
import { handleApiError } from '../utils/api-logger.js';

export function createCacheRouter(cacheManager: UnifiedCacheManager): Router {
  const router = Router();

  /**
   * GET /api/v1/cache/metrics
   * Get all cache metrics
   */
  router.get('/metrics', async (req: Request, res: Response) => {
    try {
      const stats = await cacheManager.getGlobalStats();
      res.json({
        success: true,
        data: stats,
      });
    } catch (error) {
      handleApiError('cache:metrics', error, req, res);
    }
  });

  /**
   * GET /api/v1/cache/metrics/:name
   * Get specific cache metrics
   */
  router.get('/metrics/:name', async (req: Request, res: Response) => {
    try {
      const { name } = req.params;

      if (!cacheManager.hasCache(name)) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'CACHE_NOT_FOUND',
            message: `Cache '${name}' not found`,
          },
        });
      }

      const cache = cacheManager.getCache(name);
      const stats = await cache.getStats();

      res.json({
        success: true,
        data: {
          name,
          ...stats,
        },
      });
    } catch (error) {
      handleApiError('cache:metrics', error, req, res);
    }
  });

  /**
   * GET /api/v1/cache/health
   * Get cache health status
   */
  router.get('/health', async (req: Request, res: Response) => {
    try {
      const stats = await cacheManager.getGlobalStats();
      const caches = Object.keys(stats.caches);

      // Check health for each cache
      const health: Record<string, any> = {};
      let overallHealthy = true;

      for (const name of caches) {
        const cacheStats = stats.caches[name];
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

      res.json({
        success: true,
        data: {
          healthy: overallHealthy,
          caches: health,
          global: {
            totalHitRate: stats.global.totalHitRate,
            totalSize: stats.global.totalSize,
            totalMemoryUsage: stats.global.totalMemoryUsage,
          },
        },
      });
    } catch (error) {
      handleApiError('cache:metrics', error, req, res);
    }
  });

  /**
   * GET /api/v1/cache/list
   * List all registered caches
   */
  router.get('/list', async (req: Request, res: Response) => {
    try {
      const caches = cacheManager.listCaches();
      const configs: Record<string, any> = {};
      for (const name of caches) {
        const config = cacheManager.getConfig(name);
        if (config) {
          configs[name] = config;
        }
      }

      const cacheList = caches.map((name) => ({
        name,
        strategy: configs[name]?.strategy,
        enabled: configs[name]?.enabled ?? true,
      }));

      res.json({
        success: true,
        data: {
          caches: cacheList,
          count: cacheList.length,
        },
      });
    } catch (error) {
      handleApiError('cache:metrics', error, req, res);
    }
  });

  return router;
}
