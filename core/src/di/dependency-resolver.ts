/**
 * Dependency Injection Container - Dependency Resolver
 *
 * This module handles dependency extraction and resolution.
 */

import { Class, ServiceMetadata } from './types.js';
import { ServiceContainer } from './container.js';
import { CircularDependencyDetector } from './circular-dependency-detector.js';
import { MissingDependencyError } from './errors.js';

/**
 * Resolves service dependencies
 */
export class DependencyResolver {
  constructor(private detector: CircularDependencyDetector) {}

  /**
   * Resolve dependencies for a service
   *
   * @param dependencies - Array of dependency keys
   * @param container - Service container for resolution
   * @returns Array of resolved dependency instances
   * @throws MissingDependencyError if a dependency is not registered
   * @throws CircularDependencyError if a circular dependency is detected
   */
  resolveDependencies(
    dependencies: Array<string | Class<any>>,
    container: ServiceContainer
  ): any[] {
    return dependencies.map((dep) => {
      // Check if dependency is registered
      if (!container.isRegistered(dep)) {
        throw new MissingDependencyError(
          this.detector.getCycle()[0] || 'Unknown',
          dep
        );
      }

      // Resolve dependency (container.resolve handles circular dependency detection)
      return container.resolve(dep);
    });
  }

  /**
   * Extract dependencies from a class constructor
   *
   * Note: TypeScript doesn't preserve parameter type information at runtime
   * by default. This method requires manual dependency specification or
   * the use of decorators/reflection libraries.
   *
   * For now, dependencies must be manually specified during registration.
   *
   * @param constructor - Class constructor
   * @returns Array of dependency keys (empty for now, requires manual specification)
   */
  extractDependencies(constructor: Class<any>): Array<string | Class<any>> {
    // TODO: In the future, this could use:
    // - TypeScript decorators (@Inject('key'))
    // - Reflection metadata (reflect-metadata)
    // - Manual dependency specification during registration
    //
    // For now, dependencies must be specified manually when registering
    return [];
  }

  /**
   * Validate that all dependencies are registered
   *
   * @param dependencies - Array of dependency keys
   * @param container - Service container to check against
   * @throws MissingDependencyError if any dependency is not registered
   */
  validateDependencies(
    dependencies: Array<string | Class<any>>,
    container: ServiceContainer
  ): void {
    for (const dep of dependencies) {
      if (!container.isRegistered(dep)) {
        throw new MissingDependencyError('Unknown', dep);
      }
    }
  }
}
