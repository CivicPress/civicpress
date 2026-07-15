/**
 * Dependency Injection Container - Type Definitions
 *
 * This module defines the core TypeScript types and interfaces for the
 * Dependency Injection Container system.
 */

/**
 * Represents a class constructor type. Constructor args are intentionally
 * loose (`unknown[]`) — the DI container narrows per-service at resolve()
 * time via the dependency graph, not at the type system.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Class<T = unknown> = new (...args: any[]) => T;

/**
 * Service lifetime scopes
 */
export enum ServiceLifetime {
  /** One instance shared across the entire application lifecycle */
  Singleton = 'singleton',
  /** New instance created on every resolution request */
  Transient = 'transient',
  /** One instance per scope (e.g., per request, per test) */
  Scoped = 'scoped',
}

/**
 * Service metadata stored in the registry
 */
export interface ServiceMetadata<T = unknown> {
  /** Service key (string identifier or class constructor) */
  key: string | Class<T>;
  /** Factory function to create the service instance. Uses a type-only
   * import so `types.ts → container.ts → types.ts` doesn't recurse at
   * runtime (type-only imports are erased). */
  factory?: (
    container: import('./container.js').ServiceContainer
  ) => T;
  /** Direct instance (for registerInstance) */
  instance?: T;
  /** Service lifetime */
  lifetime: ServiceLifetime;
  /** List of dependency keys */
  dependencies: Array<string | Class>;
  /** Whether the service has been initialized */
  initialized: boolean;
  /** Promise for async initialization (prevents duplicate initialization) */
  initializationPromise?: Promise<T>;
}

/**
 * Dependency graph node
 */
export interface DependencyGraphNode {
  /** Service key */
  key: string;
  /** Service type name */
  type: string;
  /** Lifetime */
  lifetime: ServiceLifetime;
}

/**
 * Dependency graph edge
 */
export interface DependencyGraphEdge {
  /** Source service key */
  from: string;
  /** Target service key (dependency) */
  to: string;
}

/**
 * Complete dependency graph
 */
export interface DependencyGraph {
  /** All service nodes */
  nodes: DependencyGraphNode[];
  /** All dependency edges */
  edges: DependencyGraphEdge[];
  /** Detected circular dependencies */
  circular: Array<string[]>;
}
