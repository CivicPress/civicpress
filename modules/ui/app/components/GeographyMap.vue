<template>
  <div ref="mapContainer" class="w-full h-full rounded-lg"></div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, nextTick } from 'vue';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useAuthStore } from '@/stores/auth';
import { useRuntimeConfig } from '#imports';

// Fix for default markers in Leaflet with Vite
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';
import markerRetina from 'leaflet/dist/images/marker-icon-2x.png';

// Fix default marker icons
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerRetina,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

import type { ColorMapping, IconMapping, IconConfig } from '~/types/geography';

interface Props {
  geographyData?: any;
  bounds?: {
    minLon: number;
    minLat: number;
    maxLon: number;
    maxLat: number;
  };
  height?: string;
  interactive?: boolean;
  scrollWheelZoom?: boolean;
  colorMapping?: ColorMapping;
  iconMapping?: IconMapping;
}

const props = withDefaults(defineProps<Props>(), {
  height: '400px',
  interactive: true,
  scrollWheelZoom: undefined, // undefined means use interactive value
  colorMapping: undefined,
  iconMapping: undefined,
});

const mapContainer = ref<HTMLElement>();
let map: L.Map | null = null;
let geoJsonLayer: L.GeoJSON | null = null;

// Composables
const authStore = useAuthStore();
const config = useRuntimeConfig();

// Cache for blob URLs to avoid re-fetching
const blobUrlCache = new Map<string, string>();

/**
 * Check if a string is a UUID
 */
const isUUID = (str: string): boolean => {
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(str);
};

/**
 * Convert UUID to blob URL by fetching from API
 */
const uuidToBlobUrl = async (uuid: string): Promise<string | null> => {
  // Check cache first
  if (blobUrlCache.has(uuid)) {
    return blobUrlCache.get(uuid)!;
  }

  try {
    const apiUrl = config.public.civicApiUrl || '';
    const response = await fetch(`${apiUrl}/api/v1/storage/files/${uuid}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${authStore.token}`,
      },
    });

    if (!response.ok) {
      // Log error but don't throw - return null to indicate failure
      console.warn(
        `Failed to fetch file ${uuid}: ${response.status} ${response.statusText}`
      );
      return null;
    }

    const blob = await response.blob();
    const blobUrl = window.URL.createObjectURL(blob);

    // Cache the blob URL
    blobUrlCache.set(uuid, blobUrl);

    return blobUrl;
  } catch (error) {
    // Log error but don't throw - return null to indicate failure
    console.warn('Failed to load icon from UUID:', uuid, error);
    return null;
  }
};

/**
 * Resolve icon URL - convert UUID to blob URL if needed
 */
const resolveIconUrl = async (url: string): Promise<string | null> => {
  // If it's already a full URL (http/https), use it directly
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url;
  }

  // If it's a UUID, convert to blob URL
  if (isUUID(url)) {
    return await uuidToBlobUrl(url);
  }

  // Otherwise, assume it's a relative path or return as-is
  return url;
};

/**
 * Get color for a feature based on color mapping
 */
const getFeatureColor = (feature: any): string => {
  if (!props.colorMapping) {
    return getDefaultColorByGeometry(feature.geometry.type);
  }

  const mapping = props.colorMapping;

  // 1. Check feature-specific override first (highest priority)
  if (feature.id && mapping.feature_overrides?.[feature.id]) {
    const color = mapping.feature_overrides[feature.id];
    return typeof color === 'string' ? color : color || '';
  }

  // 2. Check property-based mapping
  if (mapping.property && feature.properties) {
    const propertyValue = String(feature.properties[mapping.property] || '');
    if (propertyValue && mapping.colors[propertyValue]) {
      return mapping.colors[propertyValue];
    }
  }

  // 3. Fall back to default color or geometry-based default
  return (
    mapping.default_color || getDefaultColorByGeometry(feature.geometry.type)
  );
};

/**
 * Get default color based on geometry type
 */
const getDefaultColorByGeometry = (geometryType: string): string => {
  switch (geometryType) {
    case 'Point':
      return '#3b82f6'; // blue-500
    case 'LineString':
      return '#ef4444'; // red-500
    case 'Polygon':
      return '#10b981'; // green-500
    default:
      return '#6b7280'; // gray-500
  }
};

// Cache for resolved icon URLs (UUID -> resolved URL)
const resolvedIconCache = new Map<string, string>();

