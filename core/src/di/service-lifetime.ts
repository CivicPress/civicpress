/**
 * Dependency Injection Container - Service Lifetime
 *
 * This module provides utilities for managing service lifetimes.
 */

import { ServiceLifetime, ServiceMetadata } from './types.js';

/**
 * Validate service lifetime value
 */
export function isValidLifetime(lifetime: string): lifetime is ServiceLifetime {
  return Object.values(ServiceLifetime).includes(lifetime as ServiceLifetime);
}

/**
 * Check if a service should be cached (singleton or scoped)
 */
export function shouldCache(lifetime: ServiceLifetime): boolean {
  return (
    lifetime === ServiceLifetime.Singleton ||
    lifetime === ServiceLifetime.Scoped
  );
}

/**
 * Check if a service is a singleton
 */
export function isSingleton(metadata: ServiceMetadata): boolean {
  return metadata.lifetime === ServiceLifetime.Singleton;
}

/**
 * Check if a service is transient
 */
export function isTransient(metadata: ServiceMetadata): boolean {
  return metadata.lifetime === ServiceLifetime.Transient;
}

/**
 * Check if a service is scoped
 */
export function isScoped(metadata: ServiceMetadata): boolean {
  return metadata.lifetime === ServiceLifetime.Scoped;
}
