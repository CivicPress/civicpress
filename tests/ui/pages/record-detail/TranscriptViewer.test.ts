import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';

// TranscriptViewer imports useAuthStore from '@/stores/auth' (used inside load()
// for the optional bearer token) and reads civicApiUrl off the runtime config.
const { authStore } = vi.hoisted(() => ({
  authStore: { token: null as string | null },
}));
vi.mock('@/stores/auth', () => ({ useAuthStore: () => authStore }));

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);
(global as any).useRuntimeConfig = () => ({
  public: { civicApiUrl: 'http://api.test' },
});

import TranscriptViewer from '~/pages/records/[type]/[id]/_components/TranscriptViewer.vue';

const stubs = {
  UIcon: true,
  UAlert: {
    props: ['title'],
    template: '<div class="alert">{{ title }}</div>',
  },
};

const okVtt = (body: string) => ({
  ok: true,
  text: () => Promise.resolve(body),
});

const mountViewer = (props: Record<string, unknown>) =>
  mount(TranscriptViewer, { props, global: { stubs } });

beforeEach(() => {
  authStore.token = null;
  fetchMock.mockReset();
});

describe('TranscriptViewer', () => {
  it('fetches the transcript and renders parsed cues', async () => {
    fetchMock.mockResolvedValue(
      okVtt('WEBVTT\n\n00:00:01.000 --> 00:00:04.000\nHello world')
    );
    const wrapper = mountViewer({ src: '/api/v1/storage/files/x' });
    await flushPromises();
    const vm = wrapper.vm as any;

    expect(vm.loading).toBe(false);
    expect(vm.error).toBeNull();
    expect(vm.cues).toHaveLength(1);
    expect(wrapper.text()).toContain('Hello world');
    expect(wrapper.text()).toContain('00:00:01.000');
  });

  it('resolves a relative src against civicApiUrl and sends no auth header when signed out', async () => {
    fetchMock.mockResolvedValue(okVtt('WEBVTT\n\n'));
    mountViewer({ src: '/api/v1/storage/files/x' });
    await flushPromises();

    expect(fetchMock).toHaveBeenCalledWith(
      'http://api.test/api/v1/storage/files/x',
      { headers: {} }
    );
  });

  it('attaches a bearer token when one is present', async () => {
    authStore.token = 'tok-1';
    fetchMock.mockResolvedValue(okVtt('WEBVTT\n\n'));
    mountViewer({ src: 'https://cdn.test/t.vtt' });
    await flushPromises();

    // absolute URLs are passed through unchanged
    expect(fetchMock).toHaveBeenCalledWith('https://cdn.test/t.vtt', {
      headers: { Authorization: 'Bearer tok-1' },
    });
  });

  it('shows the error state when the transcript request fails', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500 });
    const wrapper = mountViewer({ src: '/api/v1/storage/files/x' });
    await flushPromises();

    expect((wrapper.vm as any).error).toBe('records.transcript.loadError');
    expect(wrapper.text()).toContain('records.transcript.loadError');
  });

  it('shows the empty state when the transcript has no cues', async () => {
    fetchMock.mockResolvedValue(okVtt('WEBVTT\n\n'));
    const wrapper = mountViewer({ src: '/api/v1/storage/files/x' });
    await flushPromises();

    expect((wrapper.vm as any).cues).toHaveLength(0);
    expect(wrapper.text()).toContain('records.transcript.empty');
  });

  it('labels a reviewed transcript and omits the automated note', async () => {
    fetchMock.mockResolvedValue(okVtt('WEBVTT\n\n'));
    const wrapper = mountViewer({
      src: '/api/v1/storage/files/x',
      status: 'reviewed',
    });
    await flushPromises();

    expect(wrapper.text()).toContain('records.transcript.reviewed');
    expect(wrapper.text()).not.toContain('records.transcript.automatedNote');
  });

  it('labels an automated transcript and shows the automated note', async () => {
    fetchMock.mockResolvedValue(okVtt('WEBVTT\n\n'));
    const wrapper = mountViewer({
      src: '/api/v1/storage/files/x',
      status: 'automated',
    });
    await flushPromises();

    expect(wrapper.text()).toContain('records.transcript.automated');
    expect(wrapper.text()).toContain('records.transcript.automatedNote');
  });
});
