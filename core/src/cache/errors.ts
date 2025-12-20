/**
 * Unified Cache Errors
 *
 * Error classes for the unified caching layer
 */

import { CivicPressError } from '../errors/index.js';

/**
 * Base cache error
 */
export class CacheError extends CivicPressError {
  code = 'CACHE_ERROR';
  statusCode = 500;

  constructor(message: string, context?: Record<string, any>) {
    super(message, context);
    this.name = 'CacheError';
  }
}

/**
 * Cache key error (invalid key format)
 */
export class CacheKeyError extends CacheError {
  code = 'CACHE_KEY_ERROR';
  statusCode = 400;

  constructor(message: string, context?: Record<string, any>) {
    super(message, context);
    this.name = 'CacheKeyError';
  }
}

/**
 * Cache size error (exceeded size limits)
 */
export class CacheSizeError extends CacheError {
  code = 'CACHE_SIZE_ERROR';
  statusCode = 500;

  constructor(message: string, context?: Record<string, any>) {
    super(message, context);
    this.name = 'CacheSizeError';
  }
}

/**
 * Cache initialization error
 */
export class CacheInitializationError extends CacheError {
  code = 'CACHE_INITIALIZATION_ERROR';
  statusCode = 500;

  constructor(message: string, context?: Record<string, any>) {
    super(message, context);
    this.name = 'CacheInitializationError';
  }
}
