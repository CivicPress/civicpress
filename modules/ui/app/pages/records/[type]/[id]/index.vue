<script setup lang="ts">
import { computed, ref } from 'vue';
import SystemFooter from '~/components/SystemFooter.vue';
import RecordHeaderInfo from './_components/RecordHeaderInfo.vue';
import RecordContentBody from './_components/RecordContentBody.vue';
import RecordDetailAccordion from './_components/RecordDetailAccordion.vue';
import TranscriptViewer from './_components/TranscriptViewer.vue';
import { useRecordDetail } from '~/composables/useRecordDetail';

// Route parameters
const route = useRoute();
const type = route.params.type as string;
const id = route.params.id as string;

// i18n
const { t } = useI18n();

// Template ref to markdown container (forwarded into composable so it can
// rewrite links / handle clicks against the rendered DOM).
const contentBodyRef = ref<InstanceType<typeof RecordContentBody> | null>(null);
const markdownContainer = computed<HTMLElement | null>(
  () => contentBodyRef.value?.markdownContainer ?? null
);

// State + handlers extracted to composable in Phase 2d (W2-T17 decomposition).
const {
  record,
  loading,
  error,
  authStore,
  renderedContent,
  statusDisplay,
  statusHistory,
  canEditRecords,
  breadcrumbItems,
  detailAccordionItems,
  additionalMetadata,
  formatDate,
  getTypeIcon,
  getMetadataFieldLabel,
  fetchRecord,
  goBack,
  handleStatusChanged,
  handleContentClick,
  downloadFile,
} = useRecordDetail({
  type,
  id,
  markdownContainer,
  t,
});

// BroadcastBox session media: the transcript artifact URL + its verification label
// (top-level frontmatter on a `session` record: `media.transcript`, `transcript_status`).
type SessionMediaMetadata = {
  media?: { transcript?: string };
  transcript_status?: string;
};
const sessionMetadata = computed(
  () => record.value?.metadata as SessionMediaMetadata | undefined
);
const transcriptSrc = computed(() => sessionMetadata.value?.media?.transcript);
const transcriptStatus = computed(
  () => sessionMetadata.value?.transcript_status
);
</script>

<template>
  <UDashboardPanel>
    <template #header>
      <UDashboardNavbar>
        <template #title>
          <h1 class="text-2xl font-semibold">
            {{ record?.id || t('records.record') }}
          </h1>
        </template>
        <template #description>
          {{
            record?.title
              ? t('records.viewRecordDetails', { title: record.title })
              : t('records.viewRecordDetailsDefault')
          }}
        </template>
        <template #right>
          <HeaderActions
            :actions="[
              {
                label: t('records.viewRaw'),
                icon: 'i-lucide-code',
                to: `/records/${type}/${id}/raw`,
                color: 'neutral',
                disabled: loading || !record,
              },
              {
                label: t('records.editRecord'),
                icon: 'i-lucide-edit',
                to: `/records/${type}/${id}/edit`,
                color: 'primary',
                show: canEditRecords,
                disabled: loading || !record,
              },
            ]"
          />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <UBreadcrumb :items="breadcrumbItems" />

      <!-- Loading State -->
      <div v-if="loading" class="flex justify-center items-center h-64">
        <div class="text-center">
          <UIcon
            name="i-lucide-loader-2"
            class="w-8 h-8 animate-spin text-gray-400 mx-auto mb-4"
          />
          <p class="text-gray-600">Loading record...</p>
        </div>
      </div>

      <!-- Error State -->
      <UAlert
        v-else-if="error"
        color="error"
        variant="soft"
        :title="error"
        icon="i-lucide-alert-circle"
        class="mb-4"
      >
        <template #footer>
          <UButton color="error" variant="soft" @click="fetchRecord">
            Try Again
          </UButton>
        </template>
      </UAlert>

      <!-- Record Content -->
      <div v-else-if="record" class="space-y-6">
        <RecordHeaderInfo
          :record="record"
          :status-display="statusDisplay"
          :format-date="formatDate"
          :get-type-icon="getTypeIcon"
        />

        <RecordContentBody
          ref="contentBodyRef"
          :content="record.content"
          :rendered-content="renderedContent"
          @content-click="handleContentClick"
        />

        <TranscriptViewer
          v-if="transcriptSrc"
          :src="transcriptSrc"
          :status="transcriptStatus"
        />

        <RecordDetailAccordion
          :record="record"
          :items="detailAccordionItems"
          :status-history="statusHistory"
          :additional-metadata="additionalMetadata"
          :can-change-status="authStore.hasPermission('records:status')"
          :get-metadata-field-label="getMetadataFieldLabel"
          @download="downloadFile"
          @status-changed="handleStatusChanged"
        />

        <SystemFooter v-if="record" />
      </div>

      <!-- No Record Found -->
      <div v-else class="flex justify-center items-center h-64">
        <div class="text-center">
          <UIcon
            name="i-lucide-file-x"
            class="w-12 h-12 text-gray-400 mx-auto mb-4"
          />
          <h3 class="text-lg font-medium mb-2">Record Not Found</h3>
          <p class="text-gray-600 dark:text-gray-400 mb-4">
            The record you're looking for doesn't exist or has been removed.
          </p>
          <UButton color="primary" variant="soft" @click="goBack">
            Back to Records
          </UButton>
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>
