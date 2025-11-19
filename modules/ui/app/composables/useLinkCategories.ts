export const useLinkCategories = () => {
  const linkCategories = ref<
    Array<{ label: string; value: string; description: string }>
  >([]);

  const fetchLinkCategories = async () => {
    try {
      const response = (await useNuxtApp().$civicApi(
        '/api/v1/config/link-categories'
      )) as any;
      if (response.success && response.data.categories) {
        linkCategories.value = Object.entries(response.data.categories).map(
          ([key, category]: [string, any]) => ({
            label:
              key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, ' '),
            value: category.value,
            description: category.description,
          })
        );
      }
    } catch (error) {
      console.error('Failed to fetch link categories:', error);
      // Fallback to default categories
      linkCategories.value = [
        {
          label: 'Related',
          value: 'related',
          description: 'Generally related records',
        },
        {
          label: 'Supersedes',
          value: 'supersedes',
          description: 'This record supersedes the linked record',
        },
        {
          label: 'Superseded By',
          value: 'superseded_by',
          description: 'This record is superseded by the linked record',
        },
        {
          label: 'Amends',
          value: 'amends',
          description: 'This record amends the linked record',
        },
        {
          label: 'Amended By',
          value: 'amended_by',
          description: 'This record is amended by the linked record',
        },
        {
          label: 'References',
          value: 'references',
          description: 'This record references the linked record',
        },
        {
          label: 'Referenced By',
          value: 'referenced_by',
          description: 'This record is referenced by the linked record',
        },
        {
          label: 'Implements',
          value: 'implements',
          description: 'This record implements the linked record',
        },
        {
          label: 'Implemented By',
          value: 'implemented_by',
          description: 'This record is implemented by the linked record',
        },
        {
          label: 'Follows',
          value: 'follows',
          description: 'This record follows from the linked record',
        },
        {
          label: 'Precedes',
          value: 'precedes',
          description: 'This record precedes the linked record',
        },
        {
          label: 'Other',
          value: 'other',
          description: 'Other relationship type',
        },
      ];
    }
  };

  const getLinkCategoryOptions = () => {
    return linkCategories.value;
  };

  const getLinkCategoryLabel = (value: string) => {
    const category = linkCategories.value.find((c) => c.value === value);
    return category?.label || value;
  };

  return {
    linkCategories: readonly(linkCategories),
    fetchLinkCategories,
    getLinkCategoryOptions,
    getLinkCategoryLabel,
  };
};
