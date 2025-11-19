#!/usr/bin/env node
/**
 * Migration Script: Convert Geography Files to Markdown Format
 *
 * This script migrates existing geography files (.geojson, .kml, .gpx) to the new
 * markdown format with YAML frontmatter and content in code blocks.
 *
 * Usage:
 *   node scripts/migrate-geography-to-markdown.mjs [--dry-run] [--data-dir=<path>]
 *
 * Options:
 *   --dry-run    Show what would be migrated without making changes
 *   --data-dir   Path to data directory (default: ./data)
 */

import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { stringify } from 'yaml';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

// Parse command line arguments
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const dataDirArg = args.find((arg) => arg.startsWith('--data-dir='));
const dataDir = dataDirArg
  ? path.resolve(dataDirArg.split('=')[1])
  : path.join(projectRoot, 'data');

const geographyDir = path.join(dataDir, 'geography');

// File extensions to migrate
const extensionsToMigrate = ['.geojson', '.kml', '.gpx'];

/**
 * Extract ID from filename (the full base name without extension)
 * This preserves the existing ID structure
 */
function extractIdFromFilename(filename) {
  return path.basename(filename, path.extname(filename));
}

/**
 * Extract name from filename (remove extension and timestamp)
 * Converts slug to title case for better readability
 */