/**
 * Pre-resolve all icon URLs from icon mapping
 */
const preResolveIcons = async (data: any) => {
  if (!props.iconMapping || !data?.features) return;

  const mapping = props.iconMapping;
  const urlsToResolve = new Set<string>();

  // Collect all URLs that need resolution
  data.features.forEach((feature: any) => {
    if (!mapping.apply_to || mapping.apply_to.includes(feature.geometry.type)) {
      // Check feature override
      if (feature.id && mapping.feature_overrides?.[feature.id]) {
        const iconConfig = mapping.feature_overrides[feature.id];
        if (iconConfig && isValidIconConfig(iconConfig)) {
          const url =
            typeof iconConfig === 'string' ? iconConfig : iconConfig?.url || '';
          if (
            url &&
            !url.startsWith('http://') &&
            !url.startsWith('https://')
          ) {
            urlsToResolve.add(url);
          }
        }
      }

      // Check property-based mapping
      if (mapping.property && feature.properties) {
        const propertyValue = String(
          feature.properties[mapping.property] || ''
        );
        if (propertyValue && mapping.icons[propertyValue]) {
          const iconConfig = mapping.icons[propertyValue];
          if (isValidIconConfig(iconConfig)) {
            const url =
              typeof iconConfig === 'string' ? iconConfig : iconConfig.url;
            if (
              url &&
              !url.startsWith('http://') &&
              !url.startsWith('https://')
            ) {
              urlsToResolve.add(url);
            }
          }
        }
      }

      // Check default icon
      if (
        mapping.default_icon &&
        mapping.default_icon !== 'none' &&
        mapping.default_icon !== 'circle' &&
        mapping.default_icon !== 'marker'
      ) {
        if (
          !mapping.default_icon.startsWith('http://') &&
          !mapping.default_icon.startsWith('https://')
        ) {
          urlsToResolve.add(mapping.default_icon);
        }
      }
    }
  });

  // Resolve all URLs
  await Promise.all(
    Array.from(urlsToResolve).map(async (url) => {
      if (!resolvedIconCache.has(url)) {
        try {
          const resolved = await resolveIconUrl(url);
          if (resolved) {
            resolvedIconCache.set(url, resolved);
          } else {
            // Cache empty string to avoid retrying failed URLs
            resolvedIconCache.set(url, '');
            console.warn('Failed to resolve icon URL:', url);
          }
        } catch (error) {
          // Cache empty string to avoid retrying failed URLs
          resolvedIconCache.set(url, '');
          console.warn('Failed to resolve icon URL:', url, error);
        }
      }
    })
  );
};

/**
 * Get icon for a feature based on icon mapping (synchronous, uses pre-resolved cache)
 */
const getFeatureIcon = (feature: any): L.Icon | null => {
  if (!props.iconMapping) {
    return null; // Use default circle marker
  }

  const mapping = props.iconMapping;

  // 1. Check if icons apply to this geometry type
  if (mapping.apply_to && !mapping.apply_to.includes(feature.geometry.type)) {
    return null; // Icons don't apply to this geometry type
  }

  // 2. Check feature-specific override first (highest priority)
  if (feature.id && mapping.feature_overrides?.[feature.id]) {
    const iconConfig = mapping.feature_overrides[feature.id];
    if (iconConfig && isValidIconConfig(iconConfig)) {
      const url = typeof iconConfig === 'string' ? iconConfig : iconConfig.url;
      const resolvedUrl = resolvedIconCache.get(url) || url;
      // Skip if URL resolution failed (empty string in cache)
      if (!resolvedUrl || resolvedUrl === '') {
        return null;
      }
      try {
        return createLeafletIconSync({
          ...(typeof iconConfig === 'object' ? iconConfig : {}),
          url: resolvedUrl,
        });
      } catch (error) {
        console.warn('Failed to create icon:', error);
        return null;
      }
    }
    return null;
  }

  // 3. Check property-based mapping
  if (mapping.property && feature.properties) {
    const propertyValue = String(feature.properties[mapping.property] || '');
    if (propertyValue && mapping.icons[propertyValue]) {
      const iconConfig = mapping.icons[propertyValue];
      if (isValidIconConfig(iconConfig)) {
        const url =
          typeof iconConfig === 'string' ? iconConfig : iconConfig.url;
        const resolvedUrl = resolvedIconCache.get(url) || url;
        // Skip if URL resolution failed (empty string in cache)
        if (!resolvedUrl || resolvedUrl === '') {
          return null;
        }
        try {
          return createLeafletIconSync({
            ...(typeof iconConfig === 'object' ? iconConfig : {}),
            url: resolvedUrl,
          });
        } catch (error) {
          console.error('Failed to create icon:', error);
          return null;
        }
      }
      return null;
    }
  }

  // 4. Fall back to default icon
  if (mapping.default_icon && mapping.default_icon !== 'none') {
    if (
      mapping.default_icon === 'circle' ||
      mapping.default_icon === 'marker'
    ) {
      return null; // Use default circle marker
    }
    // If default_icon is a URL, create icon from it
    const resolvedUrl =
      resolvedIconCache.get(mapping.default_icon) || mapping.default_icon;
    try {
      return createLeafletIconSync({ url: resolvedUrl });
    } catch (error) {
      console.error('Failed to create default icon:', error);
      return null;
    }
  }

  return null; // Use default circle marker
};

