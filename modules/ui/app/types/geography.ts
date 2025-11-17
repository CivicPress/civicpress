/**
 * Local type definitions for geography-related types
 * These types are duplicated from @civicpress/core to avoid circular dependencies
 */

export type GeographyFileType = 'geojson' | 'kml' | 'gpx' | 'shapefile';
export type GeographyCategory =
  | 'zone'
  | 'boundary'
  | 'district'
  | 'facility'
  | 'route';

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

export interface ColorMapping {
  property?: string; // Property name to match (e.g., "NOM", "LETTRE", "FID")
  type?: 'property' | 'feature_id'; // Mapping strategy
  colors: Record<string, string>; // Key-value pairs: property_value -> color
  feature_overrides?: Record<string, string>; // Optional: feature_id -> color
  default_color?: string; // Fallback color
}

export interface IconConfig {
  url: string; // UUID-based URL or external URL
  library_id?: string; // Reference to library icon (alternative to url)
  size?: [number, number]; // [width, height] - optional, auto-detect if not provided
  anchor?: [number, number]; // [x, y] - optional, defaults to center-bottom for markers
  popupAnchor?: [number, number]; // Optional: where popup appears relative to icon
  shadowUrl?: string; // Optional: shadow image URL
  shadowSize?: [number, number]; // Optional: shadow dimensions
  shadowAnchor?: [number, number]; // Optional: shadow anchor point
  colorize?: string; // Optional: apply color filter to monochrome icon
}

export interface IconMapping {
  property?: string; // Property to match (e.g., "NOM", "LETTRE")
  type?: 'property' | 'feature_id'; // Mapping strategy
  icons: Record<string, IconConfig>; // property_value -> icon config
  feature_overrides?: Record<string, IconConfig>; // feature_id -> icon config
  default_icon?: 'circle' | 'marker' | 'none' | string; // Fallback icon type or URL
  apply_to?: ('Point' | 'LineString' | 'Polygon')[]; // Which geometry types get icons
}

export interface GeographyMetadata {
  source: string;
  created: string;
  updated: string;
  version: string;
  accuracy: string;
  color_mapping?: ColorMapping;
  icon_mapping?: IconMapping;
}

export interface GeographyFile {
  id: string;
  name: string;
  type: GeographyFileType;
  category: GeographyCategory;
  description: string;
  srid: number;
  bounds: BoundingBox;
  metadata: GeographyMetadata;
  file_path: string;
  preview_image?: string;
  content?: string; // Raw file content for display
  created_at: string;
  updated_at: string;
}

export interface GeographyValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface ParsedGeographyData {
  type: GeographyFileType;
  content: any;
  bounds: BoundingBox;
  srid: number;
  featureCount: number;
  geometryTypes: string[];
}

export interface GeographyFormData {
  name: string;
  description: string;
  category: GeographyCategory;
  type: GeographyFileType;
  content: string;
  srid?: number;
  color_mapping?: ColorMapping;
  icon_mapping?: IconMapping;
}

export interface GeographyFormErrors {
  name?: string;
  description?: string;
  category?: string;
  type?: string;
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