function extractNameFromFilename(filename) {
  const base = path.basename(filename, path.extname(filename));
  // Remove timestamp (last part after last dash if it's numeric)
  const parts = base.split('-');
  if (parts.length > 1 && /^\d+$/.test(parts[parts.length - 1])) {
    parts.pop(); // Remove timestamp
  }
  // Join parts and convert to title case
  const slug = parts.join('-');
  return slug
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

/**
 * Determine geography type from file extension
 */
function getTypeFromExtension(ext) {
  switch (ext) {
    case '.geojson':
      return 'geojson';
    case '.kml':
      return 'kml';
    case '.gpx':
      return 'gpx';
    default:
      return 'geojson';
  }
}

/**
 * Determine category from directory path
 */
function getCategoryFromPath(filePath) {
  const parts = filePath.split(path.sep);
  const categoryIndex = parts.indexOf('geography') + 2; // After geography/type/
  if (categoryIndex < parts.length) {
    return parts[categoryIndex];
  }
  return 'zone'; // Default category
}

/**
 * Parse bounds from GeoJSON content
 */
function parseBoundsFromGeoJSON(content) {
  try {
    const geoJson = JSON.parse(content);
    if (geoJson.type === 'FeatureCollection' && geoJson.features) {
      let minLon = Infinity;
      let minLat = Infinity;
      let maxLon = -Infinity;
      let maxLat = -Infinity;

      for (const feature of geoJson.features) {
        if (feature.geometry && feature.geometry.coordinates) {
          extractBoundsFromGeometry(feature.geometry, (lon, lat) => {
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
    // Not valid JSON
  }

  return {
    minLon: -180,
    minLat: -90,
    maxLon: 180,
    maxLat: 90,
  };
}

/**
 * Extract bounds from geometry recursively
 */
function extractBoundsFromGeometry(geometry, callback) {
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
      coords.forEach((coord) => {
        callback(coord[0], coord[1]);
      });
      break;
    case 'Polygon':
    case 'MultiLineString':
      coords.forEach((ring) => {
        ring.forEach((coord) => {
          callback(coord[0], coord[1]);
        });
      });
      break;
    case 'MultiPolygon':
      coords.forEach((polygon) => {
        polygon.forEach((ring) => {
          ring.forEach((coord) => {
            callback(coord[0], coord[1]);
          });
        });
      });
      break;
    case 'GeometryCollection':
      if (geometry.geometries) {
        geometry.geometries.forEach((geom) => {
          extractBoundsFromGeometry(geom, callback);
        });
      }
      break;
  }
}

/**
 * Generate markdown content from geography file
 */
function generateMarkdown(geographyFile) {
  const frontmatter = {
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

  // Generate YAML frontmatter
  const yamlContent = stringify(frontmatter, {
    lineWidth: 0,
    noRefs: true,
    sortKeys: false,
  });

  const codeBlockLang = geographyFile.type === 'kml' || geographyFile.type === 'gpx' ? 'xml' : 'json';

  return `---
${yamlContent}---

\`\`\`${codeBlockLang}
${geographyFile.content}
\`\`\`
`;
}

/**
 * Migrate a single file
 */
async function migrateFile(filePath, stats) {
  const ext = path.extname(filePath);
  if (!extensionsToMigrate.includes(ext)) {
    return { skipped: true, reason: 'Not a geography file' };
  }

  try {
    // Read file content
    const content = await fs.readFile(filePath, 'utf8');

    // Extract metadata
    const filename = path.basename(filePath);
    const id = extractIdFromFilename(filename);
    const name = extractNameFromFilename(filename);
    const type = getTypeFromExtension(ext);
    const category = getCategoryFromPath(filePath);
    const relativePath = path.relative(geographyDir, filePath);
    const dir = path.dirname(relativePath);

    // Parse bounds if GeoJSON
    let bounds = {
      minLon: -180,
      minLat: -90,
      maxLon: 180,
      maxLat: 90,
    };
    if (type === 'geojson') {
      bounds = parseBoundsFromGeoJSON(content);
    }

    // Create geography file object
    const geographyFile = {
      id,
      name,
      type,
      category,
      description: `Migrated from ${filename}`,
      srid: 4326,
      bounds,
      metadata: {
        source: 'CivicPress Geography System',
        created: stats.birthtime.toISOString(),
        updated: stats.mtime.toISOString(),
        version: '1.0.0',
        accuracy: 'Standard',
      },
      created_at: stats.birthtime.toISOString(),
      updated_at: stats.mtime.toISOString(),
      content,
    };

    // Generate new filename
    // For migrated files, the ID already contains the full identifier (name-timestamp),
    // so we use it directly to avoid duplication. New files will use UUIDs and the
    // format will be name-uuid.md
    const newFilename = `${id}.md`;
    const newFilePath = path.join(path.dirname(filePath), newFilename);

    // Generate markdown
    const markdownContent = generateMarkdown(geographyFile);

    if (dryRun) {
      console.log(`[DRY RUN] Would migrate: ${relativePath} -> ${path.join(dir, newFilename)}`);
      return { migrated: false, dryRun: true };
    }

    // Write new file
    await fs.writeFile(newFilePath, markdownContent, 'utf8');

    // Delete old file
    await fs.unlink(filePath);

    return { migrated: true, oldPath: relativePath, newPath: path.join(dir, newFilename) };
  } catch (error) {
    return { error: error.message, file: filePath };
  }
}

/**
 * Find all geography files to migrate
 */
async function findGeographyFiles(dir) {
  const files = [];

  async function walk(currentDir) {
    const entries = await fs.readdir(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);

      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name);
        if (extensionsToMigrate.includes(ext)) {
          const stats = await fs.stat(fullPath);
          files.push({ path: fullPath, stats });
        }
      }
    }
  }

  if (await fs.pathExists(dir)) {
    await walk(dir);
  }

  return files;
}

/**
 * Main migration function
 */
async function main() {
  console.log('Geography File Migration to Markdown Format');
  console.log('==========================================\n');

  if (dryRun) {
    console.log('⚠️  DRY RUN MODE - No files will be modified\n');
  }

  console.log(`Data directory: ${dataDir}`);
  console.log(`Geography directory: ${geographyDir}\n`);

  // Check if geography directory exists
  if (!(await fs.pathExists(geographyDir))) {
    console.error(`❌ Geography directory not found: ${geographyDir}`);
    process.exit(1);
  }

  // Find all files to migrate
  console.log('Searching for geography files...');
  const filesToMigrate = await findGeographyFiles(geographyDir);

  if (filesToMigrate.length === 0) {
    console.log('✅ No files to migrate');
    return;
  }

  console.log(`Found ${filesToMigrate.length} file(s) to migrate\n`);

  // Migrate each file
  let migrated = 0;
  let errors = 0;
  let skipped = 0;

  for (const { path: filePath, stats } of filesToMigrate) {
    const result = await migrateFile(filePath, stats);

    if (result.migrated) {
      migrated++;
      console.log(`✅ Migrated: ${result.oldPath} -> ${result.newPath}`);
    } else if (result.dryRun) {
      migrated++;
    } else if (result.skipped) {
      skipped++;
    } else if (result.error) {
      errors++;
      console.error(`❌ Error migrating ${filePath}: ${result.error}`);
    }
  }

  console.log('\n==========================================');
  console.log('Migration Summary:');
  console.log(`  Migrated: ${migrated}`);
  console.log(`  Skipped: ${skipped}`);
  console.log(`  Errors: ${errors}`);
  console.log('==========================================\n');

  if (dryRun) {
    console.log('⚠️  This was a dry run. Run without --dry-run to apply changes.');
  } else {
    console.log('✅ Migration complete!');
  }
}

// Run migration
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

