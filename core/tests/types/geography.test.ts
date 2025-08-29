import { describe, it, expect } from 'vitest';
import {
  validateGeography,
  normalizeGeography,
  isEmptyGeography,
  getGeographySummary,
  GEOGRAPHY_CONSTANTS,
  type Geography,
  type GeographyPoint,
  type GeographyBBox,
  type GeographyAttachment,
} from '../../src/types/geography.js';

describe('Geography Types and Validation', () => {
  describe('GEOGRAPHY_CONSTANTS', () => {
    it('should have correct coordinate limits', () => {
      expect(GEOGRAPHY_CONSTANTS.MIN_LON).toBe(-180);
      expect(GEOGRAPHY_CONSTANTS.MAX_LON).toBe(180);
      expect(GEOGRAPHY_CONSTANTS.MIN_LAT).toBe(-90);
      expect(GEOGRAPHY_CONSTANTS.MAX_LAT).toBe(90);
      expect(GEOGRAPHY_CONSTANTS.DEFAULT_SRID).toBe(4326);
    });
  });

  describe('validateGeography', () => {
    it('should validate valid geography with all fields', () => {
      const geography: Geography = {
        srid: 4326,
        zone_ref: 'mtl:zone:res-R1',
        center: { lon: -73.65, lat: 45.45 },
        bbox: [-73.65, 45.45, -73.52, 45.55],
        attachments: [{ path: 'maps/zone.geojson', role: 'context' }],
      };

      const result = validateGeography(geography);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should validate minimal geography with only zone_ref', () => {
      const geography: Geography = {
        zone_ref: 'mtl:zone:res-R1',
      };

      const result = validateGeography(geography);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should validate geography with default SRID', () => {
      const geography: Geography = {
        center: { lon: -79.383, lat: 43.653 },
      };

      const result = validateGeography(geography);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject invalid SRID', () => {
      const geography: Geography = {
        srid: 4326.5,
        center: { lon: -79.383, lat: 43.653 },
      };

      const result = validateGeography(geography);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('geography.srid must be an integer');
    });

    it('should reject invalid longitude in center', () => {
      const geography: Geography = {
        center: { lon: 200, lat: 45.45 },
      };

      const result = validateGeography(geography);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        'geography.center.lon must be within [-180, 180]'
      );
    });

    it('should reject invalid latitude in center', () => {
      const geography: Geography = {
        center: { lon: -73.65, lat: 95 },
      };

      const result = validateGeography(geography);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        'geography.center.lat must be within [-90, 90]'
      );
    });

    it('should reject invalid bbox array length', () => {
      const geography: Geography = {
        bbox: [-73.65, 45.45, -73.52],
      };

      const result = validateGeography(geography);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        'geography.bbox must be an array of exactly 4 numbers'
      );
    });

    it('should reject bbox with non-numeric values', () => {
      const geography: Geography = {
        bbox: [-73.65, '45.45', -73.52, 45.55] as any,
      };

      const result = validateGeography(geography);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        'geography.bbox must contain only numbers'
      );
    });

    it('should reject invalid bbox coordinate ranges', () => {
      const geography: Geography = {
        bbox: [-200, 45.45, -73.52, 45.55],
      };

      const result = validateGeography(geography);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        'geography.bbox.minLon must be within [-180, 180]'
      );
    });

    it('should reject logically invalid bbox (minLon >= maxLon)', () => {
      const geography: Geography = {
        bbox: [-73.52, 45.45, -73.65, 45.55],
      };

      const result = validateGeography(geography);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        'geography.bbox.minLon must be less than maxLon'
      );
    });

    it('should reject logically invalid bbox (minLat >= maxLat)', () => {
      const geography: Geography = {
        bbox: [-73.65, 45.55, -73.52, 45.45],
      };

      const result = validateGeography(geography);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        'geography.bbox.minLat must be less than maxLat'
      );
    });

    it('should reject empty zone_ref', () => {
      const geography: Geography = {
        zone_ref: '',
      };

      const result = validateGeography(geography);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        'geography.zone_ref must be a non-empty string'
      );
    });

    it('should reject whitespace-only zone_ref', () => {
      const geography: Geography = {
        zone_ref: '   ',
      };

      const result = validateGeography(geography);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        'geography.zone_ref must be a non-empty string'
      );
    });

    it('should reject invalid attachment structure', () => {
      const geography: Geography = {
        attachments: [{ path: '', role: 'context' } as any],
      };

      const result = validateGeography(geography);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        'geography.attachments[0].path must be a non-empty string'
      );
    });

    it('should reject attachment without role', () => {
      const geography: Geography = {
        attachments: [{ path: 'maps/zone.geojson' } as any],
      };

      const result = validateGeography(geography);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        'geography.attachments[0].role must be a non-empty string'
      );
    });

    it('should provide warnings for missing optional fields', () => {
      const geography: Geography = {
        zone_ref: 'mtl:zone:res-R1',
      };

      const result = validateGeography(geography);
      expect(result.valid).toBe(true);
      expect(result.warnings).toContain(
        'geography should include either center or bbox for better location context'
      );
      expect(result.warnings).toContain(
        'geography.zone_ref is recommended for administrative boundary references'
      );
    });
  });

  describe('normalizeGeography', () => {
    it('should apply default SRID when missing', () => {
      const geography: Geography = {
        center: { lon: -79.383, lat: 43.653 },
      };

      const normalized = normalizeGeography(geography);
      expect(normalized.srid).toBe(4326);
      expect(normalized.center).toEqual(geography.center);
    });

    it('should preserve existing SRID', () => {
      const geography: Geography = {
        srid: 3857,
        center: { lon: -79.383, lat: 43.653 },
      };

      const normalized = normalizeGeography(geography);
      expect(normalized.srid).toBe(3857);
    });

    it('should preserve all other fields', () => {
      const geography: Geography = {
        zone_ref: 'mtl:zone:res-R1',
        center: { lon: -79.383, lat: 43.653 },
        bbox: [-79.4, 43.6, -79.3, 43.7],
        attachments: [{ path: 'maps/zone.geojson', role: 'context' }],
      };

      const normalized = normalizeGeography(geography);
      expect(normalized.zone_ref).toBe(geography.zone_ref);
      expect(normalized.center).toEqual(geography.center);
      expect(normalized.bbox).toEqual(geography.bbox);
      expect(normalized.attachments).toEqual(geography.attachments);
    });
  });

  describe('isEmptyGeography', () => {
    it('should return true for empty geography', () => {
      const geography: Geography = {};
      expect(isEmptyGeography(geography)).toBe(true);
    });

    it('should return true for geography with only undefined fields', () => {
      const geography: Geography = {
        srid: undefined,
        zone_ref: undefined,
        center: undefined,
        bbox: undefined,
        attachments: undefined,
      };
      expect(isEmptyGeography(geography)).toBe(true);
    });

    it('should return false for geography with zone_ref', () => {
      const geography: Geography = {
        zone_ref: 'mtl:zone:res-R1',
      };
      expect(isEmptyGeography(geography)).toBe(false);
    });

    it('should return false for geography with center', () => {
      const geography: Geography = {
        center: { lon: -79.383, lat: 43.653 },
      };
      expect(isEmptyGeography(geography)).toBe(false);
    });

    it('should return false for geography with bbox', () => {
      const geography: Geography = {
        bbox: [-79.4, 43.6, -79.3, 43.7],
      };
      expect(isEmptyGeography(geography)).toBe(false);
    });

    it('should return false for geography with attachments', () => {
      const geography: Geography = {
        attachments: [{ path: 'maps/zone.geojson', role: 'context' }],
      };
      expect(isEmptyGeography(geography)).toBe(false);
    });
  });

  describe('getGeographySummary', () => {
    it('should return message for empty geography', () => {
      const geography: Geography = {};
      const summary = getGeographySummary(geography);
      expect(summary).toBe('No geographic information');
    });

    it('should include SRID when different from default', () => {
      const geography: Geography = {
        srid: 3857,
        center: { lon: -79.383, lat: 43.653 },
      };
      const summary = getGeographySummary(geography);
      expect(summary).toContain('SRID: 3857');
    });

    it('should not include default SRID', () => {
      const geography: Geography = {
        srid: 4326,
        center: { lon: -79.383, lat: 43.653 },
      };
      const summary = getGeographySummary(geography);
      expect(summary).not.toContain('SRID: 4326');
    });

    it('should include zone reference', () => {
      const geography: Geography = {
        zone_ref: 'mtl:zone:res-R1',
      };
      const summary = getGeographySummary(geography);
      expect(summary).toContain('Zone: mtl:zone:res-R1');
    });

    it('should include center coordinates', () => {
      const geography: Geography = {
        center: { lon: -79.383, lat: 43.653 },
      };
      const summary = getGeographySummary(geography);
      expect(summary).toContain('Center: -79.383000, 43.653000');
    });

    it('should include bbox coordinates', () => {
      const geography: Geography = {
        bbox: [-79.4, 43.6, -79.3, 43.7],
      };
      const summary = getGeographySummary(geography);
      expect(summary).toContain(
        'BBox: [-79.400000, 43.600000, -79.300000, 43.700000]'
      );
    });

    it('should include attachment count', () => {
      const geography: Geography = {
        attachments: [
          { path: 'maps/zone.geojson', role: 'context' },
          { path: 'data/boundaries.csv', role: 'data' },
        ],
      };
      const summary = getGeographySummary(geography);
      expect(summary).toContain('2 attachment(s)');
    });

    it('should combine multiple fields with separators', () => {
      const geography: Geography = {
        zone_ref: 'mtl:zone:res-R1',
        center: { lon: -79.383, lat: 43.653 },
        attachments: [{ path: 'maps/zone.geojson', role: 'context' }],
      };
      const summary = getGeographySummary(geography);
      expect(summary).toContain(' | ');
      expect(summary).toContain('Zone: mtl:zone:res-R1');
      expect(summary).toContain('Center: -79.383000, 43.653000');
      expect(summary).toContain('1 attachment(s)');
    });
  });

  describe('Type definitions', () => {
    it('should allow valid GeographyPoint', () => {
      const point: GeographyPoint = { lon: -79.383, lat: 43.653 };
      expect(point.lon).toBe(-79.383);
      expect(point.lat).toBe(43.653);
    });

    it('should allow valid GeographyBBox', () => {
      const bbox: GeographyBBox = {
        minLon: -79.4,
        minLat: 43.6,
        maxLon: -79.3,
        maxLat: 43.7,
      };
      expect(bbox.minLon).toBe(-79.4);
      expect(bbox.maxLat).toBe(43.7);
    });

    it('should allow valid GeographyAttachment', () => {
      const attachment: GeographyAttachment = {
        path: 'maps/zone.geojson',
        role: 'context',
        description: 'Zone boundary map',
      };
      expect(attachment.path).toBe('maps/zone.geojson');
      expect(attachment.role).toBe('context');
      expect(attachment.description).toBe('Zone boundary map');
    });

    it('should allow Geography with all optional fields', () => {
      const geography: Geography = {
        srid: 4326,
        zone_ref: 'mtl:zone:res-R1',
        center: { lon: -79.383, lat: 43.653 },
        bbox: [-79.4, 43.6, -79.3, 43.7],
        attachments: [{ path: 'maps/zone.geojson', role: 'context' }],
      };
      expect(geography.srid).toBe(4326);
      expect(geography.zone_ref).toBe('mtl:zone:res-R1');
      expect(geography.center).toBeDefined();
      expect(geography.bbox).toBeDefined();
      expect(geography.attachments).toBeDefined();
    });
  });
});
