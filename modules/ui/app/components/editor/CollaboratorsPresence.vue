<script setup lang="ts">
/**
 * CollaboratorsPresence Component
 *
 * Displays avatars and names of users currently editing the same record.
 * Used in the EditorHeader to show real-time collaboration status.
 */

interface Collaborator {
  id: string;
  name: string;
  color: string;
}

interface Props {
  collaborators: Collaborator[];
  maxVisible?: number;
}

const props = withDefaults(defineProps<Props>(), {
  maxVisible: 5,
});

const { t } = useI18n();

// Split collaborators into visible and hidden
const visibleCollaborators = computed(() =>
  props.collaborators.slice(0, props.maxVisible)
);

const hiddenCount = computed(() =>
  Math.max(0, props.collaborators.length - props.maxVisible)
);

// Get initials from name
const getInitials = (name: string): string => {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0] || '';
  const last = parts[parts.length - 1] || '';
  if (parts.length === 1) {
    return first.charAt(0).toUpperCase();
  }
  return (first.charAt(0) + last.charAt(0)).toUpperCase();
};

// Get text color for contrast against background
const getTextColor = (bgColor: string): string => {
  // Simple contrast calculation
  const hex = bgColor.replace('#', '');
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5 ? '#000000' : '#ffffff';
};
</script>

<template>
  <div v-if="collaborators.length > 0" class="flex items-center gap-1">
    <!-- Visible collaborators -->
    <div class="flex -space-x-2">
      <div
        v-for="collaborator in visibleCollaborators"
        :key="collaborator.id"
        class="relative group"
      >
        <div
          class="w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium ring-2 ring-white dark:ring-gray-900 cursor-default transition-transform hover:scale-110 hover:z-10"
          :style="{
            backgroundColor: collaborator.color,
            color: getTextColor(collaborator.color),
          }"
          :title="collaborator.name"
        >
          {{ getInitials(collaborator.name) }}
        </div>

        <!-- Tooltip -->
        <div
          class="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-gray-900 dark:bg-gray-700 text-white text-xs rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-20"
        >
          {{ collaborator.name }}
          <div
            class="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900 dark:border-t-gray-700"
          />
        </div>
      </div>

      <!-- Hidden count -->
      <div
        v-if="hiddenCount > 0"
        class="w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 ring-2 ring-white dark:ring-gray-900"
        :title="`${hiddenCount} more`"
      >
        +{{ hiddenCount }}
      </div>
    </div>

    <!-- Editing label -->
    <span
      v-if="collaborators.length > 0"
      class="text-xs text-gray-500 dark:text-gray-400 ml-1"
    >
      {{
        collaborators.length === 1
          ? t('records.editor.oneEditing', {
              name: collaborators[0]?.name || 'Someone',
            })
          : t('records.editor.multipleEditing', { count: collaborators.length })
      }}
    </span>
  </div>
</template>
