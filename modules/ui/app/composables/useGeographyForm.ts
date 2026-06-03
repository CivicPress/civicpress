import { ref, computed } from 'vue';
import { extractErrorMessage, type ApiResponse } from '~/utils/api-response';
import { useDebounceFn } from '@vueuse/core';
import {
  suggestPropertyName,
  extractPropertyValues,
  assignDefaultColors,
} from '~/utils/geography-colors';
import type {
  GeographyFormData,
  GeographyFormErrors,
  GeographyPreviewData,
  GeographyFile,
} from '~/types/geography';

interface GeographyFormProps {
  mode: 'create' | 'edit';
  geographyId?: string;
}

export interface UseGeographyFormDeps {
  props: GeographyFormProps;
  emit: (event: 'success' | 'cancel', ...args: unknown[]) => void;
  t: (key: string, params?: Record<string, unknown>) => string;
}

/**
 * Bundles GeographyForm state, action handlers, and computed helpers.
 * Extracted from GeographyForm.vue in Phase 2d (ui-013 W2-T15 decomposition).
 * Behaviour preserved byte-for-byte; closures over component-local state are
 * replaced with internal refs returned to the SFC.
 */
export function useGeographyForm(deps: UseGeographyFormDeps) {
  const { props, emit, t } = deps;
  const toast = useToast();

  // Form data
  const form = ref<GeographyFormData>({
    name: '',
    type: 'geojson',
    category: 'zone',
    description: '',
    content: '',
    srid: 4326,
    color_mapping: undefined,
    icon_mapping: undefined,
  });

  const formErrors = ref<GeographyFormErrors>({});
  const saving = ref(false);
  const loading = ref(false);

  // Presets
  const presets = ref<
    Array<{ key: string; name: string; description: string; type: string }>
  >([]);
  const selectedPreset = ref<string | null>(null);
  const presetOptions = computed(() => [
    {
      key: null,
      label: t('geography.presets.none'),
      name: t('geography.presets.none'),
      description: t('geography.presets.noPreset'),
    },
    ...presets.value.map((p) => ({
      key: p.key,
      label: p.name,
      name: p.name,
      description: p.description,
    })),
  ]);

  // Preview data
  const preview = ref<GeographyPreviewData>({
    parsed: null,
    validation: { valid: false, errors: [], warnings: [] },
    isLoading: false,
  });

  // Form options
  const categoryOptions = computed(() => [
    { label: t('geography.categories.zone'), value: 'zone' },
    { label: t('geography.categories.boundary'), value: 'boundary' },
    { label: t('geography.categories.district'), value: 'district' },
    { label: t('geography.categories.facility'), value: 'facility' },
    { label: t('geography.categories.route'), value: 'route' },
  ]);

  const typeOptions = computed(() => [
    { label: t('geography.types.geojson'), value: 'geojson' },
    { label: t('geography.types.kml'), value: 'kml' },
    { label: t('geography.types.gpx'), value: 'gpx' },
    { label: t('geography.types.shapefile'), value: 'shapefile' },
  ]);

  const geometryTypeOptions = computed(() => [
    { label: t('geography.geometryTypes.point'), value: 'Point' },
    { label: t('geography.geometryTypes.linestring'), value: 'LineString' },
    { label: t('geography.geometryTypes.polygon'), value: 'Polygon' },
    { label: t('geography.geometryTypes.multipoint'), value: 'MultiPoint' },
    {
      label: t('geography.geometryTypes.multilinestring'),
      value: 'MultiLineString',
    },
    { label: t('geography.geometryTypes.multipolygon'), value: 'MultiPolygon' },
  ]);

  // Computed properties
  const isFormValid = computed(() => {
    return (
      form.value.name &&
      form.value.category &&
      form.value.description &&
      form.value.content &&
      preview.value.validation.valid
    );
  });

  // Methods
  const loadGeographyFile = async () => {
    if (props.mode !== 'edit' || !props.geographyId) return;

    try {
      loading.value = true;
      const response = (await useNuxtApp().$civicApi(
        `/api/v1/geography/${props.geographyId}`
      )) as ApiResponse;

      if (response.success) {
        const geographyFile: GeographyFile = response.data;

        // Populate form with existing data
        form.value = {
          name: geographyFile.name,
          type: geographyFile.type,
          category: geographyFile.category,
          description: geographyFile.description,
          content: geographyFile.content || '',
          srid: geographyFile.srid,
          color_mapping: geographyFile.metadata?.color_mapping,
          icon_mapping: geographyFile.metadata?.icon_mapping,
        };

        // Trigger preview update
        if (form.value.content) {
          await onContentChange();
        }
      } else {
        throw new Error(extractErrorMessage(response) || 'Failed to load geography file');
      }
    } catch (error) {
      toast.add({
        title: 'Load Failed',
        description:
          error instanceof Error
            ? error.message
            : 'Failed to load geography file',
        color: 'error',
      });
      emit('cancel');
    } finally {
      loading.value = false;
    }
  };

  const onTypeChange = () => {
    // Clear content when type changes
    form.value.content = '';
    preview.value.parsed = null;
    preview.value.validation = { valid: false, errors: [], warnings: [] };
  };

  const onContentChange = useDebounceFn(async () => {
    if (!form.value.content || !form.value.type) {
      preview.value.parsed = null;
      preview.value.validation = { valid: false, errors: [], warnings: [] };
      return;
    }

    try {
      preview.value.isLoading = true;
      preview.value.error = undefined;

      // Validate content
      const response = (await useNuxtApp().$civicApi(
        '/api/v1/geography/validate',
        {
          method: 'POST',
          body: {
            content: form.value.content,
            type: form.value.type,
          },
        }
      )) as ApiResponse;

      if (response.success) {
        preview.value.validation = response.data;

        // If valid, parse the content for preview
        if (response.data.valid && response.data.metadata) {
          preview.value.parsed = {
            type: form.value.type,
            content: JSON.parse(form.value.content), // Assuming GeoJSON for now
            bounds: response.data.metadata.bounds,
            srid: response.data.metadata.srid,
            featureCount: response.data.metadata.featureCount,
            geometryTypes: response.data.metadata.geometryTypes,
          };
        } else {
          preview.value.parsed = null;
        }
      } else {
        throw new Error(extractErrorMessage(response) || 'Validation failed');
      }
    } catch (error) {
      preview.value.error =
        error instanceof Error ? error.message : 'Validation failed';
      preview.value.parsed = null;
      preview.value.validation = { valid: false, errors: [], warnings: [] };
    } finally {
      preview.value.isLoading = false;
    }
  }, 500);

  const clearContent = () => {
    form.value.content = '';
    preview.value.parsed = null;
    preview.value.validation = { valid: false, errors: [], warnings: [] };
  };

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(form.value.content);
      toast.add({
        title: 'Copied to Clipboard',
        description: 'Geography content has been copied to your clipboard.',
        color: 'primary',
      });
    } catch {
      toast.add({
        title: 'Copy Failed',
        description: 'Failed to copy content to clipboard.',
        color: 'error',
      });
    }
  };

  const handleSubmit = async () => {
    try {
      saving.value = true;
      formErrors.value = {};

      // Manual validation
      if (!form.value.name || form.value.name.trim().length < 1) {
        formErrors.value.name = t('geography.validation.nameRequired');
        return;
      }
      if (!form.value.type) {
        formErrors.value.type = t('geography.validation.typeRequired');
        return;
      }
      if (!form.value.category) {
        formErrors.value.category = t('geography.validation.categoryRequired');
        return;
      }
      if (!form.value.description || form.value.description.trim().length < 1) {
        formErrors.value.description = t(
          'geography.validation.descriptionRequired'
        );
        return;
      }
      if (!form.value.content || form.value.content.trim().length < 1) {
        formErrors.value.content = t('geography.validation.contentRequired');
        return;
      }
      if (!form.value.srid || form.value.srid < 1) {
        formErrors.value.srid = t('geography.validation.sridRequired');
        return;
      }

      const endpoint =
        props.mode === 'create'
          ? '/api/v1/geography'
          : `/api/v1/geography/${props.geographyId}`;

      const response = (await useNuxtApp().$civicApi(endpoint, {
        method: props.mode === 'create' ? 'POST' : 'PUT',
        body: {
          name: form.value.name,
          description: form.value.description,
          category: form.value.category,
          srid: form.value.srid || undefined,
          content: form.value.content,
          type: form.value.type,
          metadata: {
            color_mapping: form.value.color_mapping,
            icon_mapping: form.value.icon_mapping,
          },
        },
      })) as ApiResponse;

      if (response.success) {
        toast.add({
          title:
            props.mode === 'create'
              ? t('geography.geographyCreated')
              : t('geography.geographyUpdated'),
          description:
            props.mode === 'create'
              ? t('geography.successfullyCreated')
              : t('geography.successfullyUpdated'),
          color: 'primary',
        });

        emit('success', response.data);
      } else {
        throw new Error(
          extractErrorMessage(response) ||             (props.mode === 'create'
              ? t('geography.failedToCreate')
              : t('geography.failedToUpdate'))
        );
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes('validation')) {
        // Handle validation errors
        formErrors.value = { content: error.message };
      } else {
        toast.add({
          title:
            props.mode === 'create'
              ? t('geography.creationFailed')
              : t('geography.updateFailed'),
          description:
            error instanceof Error
              ? error.message
              : props.mode === 'create'
                ? t('geography.failedToCreate')
                : t('geography.failedToUpdate'),
          color: 'error',
        });
      }
    } finally {
      saving.value = false;
    }
  };

  const handleCancel = () => {
    emit('cancel');
  };

  interface BoundsObject {
    minLon: number;
    minLat: number;
    maxLon: number;
    maxLat: number;
  }
  const formatBounds = (bounds: BoundsObject): string => {
    return `${bounds.minLon.toFixed(4)}, ${bounds.minLat.toFixed(4)} ${t('geography.boundsTo')} ${bounds.maxLon.toFixed(4)}, ${bounds.maxLat.toFixed(4)}`;
  };

  // Color/Icon mapping helpers
  const colorPropertyValues = computed(() => {
    if (!form.value.color_mapping?.property || !preview.value.parsed?.content) {
      return [];
    }
    const geoJson = preview.value.parsed.content;
    if (!geoJson.features || !Array.isArray(geoJson.features)) {
      return [];
    }
    const values = new Set<string>();
    geoJson.features.forEach((feature: { properties?: Record<string, unknown> }) => {
      if (
        feature.properties &&
        feature.properties[form.value.color_mapping!.property!]
      ) {
        values.add(
          String(feature.properties[form.value.color_mapping!.property!])
        );
      }
    });
    return Array.from(values).sort();
  });

  const iconPropertyValues = computed(() => {
    if (!form.value.icon_mapping?.property || !preview.value.parsed?.content) {
      return [];
    }
    const geoJson = preview.value.parsed.content;
    if (!geoJson.features || !Array.isArray(geoJson.features)) {
      return [];
    }
    const values = new Set<string>();
    geoJson.features.forEach((feature: { properties?: Record<string, unknown> }) => {
      if (
        feature.properties &&
        feature.properties[form.value.icon_mapping!.property!]
      ) {
        values.add(
          String(feature.properties[form.value.icon_mapping!.property!])
        );
      }
    });
    return Array.from(values).sort();
  });

  const initializeColorMapping = () => {
    if (!preview.value.parsed?.content) return;

    const geoJson = preview.value.parsed.content;
    if (!geoJson.features || !Array.isArray(geoJson.features)) return;

    // Suggest property name
    const suggestedProperty = suggestPropertyName(geoJson);
    if (!suggestedProperty) {
      toast.add({
        title: 'No Properties Found',
        description: 'No properties found in GeoJSON features',
        color: 'primary',
      });
      return;
    }

    // Extract unique values
    const values = extractPropertyValues(geoJson, suggestedProperty);
    if (values.length === 0) {
      toast.add({
        title: 'No Values Found',
        description: `No values found for property "${suggestedProperty}"`,
        color: 'primary',
      });
      return;
    }

    // Assign default colors
    const colors = assignDefaultColors(values);

    form.value.color_mapping = {
      property: suggestedProperty,
      type: 'property',
      colors,
      default_color: '#6b7280',
    };
  };

  const initializeIconMapping = () => {
    if (!preview.value.parsed?.content) return;

    const geoJson = preview.value.parsed.content;
    if (!geoJson.features || !Array.isArray(geoJson.features)) return;

    // Suggest property name
    const suggestedProperty = suggestPropertyName(geoJson);
    if (!suggestedProperty) {
      toast.add({
        title: 'No Properties Found',
        description: 'No properties found in GeoJSON features',
        color: 'primary',
      });
      return;
    }

    // Extract unique values
    const values = extractPropertyValues(geoJson, suggestedProperty);
    if (values.length === 0) {
      toast.add({
        title: 'No Values Found',
        description: `No values found for property "${suggestedProperty}"`,
        color: 'primary',
      });
      return;
    }

    // Initialize icons with empty URLs
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const icons: Record<string, any> = {};
    values.forEach((value) => {
      icons[value] = {
        url: '',
        size: [32, 32],
        anchor: [16, 32],
      };
    });

    form.value.icon_mapping = {
      property: suggestedProperty,
      type: 'property',
      icons,
      default_icon: 'circle',
      apply_to: ['Point'],
    };
  };

  const updateColorMapping = () => {
    // Trigger reactivity update
    if (form.value.color_mapping) {
      form.value.color_mapping = { ...form.value.color_mapping };
    }
  };

  const updateIconMapping = () => {
    // Trigger reactivity update
    if (form.value.icon_mapping) {
      form.value.icon_mapping = { ...form.value.icon_mapping };
    }
  };

  // Preset management
  const loadPresets = async () => {
    try {
      const response = (await useNuxtApp().$civicApi(
        '/api/v1/geography/presets'
      )) as ApiResponse;
      if (response.success) {
        presets.value = response.data || [];
      }
    } catch (error) {
      console.error('Failed to load presets:', error);
    }
  };

  const onPresetSelected = () => {
    // Preset selection changed, but not applied yet
  };

  const applyPreset = async () => {
    if (!selectedPreset.value) return;

    try {
      const response = (await useNuxtApp().$civicApi(
        `/api/v1/geography/presets/${selectedPreset.value}/apply`,
        {
          method: 'POST',
          body: {
            color_mapping: form.value.color_mapping,
            icon_mapping: form.value.icon_mapping,
          },
        }
      )) as ApiResponse;

      if (response.success) {
        if (response.data.color_mapping) {
          form.value.color_mapping = response.data.color_mapping;
        }
        if (response.data.icon_mapping) {
          form.value.icon_mapping = response.data.icon_mapping;
        }
        toast.add({
          title: 'Preset Applied',
          description: 'Preset has been applied to your configuration',
          color: 'primary',
        });
      }
    } catch (error) {
      toast.add({
        title: 'Failed to Apply Preset',
        description: error instanceof Error ? error.message : 'Unknown error',
        color: 'error',
      });
    }
  };

  return {
    // State
    form,
    formErrors,
    saving,
    loading,
    preview,
    selectedPreset,
    presets,
    // Computed
    presetOptions,
    categoryOptions,
    typeOptions,
    geometryTypeOptions,
    isFormValid,
    colorPropertyValues,
    iconPropertyValues,
    // Methods
    loadGeographyFile,
    onTypeChange,
    onContentChange,
    clearContent,
    copyToClipboard,
    handleSubmit,
    handleCancel,
    formatBounds,
    initializeColorMapping,
    initializeIconMapping,
    updateColorMapping,
    updateIconMapping,
    loadPresets,
    onPresetSelected,
    applyPreset,
  };
}
