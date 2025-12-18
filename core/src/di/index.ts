/**
 * Dependency Injection Container - Module Exports
 *
 * Main entry point for the DI container system.
 */

export { ServiceContainer } from './container.js';
export {
  ServiceLifetime,
  type Class,
  type ServiceMetadata,
  type DependencyGraph,
  type DependencyGraphNode,
  type DependencyGraphEdge,
} from './types.js';
export {
  DependencyInjectionError,
  ServiceNotFoundError,
  CircularDependencyError,
  ServiceRegistrationError,
  DuplicateServiceError,
  MissingDependencyError,
} from './errors.js';
export { CircularDependencyDetector } from './circular-dependency-detector.js';
export { ServiceRegistry } from './service-registry.js';
export { DependencyResolver } from './dependency-resolver.js';
export {
  isValidLifetime,
  shouldCache,
  isSingleton,
  isTransient,
  isScoped,
} from './service-lifetime.js';

// Export test utilities
export {
  createTestContainer,
  createMockContainer,
  createTestConfig,
  cleanupTestConfig,
  createTestLogger,
  createMockLogger,
  createTestDatabase,
  createMockDatabase,
} from './test-utils.js';
