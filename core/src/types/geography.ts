/**
 * Geography types and interfaces for CivicPress records
 * Provides zero-GIS dependency geography support with validation
 */

export interface GeographyPoint {
  lon: number; // Longitude: [-180, 180]
  lat: number; // Latitude: [-90, 90]
}

export type GeographyBBox = [number, number, number, number]; // [minLon, minLat, maxLon, maxLat]

export interface GeographyAttachment {
  id?: string; // UUID reference to storage file (preferred)
  path: string; // File path reference (for display/legacy)
  role: string; // Context, map, data, etc.
  description?: string; // Optional description
}

export interface Geography {
  srid?: number; // Spatial Reference System ID, defaults to 4326 (WGS84)
  zone_ref?: string; // Zone reference identifier
  bbox?: GeographyBBox; // Bounding box coordinates
  center?: GeographyPoint; // Center point coordinates
  attachments?: GeographyAttachment[]; // Associated files
}

export interface GeographyValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Geography validation rules and constants
 */
export const GEOGRAPHY_CONSTANTS = {
  DEFAULT_SRID: 4326, // WGS84
  MIN_LON: -180,
  MAX_LON: 180,
  MIN_LAT: -90,
  MAX_LAT: 90,
} as const;

/**
 * Validate geography data according to CivicPress rules
 */
