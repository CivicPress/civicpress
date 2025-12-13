import { beforeEach, vi } from 'vitest';
import { config } from '@vue/test-utils';
import * as Vue from 'vue';

// Make Vue composables globally available for SFC auto-imports
global.computed = Vue.computed;
global.ref = Vue.ref;
global.reactive = Vue.reactive;
global.watch = Vue.watch;
global.onMounted = Vue.onMounted;
global.onUnmounted = Vue.onUnmounted;
global.nextTick = Vue.nextTick;
global.defineProps = Vue.defineProps;
global.defineEmits = Vue.defineEmits;
global.withDefaults = Vue.withDefaults;

// Mock window.matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
};
global.localStorage = localStorageMock as any;

beforeEach(() => {
  vi.clearAllMocks();
  localStorageMock.getItem.mockReturnValue(null);
  localStorageMock.setItem.mockImplementation(() => {});
  localStorageMock.removeItem.mockImplementation(() => {});
  localStorageMock.clear.mockImplementation(() => {});
});

// Configure Vue Test Utils global stubs
config.global.stubs = {
  UButton: true,
  UBadge: true,
  UIcon: true,
  UDropdownMenu: true,
  UInput: true,
  UModal: true,
  UAlert: true,
  USelect: true,
  NuxtLink: true,
  RecordPreview: true,
};

// Global mocks for Nuxt auto-imports
global.useI18n = vi.fn(() => ({
  t: (key: string) => key,
  locale: { value: 'en' },
  locales: [{ code: 'en' }, { code: 'fr' }],
}));

global.useNuxtApp = vi.fn(() => ({
  $civicApi: vi.fn(),
}));

global.navigateTo = vi.fn();
global.useToast = vi.fn(() => ({
  add: vi.fn(),
}));

global.useRoute = vi.fn(() => ({
  path: '/',
  params: {},
  query: {},
}));

global.useRouter = vi.fn(() => ({
  push: vi.fn(),
  replace: vi.fn(),
}));

global.useAuthStore = vi.fn(() => ({
  user: { id: 1, username: 'test-user', role: 'admin' },
  isAuthenticated: true,
  hasPermission: vi.fn(() => true),
}));

global.useRecordsStore = vi.fn(() => ({
  records: [],
  fetchRecords: vi.fn(),
  fetchRecord: vi.fn(),
}));

global.useRecordStatuses = vi.fn(() => ({
  recordStatusOptions: () => [
    { label: 'Draft', value: 'draft' },
    { label: 'Published', value: 'published' },
    { label: 'Approved', value: 'approved' },
  ],
  getRecordStatusLabel: (status: string) =>
    status.charAt(0).toUpperCase() + status.slice(1),
  fetchRecordStatuses: vi.fn(),
}));

global.useRecordUtils = vi.fn(() => ({
  getStatusConfig: (status: string) => ({
    label: status,
    color: 'primary',
    variant: 'soft',
  }),
  formatDate: (date: string | Date) => new Date(date).toLocaleDateString(),
  normalizeDateString: (date: string) => date,
}));

global.useRecordTypes = vi.fn(() => ({
  getRecordTypeOptions: () => [
    { label: 'Bylaw', value: 'bylaw' },
    { label: 'Policy', value: 'policy' },
  ],
  getRecordTypeLabel: (type: string) =>
    type.charAt(0).toUpperCase() + type.slice(1),
  fetchRecordTypes: vi.fn(),
}));

global.useTemplates = vi.fn(() => ({
  getTemplateOptions: () => [],
  getTemplateById: vi.fn(),
  processTemplate: vi.fn(),
}));
