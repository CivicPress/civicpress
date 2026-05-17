<template>
  <UBadge
    :color="statusColor"
    :variant="statusVariant"
    :label="statusLabel"
    :icon="statusIcon"
  />
</template>

<script setup lang="ts">
import type { BroadcastDevice } from '~/composables/useBroadcastBox';

const props = defineProps<{
  status: BroadcastDevice['status'];
}>();

const { t } = useI18n();

const statusConfig = computed(() => {
  switch (props.status) {
    case 'enrolled':
      return {
        color: 'primary' as const,
        variant: 'soft' as const,
        label: 'Enrolled',
        icon: 'i-lucide-user-check',
      };
    case 'active':
      return {
        color: 'primary' as const,
        variant: 'solid' as const,
        label: 'Active',
        icon: 'i-lucide-check-circle',
      };
    case 'suspended':
      return {
        color: 'neutral' as const,
        variant: 'soft' as const,
        label: 'Suspended',
        icon: 'i-lucide-pause-circle',
      };
    case 'revoked':
      return {
        color: 'error' as const,
        variant: 'soft' as const,
        label: 'Revoked',
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
