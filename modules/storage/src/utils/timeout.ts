/**
 * Timeout Utilities
 *
 * Provides timeout handling for storage operations
 */

import { StorageTimeoutError } from '../errors/storage-errors.js';

/**
 * Execute operation with timeout
 */
export async function withTimeout<T>(
  operation: () => Promise<T>,
  timeoutMs: number,
  operationName: string = 'operation'
): Promise<T> {
  const timeoutPromise = createTimeoutPromise<T>(timeoutMs, operationName);

  try {
    return (await Promise.race([operation(), timeoutPromise])) as T;
  } catch (error) {
    // If it's a timeout error, throw StorageTimeoutError
    if (error instanceof Error && error.message.includes('timeout')) {
      throw new StorageTimeoutError(operationName, timeoutMs);
    }
    // Otherwise, re-throw the original error
    throw error;
  }
}

/**
 * Create a timeout promise that rejects after specified milliseconds
 */
function createTimeoutPromise<T>(
  ms: number,
  operationName: string
): Promise<T> {
  return new Promise((_, reject) => {
    setTimeout(() => {
      reject(new Error(`Operation '${operationName}' timed out after ${ms}ms`));
    }, ms);
  });
}

/**
 * Timeout configuration for different operation types
 */
export interface TimeoutConfig {
  upload?: number; // milliseconds
  download?: number; // milliseconds
  delete?: number; // milliseconds
  list?: number; // milliseconds
  default?: number; // milliseconds
}

/**
 * Get timeout for operation type
 */
export function getTimeoutForOperation(
  operation: 'upload' | 'download' | 'delete' | 'list',
  config: TimeoutConfig
): number {
  switch (operation) {
    case 'upload':
      return config.upload || config.default || 300000; // 5 minutes default
    case 'download':
      return config.download || config.default || 600000; // 10 minutes default
    case 'delete':
      return config.delete || config.default || 30000; // 30 seconds default
    case 'list':
      return config.list || config.default || 30000; // 30 seconds default
    default:
      return config.default || 60000; // 1 minute default
  }
}
