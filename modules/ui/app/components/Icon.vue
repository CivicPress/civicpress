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

// Use computed to get the resolved icon name
const resolvedIconName = computed(() => getIcon(props.name));
</script>