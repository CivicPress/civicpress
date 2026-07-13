<script setup lang="ts">
import type { CivicRecord } from '~/stores/records';
import GeographyLinkDisplay from '~/components/GeographyLinkDisplay.vue';
import LinkedRecordsPanel from './LinkedRecordsPanel.vue';
import AttachmentsPanel from './AttachmentsPanel.vue';
import AdditionalInfoPanel from './AdditionalInfoPanel.vue';

interface AccordionItem {
  label: string;
  value: string;
  iconName: string;
  description: string;
}

interface MetadataEntry {
  key: string;
  value: unknown;
}

interface StatusHistoryEntry {
  status: string;
  user?: string;
  date?: string;
}

interface Props {
  record: CivicRecord;
  items: AccordionItem[];
  statusHistory: StatusHistoryEntry[];
  additionalMetadata: MetadataEntry[];
  canChangeStatus: boolean;
  getMetadataFieldLabel: (key: string) => string;
}

defineProps<Props>();

defineEmits<{
  download: [fileId: string, fileName: string];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  statusChanged: [payload: { newStatus: string; record?: any }];
}>();
</script>

<template>
  <UAccordion
    :items="items"
    class="rounded-lg border border-gray-200 dark:border-gray-800"
    :ui="{
      item: 'border-b last:border-b-0',
      trigger: 'px-6 py-4 flex items-center gap-3 text-sm font-medium',
      content: 'px-6 pb-6 pt-0',
    }"
  >
    <template #default="{ item }">
      <div class="flex items-center gap-3">
        <UIcon :name="item.iconName" class="text-gray-500" />
        <div class="flex flex-col text-left">
          <span>{{ item.label }}</span>
          <span class="text-xs text-gray-500">
            {{ item.description }}
          </span>
        </div>
      </div>
    </template>

    <template #content="{ item }">
      <LinkedRecordsPanel
        v-if="item.value === 'linked-records'"
        :linked-records="record.linkedRecords"
      />

      <AttachmentsPanel
        v-else-if="item.value === 'attachments'"
        :attached-files="record.attachedFiles"
        :capture="(record.metadata as any)?.capture ?? (record as any).capture"
        @download="(id, name) => $emit('download', id, name)"
      />

      <div v-else-if="item.value === 'status-transitions'">
        <StatusTransitionControls
          v-if="record"
          :record-id="record.id"
          :current-status="record.status"
          :user-can-change-status="canChangeStatus"
          :status-history="statusHistory"
          @changed="(payload) => $emit('statusChanged', payload)"
        />
      </div>

      <div v-else-if="item.value === 'linked-geography'">
        <GeographyLinkDisplay
          :linked-geography-files="record.linkedGeographyFiles || []"
        />
      </div>

      <AdditionalInfoPanel
        v-else-if="item.value === 'additional-info'"
        :additional-metadata="additionalMetadata"
        :get-metadata-field-label="getMetadataFieldLabel"
      />
    </template>
  </UAccordion>
</template>
