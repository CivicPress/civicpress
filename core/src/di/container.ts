/**
 * Dependency Injection Container - Main Container Class
 *
 * This is the main ServiceContainer class that manages service registration,
 * resolution, and lifecycle.
 */

import {
  Class,
  ServiceLifetime,
  ServiceMetadata,
  DependencyGraph,
  DependencyGraphNode,
  DependencyGraphEdge,
} from './types.js';
import { ServiceRegistry } from './service-registry.js';
import { CircularDependencyDetector } from './circular-dependency-detector.js';
import { DependencyResolver } from './dependency-resolver.js';
import {
  ServiceNotFoundError,
  ServiceRegistrationError,
  CircularDependencyError,
  MissingDependencyError,
} from './errors.js';
import { shouldCache } from './service-lifetime.js';

/**
 * Main dependency injection container
 */
export class ServiceContainer {
  private registry: ServiceRegistry;
  private detector: CircularDependencyDetector;
  private resolver: DependencyResolver;

  constructor() {
    this.registry = new ServiceRegistry();
    this.detector = new CircularDependencyDetector();
    this.resolver = new DependencyResolver(this.detector);
  }

  /**
   * Register a service with a factory function
   *
   * @param key - Service key (string or class constructor)
   * @param factory - Factory function that creates the service
   * @param lifetime - Service lifetime (default: Singleton)
   */
  register<T>(
    key: string | Class<T>,
    factory: (container: ServiceContainer) => T,
    lifetime: ServiceLifetime = ServiceLifetime.Singleton
  ): void {
    const metadata: ServiceMetadata<T> = {
      key,
      factory,
      lifetime,
      dependencies: [],
      initialized: false,
    };

    this.registry.register(metadata);
  }

  /**
   * Register a singleton service (eager initialization)
   *
   * @param key - Service key
   * @param factory - Factory function that creates the service
   */
  singleton<T>(
    key: string | Class<T>,
    factory: (container: ServiceContainer) => T
  ): void {
    this.register(key, factory, ServiceLifetime.Singleton);
  }

  /**
   * Register a transient service (new instance each time)
   *
   * @param key - Service key
   * @param factory - Factory function that creates the service
   */
  transient<T>(
    key: string | Class<T>,
    factory: (container: ServiceContainer) => T
  ): void {
    this.register(key, factory, ServiceLifetime.Transient);
  }

  /**
   * Register a direct instance
   *
   * @param key - Service key
   * @param instance - Service instance
   * @param allowOverride - Whether to allow overriding existing registrations
   */
  registerInstance<T>(
    key: string | Class<T>,
    instance: T,
    allowOverride = true
  ): void {
    const metadata: ServiceMetadata<T> = {
      key,
      instance,
      lifetime: ServiceLifetime.Singleton,
      dependencies: [],
      initialized: true,
    };

    this.registry.register(metadata, allowOverride);
  }

  /**
   * Register a class with automatic dependency injection
   *
   * Note: Dependencies must be manually specified for now.
   * In the future, this could use decorators or reflection.
   *
   * @param key - Service key (usually the class itself)
   * @param constructor - Class constructor
   * @param dependencies - Manual dependency specification
   * @param lifetime - Service lifetime (default: Singleton)
   */
  registerClass<T>(
    key: string | Class<T>,
    constructor: Class<T>,
    dependencies: Array<string | Class<any>> = [],
    lifetime: ServiceLifetime = ServiceLifetime.Singleton
  ): void {
    const factory = (container: ServiceContainer): T => {
      const deps = this.resolver.resolveDependencies(dependencies, container);
      return new constructor(...deps);
    };

    const metadata: ServiceMetadata<T> = {
      key,
      factory,
      lifetime,
      dependencies,
      initialized: false,
    };

    this.registry.register(metadata);
  }

  /**
   * Resolve a service by key
   *
   * @param key - Service key
   * @returns Resolved service instance
   * @throws ServiceNotFoundError if service is not registered
   * @throws CircularDependencyError if circular dependency detected
   */
  resolve<T>(key: string | Class<T>): T {
    const metadata = this.registry.get<T>(key);

    if (!metadata) {
      throw new ServiceNotFoundError(key);
    }

    // Check for circular dependency
    this.detector.check(key);

    // If instance already exists and should be cached, return it
    if (metadata.instance !== undefined && shouldCache(metadata.lifetime)) {
      return metadata.instance;
    }

    // If transient, always create new instance
    if (metadata.lifetime === ServiceLifetime.Transient) {
      return this.createInstance(metadata);
    }

    // For singleton/scoped, check if already initializing (async safety)
    if (metadata.initializationPromise) {
      return metadata.initializationPromise as unknown as T;
    }

    // Create instance and cache if needed
    this.detector.enter(key);
    try {
      const instance = this.createInstance(metadata);

      // Cache instance for singleton/scoped
      if (shouldCache(metadata.lifetime)) {
        this.registry.update(key, {
          instance,
          initialized: true,
        });
      }

      return instance;
    } finally {
      this.detector.exit();
    }
  }

