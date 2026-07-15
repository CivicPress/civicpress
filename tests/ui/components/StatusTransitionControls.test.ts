import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { nextTick } from 'vue';
import StatusTransitionControls from '~/components/StatusTransitionControls.vue';

// UTimeline renders its `default` slot once per item. Our stub mimics
// that contract so the transition buttons inside the slot actually
// render and can be queried by tests.
const UTimelineStub = {
  inheritAttrs: false,
  props: ['items', 'orientation', 'color', 'size', 'defaultValue'],
  template: `
    <div class="utimeline-stub">
      <div
        v-for="item in (items || [])"
        :key="item.value"
        class="utimeline-item-stub"
      >
        <slot :item="item" />
      </div>
    </div>
  `,
};

const UButtonStub = {
  inheritAttrs: false,
  props: ['disabled'],
  emits: ['click'],
  template: `
    <button
      class="ubutton-stub"
      v-bind="$attrs"
      :disabled="disabled"
      @click="$emit('click')"
    >
      <slot />
    </button>
  `,
};

const UBadgeStub = {
  inheritAttrs: false,
  template: '<span class="ubadge-stub" v-bind="$attrs"><slot /></span>',
};

const UModalStub = {
  inheritAttrs: false,
  props: ['open', 'title', 'description'],
  emits: ['update:open'],
  template: `
    <div v-if="open" class="umodal-stub" v-bind="$attrs">
      <slot name="body" />
      <slot name="footer" :close="() => $emit('update:open', false)" />
    </div>
  `,
};

const mountOptions = {
  global: {
    stubs: {
      UTimeline: UTimelineStub,
      UButton: UButtonStub,
      UBadge: UBadgeStub,
      UIcon: true,
      UAlert: true,
      UModal: UModalStub,
    },
  },
};

describe('StatusTransitionControls', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: fetch returns no allowed-targets override → fall back to
    // recordStatusOptions(). Override per-test as needed.
    (global as any).useNuxtApp = vi.fn(() => ({
      $civicApi: vi.fn().mockResolvedValue({
        success: true,
        data: { transitions: ['published', 'archived'] },
      }),
    }));
    (global as any).useRecordStatuses = vi.fn(() => ({
      recordStatusOptions: () => [
        { label: 'Draft', value: 'draft' },
        { label: 'Published', value: 'published' },
        { label: 'Archived', value: 'archived' },
      ],
      fetchRecordStatuses: vi.fn().mockResolvedValue(undefined),
      // Vue templates auto-unwrap refs but NOT plain `{value}` objects.
      // Returning a bare false here gives the template the boolean it
      // expects (`v-if="statusesLoading"` is then correctly false).
      loading: false,
      error: null,
    }));
    (global as any).useRecordUtils = vi.fn(() => ({
      getStatusColor: () => 'primary',
      getStatusLabel: (s: string) => s.charAt(0).toUpperCase() + s.slice(1),
      getStatusIcon: () => 'i-lucide-circle',
      formatDate: (d: string) => d,
    }));
  });

  it('shows the "no permission" message when userCanChangeStatus is false', async () => {
    const wrapper = mount(StatusTransitionControls, {
      props: {
        recordId: 'rec-1',
        currentStatus: 'draft',
        userCanChangeStatus: false,
      },
      ...mountOptions,
    });

    await flushPromises();

    expect(wrapper.find('[data-test="no-permission"]').exists()).toBe(true);
  });

  it('disables every transition button when userCanChangeStatus is false', async () => {
    const wrapper = mount(StatusTransitionControls, {
      props: {
        recordId: 'rec-1',
        currentStatus: 'draft',
        userCanChangeStatus: false,
      },
      ...mountOptions,
    });

    await flushPromises();

    // Every transition button rendered in the timeline must be disabled.
    const transitionButtons = wrapper.findAll(
      'button.ubutton-stub[data-test^="transition-button-"]'
    );
    expect(transitionButtons.length).toBeGreaterThan(0);
    transitionButtons.forEach((btn) => {
      expect((btn.element as HTMLButtonElement).disabled).toBe(true);
    });
  });

  it('renders enabled transition buttons for non-current statuses when user has permission', async () => {
    const wrapper = mount(StatusTransitionControls, {
      props: {
        recordId: 'rec-1',
        currentStatus: 'draft',
        userCanChangeStatus: true,
      },
      ...mountOptions,
    });

    await flushPromises();

    // The "Published" transition block should exist & its button enabled.
    expect(wrapper.find('[data-test="transition-published"]').exists()).toBe(
      true
    );
    const publishBtn = wrapper.find(
      '[data-test="transition-button-published"]'
    );
    expect(publishBtn.exists()).toBe(true);
    expect((publishBtn.element as HTMLButtonElement).disabled).toBe(false);

    // No "no permission" message when the user CAN change status.
    expect(wrapper.find('[data-test="no-permission"]').exists()).toBe(false);
  });

  it('opens the confirmation modal with the target status when a transition button is clicked', async () => {
    const wrapper = mount(StatusTransitionControls, {
      props: {
        recordId: 'rec-1',
        currentStatus: 'draft',
        userCanChangeStatus: true,
      },
      ...mountOptions,
    });

    await flushPromises();

    // Modal not visible initially.
    expect(wrapper.find('.umodal-stub').exists()).toBe(false);

    // Click the "publish" transition button.
    await wrapper
      .find('[data-test="transition-button-published"]')
      .trigger('click');
    await nextTick();

    // Modal should now be open and reference "Published".
    const modal = wrapper.find('.umodal-stub');
    expect(modal.exists()).toBe(true);
    expect(modal.text()).toContain('Published');
  });

  it('emits "changed" with the new status after confirming a transition', async () => {
    const civicApi = vi.fn().mockResolvedValue({
      success: true,
      data: { record: { id: 'rec-1', status: 'published' } },
    });
    // First call (transitions fetch) and subsequent (status POST) both
    // go through the same $civicApi mock here.
    (global as any).useNuxtApp = vi.fn(() => ({ $civicApi: civicApi }));

    const wrapper = mount(StatusTransitionControls, {
      props: {
        recordId: 'rec-1',
        currentStatus: 'draft',
        userCanChangeStatus: true,
      },
      ...mountOptions,
    });

    await flushPromises();

    // Click transition button → opens modal
    await wrapper
      .find('[data-test="transition-button-published"]')
      .trigger('click');
    await nextTick();

    // Click "Confirm Change" in the modal footer (the second button)
    const modalButtons = wrapper.findAll('.umodal-stub button.ubutton-stub');
    expect(modalButtons.length).toBeGreaterThanOrEqual(2);
    const confirmBtn = modalButtons[modalButtons.length - 1];
    await confirmBtn.trigger('click');
    await flushPromises();

    const emitted = wrapper.emitted('changed');
    expect(emitted).toBeTruthy();
    expect(emitted![0][0]).toMatchObject({ newStatus: 'published' });
  });

  it('does not render a transition for the currentStatus (only non-current targets)', async () => {
    const wrapper = mount(StatusTransitionControls, {
      props: {
        recordId: 'rec-1',
        currentStatus: 'draft',
        userCanChangeStatus: true,
      },
      ...mountOptions,
    });

    await flushPromises();

    // 'draft' is currentStatus → should NOT have a transition block.
    expect(wrapper.find('[data-test="transition-draft"]').exists()).toBe(false);
    // But other statuses should.
    expect(wrapper.find('[data-test="transition-published"]').exists()).toBe(
      true
    );
  });
});
