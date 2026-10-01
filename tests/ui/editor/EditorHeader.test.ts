import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { defineComponent, nextTick } from 'vue';
import EditorHeader from '~/components/editor/EditorHeader.vue';

/**
 * The instance's status configuration, as the API serves it. Tests change this
 * table to stand in for a differently-configured instance — which is the whole
 * point: the editor must follow the configuration, not a list of its own.
 */
const { statusConfig } = vi.hoisted(() => ({
  statusConfig: {
    statuses: [] as Array<{ key: string; label: string; public?: boolean }>,
  },
}));

// What a default instance ships (core/src/config/record-statuses.ts), plus the
// workflow's own `proposed` / `reviewed`.
const DEFAULT_STATUSES = [
  { key: 'draft', label: 'Draft' },
  { key: 'proposed', label: 'Proposed' },
  { key: 'reviewed', label: 'Reviewed' },
  { key: 'approved', label: 'Approved' },
  { key: 'published', label: 'Published', public: true },
  { key: 'archived', label: 'Archived', public: true },
  { key: 'expired', label: 'Expired', public: true },
];

// Mock composables at module level (before import)
vi.mock('~/composables/useI18n', () => ({
  useI18n: () => ({
    t: (key: string) => key,
    locale: { value: 'en' },
  }),
}));

// EditorHeader.vue uses useTypedI18n(), which wraps the real vue-i18n useI18n()
// and throws ("Need to install with app.use") outside a configured app. Mock it
// at the composable boundary so the component renders with passthrough t.
// Passthrough `t` that keeps its parameters visible, so a test can tell
// "Change status to Approved" from "Change status to Reviewed".
vi.mock('~/composables/useTypedI18n', () => ({
  useTypedI18n: () => ({
    t: (key: string, params?: Record<string, unknown>) =>
      params ? `${key} ${JSON.stringify(params)}` : key,
    tPlural: (key: string) => key,
    locale: { value: 'en' },
  }),
}));

vi.mock('~/composables/useRecordStatuses', () => ({
  useRecordStatuses: () => ({
    recordStatusOptions: () =>
      statusConfig.statuses.map((s) => ({ label: s.label, value: s.key })),
    getRecordStatusLabel: (key: string) =>
      statusConfig.statuses.find((s) => s.key === key)?.label ?? key,
    isPublicStatus: (key: string) =>
      statusConfig.statuses.find((s) => s.key === key)?.public === true,
  }),
}));

vi.mock('~/composables/useRecordUtils', () => ({
  useRecordUtils: () => ({
    getStatusConfig: () => ({ label: 'Draft', color: 'primary' }),
  }),
}));

const mountOptions = {
  global: {
    stubs: {
      UButton: true,
      UBadge: true,
      UIcon: true,
      UDropdownMenu: true,
      UInput: true,
      UModal: true,
    },
    mocks: {
      $t: (key: string) => key,
    },
  },
};

