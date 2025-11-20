<script setup lang="ts">
interface Props {
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  showText?: boolean;
  variant?: 'icon' | 'full';
}

const props = withDefaults(defineProps<Props>(), {
  size: 'md',
  showText: false,
  variant: 'icon',
});

const sizeClasses = {
  sm: 'w-6 h-6',
  md: 'w-8 h-8',
  lg: 'w-12 h-12',
  xl: 'w-16 h-16',
  '2xl': 'w-24 h-24',
};

// Get organization info from the store or composable
const { $civicApi } = useNuxtApp();
const organizationInfo = ref<any>(null);

// Fetch organization info if not already available
const fetchOrgInfo = async () => {
  if (!organizationInfo.value) {
    try {
      const response = (await $civicApi('/api/v1/info')) as any;
      if (response?.success && response.organization) {
        organizationInfo.value = response.organization;
      }
    } catch (err) {
      console.error('Error fetching organization info for logo:', err);
      // Don't set organizationInfo to avoid repeated failed calls
    }
  }
};

const logoSrc = computed(() => {
  if (props.variant === 'full') {
    return '/logo-large.svg';
  }

  // Use configurable logo from organization config if available
  if (
    organizationInfo.value?.logo &&
    typeof organizationInfo.value.logo === 'string'
  ) {
    // Convert relative path to API endpoint
    const logoPath = organizationInfo.value.logo.trim();
    if (logoPath && logoPath.startsWith('brand-assets/')) {
      return `/brand-assets/${logoPath.replace('brand-assets/', '')}`;
    }
    if (logoPath) {
      return logoPath;
    }
  }

  // Fallback to default logo
  return '/logo.svg';
});

const organizationName = computed(() => {
  return 'CivicPress';
});

// Fetch org info on mount
onMounted(() => {
  fetchOrgInfo();
});
</script>

<template>
  <div class="flex items-center gap-2">
    <img
      :src="logoSrc"
      :class="sizeClasses[size]"
      alt="CivicPress Logo"
      class="flex-shrink-0 dark:invert"
    />
    <span
      v-if="showText"
      class="font-bold tracking-wide text-gray-900 dark:text-gray-100"
    >
      {{ organizationName }}
    </span>
  </div>
</template>