export function validateGeography(
  geography: Geography
): GeographyValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Validate SRID
  if (geography.srid !== undefined) {
    if (!Number.isInteger(geography.srid)) {
      errors.push('geography.srid must be an integer');
    }
  }

  // Validate center coordinates
  if (geography.center) {
    const { lon, lat } = geography.center;

    if (typeof lon !== 'number' || typeof lat !== 'number') {
      errors.push(
        'geography.center.lon and geography.center.lat must be numbers'
      );
    } else {
      if (
        lon < GEOGRAPHY_CONSTANTS.MIN_LON ||
        lon > GEOGRAPHY_CONSTANTS.MAX_LON
      ) {
        errors.push(
          `geography.center.lon must be within [${GEOGRAPHY_CONSTANTS.MIN_LON}, ${GEOGRAPHY_CONSTANTS.MAX_LON}]`
        );
      }
      if (
        lat < GEOGRAPHY_CONSTANTS.MIN_LAT ||
        lat > GEOGRAPHY_CONSTANTS.MAX_LAT
      ) {
        errors.push(
          `geography.center.lat must be within [${GEOGRAPHY_CONSTANTS.MIN_LAT}, ${GEOGRAPHY_CONSTANTS.MAX_LAT}]`
        );
      }
    }
  }

  // Validate bounding box
  if (geography.bbox) {
    if (!Array.isArray(geography.bbox) || geography.bbox.length !== 4) {
      errors.push('geography.bbox must be an array of exactly 4 numbers');
    } else {
      const [minLon, minLat, maxLon, maxLat] = geography.bbox;

      if (
        typeof minLon !== 'number' ||
        typeof minLat !== 'number' ||
        typeof maxLon !== 'number' ||
        typeof maxLat !== 'number'
      ) {
        errors.push('geography.bbox must contain only numbers');
      } else {
        // Validate coordinate ranges
        if (
          minLon < GEOGRAPHY_CONSTANTS.MIN_LON ||
          minLon > GEOGRAPHY_CONSTANTS.MAX_LON
        ) {
          errors.push(
            `geography.bbox[0] (minLon) must be within [${GEOGRAPHY_CONSTANTS.MIN_LON}, ${GEOGRAPHY_CONSTANTS.MAX_LON}]`
          );
        }
        if (
          minLat < GEOGRAPHY_CONSTANTS.MIN_LAT ||
          minLat > GEOGRAPHY_CONSTANTS.MAX_LAT
        ) {
          errors.push(
            `geography.bbox[1] (minLat) must be within [${GEOGRAPHY_CONSTANTS.MIN_LAT}, ${GEOGRAPHY_CONSTANTS.MAX_LAT}]`
          );
        }
        if (
          maxLon < GEOGRAPHY_CONSTANTS.MIN_LON ||
          maxLon > GEOGRAPHY_CONSTANTS.MAX_LON
        ) {
          errors.push(
            `geography.bbox[2] (maxLon) must be within [${GEOGRAPHY_CONSTANTS.MIN_LON}, ${GEOGRAPHY_CONSTANTS.MAX_LON}]`
          );
        }
        if (
          maxLat < GEOGRAPHY_CONSTANTS.MIN_LAT ||
          maxLat > GEOGRAPHY_CONSTANTS.MAX_LAT
        ) {
          errors.push(
            `geography.bbox[3] (maxLat) must be within [${GEOGRAPHY_CONSTANTS.MIN_LAT}, ${GEOGRAPHY_CONSTANTS.MAX_LAT}]`
          );
        }

        // Validate logical relationships
        if (minLon >= maxLon) {
          errors.push(
            'geography.bbox[0] (minLon) must be less than geography.bbox[2] (maxLon)'
          );
        }
        if (minLat >= maxLat) {
          errors.push(
            'geography.bbox[1] (minLat) must be less than geography.bbox[3] (maxLat)'
          );
        }
      }
    }
  }

  // Validate zone_ref
  if (geography.zone_ref !== undefined) {
    if (
      typeof geography.zone_ref !== 'string' ||
      geography.zone_ref.trim() === ''
    ) {
      errors.push('geography.zone_ref must be a non-empty string');
    }
  }

  // Validate attachments
  if (geography.attachments) {
    if (!Array.isArray(geography.attachments)) {
      errors.push('geography.attachments must be an array');
    } else {
      geography.attachments.forEach((attachment, index) => {
        if (typeof attachment !== 'object' || attachment === null) {
          errors.push(`geography.attachments[${index}] must be an object`);
          return;
        }

        if (
          typeof attachment.path !== 'string' ||
          attachment.path.trim() === ''
        ) {
          errors.push(
            `geography.attachments[${index}].path must be a non-empty string`
          );
        }

        if (
          typeof attachment.role !== 'string' ||
          attachment.role.trim() === ''
        ) {
          errors.push(
            `geography.attachments[${index}].role must be a non-empty string`
          );
        }

        if (
          attachment.description !== undefined &&
          typeof attachment.description !== 'string'
        ) {
          errors.push(
            `geography.attachments[${index}].description must be a string if provided`
          );
        }
      });
    }
  }

  // Warnings for missing optional fields
  if (!geography.center && !geography.bbox) {
    warnings.push(
      'geography should include either center or bbox for better location context'
    );
  }

  if (!geography.zone_ref) {
    warnings.push(
      'geography.zone_ref is recommended for administrative boundary references'
    );
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Normalize geography data by applying defaults
 */
export function normalizeGeography(geography: Geography): Geography {
  return {
    srid: geography.srid ?? GEOGRAPHY_CONSTANTS.DEFAULT_SRID,
    zone_ref: geography.zone_ref,
    bbox: geography.bbox,
    center: geography.center,
    attachments: geography.attachments,
  };
}

/**
 * Check if geography data is empty (no meaningful geographic information)
 */
export function isEmptyGeography(geography: Geography): boolean {
  return (
    !geography.center &&
    !geography.bbox &&
    !geography.zone_ref &&
    (!geography.attachments || geography.attachments.length === 0)
  );
}

/**
 * Generate a human-readable summary of geography data
 */
export function getGeographySummary(geography: Geography): string {
  if (isEmptyGeography(geography)) {
    return 'No geographic information';
  }

  const parts: string[] = [];

  if (geography.srid && geography.srid !== GEOGRAPHY_CONSTANTS.DEFAULT_SRID) {
    parts.push(`SRID: ${geography.srid}`);
  }

  if (geography.zone_ref) {
    parts.push(`Zone: ${geography.zone_ref}`);
  }

  if (geography.center) {
    parts.push(
      `Center: ${geography.center.lon.toFixed(6)}, ${geography.center.lat.toFixed(6)}`
    );
  }

  if (geography.bbox) {
    parts.push(
      `BBox: [${geography.bbox[0].toFixed(6)}, ${geography.bbox[1].toFixed(6)}, ${geography.bbox[2].toFixed(6)}, ${geography.bbox[3].toFixed(6)}]`
    );
  }

  if (geography.attachments && geography.attachments.length > 0) {
    parts.push(`${geography.attachments.length} attachment(s)`);
  }

  return parts.join(' | ');
}

// ============================================================================
// NEW GEOGRAPHY DATA SYSTEM TYPES
// ============================================================================

/**
 * Supported geography file types for the new centralized system
 */
export type GeographyFileType = 'geojson' | 'kml' | 'gpx' | 'shapefile';
export type GeographyCategory =
  | 'zone'
  | 'boundary'
  | 'district'
  | 'facility'
  | 'route';
export type GeographyRelationshipType =
  | 'contains'
  | 'overlaps'
  | 'adjacent'
  | 'supersedes';
export type SRID = number;

export interface BoundingBox {
  minLon: number;
  minLat: number;
  maxLon: number;
  maxLat: number;
}

export interface CenterCoordinates {
  lon: number;
  lat: number;
}

export interface GeographyMetadata {
  source: string;
  created: string;
  updated: string;
  version: string;
  accuracy: string;
}

export interface GeographyFile {
  id: string;
  name: string;
  type: GeographyFileType;
  category: GeographyCategory;
  description: string;
  srid: SRID;
  bounds: BoundingBox;
  metadata: GeographyMetadata;
  file_path: string;
  preview_image?: string;
  content?: string; // Raw file content for display
  created_at: string;
  updated_at: string;
}

export interface GeographyRelationship {
  id: string;
  type: GeographyRelationshipType;
  source: string;
  target: string;
  description: string;
  created: string;
  created_by: string;
}

export interface LinkedGeography {
  geographyId: string;
  role: string;
  description?: string;
}

export interface RecordGeography {
  srid: SRID;
  zone_ref?: string;
  bbox?: BoundingBox;
  center?: CenterCoordinates;
  linkedGeography?: LinkedGeography[];
}

export interface CreateGeographyRequest {
  name: string;
  type: GeographyFileType;
  category: GeographyCategory;
  description: string;
  content: string;
  srid?: SRID;
  metadata?: Partial<GeographyMetadata>;
}

export interface UpdateGeographyRequest {
  name?: string;
  category?: GeographyCategory;
  description?: string;
  content?: string;
  metadata?: Partial<GeographyMetadata>;
}

export interface GeographyValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  metadata?: {
    featureCount: number;
    bounds: BoundingBox;
    srid: SRID;
    geometryTypes: string[];
  };
}

