/**
 * Geography Manager
 *
 * Core service for managing geography files in the centralized geography data system.
 * Handles file validation, generation, storage, and metadata management.
 */

import { promises as fs } from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import {
  GeographyFile,
  GeographyCategory,
  GeographyFileType,
  CreateGeographyRequest,
  UpdateGeographyRequest,
  GeographyValidationResult,
  ParsedGeographyData,
  BoundingBox,
  GeographyMetadata,
  GeographyError,
  GeographyValidationError,
  GeographyNotFoundError,
  SRID,
} from '../types/geography.js';

export class GeographyManager {
  private dataDir: string;
  private geographyDir: string;

  constructor(dataDir: string) {
    this.dataDir = dataDir;
    this.geographyDir = path.join(dataDir, 'geography');
  }

  /**
   * Create a new geography file
   */
  async createGeographyFile(
    request: CreateGeographyRequest,
    user: any
  ): Promise<GeographyFile> {
    try {
      // Validate the content
      const validation = await this.validateGeographyContent(
        request.content,
        request.type
      );
      if (!validation.valid) {
        throw new GeographyValidationError(
          'Invalid geography content',
          validation
        );
      }

      // Parse the content
      const parsed = await this.parseGeographyContent(
        request.content,
        request.type
      );

      // Generate unique ID and filename
      const id = uuidv4();
      const filename = this.generateFilename(request.name, request.type);
      const categoryDir = path.join(
        this.geographyDir,
        request.type,
        request.category
      );
      const filePath = path.join(categoryDir, filename);

      // Ensure directory exists
      await fs.mkdir(categoryDir, { recursive: true });

      // Save the file
      await fs.writeFile(filePath, request.content, 'utf8');

      // Create metadata
      const metadata: GeographyMetadata = {
        source: 'CivicPress Geography System',
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
        version: '1.0.0',
        accuracy: 'Standard',
        ...request.metadata,
      };

      // Create geography file record
      const geographyFile: GeographyFile = {
        id,
        name: request.name,
        type: request.type,
        category: request.category,
        description: request.description,
        srid: request.srid || 4326,
        bounds: parsed.bounds,
        metadata,
        file_path: path.relative(this.dataDir, filePath),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      // TODO: Save to database
      // await this.saveToDatabase(geographyFile);

      return geographyFile;
    } catch (error) {
      if (error instanceof GeographyError) {
        throw error;
      }
      throw new GeographyError(
        `Failed to create geography file: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'CREATE_ERROR',
        { request, error }
      );
    }
  }

  /**
   * Get a geography file by ID
   */
  async getGeographyFile(id: string): Promise<GeographyFile | null> {
    try {
      // Search for the file across all geography directories
      const types = ['geojson', 'kml', 'gpx', 'shp'];
      const categories = ['zone', 'boundary', 'district', 'facility', 'route'];

      for (const fileType of types) {
        const typeDir = path.join(this.geographyDir, fileType);

        try {
          const typeExists = await fs
            .access(typeDir)
            .then(() => true)
            .catch(() => false);
          if (!typeExists) continue;

          for (const category of categories) {
            const categoryDir = path.join(typeDir, category);

            try {
              const categoryExists = await fs
                .access(categoryDir)
                .then(() => true)
                .catch(() => false);
              if (!categoryExists) continue;

              const fileNames = await fs.readdir(categoryDir);

              for (const fileName of fileNames) {
                const fileId = path.basename(fileName, path.extname(fileName));

                if (fileId === id) {
                  // Found the file, read and parse it
                  const filePath = path.join(categoryDir, fileName);
                  const stats = await fs.stat(filePath);

                  if (stats.isFile()) {
                    const content = await fs.readFile(filePath, 'utf8');

                    try {
                      const parsed = await this.parseGeographyContent(
                        content,
                        fileType as GeographyFileType
                      );

                      const geographyFile: GeographyFile = {
                        id: fileId,
                        name: this.extractNameFromFilename(fileName),
                        type: fileType as GeographyFileType,
                        category: category as GeographyCategory,
                        description: `Geography file: ${fileName}`,
                        srid: 4326,
                        bounds: parsed.bounds,
                        metadata: {
                          source: 'CivicPress Geography System',
                          created: stats.birthtime.toISOString(),
                          updated: stats.mtime.toISOString(),
                          version: '1.0.0',
                          accuracy: 'Standard',
                        },
                        file_path: path.relative(this.dataDir, filePath),
                        created_at: stats.birthtime.toISOString(),
                        updated_at: stats.mtime.toISOString(),
                        content: content, // Include raw content for the view page
                      };

                      return geographyFile;
                    } catch (parseError) {
                      console.warn(
                        `Failed to parse file: ${fileName}`,
                        parseError
                      );
                      continue;
                    }
                  }
                }
              }
            } catch (error) {
              // Skip categories that can't be read
              continue;
            }
          }
        } catch (error) {
          // Skip types that can't be read
          continue;
        }
      }

      // File not found
      return null;
    } catch (error) {
      if (error instanceof GeographyError) {
        throw error;
      }
      throw new GeographyError(
        `Failed to get geography file: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'GET_ERROR',
        { id, error }
      );
    }
  }

  /**
   * Update a geography file
   */
  async updateGeographyFile(
    id: string,
    request: UpdateGeographyRequest,
    user: any
  ): Promise<GeographyFile> {
    try {
      const existingFile = await this.getGeographyFile(id);
      if (!existingFile) {
        throw new GeographyNotFoundError(id);
      }

      // If content is being updated, validate it
      if (request.content) {
        const validation = await this.validateGeographyContent(
          request.content,
          existingFile.type
        );
        if (!validation.valid) {
          throw new GeographyValidationError(
            'Invalid geography content',
            validation
          );
        }
      }

      // Update the file if content changed
      if (request.content) {
        const filePath = path.join(this.dataDir, existingFile.file_path);
        await fs.writeFile(filePath, request.content, 'utf8');
      }

      // Update metadata
      const updatedFile: GeographyFile = {
        ...existingFile,
        name: request.name || existingFile.name,
        category: request.category || existingFile.category,
        description: request.description || existingFile.description,
        metadata: {
          ...existingFile.metadata,
          ...request.metadata,
          updated: new Date().toISOString(),
        },
        updated_at: new Date().toISOString(),
      };

      // TODO: Update in database
      // await this.updateInDatabase(updatedFile);

      return updatedFile;
    } catch (error) {
      if (error instanceof GeographyError) {
        throw error;
      }
      throw new GeographyError(
        `Failed to update geography file: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'UPDATE_ERROR',
        { id, request, error }
      );
    }
  }

  /**
   * Delete a geography file
   */
  async deleteGeographyFile(id: string, user: any): Promise<void> {
    try {
      const existingFile = await this.getGeographyFile(id);
      if (!existingFile) {
        throw new GeographyNotFoundError(id);
      }

      // Delete the file
      const filePath = path.join(this.dataDir, existingFile.file_path);
      await fs.unlink(filePath);

      // TODO: Delete from database
      // await this.deleteFromDatabase(id);
    } catch (error) {
      if (error instanceof GeographyError) {
        throw error;
      }
      throw new GeographyError(
        `Failed to delete geography file: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'DELETE_ERROR',
        { id, error }
      );
    }
  }

  /**
   * List geography files
   */
  async listGeographyFiles(
    category?: GeographyCategory,
    type?: GeographyFileType,
    page: number = 1,
    limit: number = 10
  ): Promise<{ files: GeographyFile[]; total: number }> {
    try {
      const files: GeographyFile[] = [];

      // Get all geography file types
      const types = type ? [type] : ['geojson', 'kml', 'gpx', 'shp'];

      for (const fileType of types) {
        const typeDir = path.join(this.geographyDir, fileType);

        try {
          const typeExists = await fs
            .access(typeDir)
            .then(() => true)
            .catch(() => false);
          if (!typeExists) continue;

          // Get all categories for this type
          const categories = category
            ? [category]
            : ['zone', 'boundary', 'district', 'facility', 'route'];

          for (const cat of categories) {
            const categoryDir = path.join(typeDir, cat);

            try {
              const categoryExists = await fs
                .access(categoryDir)
                .then(() => true)
                .catch(() => false);
              if (!categoryExists) continue;

              // Read all files in this category
              const fileNames = await fs.readdir(categoryDir);

              for (const fileName of fileNames) {
                const filePath = path.join(categoryDir, fileName);
                const stats = await fs.stat(filePath);

                if (stats.isFile()) {
                  // Read file content to extract metadata
                  const content = await fs.readFile(filePath, 'utf8');

                  try {
                    const parsed = await this.parseGeographyContent(
                      content,
                      fileType as GeographyFileType
                    );

                    const geographyFile: GeographyFile = {
                      id: path.basename(fileName, path.extname(fileName)),
                      name: this.extractNameFromFilename(fileName),
                      type: fileType as GeographyFileType,
                      category: cat as GeographyCategory,
                      description: `Geography file: ${fileName}`,
                      srid: 4326,
                      bounds: parsed.bounds,
                      metadata: {
                        source: 'CivicPress Geography System',
                        created: stats.birthtime.toISOString(),
                        updated: stats.mtime.toISOString(),
                        version: '1.0.0',
                        accuracy: 'Standard',
                      },
                      file_path: path.relative(this.dataDir, filePath),
                      created_at: stats.birthtime.toISOString(),
                      updated_at: stats.mtime.toISOString(),
                    };

                    files.push(geographyFile);
                  } catch (parseError) {
                    // Skip files that can't be parsed
                    console.warn(
                      `Skipping unparseable file: ${fileName}`,
                      parseError
                    );
                  }
                }
              }
            } catch (error) {
              // Skip categories that can't be read
              console.warn(`Skipping category: ${cat}`, error);
            }
          }
        } catch (error) {
          // Skip types that can't be read
          console.warn(`Skipping type: ${fileType}`, error);
        }
      }

      // Sort by creation date (newest first)
      files.sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );

      // Apply pagination
      const startIndex = (page - 1) * limit;
      const endIndex = startIndex + limit;
      const paginatedFiles = files.slice(startIndex, endIndex);

      return { files: paginatedFiles, total: files.length };
    } catch (error) {
      throw new GeographyError(
        `Failed to list geography files: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'LIST_ERROR',
        { category, type, page, limit, error }
      );
    }
  }

  /**
   * Validate geography content
   */
  async validateGeographyContent(
    content: string,
    type: GeographyFileType
  ): Promise<GeographyValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      // Parse the content
      const parsed = await this.parseGeographyContent(content, type);

      // Validate geometry
      if (parsed.featureCount === 0) {
        errors.push('No features found in geography data');
      }

      // Validate bounds (allow equal coordinates for single points)
      // Only fail if min is actually greater than max (not equal)
      if (
        parsed.bounds.minLon > parsed.bounds.maxLon ||
        parsed.bounds.minLat > parsed.bounds.maxLat
      ) {
        errors.push(
          'Invalid bounding box: min coordinates cannot be greater than max coordinates'
        );
      }

      // Validate coordinate ranges
      if (parsed.bounds.minLon < -180 || parsed.bounds.maxLon > 180) {
        errors.push('Longitude values must be between -180 and 180');
      }
      if (parsed.bounds.minLat < -90 || parsed.bounds.maxLat > 90) {
        errors.push('Latitude values must be between -90 and 90');
      }

      return {
        valid: errors.length === 0,
        errors,
        warnings,
        metadata: {
          featureCount: parsed.featureCount,
          bounds: parsed.bounds,
          srid: parsed.srid,
          geometryTypes: parsed.geometryTypes,
        },
      };
    } catch (error) {
      errors.push(
        `Failed to parse geography content: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
      return {
        valid: false,
        errors,
        warnings,
      };
    }
  }

  /**
   * Parse geography content
   */
  private async parseGeographyContent(
    content: string,
    type: GeographyFileType
  ): Promise<ParsedGeographyData> {
    let parsedContent: any;
    let bounds: BoundingBox;
    let featureCount = 0;
    let geometryTypes: string[] = [];

    try {
      if (type === 'geojson') {
        parsedContent = JSON.parse(content);

        if (
          parsedContent.type === 'FeatureCollection' &&
          Array.isArray(parsedContent.features)
        ) {
          featureCount = parsedContent.features.length;

          // Extract geometry types
          geometryTypes = [
            ...new Set(
              parsedContent.features
                .map((f: any) => f.geometry?.type)
                .filter(Boolean)
            ),
          ] as string[];

          // Calculate bounds
          bounds = this.calculateBounds(parsedContent.features);
        } else {
          throw new Error('Invalid GeoJSON structure');
        }
      } else if (type === 'kml') {
        // TODO: Implement KML parsing
        throw new Error('KML parsing not yet implemented');
      } else {
        throw new Error(`Unsupported geography type: ${type}`);
      }

      return {
        type,
        content: parsedContent,
        bounds,
        srid: 4326, // Default SRID
        featureCount,
        geometryTypes,
      };
    } catch (error) {
      throw new Error(
        `Failed to parse ${type} content: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Calculate bounding box from features
   */
  private calculateBounds(features: any[]): BoundingBox {
    let minLon = Infinity;
    let minLat = Infinity;
    let maxLon = -Infinity;
    let maxLat = -Infinity;

    for (const feature of features) {
      if (feature.geometry && feature.geometry.coordinates) {
        this.extractCoordinates(
          feature.geometry.coordinates,
          (lon: number, lat: number) => {
            minLon = Math.min(minLon, lon);
            minLat = Math.min(minLat, lat);
            maxLon = Math.max(maxLon, lon);
            maxLat = Math.max(maxLat, lat);
          }
        );
      }
    }

    // If no coordinates were found, return a default bounding box
    if (minLon === Infinity || maxLon === -Infinity) {
      return {
        minLon: 0,
        minLat: 0,
        maxLon: 0,
        maxLat: 0,
      };
    }

    return {
      minLon,
      minLat,
      maxLon,
      maxLat,
    };
  }

  /**
   * Extract coordinates from geometry recursively
   */
  private extractCoordinates(
    coordinates: any,
    callback: (lon: number, lat: number) => void
  ): void {
    if (Array.isArray(coordinates)) {
      if (
        typeof coordinates[0] === 'number' &&
        typeof coordinates[1] === 'number'
      ) {
        // This is a coordinate pair [lon, lat]
        callback(coordinates[0], coordinates[1]);
      } else {
        // This is an array of coordinates or nested arrays
        for (const coord of coordinates) {
          this.extractCoordinates(coord, callback);
        }
      }
    }
  }

  /**
   * Generate filename from name and type
   */
  private generateFilename(name: string, type: GeographyFileType): string {
    const sanitizedName = name
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');

    const timestamp = Date.now();
    return `${sanitizedName}-${timestamp}.${type}`;
  }

  /**
   * Extract a human-readable name from a filename
   */
  private extractNameFromFilename(filename: string): string {
    // Remove extension
    const nameWithoutExt = path.basename(filename, path.extname(filename));

    // Remove timestamp (last part after last dash)
    const parts = nameWithoutExt.split('-');
    if (parts.length > 1 && /^\d+$/.test(parts[parts.length - 1])) {
      parts.pop(); // Remove timestamp
    }

    // Join parts and convert to title case
    return parts.join(' ').replace(/\b\w/g, (l) => l.toUpperCase());
  }
}
