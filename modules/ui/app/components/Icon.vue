<template>
  <UIcon :name="resolvedIconName" v-bind="$attrs" />
</template>

<script setup lang="ts">
import type { IconName } from '~/composables/useIcons';

interface Props {
  name: IconName;
  size?: string;
  class?: string;
}

const props = defineProps<Props>();

const { getIcon } = useIcons();

// Use a simple computed to avoid reactive loops
const resolvedIconName = computed(() => {
  return getIcon(props.name);
});
</script>