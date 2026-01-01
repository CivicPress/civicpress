<template>
  <div class="flex items-center gap-2">
    <div
      class="w-2 h-2 rounded-full"
      :class="connectionClass"
      :title="connectionTitle"
    />
    <span v-if="showLabel" class="text-sm text-gray-600">{{
      connectionLabel
    }}</span>
  </div>
</template>

<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    connected: boolean;
    lastSeenAt?: string;
    showLabel?: boolean;
  }>(),
  {
    showLabel: false,
  }
);

const connectionClass = computed(() => {
  if (!props.connected) {
    return 'bg-gray-400';
  }

  // Check if last seen is recent (within 5 minutes)
  if (props.lastSeenAt) {
    const lastSeen = new Date(props.lastSeenAt);
    const now = new Date();
    const diffMinutes = (now.getTime() - lastSeen.getTime()) / 1000 / 60;

    if (diffMinutes > 5) {
      return 'bg-yellow-500 animate-pulse';
    }
  }

  return 'bg-green-500';
});

const connectionTitle = computed(() => {
  if (!props.connected) {
    return 'Disconnected';
  }

  if (props.lastSeenAt) {
    const lastSeen = new Date(props.lastSeenAt);
    const now = new Date();
    const diffMinutes = (now.getTime() - lastSeen.getTime()) / 1000 / 60;

    if (diffMinutes > 5) {
      return `Last seen ${Math.round(diffMinutes)} minutes ago`;
    }
  }

  return 'Connected';
});

const connectionLabel = computed(() => {
  if (!props.connected) {
    return 'Disconnected';
  }
  return 'Connected';
});
</script>
