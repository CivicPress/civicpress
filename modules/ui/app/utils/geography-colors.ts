/**
 * Geography Color Utilities
 *
 * Client-side utilities for color validation, format conversion, and default palettes
 * for geography feature styling. These are UI-only utilities and don't need to be
 * in the core package to avoid circular dependencies.
 */

/**
 * Default color palette for geography features
 */
export const DEFAULT_COLOR_PALETTE = [
  '#3b82f6', // blue-500
  '#10b981', // emerald-500
  '#f59e0b', // amber-500
  '#ef4444', // red-500
  '#8b5cf6', // violet-500
  '#06b6d4', // cyan-500
  '#f97316', // orange-500
  '#ec4899', // pink-500
  '#14b8a6', // teal-500
  '#6366f1', // indigo-500
  '#84cc16', // lime-500
  '#a855f7', // purple-500
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
