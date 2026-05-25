<script setup lang="ts">
interface MetadataEntry {
  key: string;
  value: unknown;
}

interface Props {
  additionalMetadata: MetadataEntry[];
  getMetadataFieldLabel: (key: string) => string;
}

defineProps<Props>();

const { t } = useI18n();
</script>

<template>
  <div v-if="additionalMetadata.length > 0">
    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div
        v-for="entry in additionalMetadata"
        :key="entry.key"
        class="space-y-1"
      >
        <dt
          class="text-sm font-medium text-gray-500 dark:text-gray-400 capitalize"
        >
          {{ getMetadataFieldLabel(entry.key) }}
        </dt>
        <dd class="text-sm">
          <template
            v-if="
              entry.key === 'attendees' &&
              Array.isArray(entry.value) &&
              entry.value.length
            "
          >
            <ul class="space-y-2">
              <li
                v-for="(attendee, attendeeIndex) in (entry.value as any[])"
                :key="attendeeIndex"
                class="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm"
              >
                <span class="font-medium">
                  {{ attendee.name || t('records.unknownAttendee') }}
                </span>
                <span
                  v-if="attendee.role"
                  class="text-gray-500 dark:text-gray-400"
                >
                  {{ attendee.role }}
                </span>
                <UBadge
                  v-if="attendee.status"
                  color="neutral"
                  variant="soft"
                  size="xs"
                >
                  {{ attendee.status }}
                </UBadge>
              </li>
            </ul>
          </template>
          <span v-else-if="typeof entry.value === 'string'">{{
            entry.value
          }}</span>
          <span
            v-else
            class="font-mono text-xs bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded"
          >
            {{ JSON.stringify(entry.value) }}
          </span>
        </dd>
      </div>
    </div>
  </div>
  <div v-else class="text-gray-500 dark:text-gray-400 italic">
    {{ t('records.noAdditionalMetadataAvailable') }}
  </div>
</template>