export interface ParsedGeographyData {
  type: GeographyFileType;
  content: any;
  bounds: BoundingBox;
  srid: SRID;
  featureCount: number;
  geometryTypes: string[];
}

export interface GeographyFormData {
  name: string;
  type: GeographyFileType;
  category: GeographyCategory;
  description: string;
  content: string;
  srid: SRID;
}

export interface GeographyFormErrors {
  name?: string;
  type?: string;
  category?: string;
  description?: string;
  content?: string;
  srid?: string;
}

export interface GeographyPreviewData {
  parsed: ParsedGeographyData | null;
  validation: GeographyValidationResult;
  mapBounds?: BoundingBox;
  isLoading: boolean;
  error?: string;
}

export class GeographyError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: any
  ) {
    super(message);
    this.name = 'GeographyError';
  }
}

export class GeographyValidationError extends GeographyError {
  constructor(
    message: string,
    public validationResult: GeographyValidationResult
  ) {
    super(message, 'VALIDATION_ERROR', validationResult);
    this.name = 'GeographyValidationError';
  }
}

export class GeographyNotFoundError extends GeographyError {
  constructor(geographyId: string) {
    super(`Geography file with ID '${geographyId}' not found`, 'NOT_FOUND', {
      geographyId,
    });
    this.name = 'GeographyNotFoundError';
  }
}
