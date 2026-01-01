<template>
  <UBadge
    :color="statusColor"
    :variant="statusVariant"
    :label="statusLabel"
    :icon="statusIcon"
  />
</template>

<script setup lang="ts">
import type { BroadcastSession } from '~/composables/useBroadcastBox';

const props = defineProps<{
  status: BroadcastSession['status'];
}>();

const statusConfig = computed(() => {
  switch (props.status) {
    case 'pending':
      return {
        color: 'primary' as const,
        variant: 'soft' as const,
        label: 'Pending',
        icon: 'i-lucide-clock',
      };
    case 'recording':
      return {
        color: 'error' as const,
        variant: 'solid' as const,
        label: 'Recording',
        icon: 'i-lucide-circle',
      };
    case 'stopping':
      return {
        color: 'neutral' as const,
        variant: 'soft' as const,
        label: 'Stopping',
        icon: 'i-lucide-square',
      };
    case 'encoding':
      return {
        color: 'primary' as const,
        variant: 'soft' as const,
        label: 'Encoding',
        icon: 'i-lucide-loader-2',
      };
    case 'uploading':
      return {
        color: 'primary' as const,
        variant: 'soft' as const,
        label: 'Uploading',
        icon: 'i-lucide-upload',
      };
    case 'complete':
      return {
        color: 'primary' as const,
        variant: 'solid' as const,
        label: 'Complete',
        icon: 'i-lucide-check-circle',
      };
    case 'failed':
      return {
        color: 'error' as const,
        variant: 'soft' as const,
        label: 'Failed',
        icon: 'i-lucide-x-circle',
      };
    default:
      return {
        color: 'neutral' as const,
        variant: 'soft' as const,
        label: 'Unknown',
        icon: 'i-lucide-help-circle',
      };
  }
});

const statusColor = computed(() => statusConfig.value.color);
const statusVariant = computed(() => statusConfig.value.variant);
const statusLabel = computed(() => statusConfig.value.label);
const statusIcon = computed(() => statusConfig.value.icon);
</script>
