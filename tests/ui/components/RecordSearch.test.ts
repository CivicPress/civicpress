import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { nextTick } from 'vue';

// Stub the composables RecordSearch pulls from `~/composables/...` so we
// don't trigger real network calls in onMounted.
vi.mock('~/composables/useRecordTypes', () => ({
  useRecordTypes: () => ({
    recordTypes: { value: [] },
    loading: { value: false },
    error: { value: null },
    fetchRecordTypes: vi.fn().mockResolvedValue(undefined),
    getRecordTypeIcon: () => 'i-lucide-file',
    getRecordTypeLabel: (type: string) => type,
    getRecordTypeOptions: () => [
      { label: 'Bylaw', value: 'bylaw', icon: 'i-lucide-file' },
    ],
  }),
}));

vi.mock('~/composables/useRecordStatuses', () => ({
  useRecordStatuses: () => ({
    recordStatuses: { value: [] },
    loading: { value: false },
    error: { value: null },
    fetchRecordStatuses: vi.fn().mockResolvedValue(undefined),
    getRecordStatusLabel: (status: string) => status,
    recordStatusOptions: () => [
      { label: 'Draft', value: 'draft' },
      { label: 'Published', value: 'published' },
    ],
  }),
}));

vi.mock('~/composables/useSearchSuggestions', () => ({
  useSearchSuggestions: () => ({
    suggestions: { value: [] },
    words: { value: [] },
    titles: { value: [] },
    isLoading: { value: false },
    error: { value: null },
    fetchSuggestions: vi.fn(),
    clearSuggestions: vi.fn(),
  }),
}));

import RecordSearch from '~/components/RecordSearch.vue';

// A UInput stub that exposes a real <input> with v-model wiring so tests
// can drive `setValue` / `trigger('input')` and slots render.
const UInputStub = {
  inheritAttrs: false,
  props: ['modelValue', 'placeholder', 'icon', 'ui'],
  emits: ['update:modelValue', 'focus', 'blur', 'keydown'],
  template: `
    <div class="uinput-stub" v-bind="$attrs">
      <input
        type="search"
        class="uinput-stub-input"
        :value="modelValue"
        :placeholder="placeholder"
        @input="$emit('update:modelValue', $event.target.value)"
        @focus="$emit('focus', $event)"
        @blur="$emit('blur', $event)"
        @keydown="$emit('keydown', $event)"
      />
      <slot name="trailing" />
    </div>
  `,
};

const UButtonStub = {
  inheritAttrs: false,
  emits: ['click'],
  template:
    '<button class="ubutton-stub" v-bind="$attrs" @click="$emit(\'click\')"><slot /></button>',
};

const mountOptions = {
  global: {
    stubs: {
      UInput: UInputStub,
      UButton: UButtonStub,
      USelectMenu: true,
      UIcon: true,
      UAlert: true,
    },
  },
};

describe('RecordSearch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // RecordSearch destructures getTypeLabel/getStatusLabel from
    // useRecordUtils. The default mock in tests/ui/setup.ts omits those
    // helpers, so extend it here to keep the watch handlers safe.
    (global as any).useRecordUtils = vi.fn(() => ({
      getTypeLabel: (t: string) => t,
      getStatusLabel: (s: string) => s,
      getStatusColor: () => 'primary',
      getStatusIcon: () => 'i-lucide-circle',
      formatDate: (d: string) => d,
      normalizeDateString: (d: string) => d,
    }));
    (global as any).useRecordsStore = vi.fn(() => ({
      records: [],
      facetCounts: { types: {}, statuses: {} },
      fetchRecords: vi.fn(),
    }));
  });

  it('emits "search" on every keystroke in the search input', async () => {
    const wrapper = mount(RecordSearch, { ...mountOptions });
    await nextTick();

    const input = wrapper.find('input[type="search"]');
    expect(input.exists()).toBe(true);

    await input.setValue('bylaw 2026');

    const emitted = wrapper.emitted('search');
    expect(emitted).toBeTruthy();
    // Last emit should be the latest value typed.
    expect(emitted!.at(-1)![0]).toBe('bylaw 2026');
  });

  it('emits "searchSubmit" on Enter key', async () => {
    const wrapper = mount(RecordSearch, { ...mountOptions });
    await nextTick();

    const input = wrapper.find('input[type="search"]');
    await input.setValue('parks');
    await input.trigger('keydown', { key: 'Enter' });

    const emitted = wrapper.emitted('searchSubmit');
    expect(emitted).toBeTruthy();
    expect(emitted!.at(-1)![0]).toBe('parks');
  });

  it('renders the clear button only when the query is non-empty', async () => {
    const wrapper = mount(RecordSearch, { ...mountOptions });
    await nextTick();

    // No query → no clear button
    expect(wrapper.find('[data-test="clear-search"]').exists()).toBe(false);

    // Type → clear button appears
    await wrapper.find('input[type="search"]').setValue('something');
    await nextTick();
    expect(wrapper.find('[data-test="clear-search"]').exists()).toBe(true);
  });

  it('clears the input when the clear button is clicked', async () => {
    const wrapper = mount(RecordSearch, {
      props: { initialFilters: { search: 'park bylaws' } },
      ...mountOptions,
    });
    // initialFilters.search is applied via the watch with immediate:true
    await nextTick();
    await flushPromises();

    const input = wrapper.find('input[type="search"]');
    expect((input.element as HTMLInputElement).value).toBe('park bylaws');

    const clear = wrapper.find('[data-test="clear-search"]');
    expect(clear.exists()).toBe(true);
    await clear.trigger('click');
    await nextTick();

    // After clearing, the input should be empty
    expect((input.element as HTMLInputElement).value).toBe('');

    // And the component should have emitted searchSubmit('') to reset
    const submits = wrapper.emitted('searchSubmit');
    expect(submits).toBeTruthy();
    expect(submits!.at(-1)![0]).toBe('');
  });

  it('initializes the input value from initialFilters.search', async () => {
    const wrapper = mount(RecordSearch, {
      props: { initialFilters: { search: 'preloaded query' } },
      ...mountOptions,
    });
    await nextTick();
    await flushPromises();

    const input = wrapper.find('input[type="search"]');
    expect((input.element as HTMLInputElement).value).toBe('preloaded query');
  });
});
