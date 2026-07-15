<script setup lang="ts">
import { ref, watch, onMounted } from 'vue';
import { useAuthStore } from '@/stores/auth';
import { parseWebVtt, type TranscriptCue } from '@/utils/media-preview';

interface Props {
  /** Transcript artifact URL (a session record's `media.transcript`), typically `/api/v1/storage/files/<uuid>`. */
  src: string;
  /** Verification label from `transcript_status` ('automated' | 'reviewed'). */
  status?: string;
}
const props = defineProps<Props>();

const { t } = useI18n();
const config = useRuntimeConfig();

const loading = ref(true);
const error = ref<string | null>(null);
const cues = ref<TranscriptCue[]>([]);

function resolveUrl(src: string): string {
  if (/^https?:\/\//.test(src)) return src;
  const base = (config.public.civicApiUrl as string) || '';
  return src.startsWith('/') ? `${base}${src}` : src;
}

async function load() {
  loading.value = true;
  error.value = null;
  cues.value = [];
  try {
    const authStore = useAuthStore();
    // Public records UI: only attach a token if we have one — public A/V and its
    // transcript are served via the storage public-folder bypass.
    const headers: Record<string, string> = {};
    if (authStore.token) headers.Authorization = `Bearer ${authStore.token}`;
    const res = await fetch(resolveUrl(props.src), { headers });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    cues.value = parseWebVtt(await res.text());
  } catch {
    error.value = t('records.transcript.loadError');
  } finally {
    loading.value = false;
  }
}

onMounted(load);
watch(() => props.src, load);
</script>

<template>
  <div class="border rounded-lg p-4 bg-gray-50 dark:bg-gray-800">
    <div class="flex items-center justify-between mb-3">
      <h3
        class="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2"
      >
        <UIcon name="i-lucide-captions" class="w-4 h-4" />
        {{ t('records.transcript.title') }}
      </h3>
      <span
        v-if="status"
        class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium"
        :class="
          status === 'reviewed'
            ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
            : 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200'
        "
      >
        {{
          status === 'reviewed'
            ? t('records.transcript.reviewed')
            : t('records.transcript.automated')
        }}
      </span>
    </div>

    <p
      v-if="status !== 'reviewed'"
      class="text-xs text-gray-500 dark:text-gray-400 mb-3"
    >
      {{ t('records.transcript.automatedNote') }}
    </p>

    <div v-if="loading" class="text-sm text-gray-500 dark:text-gray-400">
      {{ t('records.transcript.loading') }}
    </div>
    <UAlert
      v-else-if="error"
      color="error"
      variant="subtle"
      :title="error"
    />
    <div
      v-else-if="cues.length === 0"
      class="text-sm text-gray-500 dark:text-gray-400"
    >
      {{ t('records.transcript.empty') }}
    </div>
    <ol v-else class="space-y-2 max-h-96 overflow-y-auto pr-2 text-sm">
      <li
        v-for="(cue, i) in cues"
        :key="i"
        class="flex gap-3"
      >
        <span class="font-mono text-xs text-gray-400 shrink-0 pt-0.5">{{
          cue.start
        }}</span>
        <span class="text-gray-800 dark:text-gray-200">{{ cue.text }}</span>
      </li>
    </ol>
  </div>
</template>
