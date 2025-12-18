/**
 * Dependency Injection Container - Service Registry
 *
 * This module manages service registration and metadata storage.
 */

import { Class, ServiceMetadata } from './types.js';
import { DuplicateServiceError } from './errors.js';

/**
 * Manages service registrations and metadata
 */
export class ServiceRegistry {
  /**
   * Map of registered services
   */
  private services = new Map<string | Class<any>, ServiceMetadata>();

  /**
   * Register a service with metadata
   *
   * @param metadata - Service metadata
   * @param allowOverride - Whether to allow overriding existing registrations
   * @throws DuplicateServiceError if service is already registered and override not allowed
   */
  register<T>(metadata: ServiceMetadata<T>, allowOverride = false): void {
    if (this.services.has(metadata.key) && !allowOverride) {
      throw new DuplicateServiceError(metadata.key);
    }

    this.services.set(metadata.key, metadata);
  }

  /**
   * Get service metadata by key
   *
   * @param key - Service key
   * @returns Service metadata or undefined if not found
   */
  get<T>(key: string | Class<T>): ServiceMetadata<T> | undefined {
    return this.services.get(key) as ServiceMetadata<T> | undefined;
  }

  /**
   * Check if a service is registered
   *
   * @param key - Service key
   * @returns True if service is registered
   */
  has(key: string | Class<any>): boolean {
    return this.services.has(key);
  }

  /**
   * Get all registered service keys
   *
   * @returns Array of all registered keys
   */
  getRegisteredKeys(): Array<string | Class<any>> {
    return Array.from(this.services.keys());
  }

  /**
   * Clear all registrations (useful for testing)
   */
  clear(): void {
    this.services.clear();
  }

  /**
   * Get the number of registered services
   *
   * @returns Number of registered services
   */
  size(): number {
    return this.services.size;
  }

  /**
   * Update service metadata (for instance caching, etc.)
   *
   * @param key - Service key
   * @param updates - Partial metadata updates
   */
  update<T>(
    key: string | Class<T>,
    updates: Partial<ServiceMetadata<T>>
  ): void {
    const existing = this.get(key);
    if (!existing) {
      throw new Error(`Cannot update unregistered service: ${key}`);
    }

    this.services.set(key, { ...existing, ...updates });
  }
}
