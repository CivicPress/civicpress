export const useAttachmentTypes = () => {
  const attachmentTypes = ref<
    Array<{ label: string; value: string; description: string }>
  >([]);

  const fetchAttachmentTypes = async () => {
    try {
      const response = await useNuxtApp().$civicApi(
        '/api/v1/config/attachment-types'
      );
      if (response.success && response.data.types) {
        attachmentTypes.value = Object.entries(response.data.types).map(
          ([key, type]: [string, any]) => ({
            label: key.charAt(0).toUpperCase() + key.slice(1),
            value: type.value,
            description: type.description,
          })
        );
      }
    } catch (error) {
      console.error('Failed to fetch attachment types:', error);
      // Fallback to default types
      attachmentTypes.value = [
        {
          label: 'Reference',
          value: 'reference',
          description: 'Reference documents and materials',
        },
        {
          label: 'Supporting',
          value: 'supporting',
          description: 'Supporting evidence and documentation',
        },
        {
          label: 'Evidence',
          value: 'evidence',
          description: 'Legal or procedural evidence',
        },
        {
          label: 'Correspondence',
          value: 'correspondence',
          description: 'Letters, emails, and communications',
        },
        {
          label: 'Legal',
          value: 'legal',
          description: 'Legal documents and contracts',
        },
        {
          label: 'Financial',
          value: 'financial',
          description: 'Financial reports and budgets',
        },
        {
          label: 'Technical',
          value: 'technical',
          description: 'Technical specifications and drawings',
        },
        {
          label: 'Media',
          value: 'media',
          description: 'Photos, videos, and media files',
        },
        {
          label: 'Archive',
          value: 'archive',
          description: 'Archived and historical documents',
        },
        {
          label: 'Other',
          value: 'other',
          description: 'Other miscellaneous attachments',
        },
      ];
    }
  };

  const getAttachmentTypeOptions = () => {
    return attachmentTypes.value;
  };

  const getAttachmentTypeLabel = (value: string) => {
    const type = attachmentTypes.value.find((t) => t.value === value);
    return type?.label || value;
  };

  return {
    attachmentTypes: readonly(attachmentTypes),
    fetchAttachmentTypes,
    getAttachmentTypeOptions,
    getAttachmentTypeLabel,
  };
};
