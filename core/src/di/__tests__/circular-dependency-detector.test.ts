/**
 * Circular Dependency Detector - Unit Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { CircularDependencyDetector } from '../circular-dependency-detector.js';
import { CircularDependencyError } from '../errors.js';

describe('CircularDependencyDetector', () => {
  let detector: CircularDependencyDetector;

  beforeEach(() => {
    detector = new CircularDependencyDetector();
  });

  describe('Cycle Detection', () => {
    it('should detect simple cycle', () => {
      detector.enter('A');
      detector.enter('B');

      expect(() => {
        detector.check('A');
      }).toThrow(CircularDependencyError);
    });

    it('should detect complex cycle', () => {
      detector.enter('A');
      detector.enter('B');
      detector.enter('C');

      expect(() => {
        detector.check('A');
      }).toThrow(CircularDependencyError);
    });

    it('should not throw for non-circular dependencies', () => {
      detector.enter('A');
      detector.enter('B');

      expect(() => {
        detector.check('C');
      }).not.toThrow();
    });
  });

  describe('Stack Management', () => {
    it('should track resolution stack', () => {
      detector.enter('A');
      detector.enter('B');
      detector.enter('C');

      const cycle = detector.getCycle();

      expect(cycle).toEqual(['A', 'B', 'C']);
    });

    it('should exit from stack', () => {
      detector.enter('A');
      detector.enter('B');
      detector.exit();
      detector.enter('C');

      const cycle = detector.getCycle();

      expect(cycle).toEqual(['A', 'C']);
    });

    it('should check if resolving', () => {
      expect(detector.isResolving()).toBe(false);

      detector.enter('A');

      expect(detector.isResolving()).toBe(true);

      detector.exit();

      expect(detector.isResolving()).toBe(false);
    });

    it('should clear stack', () => {
      detector.enter('A');
      detector.enter('B');

      detector.clear();

      expect(detector.isResolving()).toBe(false);
      expect(detector.getCycle()).toEqual([]);
    });
  });
});