  /**
   * Create a service instance from metadata
   *
   * @param metadata - Service metadata
   * @returns Service instance
   */
  private createInstance<T>(metadata: ServiceMetadata<T>): T {
    if (metadata.instance !== undefined) {
      return metadata.instance;
    }

    if (!metadata.factory) {
      throw new ServiceRegistrationError(
        metadata.key,
        'No factory or instance provided'
      );
    }

    try {
      return metadata.factory(this);
    } catch (error) {
      // Re-throw DI-specific errors as-is
      if (
        error instanceof ServiceNotFoundError ||
        error instanceof ServiceRegistrationError ||
        error instanceof CircularDependencyError ||
        error instanceof MissingDependencyError
      ) {
        throw error;
      }
      // Wrap other errors
      throw new ServiceRegistrationError(
        metadata.key,
        `Factory function threw error: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Check if a service is registered
   *
   * @param key - Service key
   * @returns True if service is registered
   */
  isRegistered(key: string | Class<any>): boolean {
    return this.registry.has(key);
  }

  /**
   * Get all registered service keys
   *
   * @returns Array of registered keys
   */
  getRegisteredKeys(): Array<string | Class<any>> {
    return this.registry.getRegisteredKeys();
  }

  /**
   * Clear all registrations (useful for testing)
   */
  clear(): void {
    this.registry.clear();
    this.detector.clear();
  }

  /**
   * Create a child container (for scoped services)
   *
   * @returns New scoped container
   */
  createScope(): ServiceContainer {
    const scoped = new ServiceContainer();
    // Copy singleton registrations to child
    for (const key of this.getRegisteredKeys()) {
      const metadata = this.registry.get(key);
      if (metadata && metadata.lifetime === ServiceLifetime.Singleton) {
        scoped.registry.register(metadata, true);
      }
    }
    return scoped;
  }

  /**
   * Get dependency graph visualization
   *
   * @returns Dependency graph with nodes, edges, and cycles
   */
  getDependencyGraph(): DependencyGraph {
    const nodes: DependencyGraphNode[] = [];
    const edges: DependencyGraphEdge[] = [];
    const circular: Array<string[]> = [];
    const keyToName = new Map<string | Class<any>, string>();

    // First pass: collect all nodes and create name mapping
    for (const key of this.getRegisteredKeys()) {
      const metadata = this.registry.get(key);
      if (!metadata) continue;

      const keyName = typeof key === 'string' ? key : key.name || 'Unknown';
      keyToName.set(key, keyName);

      nodes.push({
        key: keyName,
        type: typeof key === 'string' ? 'string' : 'class',
        lifetime: metadata.lifetime,
      });
    }

    // Second pass: collect edges from registered dependencies
    for (const key of this.getRegisteredKeys()) {
      const metadata = this.registry.get(key);
      if (!metadata) continue;

      const keyName = keyToName.get(key)!;

      // Add edges from explicitly registered dependencies
      for (const dep of metadata.dependencies) {
        const depName =
          keyToName.get(dep) ||
          (typeof dep === 'string' ? dep : dep.name || 'Unknown');
        edges.push({
          from: keyName,
          to: depName,
        });
      }
    }

    // Detect cycles (simple DFS)
    const visited = new Set<string>();
    const recursionStack = new Set<string>();

    const detectCycle = (node: string): string[] | null => {
      if (recursionStack.has(node)) {
        return [node];
      }
      if (visited.has(node)) {
        return null;
      }

      visited.add(node);
      recursionStack.add(node);

      const outgoingEdges = edges.filter((e) => e.from === node);
      for (const edge of outgoingEdges) {
        const cycle = detectCycle(edge.to);
        if (cycle) {
          recursionStack.delete(node);
          return [node, ...cycle];
        }
      }

      recursionStack.delete(node);
      return null;
    };

    for (const node of nodes) {
      if (!visited.has(node.key)) {
        const cycle = detectCycle(node.key);
        if (cycle) {
          circular.push(cycle);
        }
      }
    }

    return { nodes, edges, circular };
  }
}
