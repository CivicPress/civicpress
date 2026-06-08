/**
 * Unit Tests for Rate Limiting
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RealtimeServer } from '../realtime-server.js';
import type {
  Logger,
  HookSystem,
  AuthService,
  CivicPressConfig,
} from '@civicpress/core';
import { RealtimeConfigManager } from '../realtime-config-manager.js';

describe('Rate Limiting', () => {
  let realtimeServer: RealtimeServer;
  let mockLogger: Logger;
  let mockHookSystem: HookSystem;
  let mockAuthService: AuthService;
  let configManager: RealtimeConfigManager;
  let config: CivicPressConfig;

  beforeEach(() => {
    mockLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
      isVerbose: () => false,
    } as any;

    mockHookSystem = {
      emit: vi.fn(),
      on: vi.fn(),
      off: vi.fn(),
    } as any;

    mockAuthService = {} as any;

    configManager = new RealtimeConfigManager();
    config = {
      dataDir: '/tmp/test',
      database: {
        type: 'sqlite',
        sqlite: { file: '/tmp/test.db' },
      },
    };

    realtimeServer = new RealtimeServer(
      mockLogger,
      mockHookSystem,
      mockAuthService,
      configManager,
      config
    );
  });

  describe('checkMessageRateLimit', () => {
    it('should allow messages within rate limit', () => {
      // Access private method via reflection (for testing)
      const checkRateLimit = (realtimeServer as any).checkMessageRateLimit.bind(
        realtimeServer
      );

      // Set up config
      (realtimeServer as any).realtimeConfig = {
        rate_limiting: {
          messages_per_second: 10,
          connections_per_ip: 100,
          connections_per_user: 10,
        },
      };

      const clientId = 'test-client-1';

      // First 10 messages should be allowed
      for (let i = 0; i < 10; i++) {
        const result = checkRateLimit(clientId);
        expect(result.allowed).toBe(true);
        expect(result.remaining).toBeGreaterThanOrEqual(0);
      }
    });

    it('should block messages exceeding rate limit', () => {
      const checkRateLimit = (realtimeServer as any).checkMessageRateLimit.bind(
        realtimeServer
      );

      (realtimeServer as any).realtimeConfig = {
        rate_limiting: {
          messages_per_second: 5,
          connections_per_ip: 100,
          connections_per_user: 10,
        },
      };

      const clientId = 'test-client-2';

      // First 5 messages should be allowed
      for (let i = 0; i < 5; i++) {
        const result = checkRateLimit(clientId);
        expect(result.allowed).toBe(true);
      }

      // 6th message should be blocked
      const result = checkRateLimit(clientId);
      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
    });

    it('should reset rate limit after time window', async () => {
      const checkRateLimit = (realtimeServer as any).checkMessageRateLimit.bind(
        realtimeServer
      );

      (realtimeServer as any).realtimeConfig = {
        rate_limiting: {
          messages_per_second: 5,
          connections_per_ip: 100,
          connections_per_user: 10,
        },
      };

      const clientId = 'test-client-3';

      // Exhaust rate limit
      for (let i = 0; i < 5; i++) {
        checkRateLimit(clientId);
      }

      // Should be blocked
      let result = checkRateLimit(clientId);
      expect(result.allowed).toBe(false);

      // Manually expire the window by setting resetTime in the past
      const rateLimits = (realtimeServer as any).messageRateLimits;
      const rateLimit = rateLimits.get(clientId);
      if (rateLimit) {
        rateLimit.resetTime = Date.now() - 1000; // 1 second ago
      }

      // Should be allowed again after reset
      result = checkRateLimit(clientId);
      expect(result.allowed).toBe(true);
    });

    it('should warn when approaching rate limit', () => {
      const checkRateLimit = (realtimeServer as any).checkMessageRateLimit.bind(
        realtimeServer
      );

      (realtimeServer as any).realtimeConfig = {
        rate_limiting: {
          messages_per_second: 10,
          connections_per_ip: 100,
          connections_per_user: 10,
        },
      };

      const clientId = 'test-client-4';

      // Send 8 messages (80% of limit)
      for (let i = 0; i < 8; i++) {
        const result = checkRateLimit(clientId);
        // Should warn at 20% remaining (2 messages left)
        if (i >= 8) {
          expect(result.warning).toBe(true);
        }
      }

      const result = checkRateLimit(clientId);
      // At 9/10, we have 1 remaining (10% remaining, less than 20% threshold)
      expect(result.warning).toBe(true);
    });

    it('should return allowed=true when config is null', () => {
      const checkRateLimit = (realtimeServer as any).checkMessageRateLimit.bind(
        realtimeServer
      );

      (realtimeServer as any).realtimeConfig = null;

      const result = checkRateLimit('test-client-5');
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(Infinity);
    });
  });
});
