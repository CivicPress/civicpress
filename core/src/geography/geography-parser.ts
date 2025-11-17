/**
 * Geography Parser - Parse and serialize geography files as markdown
 *
 * This module provides utilities for parsing and serializing CivicPress geography files
 * according to the markdown format with YAML frontmatter and GeoJSON/KML content in code blocks.
 * It handles:
 * - Parsing markdown files with YAML frontmatter
 * - Extracting GeoJSON/KML content from code blocks
 * - Serializing GeographyFile to properly formatted markdown
 * - Extracting raw content for external tools
 *
 * @module geography/geography-parser
 */

import matter from 'gray-matter';
import { stringify } from 'yaml';
import {
  GeographyFile,
  GeographyFileType,
  GeographyMetadata,
  BoundingBox,
  ColorMapping,
  IconMapping,
} from '../types/geography.js';
import { Logger } from '../utils/logger.js';

const logger = new Logger();

/**
 * GeographyParser - Parse and serialize geography files according to the markdown format
 */
export class GeographyParser {
  /**
   * Parse a markdown file string into GeographyFile
   *
   * @param content - Full markdown file content with frontmatter
   * @param filePath - Optional file path for error reporting
   * @returns Parsed GeographyFile object
   * @throws Error if required fields are missing or content is invalid
   */
  static parseFromMarkdown(content: string, filePath?: string): GeographyFile {
    try {
      const { data: frontmatter, content: markdownContent } = matter(content);

      if (!frontmatter || typeof frontmatter !== 'object') {
        throw new Error('Invalid or missing frontmatter');
      }

      // Validate required fields
      if (!frontmatter.id) {
        throw new Error('Missing required field: id');
      }
      if (!frontmatter.name) {
        throw new Error('Missing required field: name');
      }
      if (!frontmatter.type) {
        throw new Error('Missing required field: type');
      }
      if (!frontmatter.category) {
        throw new Error('Missing required field: category');
      }
      if (!frontmatter.description) {
        throw new Error('Missing required field: description');
      }

      // Extract raw content from code block
      const rawContent = this.extractRawContent(markdownContent);

      if (!rawContent) {
        throw new Error('No geography content found in markdown body');
      }

      // Build metadata object with color/icon mappings
      const baseMetadata = frontmatter.metadata || {
        source: 'CivicPress Geography System',
        created: frontmatter.created_at || new Date().toISOString(),
        updated: frontmatter.updated_at || new Date().toISOString(),
        version: '1.0.0',
        accuracy: 'Standard',
      };

      // Include color_mapping and icon_mapping if present in frontmatter (can be at top level or in metadata)
      const colorMapping =
        frontmatter.color_mapping || frontmatter.metadata?.color_mapping;
      const iconMapping =
        frontmatter.icon_mapping || frontmatter.metadata?.icon_mapping;

      const metadata: GeographyMetadata = {
        ...baseMetadata,
        ...(colorMapping && { color_mapping: colorMapping }),
        ...(iconMapping && { icon_mapping: iconMapping }),
      };

      // Build GeographyFile object
      const geographyFile: GeographyFile = {
        id: frontmatter.id,
        name: frontmatter.name,
        type: frontmatter.type as GeographyFileType,
        category: frontmatter.category,
        description: frontmatter.description,
        srid: frontmatter.srid || 4326,
        bounds: frontmatter.bounds || this.parseBoundsFromContent(rawContent),
        metadata,
        file_path: filePath || '',
        created_at: frontmatter.created_at || new Date().toISOString(),
        updated_at: frontmatter.updated_at || new Date().toISOString(),
        content: rawContent, // Include raw content for API responses
      };

      return geographyFile;
    } catch (error) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : 'Unknown error parsing geography file';
      logger.error(
        `Failed to parse geography file${filePath ? ` from ${filePath}` : ''}: ${errorMessage}`
      );
      throw new Error(
        `Geography parsing failed${filePath ? ` (${filePath})` : ''}: ${errorMessage}`
      );
    }
  }

  /**
   * Serialize GeographyFile to markdown with properly formatted frontmatter
   *
   * @param geographyFile - GeographyFile object to serialize
   * @returns Formatted markdown string with YAML frontmatter and code block
   */
  static serializeToMarkdown(geographyFile: GeographyFile): string {
    // Build frontmatter object
    const frontmatter: any = {
      id: geographyFile.id,
      name: geographyFile.name,
      type: geographyFile.type,
      category: geographyFile.category,
      description: geographyFile.description,
      srid: geographyFile.srid,
      bounds: geographyFile.bounds,
      metadata: geographyFile.metadata,
      created_at: geographyFile.created_at,
      updated_at: geographyFile.updated_at,
    };

    // Extract color_mapping and icon_mapping from metadata to top-level for cleaner YAML
    if (geographyFile.metadata?.color_mapping) {
      frontmatter.color_mapping = geographyFile.metadata.color_mapping;
    }
    if (geographyFile.metadata?.icon_mapping) {
      frontmatter.icon_mapping = geographyFile.metadata.icon_mapping;
    }

    // Generate YAML frontmatter
    const yamlContent = stringify(frontmatter, {
      lineWidth: 0,
      noRefs: true,
      sortKeys: false,
    });

    // Determine code block language based on type
    const codeBlockLang = this.getCodeBlockLanguage(geographyFile.type);

    // Get raw content (from content field or extract from somewhere)
    const rawContent = geographyFile.content || '';

    // Return formatted markdown
    return `---
${yamlContent}---

\`\`\`${codeBlockLang}
${rawContent}
\`\`\`
`;
  }

  /**
   * Extract raw GeoJSON/KML content from markdown code block
   *
   * @param markdownContent - Markdown content (after frontmatter)
   * @returns Raw content string or null if not found
   */
  static extractRawContent(markdownContent: string): string | null {
    if (!markdownContent) {
      return null;
    }

    // Try to find code block with common languages
    const codeBlockPattern =
      /```(?:json|geojson|kml|gpx|xml)?\s*\n([\s\S]*?)```/;
    const match = markdownContent.match(codeBlockPattern);

    if (match && match[1]) {
      return match[1].trim();
    }

    // If no code block found, return the content as-is (might be raw content)
    const trimmed = markdownContent.trim();
    return trimmed || null;
  }

  /**
   * Get code block language based on geography file type
   *
   * @param type - Geography file type
   * @returns Code block language identifier
   */
  private static getCodeBlockLanguage(type: GeographyFileType): string {
    switch (type) {
      case 'geojson':
        return 'json';
      case 'kml':
        return 'xml';
      case 'gpx':
        return 'xml';
      case 'shapefile':
        return 'json'; // Shapefiles are typically converted to GeoJSON
      default:
        return 'json';
    }
  }

  /**
   * Parse bounds from GeoJSON content (fallback if not in frontmatter)
   *
   * @param content - Raw GeoJSON/KML content
   * @returns BoundingBox or default bounds
   */
  private static parseBoundsFromContent(content: string): BoundingBox {
    try {
      // Try to parse as GeoJSON
      const geoJson = JSON.parse(content);
      if (geoJson.type === 'FeatureCollection' && geoJson.features) {
        // Calculate bounds from features
        let minLon = Infinity;
        let minLat = Infinity;
        let maxLon = -Infinity;
        let maxLat = -Infinity;

        for (const feature of geoJson.features) {
          if (feature.geometry && feature.geometry.coordinates) {
            this.extractBoundsFromGeometry(feature.geometry, (lon, lat) => {
              minLon = Math.min(minLon, lon);
              minLat = Math.min(minLat, lat);
              maxLon = Math.max(maxLon, lon);
              maxLat = Math.max(maxLat, lat);
            });
          }
        }

        if (
          minLon !== Infinity &&
          minLat !== Infinity &&
          maxLon !== -Infinity &&
          maxLat !== -Infinity
        ) {
          return {
            minLon,
            minLat,
            maxLon,
            maxLat,
          };
        }
      }
    } catch {
      // Not valid JSON, return default bounds
    }

    // Return default bounds if parsing fails
    return {
      minLon: -180,
      minLat: -90,
      maxLon: 180,
      maxLat: 90,
    };
  }

  /**
   * Extract bounds from a geometry recursively
   *
   * @param geometry - GeoJSON geometry object
   * @param callback - Callback for each coordinate pair (lon, lat)
   */
  private static extractBoundsFromGeometry(
    geometry: any,
    callback: (lon: number, lat: number) => void
  ): void {
    if (!geometry || !geometry.coordinates) {
      return;
    }

    const coords = geometry.coordinates;

    switch (geometry.type) {
      case 'Point':
        callback(coords[0], coords[1]);
        break;
      case 'LineString':
      case 'MultiPoint':
        coords.forEach((coord: number[]) => {
          callback(coord[0], coord[1]);
        });
        break;
      case 'Polygon':
      case 'MultiLineString':
        coords.forEach((ring: number[][]) => {
          ring.forEach((coord: number[]) => {
            callback(coord[0], coord[1]);
          });
        });
        break;
      case 'MultiPolygon':
        coords.forEach((polygon: number[][][]) => {
          polygon.forEach((ring: number[][]) => {
            ring.forEach((coord: number[]) => {
              callback(coord[0], coord[1]);
            });
          });
        });
        break;
      case 'GeometryCollection':
        if (geometry.geometries) {
          geometry.geometries.forEach((geom: any) => {
            this.extractBoundsFromGeometry(geom, callback);
          });
        }
        break;
    }
  }
}
