/**
 * Dependency Injection Container - Error Classes
 *
 * This module defines custom error classes for the DI container system.
 */

/**
 * Base error class for all DI-related errors
 */
export abstract class DependencyInjectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Thrown when attempting to resolve a service that is not registered
 */
export class ServiceNotFoundError extends DependencyInjectionError {
  constructor(public readonly key: string | any) {
    const keyName = typeof key === 'string' ? key : key.name || 'Unknown';
    super(`Service not found: ${keyName}`);
  }
}

/**
 * Thrown when a circular dependency is detected during resolution
 */
export class CircularDependencyError extends DependencyInjectionError {
  constructor(public readonly cycle: Array<string | any>) {
    const cyclePath = cycle
      .map((key) => (typeof key === 'string' ? key : key.name || 'Unknown'))
      .join(' -> ');
    super(`Circular dependency detected: ${cyclePath}`);
  }
}

/**
 * Thrown when service registration fails
 */
export class ServiceRegistrationError extends DependencyInjectionError {
  constructor(
    public readonly key: string | any,
    public readonly reason: string
  ) {
    const keyName = typeof key === 'string' ? key : key.name || 'Unknown';
    super(`Failed to register service ${keyName}: ${reason}`);
  }
}

/**
 * Thrown when attempting to register a service that is already registered
 */
export class DuplicateServiceError extends ServiceRegistrationError {
  constructor(key: string | any) {
    super(key, 'Service is already registered');
  }
}

/**
 * Thrown when service resolution fails due to missing dependencies
 */
export class MissingDependencyError extends DependencyInjectionError {
  constructor(
    public readonly serviceKey: string | any,
    public readonly missingDependency: string | any
  ) {
    const serviceName =
      typeof serviceKey === 'string'
        ? serviceKey
        : serviceKey.name || 'Unknown';
    const depName =
      typeof missingDependency === 'string'
        ? missingDependency
        : missingDependency.name || 'Unknown';
    super(
      `Service ${serviceName} requires dependency ${depName} which is not registered`
    );
  }
}