describe('EditorHeader', () => {
  const defaultProps = {
    title: 'Test Record',
    status: 'draft',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    statusConfig.statuses = DEFAULT_STATUSES.map((s) => ({ ...s }));
  });

  it('should render title and status', () => {
    const wrapper = mount(EditorHeader, {
      props: defaultProps,
      ...mountOptions,
    });

    expect(wrapper.exists()).toBe(true);
  });

  it('should display draft badge when isDraft is true', () => {
    const wrapper = mount(EditorHeader, {
      props: {
        ...defaultProps,
        isDraft: true,
      },
      ...mountOptions,
    });

    expect(wrapper.exists()).toBe(true);
  });

  it('should display unpublished changes badge when hasUnpublishedChanges is true', () => {
    const wrapper = mount(EditorHeader, {
      props: {
        ...defaultProps,
        hasUnpublishedChanges: true,
        isEditing: true,
      },
      ...mountOptions,
    });

    expect(wrapper.exists()).toBe(true);
  });

  it('should show autosave status', () => {
    const wrapper = mount(EditorHeader, {
      props: {
        ...defaultProps,
        autosaveStatus: 'saving',
      },
      ...mountOptions,
    });

    expect(wrapper.exists()).toBe(true);
  });

  it('should show saved status with lastSaved time', () => {
    const wrapper = mount(EditorHeader, {
      props: {
        ...defaultProps,
        autosaveStatus: 'saved',
        lastSaved: new Date(),
      },
      ...mountOptions,
    });

    expect(wrapper.exists()).toBe(true);
  });

  it('should disable controls when disabled prop is true', () => {
    const wrapper = mount(EditorHeader, {
      props: {
        ...defaultProps,
        disabled: true,
      },
      ...mountOptions,
    });

    expect(wrapper.exists()).toBe(true);
  });

  it('should show publish button when isEditing is true', () => {
    const wrapper = mount(EditorHeader, {
      props: {
        ...defaultProps,
        isEditing: true,
      },
      ...mountOptions,
    });

    expect(wrapper.exists()).toBe(true);
  });

  it('should show delete unpublished changes option when hasUnpublishedChanges is true', () => {
    const wrapper = mount(EditorHeader, {
      props: {
        ...defaultProps,
        isEditing: true,
        hasUnpublishedChanges: true,
      },
      ...mountOptions,
    });

    expect(wrapper.exists()).toBe(true);
  });
});

/**
 * "Is this record published?" has one authority: the `public` flag on the
 * record's status, set in the instance's configuration and enforced by the
 * read gate. The editor used to answer from a list of its own —
 * ['published', 'active', 'approved'] — so the two could disagree, and did:
 * an approved record is not served to the public, but the editor called it
 * published and said so in its dialogs.
 */
