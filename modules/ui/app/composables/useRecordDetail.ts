import { ref, computed, onMounted, watch, nextTick, type Ref } from 'vue';
import type { CivicRecord } from '~/stores/records';
import { useAuthStore } from '~/stores/auth';

/**
 * Bundles state, fetch logic, link rewriting, and action handlers for the
 * record detail page. Extracted from `pages/records/[type]/[id]/index.vue`
 * in Phase 2d (W2-T17 decomposition). Behaviour preserved byte-for-byte.
 */
export interface UseRecordDetailDeps {
  type: string;
  id: string;
  markdownContainer: Ref<HTMLElement | null>;
  t: (key: string, params?: Record<string, unknown>) => string;
}

export function useRecordDetail(deps: UseRecordDetailDeps) {
  const { type, id, markdownContainer, t } = deps;

  const router = useRouter();
  const { renderMarkdown } = useMarkdown();

  const record = ref<CivicRecord | null>(null);
  const loading = ref(false);
  const error = ref('');

  const authStore = useAuthStore();

  const {
    formatDate,
    getStatusColor,
    getTypeIcon,
    getTypeLabel,
    getStatusLabel,
    getStatusIcon,
  } = useRecordUtils();

  // --- Link rewriting helpers ------------------------------------------------

  const isExternalLink = (href: string) => {
    return /^(https?:|mailto:|tel:)/i.test(href);
  };

  const normalizeRelativePath = (path: string): string => {
    const segments = path.split('/');
    const stack: string[] = [];

    segments.forEach((segment) => {
      if (segment === '..') {
        stack.pop();
      } else if (segment !== '.' && segment !== '') {
        stack.push(segment);
      }
    });

    return stack.join('/');
  };

  const resolveRecordLink = (
    href: string,
    currentRecordPath: string
  ): string | null => {
    if (!href.endsWith('.md')) {
      return null;
    }

    let normalizedCurrent = currentRecordPath.replace(/\\/g, '/');
    if (!normalizedCurrent.startsWith('records/')) {
      normalizedCurrent = `records/${normalizedCurrent.replace(/^\/+/, '')}`;
    }
    const currentDir = normalizedCurrent.includes('/')
      ? normalizedCurrent.substring(0, normalizedCurrent.lastIndexOf('/'))
      : normalizedCurrent;

    let combinedPath: string;
    if (href.startsWith('.')) {
      combinedPath = normalizeRelativePath(`${currentDir}/${href}`);
    } else if (href.includes('/')) {
      combinedPath = normalizeRelativePath(
        href.startsWith('records/') ? href : `${currentDir}/${href}`
      );
    } else {
      combinedPath = normalizeRelativePath(`${currentDir}/${href}`);
    }

    if (!combinedPath.startsWith('records/')) {
      return null;
    }

    const pathParts = combinedPath.split('/');
    if (pathParts.length < 3) {
      return null;
    }

    const linkType = pathParts[1];
    const filename = pathParts[pathParts.length - 1];
    if (!filename) {
      return null;
    }
    const recordId = filename.replace(/\.md$/i, '');

    if (!linkType || !recordId) {
      return null;
    }

    return `/records/${linkType}/${recordId}`;
  };

  const rewriteLinks = (
    root: Document | DocumentFragment | Element,
    currentRecordPath: string
  ) => {
    const anchors = root.querySelectorAll('a[href]');
    anchors.forEach((anchor) => {
      const href = anchor.getAttribute('href') || '';

      if (isExternalLink(href)) {
        return;
      }

      const resolved = resolveRecordLink(href, currentRecordPath);
      if (!resolved) {
        return;
      }

      anchor.setAttribute('href', resolved);
      anchor.setAttribute('data-record-link', 'true');
    });
  };

  const normalizeOrderedLists = (root: HTMLElement) => {
    const olElements = root.querySelectorAll('ol');
    olElements.forEach((ol) => {
      const items = Array.from(ol.children).filter(
        (child) => child.tagName === 'LI'
      );
      items.forEach((item) => {
        const li = item as HTMLElement;
        const rawSegments = li.innerHTML
          .split(/<br\s*\/?>/i)
          .map((segment) => segment.trim())
          .filter((segment): segment is string => segment.length > 0);

        if (rawSegments.length <= 1) {
          return;
        }

        li.innerHTML = rawSegments[0] ?? '';

        const parentStack: HTMLElement[] = [li];

        rawSegments.slice(1).forEach((segment) => {
          const match = segment.match(/^(\d+(?:\.\d+)*)(?:\.)?\s*(.*)$/);
          if (!match) {
            const wrapper = document.createElement('span');
            wrapper.innerHTML = segment;
            li.appendChild(document.createElement('br'));
            li.appendChild(wrapper);
            return;
          }

          const matchedNumber = match[1] ?? '';
          const matchedText = match[2] ?? '';
          const depth = matchedNumber.split('.').length;
          const contentText = matchedText.trim() || matchedNumber.trim();

          if (!contentText) {
            return;
          }

          while (parentStack.length >= depth) {
            parentStack.pop();
          }

          const currentParent = parentStack[parentStack.length - 1] ?? li;

          let nestedOl = currentParent.querySelector(':scope > ol');
          if (!nestedOl) {
            nestedOl = document.createElement('ol');
            currentParent.appendChild(nestedOl);
          }

          const newLi = document.createElement('li');
          newLi.innerHTML = contentText;
          nestedOl.appendChild(newLi);
          parentStack.push(newLi);
        });
      });
    });
  };

  const applyLinkTransformations = () => {
    if (!process.client) {
      return;
    }

    if (!record.value?.path) {
      return;
    }

    const container = markdownContainer.value;
    if (!container) {
      return;
    }

    rewriteLinks(container, record.value.path);
  };

  const renderedContent = computed(() => {
    if (!record.value?.content) {
      return '';
    }

    return renderMarkdown(record.value.content, {
      preserveLineBreaks: true,
    });
  });

  watch(
    () => renderedContent.value,
    () => {
      if (!process.client) {
        return;
      }
      nextTick(() => applyLinkTransformations());
    }
  );

  watch(
    () => record.value?.path,
    () => {
      if (!process.client) {
        return;
      }
      nextTick(() => applyLinkTransformations());
    }
  );

  const handleContentClick = (event: MouseEvent) => {
    if (!process.client) {
      return;
    }

    const target = event.target as Element | null;
    if (!target) {
      return;
    }

    const link = target.closest(
      'a[data-record-link="true"]'
    ) as HTMLAnchorElement | null;

    if (!link) {
      return;
    }

    const href = link.getAttribute('href');
    if (!href) {
      return;
    }

    event.preventDefault();
    router.push(href);
  };

  // --- Computed display state ------------------------------------------------

  const statusDisplay = computed(() =>
    record.value ? getStatusLabel(record.value.status) : ''
  );

  const statusHistory = computed(() => {
    const source =
      record.value?.metadata?.status_history ||
      record.value?.metadata?.statusHistory ||
      [];

    if (!Array.isArray(source)) {
      return [] as Array<{ status: string; user?: string; date?: string }>;
    }

    return source
      .map((entry: any) => ({
        status: entry?.status || entry?.value || entry?.name,
        user: entry?.user || entry?.by || entry?.actor || entry?.updated_by,
        date:
          entry?.date ||
          entry?.at ||
          entry?.timestamp ||
          entry?.updated_at ||
          entry?.created_at,
      }))
      .filter(
        (entry) => typeof entry.status === 'string' && entry.status.length > 0
      );
  });

  const canEditRecords = computed(() => {
    const userRole = authStore.currentUser?.role;
    return userRole === 'admin' || userRole === 'clerk';
  });

  const breadcrumbItems = computed(() => [
    {
      label: t('common.home'),
      to: '/',
    },
    {
      label: t('records.allRecords'),
      to: '/records',
    },
    {
      label: getTypeLabel(type),
      to: `/records/${type}`,
    },
    {
      label: record.value?.id || t('records.record'),
    },
  ]);

  const detailAccordionItems = computed(() => {
    const currentRecord = record.value;

    return [
      {
        label: t('records.linkedRecords.title'),
        value: 'linked-records',
        iconName: 'i-lucide-link-2',
        description: currentRecord?.linkedRecords?.length
          ? currentRecord.linkedRecords.length === 1
            ? `1 ${t('records.record').toLowerCase()}`
            : `${currentRecord.linkedRecords.length} ${t('records.records')}`
          : t('records.linkedRecords.noLinks'),
      },
      {
        label: t('records.fileAttachments'),
        value: 'attachments',
        iconName: 'i-lucide-paperclip',
        description: currentRecord?.attachedFiles?.length
          ? `${currentRecord.attachedFiles.length} ${t('records.files')}`
          : t('records.attachments.noAttachments'),
      },
      {
        label: t('records.statusTransitions'),
        value: 'status-transitions',
        iconName: getStatusIcon(record.value?.status || ''),
        description: getStatusLabel(record.value?.status || ''),
      },
      {
        label: t('records.linkedGeography'),
        value: 'linked-geography',
        iconName: 'i-lucide-map-pin',
        description: currentRecord?.linkedGeographyFiles?.length
          ? `${currentRecord.linkedGeographyFiles.length} ${t('records.items')}`
          : t('records.geography.noGeography'),
      },
      {
        label: t('records.additionalInformation'),
        value: 'additional-info',
        iconName: 'i-lucide-info',
        description:
          currentRecord?.metadata &&
          Object.keys(currentRecord.metadata).length > 0
            ? `${Object.keys(currentRecord.metadata).length} ${t('records.fields')}`
            : t('records.noAdditionalMetadata'),
      },
    ];
  });

  const additionalMetadata = computed(() => {
    const meta = record.value?.metadata;
    if (!meta) return [] as Array<{ key: string; value: unknown }>;

    const hiddenKeys = new Set(['metadata', 'file_path', 'extensions']);
    return Object.entries(meta)
      .filter(([key]) => !hiddenKeys.has(key))
      .map(([key, value]) => ({ key, value }));
  });

  const getMetadataFieldLabel = (key: string): string => {
    const translationKey = `records.metadataFields.${key}`;
    const translated = t(translationKey);
    if (translated && translated !== translationKey) {
      return translated;
    }
    return key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, ' ');
  };

  // --- Data fetch + actions --------------------------------------------------

  const fetchRecord = async () => {
    loading.value = true;
    error.value = '';

    try {
      // Direct API call for now to test
      const { $civicApi } = useNuxtApp();
      const response = (await $civicApi(`/api/v1/records/${id}`)) as any;

      if (response && response.success && response.data) {
        const apiRecord = response.data;

        // Extract content body from full markdown (remove YAML frontmatter)
        let contentBody = apiRecord.content || '';
        if (contentBody) {
          // Remove YAML frontmatter if present
          const frontmatterMatch = contentBody.match(
            /^---\s*\n([\s\S]*?)\n---\s*\n/
          );
          if (frontmatterMatch) {
            // Extract only the content after the frontmatter
            contentBody = contentBody
              .replace(/^---\s*\n[\s\S]*?\n---\s*\n/, '')
              .trim();
          }
        }

        // Transform API response to match CivicRecord interface
        record.value = {
          id: apiRecord.id,
          title: apiRecord.title,
          type: apiRecord.type,
          content: contentBody, // Use only the content body, not the full markdown
          status: apiRecord.status,
          path: apiRecord.path,
          author: apiRecord.author,
          created_at: apiRecord.created || apiRecord.created_at,
          updated_at: apiRecord.updated || apiRecord.updated_at,
          linkedGeographyFiles: apiRecord.linkedGeographyFiles || [],
          metadata: apiRecord.metadata || {},
          attachedFiles: apiRecord.attachedFiles || [],
          linkedRecords: apiRecord.linkedRecords || [],
          hasUnpublishedChanges: apiRecord.hasUnpublishedChanges || false,
        };
      } else {
        throw new Error(t('records.failedToLoadRecord'));
      }
    } catch (err: any) {
      error.value = err.message || t('records.failedToLoadRecord');
      console.error('Error fetching record:', err);
    } finally {
      loading.value = false;
    }
  };

  const goBack = () => {
    // Check if we can go back in browser history
    if (window.history.length > 1) {
      // Use router.back() to preserve the previous page state (filters, pagination, etc.)
      router.back();
    } else {
      // Fall back to navigating to the records list page
      router.push('/records');
    }
  };

  const handleStatusChanged = (payload: {
    newStatus: string;
    record?: any;
  }) => {
    if (record.value) {
      record.value.status = payload.newStatus as CivicRecord['status'];
    }
    useToast().add({
      title: t('records.statusUpdated'),
      description: t('records.statusChangedTo', { status: payload.newStatus }),
      color: 'primary',
    });
  };

  const downloadFile = async (fileId: string, fileName: string) => {
    if (!process.client) return;

    try {
      const config = useRuntimeConfig();
      const downloadAuthStore = useAuthStore();

      const response = await fetch(
        `${config.public.civicApiUrl}/api/v1/storage/files/${fileId}`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${downloadAuthStore.token}`,
          },
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      // Get the blob data
      const blob = await response.blob();

      // Create download link
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (downloadErr) {
      console.error('Download failed:', downloadErr);
      useToast().add({
        title: t('records.downloadFailed'),
        description: t('records.failedToDownloadFile'),
        color: 'error',
      });
    }
  };

  onMounted(() => {
    if (process.client) {
      nextTick(() => applyLinkTransformations());
    }
    fetchRecord();
  });

  return {
    // state
    record,
    loading,
    error,
    authStore,
    // computed display
    renderedContent,
    statusDisplay,
    statusHistory,
    canEditRecords,
    breadcrumbItems,
    detailAccordionItems,
    additionalMetadata,
    // utils
    formatDate,
    getStatusColor,
    getTypeIcon,
    getTypeLabel,
    getStatusLabel,
    getStatusIcon,
    getMetadataFieldLabel,
    // actions
    fetchRecord,
    goBack,
    handleStatusChanged,
    handleContentClick,
    downloadFile,
  };
}
