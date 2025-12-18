/**
 * Dependency Injection Container - Circular Dependency Detector
 *
 * This module detects circular dependencies during service resolution.
 */

import { Class } from './types.js';
import { CircularDependencyError } from './errors.js';

/**
 * Detects circular dependencies during service resolution
 */
export class CircularDependencyDetector {
  /**
   * Stack tracking the current resolution path
   */
  private resolutionStack: Array<string | Class<any>> = [];

  /**
   * Check if adding a key would create a circular dependency
   *
   * @param key - Service key to check
   * @throws CircularDependencyError if a cycle is detected
   */
  check(key: string | Class<any>): void {
    if (this.resolutionStack.includes(key)) {
      const cycle = [...this.resolutionStack, key];
      throw new CircularDependencyError(cycle);
    }
  }

  /**
   * Enter a service key into the resolution stack
   *
   * @param key - Service key entering resolution
   */
  enter(key: string | Class<any>): void {
    this.resolutionStack.push(key);
  }

  /**
   * Exit the current service key from the resolution stack
   */
  exit(): void {
    this.resolutionStack.pop();
  }

  /**
   * Get the current resolution path (for debugging)
   *
   * @returns Copy of the current resolution stack
   */
  getCycle(): Array<string | Class<any>> {
    return [...this.resolutionStack];
  }

  /**
   * Check if currently resolving a service
   *
   * @returns True if resolution is in progress
   */
  isResolving(): boolean {
    return this.resolutionStack.length > 0;
  }

  /**
   * Clear the resolution stack (useful for testing)
   */
  clear(): void {
    this.resolutionStack = [];
  }
}
