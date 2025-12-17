import { ref } from 'vue';

/**
 * Template interface matching API response
 */
export interface Template {
  id: string;
  type: string;
  name: string;
  description?: string;
  extends?: string;
  content: string;
  rawContent: string;
  validation?: {
    required_fields?: string[];
    status_values?: string[];
    business_rules?: string[];
    sections?: any[];
    advanced_rules?: any[];
    field_relationships?: any[];
    custom_validators?: any[];
  };
  sections?: any[];
  variables?: Array<{
    name: string;
    type: 'static' | 'dynamic' | 'conditional';
    description?: string;
  }>;
  partials?: string[];
  metadata?: {
    created?: string;
    updated?: string;
    author?: string;
    version?: string;
  };
}

/**
 * Template list response from API
 */
interface TemplateListResponse {
  templates: Template[];
  total: number;
  page: number;
  limit: number;
}

/**
 * Template preview response from API
 */
interface TemplatePreviewResponse {
  rendered: string;
  variables: {
    used: string[];
    missing: string[];
    available: Array<{
      name: string;
      type: 'static' | 'dynamic' | 'conditional';
      description?: string;
    }>;
  };
}

/**
 * Composable for template operations
 */
export function useTemplates() {
  const { $civicApi } = useNuxtApp();

  const templates = ref<Template[]>([]);
  const loading = ref(false);
  const error = ref<string | null>(null);
  const currentTemplate = ref<Template | null>(null);

  /**
   * Fetch templates from API
   */
  const fetchTemplates = async (options?: {
    type?: string;
    search?: string;
    include?: ('metadata' | 'validation' | 'variables')[];
    page?: number;
    limit?: number;
  }) => {
    loading.value = true;
    error.value = null;

    try {
      const params = new URLSearchParams();
      if (options?.type) params.set('type', options.type);
      if (options?.search) params.set('search', options.search);
      if (options?.include) {
        options.include.forEach((inc) => params.append('include', inc));
      }
      if (options?.page) params.set('page', String(options.page));
      if (options?.limit) params.set('limit', String(options.limit));

      const url = `/api/v1/templates${params.toString() ? `?${params.toString()}` : ''}`;
      const response = (await $civicApi(url)) as {
        success: boolean;
        data: TemplateListResponse;
      };

      if (response.success && response.data) {
        templates.value = response.data.templates;
        return response.data;
      } else {
        throw new Error('Invalid response from API');
      }
    } catch (err: any) {
      const errorMessage =
        err?.data?.error?.message ||
        err?.message ||
        'Failed to fetch templates';
      error.value = errorMessage;
      templates.value = [];
      throw err;
    } finally {
      loading.value = false;
    }
  };

  /**
   * Fetch a specific template by ID
   */
  const fetchTemplate = async (templateId: string) => {
    loading.value = true;
    error.value = null;

    try {
      // URL-encode the template ID to handle slashes (e.g., "bylaw/default")
      const encodedId = encodeURIComponent(templateId);
      const response = (await $civicApi(`/api/v1/templates/${encodedId}`)) as {
        success: boolean;
        data: { template: Template };
      };

      if (response.success && response.data?.template) {
        currentTemplate.value = response.data.template;
        return response.data.template;
      } else {
        throw new Error('Template not found');
      }
    } catch (err: any) {
      const errorMessage =
        err?.data?.error?.message || err?.message || 'Failed to fetch template';
      error.value = errorMessage;
      currentTemplate.value = null;
      throw err;
    } finally {
      loading.value = false;
    }
  };

  /**
   * Preview template with variables
   */
  const previewTemplate = async (
    templateId: string,
    variables: Record<string, any>
  ) => {
    loading.value = true;
    error.value = null;

    try {
      // URL-encode the template ID to handle slashes (e.g., "bylaw/default")
      const encodedId = encodeURIComponent(templateId);
      const response = (await $civicApi(
        `/api/v1/templates/${encodedId}/preview`,
        {
          method: 'POST',
          body: { variables },
        }
      )) as {
        success: boolean;
        data: TemplatePreviewResponse;
      };

      if (response.success && response.data) {
        return response.data;
      } else {
        throw new Error('Failed to preview template');
      }
    } catch (err: any) {
      const errorMessage =
        err?.data?.error?.message ||
        err?.message ||
        'Failed to preview template';
      error.value = errorMessage;
      throw err;
    } finally {
      loading.value = false;
    }
  };

  /**
   * Get templates for a specific record type (synchronous wrapper for backward compatibility)
   * Note: This returns an empty array immediately. Use fetchTemplates() for async operations.
   */
  const getTemplatesForType = (recordType: string): Template[] => {
    // Return cached templates if available for this type
    return templates.value.filter((t) => t.type === recordType);
  };

  /**
   * Get a specific template by ID (synchronous wrapper for backward compatibility)
   * Note: This returns null immediately. Use fetchTemplate() for async operations.
   */
  const getTemplateById = (templateId: string): Template | null => {
    // Return cached template if available
    return (
      templates.value.find((t) => t.id === templateId) ||
      (currentTemplate.value?.id === templateId ? currentTemplate.value : null)
    );
  };

  /**
   * Process template content with variables (client-side fallback)
   * Note: For better results, use previewTemplate API endpoint
   */
  const processTemplate = (
    template: Template,
    variables: Record<string, string>
  ): string => {
    let processedContent = template.content;

    // Replace variables in the template
    for (const [key, value] of Object.entries(variables)) {
      const placeholder = `{{${key}}}`;
      processedContent = processedContent.replace(
        new RegExp(placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'),
        value
      );
    }

    return processedContent;
  };

  /**
   * Get template options for select menu
   */
  const getTemplateOptions = async (recordType: string) => {
    try {
      const result = await fetchTemplates({ type: recordType });
      return result.templates.map((template) => ({
        label: template.name || template.id,
        value: template.id,
        description: template.description,
        icon: 'i-lucide-file-text',
      }));
    } catch {
      return [];
    }
  };

  /**
   * Clear templates cache
   */
  const clearTemplates = () => {
    templates.value = [];
    currentTemplate.value = null;
    error.value = null;
  };

  return {
    templates,
    currentTemplate,
    loading,
    error,
    fetchTemplates,
    fetchTemplate,
    previewTemplate,
    getTemplatesForType,
    getTemplateById,
    processTemplate,
    getTemplateOptions,
    clearTemplates,
  };
}