/**
 * Check if an IconConfig has a valid URL
 */
const isValidIconConfig = (config: IconConfig | undefined | null): boolean => {
  if (!config) return false;
  const url = typeof config === 'string' ? config : config.url;
  return !!url && typeof url === 'string' && url.trim().length > 0;
};

/**
 * Create a Leaflet icon from IconConfig (synchronous version using pre-resolved URLs)
 */
const createLeafletIconSync = (config: IconConfig): L.Icon => {
  // Validate URL before creating icon
  if (
    !config.url ||
    typeof config.url !== 'string' ||
    config.url.trim().length === 0
  ) {
    throw new Error('iconUrl not set in Icon options');
  }

  const iconOptions: L.IconOptions = {
    iconUrl: config.url, // URL should already be resolved
    iconSize: config.size ? [config.size[0], config.size[1]] : [32, 32],
    iconAnchor: config.anchor ? [config.anchor[0], config.anchor[1]] : [16, 32],
    popupAnchor: config.popupAnchor
      ? [config.popupAnchor[0], config.popupAnchor[1]]
      : [0, -32],
  };

  if (config.shadowUrl) {
    const resolvedShadowUrl =
      resolvedIconCache.get(config.shadowUrl) || config.shadowUrl;
    iconOptions.shadowUrl = resolvedShadowUrl;
    iconOptions.shadowSize = config.shadowSize
      ? [config.shadowSize[0], config.shadowSize[1]]
      : undefined;
    iconOptions.shadowAnchor = config.shadowAnchor
      ? [config.shadowAnchor[0], config.shadowAnchor[1]]
      : undefined;
  }

  return L.icon(iconOptions);
};

/**
 * Darken a color by a percentage (simple darkening for borders)
 */
const darkenColor = (color: string, amount: number): string => {
  // Simple hex color darkening
  if (color.startsWith('#')) {
    const hex = color.slice(1);
    const num = parseInt(hex, 16);
    const r = Math.max(0, Math.floor((num >> 16) * (1 - amount)));
    const g = Math.max(0, Math.floor(((num >> 8) & 0x00ff) * (1 - amount)));
    const b = Math.max(0, Math.floor((num & 0x0000ff) * (1 - amount)));
    return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
  }
  // Fallback for non-hex colors
  return '#1e40af';
};

const initializeMap = async () => {
  if (!mapContainer.value) return;

  // Create map
  const scrollWheelZoomEnabled =
    props.scrollWheelZoom !== undefined
      ? props.scrollWheelZoom
      : props.interactive;

  map = L.map(mapContainer.value, {
    zoomControl: props.interactive,
    dragging: props.interactive,
    touchZoom: props.interactive,
    doubleClickZoom: props.interactive,
    scrollWheelZoom: scrollWheelZoomEnabled,
    boxZoom: props.interactive,
    keyboard: props.interactive,
  });

  // Add tile layer
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution:
      '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19,
  }).addTo(map);

  // Set initial view
  if (props.bounds) {
    const bounds = L.latLngBounds(
      [props.bounds.minLat, props.bounds.minLon],
      [props.bounds.maxLat, props.bounds.maxLon]
    );
    map.fitBounds(bounds, { padding: [20, 20] });
  } else {
    map.setView([40.7128, -74.006], 10);
  }

  // Add geography data if provided
  if (props.geographyData) {
    addGeographyData(props.geographyData);
  }
};

