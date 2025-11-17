/**
 * Geography Presets Management
 *
 * Provides utilities for loading and managing geography styling presets
 * from the configuration file.
 */

import * as fs from 'fs';
import * as path from 'path';
import yaml from 'yaml';
import { CentralConfigManager } from '../config/central-config.js';
import type { ColorMapping, IconMapping } from '../types/geography.js';
import { Logger } from '../utils/logger.js';

const logger = new Logger();

export interface GeographyPreset {
  name: string;
  description: string;
  type: 'color' | 'icon' | 'combined';
  color_mapping?: ColorMapping;
  icon_mapping?: IconMapping;
}

export interface GeographyPresetsConfig {
  _metadata?: {
    name?: string;
    description?: string;
    version?: string;
    editable?: boolean;
  };
  presets: Record<string, GeographyPreset>;
}

/**
 * Get all available geography presets
 */
export function getGeographyPresets(): Record<string, GeographyPreset> {
  try {
    const dataDir = CentralConfigManager.getDataDir();
    const presetsPath = path.join(dataDir, '.civic', 'geography-presets.yml');

    if (!fs.existsSync(presetsPath)) {
      // Return empty presets if file doesn't exist
      logger.warn('Geography presets file not found, returning empty presets');
      return {};
    }

    const content = fs.readFileSync(presetsPath, 'utf8');
    const config: GeographyPresetsConfig = yaml.parse(content);

    if (!config.presets || typeof config.presets !== 'object') {
      logger.warn('Invalid geography presets format, returning empty presets');
      return {};
    }

    return config.presets;
  } catch (error) {
    logger.error('Failed to load geography presets:', error);
    return {};
  }
}

/**
 * Get a specific preset by key
 */
export function getGeographyPreset(key: string): GeographyPreset | null {
  const presets = getGeographyPresets();
  return presets[key] || null;
}

/**
 * List all preset keys with their names
 */
export function listGeographyPresets(): Array<{
  key: string;
  name: string;
  description: string;
  type: string;
}> {
  const presets = getGeographyPresets();
  return Object.entries(presets).map(([key, preset]) => ({
    key,
    name: preset.name,
    description: preset.description || '',
    type: preset.type,
  }));
}

/**
 * Apply a preset to color/icon mappings
 * Returns a new object with the preset's mappings applied
 */
export function applyGeographyPreset(
  presetKey: string,
  existingColorMapping?: ColorMapping,
  existingIconMapping?: IconMapping
): {
  color_mapping?: ColorMapping;
  icon_mapping?: IconMapping;
} {
  const preset = getGeographyPreset(presetKey);
  if (!preset) {
    throw new Error(`Preset '${presetKey}' not found`);
  }

  const result: {
    color_mapping?: ColorMapping;
    icon_mapping?: IconMapping;
  } = {};

  // Apply color mapping (preset overrides existing)
  if (preset.color_mapping) {
    result.color_mapping = {
      ...existingColorMapping,
      ...preset.color_mapping,
      // Merge colors if both exist
      colors: existingColorMapping?.colors
        ? { ...existingColorMapping.colors, ...preset.color_mapping.colors }
        : preset.color_mapping.colors,
    };
  } else if (existingColorMapping) {
    result.color_mapping = existingColorMapping;
  }

  // Apply icon mapping (preset overrides existing)
  if (preset.icon_mapping) {
    result.icon_mapping = {
      ...existingIconMapping,
      ...preset.icon_mapping,
      // Merge icons if both exist
      icons: existingIconMapping?.icons
        ? { ...existingIconMapping.icons, ...preset.icon_mapping.icons }
        : preset.icon_mapping.icons,
    };
  } else if (existingIconMapping) {
    result.icon_mapping = existingIconMapping;
  }

  return result;
}
