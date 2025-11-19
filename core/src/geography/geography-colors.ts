/**
 * Geography Color Utilities
 *
 * Provides utilities for color validation, format conversion, and default palettes
 * for geography feature styling.
 */

/**
 * Validate color format (hex, rgb, rgba, or named color)
 */
export function validateColor(color: string): boolean {
  if (!color || typeof color !== 'string') {
    return false;
  }

  // Hex color (#fff, #ffffff)
  if (/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(color)) {
    return true;
  }

  // RGB/RGBA color
  if (/^rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*(,\s*[\d.]+\s*)?\)$/.test(color)) {
    return true;
  }

  // Named colors (basic set)
  const namedColors = [
    'black',
    'white',
    'red',
    'green',
    'blue',
    'yellow',
    'cyan',
    'magenta',
    'orange',
    'purple',
    'pink',
    'brown',
    'gray',
    'grey',
    'silver',
    'gold',
    'navy',
    'teal',
    'lime',
    'olive',
    'maroon',
    'aqua',
    'fuchsia',
  ];
  if (namedColors.includes(color.toLowerCase())) {
    return true;
  }

  return false;
}

/**
 * Convert color to hex format for consistent use
 */
export function colorToHex(color: string): string | null {
  if (!validateColor(color)) {
    return null;
  }

  // Already hex
  if (color.startsWith('#')) {
    // Expand short hex (#fff -> #ffffff)
    if (color.length === 4) {
      return `#${color[1]}${color[1]}${color[2]}${color[2]}${color[3]}${color[3]}`;
    }
    return color.toLowerCase();
  }

  // RGB/RGBA - extract RGB values
  const rgbMatch = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (rgbMatch) {
    const r = parseInt(rgbMatch[1], 10).toString(16).padStart(2, '0');
    const g = parseInt(rgbMatch[2], 10).toString(16).padStart(2, '0');
    const b = parseInt(rgbMatch[3], 10).toString(16).padStart(2, '0');
    return `#${r}${g}${b}`;
  }

  // Named colors to hex mapping
  const namedColorMap: Record<string, string> = {
    black: '#000000',
    white: '#ffffff',
    red: '#ff0000',
    green: '#008000',
    blue: '#0000ff',
    yellow: '#ffff00',
    cyan: '#00ffff',
    magenta: '#ff00ff',
    orange: '#ffa500',
    purple: '#800080',
    pink: '#ffc0cb',
    brown: '#a52a2a',
    gray: '#808080',
    grey: '#808080',
    silver: '#c0c0c0',
    gold: '#ffd700',
    navy: '#000080',
    teal: '#008080',
    lime: '#00ff00',
    olive: '#808000',
    maroon: '#800000',
    aqua: '#00ffff',
    fuchsia: '#ff00ff',
  };

  return namedColorMap[color.toLowerCase()] || null;
}

/**
 * Default color palette for geography features
 * Based on Material Design and Tailwind CSS color schemes
 */
export const DEFAULT_COLOR_PALETTE = [
  '#3b82f6', // blue-500
  '#ef4444', // red-500
  '#10b981', // green-500
  '#f59e0b', // amber-500
  '#8b5cf6', // violet-500
  '#ec4899', // pink-500
  '#06b6d4', // cyan-500
  '#84cc16', // lime-500
  '#f97316', // orange-500
  '#6366f1', // indigo-500
  '#14b8a6', // teal-500
  '#a855f7', // purple-500
  '#eab308', // yellow-500
  '#22c55e', // emerald-500
  '#64748b', // slate-500
];

/**
 * Get a color from the default palette by index (with wrapping)
 */
export function getDefaultColor(index: number): string {
  return DEFAULT_COLOR_PALETTE[index % DEFAULT_COLOR_PALETTE.length];
}

/**
 * Auto-assign colors to property values using default palette
 */
export function assignDefaultColors(
  propertyValues: string[],
  startIndex: number = 0
): Record<string, string> {
  const colorMap: Record<string, string> = {};
  propertyValues.forEach((value, index) => {
    colorMap[value] = getDefaultColor(startIndex + index);
  });
  return colorMap;
}

/**
 * Extract unique property values from GeoJSON features
 */
export function extractPropertyValues(
  geoJson: any,
  propertyName: string
): string[] {
  if (!geoJson || !geoJson.features || !Array.isArray(geoJson.features)) {
    return [];
  }

  const values = new Set<string>();
  geoJson.features.forEach((feature: any) => {
    if (feature.properties && feature.properties[propertyName]) {
      const value = String(feature.properties[propertyName]);
      if (value) {
        values.add(value);
      }
    }
  });

  return Array.from(values).sort();
}

/**
 * Suggest property name for color/icon mapping based on common patterns
 */
export function suggestPropertyName(geoJson: any): string | null {
  if (!geoJson || !geoJson.features || !Array.isArray(geoJson.features)) {
    return null;
  }

  // Priority order for property names
  const priorityProperties = [
    'NOM',
    'LETTRE',
    'name',
    'type',
    'category',
    'FID',
    'OBJECTID',
  ];

  // Check which properties exist in the features
  const availableProperties = new Set<string>();
  geoJson.features.forEach((feature: any) => {
    if (feature.properties) {
      Object.keys(feature.properties).forEach((key) => {
        availableProperties.add(key);
      });
    }
  });

  // Return first priority property that exists
  for (const prop of priorityProperties) {
    if (availableProperties.has(prop)) {
      return prop;
    }
  }

  // If no priority property found, return first available property
  const firstProp = Array.from(availableProperties)[0];
  return firstProp || null;
}