const addGeographyData = async (data: any) => {
  if (!map) return;

  // Remove existing layer
  if (geoJsonLayer) {
    map.removeLayer(geoJsonLayer);
  }

  try {
    // Pre-resolve all icon URLs before creating the layer
    await preResolveIcons(data);

    // Parse and add GeoJSON data
    geoJsonLayer = L.geoJSON(data, {
      style: (feature: any) => {
        // Get color from mapping or use default
        const featureColor = getFeatureColor(feature);
        const geometryType = feature?.geometry?.type;

        // For Point features, styling is handled by pointToLayer
        if (geometryType === 'Point') {
          return {};
        }

        // For LineString and Polygon, apply colors
        switch (geometryType) {
          case 'LineString':
            return {
              color: featureColor,
              weight: 3,
              opacity: 0.8,
            };
          case 'Polygon':
            return {
              color: featureColor,
              weight: 2,
              opacity: 0.8,
              fillColor: featureColor,
              fillOpacity: 0.3,
            };
          default:
            return {
              color: featureColor,
              weight: 2,
              opacity: 0.8,
              fillOpacity: 0.3,
            };
        }
      },
      pointToLayer: (feature, latlng) => {
        try {
          // Check if custom icon is available (now synchronous)
          const customIcon = getFeatureIcon(feature);
          if (customIcon) {
            return L.marker(latlng, { icon: customIcon });
          }
        } catch (error) {
          // If icon creation fails, fall back to circle marker
          console.warn(
            'Failed to create custom icon, using default marker:',
            error
          );
        }

        // Use circle marker with custom color
        const featureColor = getFeatureColor(feature);
        // Darken color for border (simple darkening)
        const borderColor = darkenColor(featureColor, 0.2);

        return L.circleMarker(latlng, {
          radius: 8,
          fillColor: featureColor,
          color: borderColor,
          weight: 2,
          opacity: 1,
          fillOpacity: 0.8,
        });
      },
      onEachFeature: (feature, layer) => {
        // Add popup with feature properties
        if (feature.properties) {
          const popupContent = Object.entries(feature.properties)
            .map(([key, value]) => `<strong>${key}:</strong> ${value}`)
            .join('<br>');

          layer.bindPopup(popupContent);
        }
      },
    });

    geoJsonLayer.addTo(map);

    // Fit map to the data bounds
    if (geoJsonLayer.getBounds().isValid()) {
      map.fitBounds(geoJsonLayer.getBounds(), { padding: [20, 20] });
    }
  } catch (error) {
    console.error('Error adding geography data to map:', error);
  }
};

const updateMap = async () => {
  if (props.geographyData) {
    await addGeographyData(props.geographyData);
  }
};

// Watch for changes in geography data, color mapping, and icon mapping
watch(() => props.geographyData, updateMap, { deep: true });
watch(() => props.colorMapping, updateMap, { deep: true });
watch(() => props.iconMapping, updateMap, { deep: true });

// Watch for changes in bounds
watch(
  () => props.bounds,
  (newBounds) => {
    if (map && newBounds) {
      const bounds = L.latLngBounds(
        [newBounds.minLat, newBounds.minLon],
        [newBounds.maxLat, newBounds.maxLon]
      );
      map.fitBounds(bounds, { padding: [20, 20] });
    }
  }
);

onMounted(async () => {
  await nextTick();
  initializeMap();
});

onUnmounted(() => {
  try {
    // Remove GeoJSON layer first
    if (geoJsonLayer && map) {
      map.removeLayer(geoJsonLayer);
      geoJsonLayer = null;
    }
    // Remove map
    if (map) {
      map.remove();
      map = null;
    }
    // Clean up blob URLs
    blobUrlCache.forEach((url) => {
      window.URL.revokeObjectURL(url);
    });
    blobUrlCache.clear();
    resolvedIconCache.clear();
  } catch (error) {
    // Silently handle cleanup errors
    console.warn('Error during map cleanup:', error);
    map = null;
    geoJsonLayer = null;
  }
});

// Expose map instance for parent components
defineExpose({
  map: () => map,
  addGeographyData,
  fitBounds: (bounds: L.LatLngBounds) => {
    if (map) {
      map.fitBounds(bounds, { padding: [20, 20] });
    }
  },
});
</script>

<style scoped>
/* Ensure the map container takes full height */
.mapContainer {
  height: v-bind(height);
  min-height: 200px;
}
</style>
