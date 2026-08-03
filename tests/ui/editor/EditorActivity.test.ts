import { describe, it, expect, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import EditorActivity from '~/components/editor/EditorActivity.vue';

/**
 * EditorActivity shows a record's Git commit history from
 * `GET /api/v1/diff/:recordId/history`. It used to render a single hardcoded
 * "Record created" row; these tests pin the real fetch + the loading/empty/
 * error states, including that a 404 (an unpublished draft with no committed
 * history) reads as empty, not an error.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mountActivity = (
  civicApi: any,
  props: { recordId?: string } = { recordId: 'rec-1' }
) => {
  globalThis.useNuxtApp = vi.fn(() => ({ $civicApi: civicApi }));
  return mount(EditorActivity, {
    props,
    global: { stubs: { UIcon: true } },
  });
};

// Let the watch's immediate fetch + the reactive update settle.
const flush = async () => {
  await nextTick();
  await nextTick();
  await nextTick();
};

describe('EditorActivity', () => {
  it('renders commit-history rows from the diff API (summary + author)', async () => {
    const civicApi = vi.fn(async () => ({
      data: {
        commits: [
          {
            hash: 'a1',
            shortHash: 'a1',
            date: '2026-01-02T10:00:00Z',
            author: 'Ada',
            message: 'Update budget figures\n\nlong body text',
            changes: [],
          },
          {
            hash: 'b2',
            shortHash: 'b2',
            date: '2026-01-01T09:00:00Z',
            author: 'Grace',
            message: 'Create record',
            changes: [],
          },
        ],
      },
    }));
    const wrapper = mountActivity(civicApi);
    await flush();

    expect(civicApi).toHaveBeenCalledWith(
      '/api/v1/diff/rec-1/history?limit=20'
    );
    const text = wrapper.text();
    expect(text).toContain('Update budget figures');
    // Only the first line of the commit message is shown.
    expect(text).not.toContain('long body text');
    expect(text).toContain('Ada');
    expect(text).toContain('Grace');
  });

  it('shows the empty state when there are no commits', async () => {
    const civicApi = vi.fn(async () => ({ data: { commits: [] } }));
    const wrapper = mountActivity(civicApi);
    await flush();
    expect(wrapper.text()).toContain('records.editor.activityEmpty');
  });

  it('treats a 404 (unpublished draft) as empty, not an error', async () => {
    const civicApi = vi.fn(async () => {
      throw { statusCode: 404 };
    });
    const wrapper = mountActivity(civicApi);
    await flush();
    expect(wrapper.text()).toContain('records.editor.activityEmpty');
    expect(wrapper.text()).not.toContain('records.editor.activityError');
  });

  it('shows the error state on a genuine failure', async () => {
    const civicApi = vi.fn(async () => {
      throw { statusCode: 500 };
    });
    const wrapper = mountActivity(civicApi);
    await flush();
    expect(wrapper.text()).toContain('records.editor.activityError');
  });

  it('does not fetch when no recordId is provided', async () => {
    const civicApi = vi.fn();
    mountActivity(civicApi, {});
    await flush();
    expect(civicApi).not.toHaveBeenCalled();
  });
});
