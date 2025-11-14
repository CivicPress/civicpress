<template>
  <div ref="mapContainer" class="w-full h-full rounded-lg"></div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, nextTick } from 'vue';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

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
}

const props = withDefaults(defineProps<Props>(), {
  height: '400px',
  interactive: true,
  scrollWheelZoom: undefined, // undefined means use interactive value
});

const mapContainer = ref<HTMLElement>();
let map: L.Map | null = null;
let geoJsonLayer: L.GeoJSON | null = null;

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

const addGeographyData = (data: any) => {
  if (!map) return;

  // Remove existing layer
  if (geoJsonLayer) {
    map.removeLayer(geoJsonLayer);
  }

  try {
    // Parse and add GeoJSON data
    geoJsonLayer = L.geoJSON(data, {
      style: (feature) => {
        // Style based on geometry type
        const geometryType = feature.geometry.type;

        switch (geometryType) {
          case 'Point':
            return {
              radius: 8,
              fillColor: '#3b82f6',
              color: '#1e40af',
              weight: 2,
              opacity: 1,
              fillOpacity: 0.8,
            };
          case 'LineString':
            return {
              color: '#ef4444',
              weight: 3,
              opacity: 0.8,
            };
          case 'Polygon':
            return {
              color: '#10b981',
              weight: 2,
              opacity: 0.8,
              fillColor: '#10b981',
              fillOpacity: 0.3,
            };
          default:
            return {
              color: '#6b7280',
              weight: 2,
              opacity: 0.8,
              fillOpacity: 0.3,
            };
        }
      },
      pointToLayer: (feature, latlng) => {
        // Custom marker for points
        return L.circleMarker(latlng, {
          radius: 8,
          fillColor: '#3b82f6',
          color: '#1e40af',
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

const updateMap = () => {
  if (props.geographyData) {
    addGeographyData(props.geographyData);
  }
};

// Watch for changes in geography data
watch(() => props.geographyData, updateMap, { deep: true });

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
  if (map) {
    map.remove();
    map = null;
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
