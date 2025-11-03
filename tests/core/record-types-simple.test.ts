import { describe, it, expect } from 'vitest';

// Import from the source directly to avoid build issues
const { DEFAULT_RECORD_TYPES } = await import(
  '../../core/src/config/record-types.js'
);

describe('Record Types Configuration - Simple Tests', () => {
  describe('DEFAULT_RECORD_TYPES', () => {
    it('should contain all expected record types', () => {
      expect(DEFAULT_RECORD_TYPES).toHaveProperty('bylaw');
      expect(DEFAULT_RECORD_TYPES).toHaveProperty('ordinance');
      expect(DEFAULT_RECORD_TYPES).toHaveProperty('policy');
      expect(DEFAULT_RECORD_TYPES).toHaveProperty('proclamation');
      expect(DEFAULT_RECORD_TYPES).toHaveProperty('resolution');
      expect(DEFAULT_RECORD_TYPES).toHaveProperty('geography');
      expect(DEFAULT_RECORD_TYPES).toHaveProperty('session');
    });

    it('should have correct structure for each record type', () => {
      const recordTypes = Object.values(DEFAULT_RECORD_TYPES);
      expect(recordTypes.length).toBeGreaterThanOrEqual(7); // Now includes geography and session

      recordTypes.forEach((recordType) => {
        expect(recordType).toHaveProperty('label');
        expect(recordType).toHaveProperty('description');
        expect(recordType).toHaveProperty('source');
        expect(recordType).toHaveProperty('priority');
        expect(typeof recordType.label).toBe('string');
        expect(typeof recordType.description).toBe('string');
        expect(recordType.source).toBe('core');
        expect(typeof recordType.priority).toBe('number');
      });
    });

    it('should have unique priorities', () => {
      const priorities = Object.values(DEFAULT_RECORD_TYPES).map(
        (rt) => rt.priority
      );
      const uniquePriorities = new Set(priorities);
      expect(uniquePriorities.size).toBe(priorities.length);
    });

    it('should have valid labels', () => {
      Object.values(DEFAULT_RECORD_TYPES).forEach((recordType) => {
        expect(recordType.label.length).toBeGreaterThan(0);
        expect(recordType.description.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Record Types Structure', () => {
    it('should have bylaw with correct properties', () => {
      const bylaw = DEFAULT_RECORD_TYPES.bylaw;
      expect(bylaw.label).toBe('Bylaws');
      expect(bylaw.description).toBe('Municipal bylaws and regulations');
      expect(bylaw.source).toBe('core');
      expect(bylaw.priority).toBe(1);
    });

    it('should have ordinance with correct properties', () => {
      const ordinance = DEFAULT_RECORD_TYPES.ordinance;
      expect(ordinance.label).toBe('Ordinances');
      expect(ordinance.description).toBe('Local ordinances and laws');
      expect(ordinance.source).toBe('core');
      expect(ordinance.priority).toBe(2);
    });

    it('should have policy with correct properties', () => {
      const policy = DEFAULT_RECORD_TYPES.policy;
      expect(policy.label).toBe('Policies');
      expect(policy.description).toBe('Administrative policies');
      expect(policy.source).toBe('core');
      expect(policy.priority).toBe(3);
    });

    it('should have proclamation with correct properties', () => {
      const proclamation = DEFAULT_RECORD_TYPES.proclamation;
      expect(proclamation.label).toBe('Proclamations');
      expect(proclamation.description).toBe('Official proclamations');
      expect(proclamation.source).toBe('core');
      expect(proclamation.priority).toBe(4);
    });

    it('should have resolution with correct properties', () => {
      const resolution = DEFAULT_RECORD_TYPES.resolution;
      expect(resolution.label).toBe('Resolutions');
      expect(resolution.description).toBe('Council resolutions');
      expect(resolution.source).toBe('core');
      expect(resolution.priority).toBe(5);
    });
  });
});