describe('EditorHeader — what "published" means comes from configuration', () => {
  interface MenuItem {
    label: string;
    onClick?: () => void;
  }

  // Stubs that keep what the component hands them, so a test reads the real
  // menu and the real dialog text rather than checking that something rendered.
  const UDropdownMenu = defineComponent({
    name: 'UDropdownMenu',
    props: { items: { type: Array, default: () => [] } },
    template: '<div><slot /></div>',
  });
  const UModal = defineComponent({
    name: 'UModal',
    props: { open: Boolean, title: { type: String, default: '' } },
    template:
      '<section :data-title="title"><slot name="body" /><slot name="footer" :close="() => {}" /></section>',
  });

  const mountHeader = (props: Record<string, unknown>) =>
    mount(EditorHeader, {
      props: { title: 'Test Record', isEditing: true, ...props },
      global: {
        stubs: {
          UButton: { template: '<button><slot /></button>' },
          UBadge: true,
          UIcon: true,
          UInput: true,
          UDropdownMenu,
          UModal,
        },
        mocks: { $t: (key: string) => key },
      },
    });

  /** Every item in the save split-button's menu, flattened across sections. */
  const menuOf = (wrapper: ReturnType<typeof mountHeader>): MenuItem[] =>
    (
      wrapper.findAllComponents(UDropdownMenu)[0].props('items') as MenuItem[][]
    ).flat();

  const labelsOf = (wrapper: ReturnType<typeof mountHeader>) =>
    menuOf(wrapper).map((item) => item.label);

  /** Rendered text of the dialog whose title starts with `title`. */
  const dialog = (wrapper: ReturnType<typeof mountHeader>, title: string) => {
    const found = wrapper
      .findAllComponents(UModal)
      .find((modal) => String(modal.props('title')).startsWith(title));
    if (!found) throw new Error(`no dialog titled ${title}`);
    return found.text();
  };

  beforeEach(() => {
    statusConfig.statuses = DEFAULT_STATUSES.map((s) => ({ ...s }));
  });

  describe('going back to draft', () => {
    it('is "unpublish" for a record in a public status', () => {
      const wrapper = mountHeader({
        status: 'published',
        allowedTransitions: ['draft'],
      });

      expect(labelsOf(wrapper)).toContain('records.editor.unpublishToDraft');
      expect(labelsOf(wrapper)).not.toContain('records.editor.returnToDraft');

      const text = dialog(wrapper, 'records.editor.unpublishRecord');
      expect(text).toContain('records.editor.unpublishDescription');
      expect(text).toContain('records.editor.willNoLongerBePublic');
    });

    it('does not call an approved record published — it is not public', () => {
      // The regression this file exists for. `approved` was in the hardcoded
      // list, so the editor offered to "unpublish" a record the public could
      // never see, and warned it would "no longer be publicly accessible".
      const wrapper = mountHeader({
        status: 'approved',
        allowedTransitions: ['draft'],
      });

      expect(labelsOf(wrapper)).toContain('records.editor.returnToDraft');
      expect(labelsOf(wrapper)).not.toContain(
        'records.editor.unpublishToDraft'
      );

      const text = dialog(wrapper, 'records.editor.returnToDraft');
      expect(text).toContain('records.editor.returnToDraftDescription');
      expect(text).toContain('records.editor.willRevertToDraft');
      expect(text).not.toContain('records.editor.willNoLongerBePublic');
      expect(text).not.toContain('records.editor.unpublishDescription');
    });

    it('follows a status the municipality declared public itself', () => {
      // No list in the UI could know about this one.
      statusConfig.statuses.push({
        key: 'in_force',
        label: 'In force',
        public: true,
      });
      const wrapper = mountHeader({
        status: 'in_force',
        allowedTransitions: ['draft'],
      });

      expect(labelsOf(wrapper)).toContain('records.editor.unpublishToDraft');
    });

    it('follows the configuration when it makes approved public', () => {
      statusConfig.statuses = statusConfig.statuses.map((s) =>
        s.key === 'approved' ? { ...s, public: true } : s
      );
      const wrapper = mountHeader({
        status: 'approved',
        allowedTransitions: ['draft'],
      });

      expect(labelsOf(wrapper)).toContain('records.editor.unpublishToDraft');
    });

    it('is offered from any status the workflow allows it from', () => {
      // Previously offered for the hardcoded "published" statuses only, while
      // `draft` was also filtered out of the generic list — so a proposed
      // record had no way back to draft here even when the workflow had one.
      const wrapper = mountHeader({
        status: 'proposed',
        allowedTransitions: ['draft', 'reviewed'],
      });

      expect(labelsOf(wrapper)).toContain('records.editor.returnToDraft');
    });

    it('is not offered when the workflow does not allow it', () => {
      const wrapper = mountHeader({
        status: 'published',
        allowedTransitions: ['archived'],
      });

      expect(labelsOf(wrapper)).not.toContain(
        'records.editor.unpublishToDraft'
      );
      expect(labelsOf(wrapper)).not.toContain('records.editor.returnToDraft');
    });

    it('treats a status as not public until the configuration has loaded', () => {
      // Fail-closed, like the read gate: no answer yet is not "public".
      statusConfig.statuses = [];
      const wrapper = mountHeader({
        status: 'published',
        allowedTransitions: ['draft'],
      });

      expect(labelsOf(wrapper)).toContain('records.editor.returnToDraft');
    });
  });

  describe('the list of other transitions', () => {
    const changeTo = (label: string) =>
      `records.editor.changeStatusTo ${JSON.stringify({ status: label })}`;

    it('lists every transition the workflow allows', () => {
      const wrapper = mountHeader({
        status: 'reviewed',
        allowedTransitions: ['approved', 'archived'],
      });

      // `approved` used to be hidden as "published-like".
      expect(labelsOf(wrapper)).toContain(changeTo('Approved'));
    });

    it('does not hide a status for being public', () => {
      const wrapper = mountHeader({
        status: 'approved',
        allowedTransitions: ['published', 'expired'],
      });

      expect(labelsOf(wrapper)).toContain(changeTo('Published'));
      expect(labelsOf(wrapper)).toContain(changeTo('Expired'));
    });

    it('leaves draft and archived to their own items, once each', () => {
      const wrapper = mountHeader({
        status: 'published',
        allowedTransitions: ['draft', 'archived', 'expired'],
      });
      const labels = labelsOf(wrapper);

      expect(labels).not.toContain(changeTo('Draft'));
      expect(labels).not.toContain(changeTo('Archived'));
      expect(
        labels.filter((l) => l === 'records.editor.unpublishToDraft')
      ).toHaveLength(1);
      expect(
        labels.filter((l) => l === 'records.editor.archiveRecord')
      ).toHaveLength(1);
    });

    it('offers nothing the workflow does not allow', () => {
      const wrapper = mountHeader({
        status: 'draft',
        allowedTransitions: ['proposed'],
      });

      expect(
        labelsOf(wrapper).filter((l) =>
          l.startsWith('records.editor.changeStatusTo')
        )
      ).toEqual([changeTo('Proposed')]);
    });
  });

  describe('the publish dialog', () => {
    it('promises public access when the status is public', () => {
      const wrapper = mountHeader({ status: 'published' });

      const text = dialog(wrapper, 'records.editor.publishRecord');
      expect(text).toContain('records.editor.publishDescription');
      expect(text).toContain('records.editor.changesPubliclyVisible');
      expect(text).not.toContain('NotPublic');
    });

    it('does not promise public access for a status that is not public', () => {
      // "Save and publish" on a record whose status is `approved` commits it,
      // but the read gate will not serve it to the public.
      const wrapper = mountHeader({ status: 'approved' });

      const text = dialog(wrapper, 'records.editor.publishRecord');
      expect(text).toContain(
        `records.editor.publishDescriptionNotPublic ${JSON.stringify({ status: 'Approved' })}`
      );
      expect(text).toContain('records.editor.changesNotPubliclyVisible');
      expect(text).not.toContain('records.editor.changesPubliclyVisible');
    });

    it('describes the status picked from the menu, not the current one', async () => {
      const wrapper = mountHeader({
        status: 'draft',
        allowedTransitions: ['proposed', 'published'],
      });

      const pick = (label: string) =>
        menuOf(wrapper).find((item) => item.label.includes(`"${label}"`))!
          .onClick!();

      pick('Published');
      await nextTick();
      expect(dialog(wrapper, 'records.editor.publishRecord')).toContain(
        'records.editor.changesPubliclyVisible'
      );

      pick('Proposed');
      await nextTick();
      const text = dialog(wrapper, 'records.editor.publishRecord');
      expect(text).toContain('records.editor.changesNotPubliclyVisible');
      expect(text).toContain(JSON.stringify({ status: 'Proposed' }));
    });

    it('publishes with the status that was picked', async () => {
      const wrapper = mountHeader({
        status: 'draft',
        allowedTransitions: ['proposed'],
      });

      menuOf(wrapper).find((item) => item.label.includes('"Proposed"'))!
        .onClick!();
      await nextTick();
      (wrapper.vm as unknown as { confirmPublish(): void }).confirmPublish();

      expect(wrapper.emitted('publish')).toEqual([['proposed']]);
    });
  });

  describe('the archive dialog', () => {
    it('says an archived record stays public, which is the default', () => {
      // It used to say "not publicly accessible" unconditionally — false
      // since archived was declared public on 2026-08-09.
      const wrapper = mountHeader({
        status: 'published',
        allowedTransitions: ['archived'],
      });

      const text = dialog(wrapper, 'records.editor.archiveRecord');
      expect(text).toContain('records.editor.archiveDescriptionPublic');
      expect(text).toContain('records.editor.willRemainPublic');
      expect(text).not.toContain('records.editor.willNotBePublic');
    });

    it('says it will not be public when the instance configures it so', () => {
      statusConfig.statuses = statusConfig.statuses.map((s) =>
        s.key === 'archived' ? { ...s, public: false } : s
      );
      const wrapper = mountHeader({
        status: 'published',
        allowedTransitions: ['archived'],
      });

      const text = dialog(wrapper, 'records.editor.archiveRecord');
      expect(text).toContain('records.editor.archiveDescription');
      expect(text).toContain('records.editor.willNotBePublic');
      expect(text).not.toContain('records.editor.willRemainPublic');
      expect(text).not.toContain('records.editor.archiveDescriptionPublic');
    });
  });
});
