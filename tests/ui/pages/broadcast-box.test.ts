import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { useBroadcastBox } from '~/composables/useBroadcastBox';
import BroadcastBoxPage from '~/pages/settings/broadcast-box/index.vue';

vi.mock('~/components/SystemFooter.vue', () => ({
  default: { name: 'SystemFooter', template: '<footer />' },
}));

const civicApiMock = vi.fn();
(global as any).useNuxtApp = vi.fn(() => ({ $civicApi: civicApiMock }));

let hasPerm: (p: string) => boolean = () => true;
(global as any).useAuthStore = vi.fn(() => ({
  isInitialized: true,
  hasPermission: (p: string) => hasPerm(p),
}));

const toastAdd = vi.fn();
(global as any).useToast = vi.fn(() => ({ add: toastAdd }));
(global as any).definePageMeta = vi.fn();

const devices = [
  {
    id: 'dev-1',
    deviceUuid: 'u1',
    name: 'Chamber Cam',
    status: 'active',
    createdAt: '',
    updatedAt: '',
  },
];
const sessions = [
  {
    id: 'sess-1',
    deviceId: 'dev-1',
    civicpressSessionId: 'rec-1',
    status: 'recording',
    metadata: { title: 'Council Meeting' },
    createdAt: '',
    updatedAt: '',
  },
];

const routeApi = (url: string) => {
  if (url === '/api/v1/broadcast-box/devices')
    return Promise.resolve({ success: true, devices });
  if (url === '/api/v1/broadcast-box/sessions')
    return Promise.resolve({ success: true, sessions });
  if (url.startsWith('/api/v1/records/'))
    return Promise.resolve({
      success: true,
      data: { metadata: { capture: { redaction_status: 'complete' } } },
    });
  return Promise.resolve({ success: true });
};

const stubs = {
  UDashboardPanel: {
    template: '<div><slot name="header" /><slot name="body" /></div>',
  },
  UDashboardNavbar: {
    template:
      '<div><slot name="title" /><slot name="description" /><slot name="right" /></div>',
  },
  UBreadcrumb: { template: '<nav />' },
  UCard: { template: '<div><slot name="header" /><slot /></div>' },
  UAlert: { props: ['title'], template: '<div class="alert">{{ title }}</div>' },
  UBadge: { template: '<span class="badge"><slot /></span>' },
  UButton: { props: ['to', 'disabled'], template: '<button><slot /></button>' },
  UModal: { template: '<div />' }, // closed by default; keep its content out
  UFormField: { template: '<div><slot /></div>' },
  USelectMenu: { template: '<select />' },
  UInput: { template: '<input />' },
  UIcon: true,
};

const mountPage = () => mount(BroadcastBoxPage, { global: { stubs } });

beforeEach(() => {
  hasPerm = () => true;
  civicApiMock.mockReset();
  civicApiMock.mockImplementation((url: string) => routeApi(url));
  toastAdd.mockReset();
});

describe('useBroadcastBox composable', () => {
  it('reads devices/sessions/enrollment/redaction from the right fields', async () => {
    const bb = useBroadcastBox();
    expect(await bb.listDevices()).toHaveLength(1);
    expect((await bb.listSessions())[0].civicpressSessionId).toBe('rec-1');
    expect(await bb.getRedactionStatus('rec-1')).toBe('complete');

    civicApiMock.mockResolvedValueOnce({
      success: true,
      enrollment: { deviceUuid: 'x', enrollmentCode: 'CODE', expiresAt: '' },
    });
    expect((await bb.enrollDevice({ name: 'n' })).enrollmentCode).toBe('CODE');
  });

  it('swallows a missing-record error when reading redaction status', async () => {
    civicApiMock.mockRejectedValueOnce(new Error('404'));
    expect(await useBroadcastBox().getRedactionStatus('missing')).toBeUndefined();
  });
});

describe('broadcast-box operator page', () => {
  it('lists devices, sessions, and each session redaction status', async () => {
    const w = mountPage();
    await flushPromises();
    const text = w.text();
    expect(text).toContain('Chamber Cam');
    expect(text).toContain('Council Meeting');
    expect(text).toContain('complete'); // the redaction badge
  });

  it('hides the Enroll action without broadcast-box:devices:enroll', async () => {
    hasPerm = (p) => p !== 'broadcast-box:devices:enroll';
    const w = mountPage();
    await flushPromises();
    expect(w.text()).not.toContain('settings.broadcastBox.enrollDevice');
  });

  it('shows the Enroll action with the permission', async () => {
    const w = mountPage();
    await flushPromises();
    expect(w.text()).toContain('settings.broadcastBox.enrollDevice');
  });
});
