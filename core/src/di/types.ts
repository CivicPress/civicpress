/**
 * Dependency Injection Container - Type Definitions
 *
 * This module defines the core TypeScript types and interfaces for the
 * Dependency Injection Container system.
 */

/**
 * Represents a class constructor type
 */
export type Class<T = any> = new (...args: any[]) => T;

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
export interface ServiceMetadata<T = any> {
  /** Service key (string identifier or class constructor) */
  key: string | Class<T>;
  /** Factory function to create the service instance */
  factory?: (container: any) => T;
  /** Direct instance (for registerInstance) */
  instance?: T;
  /** Service lifetime */
  lifetime: ServiceLifetime;
  /** List of dependency keys */
  dependencies: Array<string | Class<any>>;
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
