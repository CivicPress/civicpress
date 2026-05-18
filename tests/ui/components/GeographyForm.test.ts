import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import GeographyForm from '~/components/GeographyForm.vue';

// Per-test mockable $civicApi (overridable via mockImplementationOnce).
const civicApiMock = vi.fn();

// Override useNuxtApp from tests/ui/setup.ts so $civicApi can be controlled.
beforeEach(() => {
  civicApiMock.mockReset();
  // Default behavior: presets endpoint returns empty list; everything else
  // returns success. Individual tests override per call.
  civicApiMock.mockImplementation(async (url: string) => {
    if (url.includes('/api/v1/geography/presets')) {
      return { success: true, data: [] };
    }
    return { success: true, data: {} };
  });
});

(global as any).useNuxtApp = vi.fn(() => ({ $civicApi: civicApiMock }));

// vue-router is imported directly by GeographyForm.
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
}));

// GeographyForm imports `useToast` from Nuxt's `#imports` virtual module.
vi.mock('#imports', () => ({
  useToast: () => ({ add: vi.fn() }),
}));

// useDebounceFn from @vueuse/core wraps onContentChange and would defer
// execution. We don't call it in these tests, but if a test ever triggers
// content changes, debounce would normally swallow the call. Replace with
// a pass-through for predictability.
vi.mock('@vueuse/core', async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  return {
    ...actual,
    useDebounceFn: (fn: any) => fn,
  };
});

const mountOptions = {
  global: {
    stubs: {
      UForm: {
        template: '<form @submit="$emit(\'submit\', $event)"><slot /></form>',
      },
      UFormField: { template: '<div><slot /></div>' },
      UInput: { template: '<input />' },
      UTextarea: { template: '<textarea />' },
      USelectMenu: true,
      UCard: {
        template: '<div><slot name="header" /><slot /></div>',
      },
      UButton: true,
      UIcon: true,
      UAlert: true,
      GeographyMap: true,
    },
  },
};

describe('GeographyForm', () => {
  it('mounts in create mode with default form values', async () => {
    const wrapper = mount(GeographyForm, {
      props: { mode: 'create' },
      ...mountOptions,
    });
    await flushPromises();

    expect(wrapper.exists()).toBe(true);
    const vm = wrapper.vm as any;
    expect(vm.form.name).toBe('');
    expect(vm.form.type).toBe('geojson');
    expect(vm.form.category).toBe('zone');
    expect(vm.form.srid).toBe(4326);
  });

  it('mounts in edit mode and loads existing geography file', async () => {
    civicApiMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/v1/geography/presets')) {
        return { success: true, data: [] };
      }
      if (url.includes('/api/v1/geography/validate')) {
        // onContentChange triggers this; return shape includes a validation
        // object with the array fields the template reads on.
        return {
          success: true,
          data: { valid: true, errors: [], warnings: [], metadata: null },
        };
      }
      if (url.endsWith('/geo-1')) {
        return {
          success: true,
          data: {
            name: 'Downtown',
            type: 'geojson',
            category: 'district',
            description: 'Downtown district',
            content: '{"type":"FeatureCollection","features":[]}',
            srid: 4326,
            metadata: {},
          },
        };
      }
      return { success: true, data: { valid: false, errors: [], warnings: [] } };
    });

    const wrapper = mount(GeographyForm, {
      props: { mode: 'edit', geographyId: 'geo-1' },
      ...mountOptions,
    });
    await flushPromises();

    const vm = wrapper.vm as any;
    expect(vm.form.name).toBe('Downtown');
    expect(vm.form.category).toBe('district');
    expect(vm.form.description).toBe('Downtown district');
    expect(vm.form.content).toContain('FeatureCollection');
  });

  it('emits "success" with payload after a valid create submission', async () => {
    civicApiMock.mockImplementation(async (url: string, opts: any) => {
      if (url.includes('/api/v1/geography/presets')) {
        return { success: true, data: [] };
      }
      if (url === '/api/v1/geography' && opts?.method === 'POST') {
        return {
          success: true,
          data: { id: 'new-geo', name: opts.body.name, type: 'geojson' },
        };
      }
      return { success: true, data: {} };
    });

    const wrapper = mount(GeographyForm, {
      props: { mode: 'create' },
      ...mountOptions,
    });
    await flushPromises();

    const vm = wrapper.vm as any;
    vm.form.name = 'New Zone';
    vm.form.category = 'zone';
    vm.form.description = 'A zone';
    vm.form.content = '{"type":"FeatureCollection","features":[]}';
    vm.form.type = 'geojson';
    vm.form.srid = 4326;

    await vm.handleSubmit();
    await flushPromises();

    const emitted = wrapper.emitted('success');
    expect(emitted).toBeTruthy();
    expect(emitted![0][0]).toMatchObject({ id: 'new-geo', name: 'New Zone' });
  });

  it('does NOT emit "success" and sets formErrors.name when name is missing', async () => {
    const wrapper = mount(GeographyForm, {
      props: { mode: 'create' },
      ...mountOptions,
    });
    await flushPromises();

    const vm = wrapper.vm as any;
    vm.form.name = '';
    vm.form.category = 'zone';
    vm.form.description = 'A zone';
    vm.form.content = '{"type":"FeatureCollection","features":[]}';
    vm.form.type = 'geojson';
    vm.form.srid = 4326;

    await vm.handleSubmit();
    await flushPromises();

    expect(wrapper.emitted('success')).toBeFalsy();
    expect(vm.formErrors.name).toBeTruthy();
  });

  it('rejects invalid SRID (zero / negative) with formErrors.srid', async () => {
    const wrapper = mount(GeographyForm, {
      props: { mode: 'create' },
      ...mountOptions,
    });
    await flushPromises();

    const vm = wrapper.vm as any;
    vm.form.name = 'Bad SRID Zone';
    vm.form.category = 'zone';
    vm.form.description = 'desc';
    vm.form.content = '{"type":"FeatureCollection","features":[]}';
    vm.form.type = 'geojson';
    vm.form.srid = 0;

    await vm.handleSubmit();
    await flushPromises();

    expect(wrapper.emitted('success')).toBeFalsy();
    expect(vm.formErrors.srid).toBeTruthy();
  });

  it('clearContent resets content and preview state', async () => {
    const wrapper = mount(GeographyForm, {
      props: { mode: 'create' },
      ...mountOptions,
    });
    await flushPromises();

    const vm = wrapper.vm as any;
    vm.form.content = '{"some":"content"}';
    vm.preview.parsed = { foo: 'bar' };
    vm.preview.validation = { valid: true, errors: [], warnings: [] };

    vm.clearContent();
    await flushPromises();

    expect(vm.form.content).toBe('');
    expect(vm.preview.parsed).toBeNull();
    expect(vm.preview.validation.valid).toBe(false);
  });

  it('emits "cancel" via handleCancel', async () => {
    const wrapper = mount(GeographyForm, {
      props: { mode: 'create' },
      ...mountOptions,
    });
    await flushPromises();

    const vm = wrapper.vm as any;
    vm.handleCancel();
    await flushPromises();

    expect(wrapper.emitted('cancel')).toBeTruthy();
  });

  it('sets saving=true during submission and resets to false after', async () => {
    let resolveApi: (v: any) => void = () => {};
    const apiPromise = new Promise((res) => {
      resolveApi = res;
    });

    civicApiMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/v1/geography/presets')) {
        return { success: true, data: [] };
      }
      return apiPromise;
    });

    const wrapper = mount(GeographyForm, {
      props: { mode: 'create' },
      ...mountOptions,
    });
    await flushPromises();

    const vm = wrapper.vm as any;
    vm.form.name = 'Z';
    vm.form.category = 'zone';
    vm.form.description = 'desc';
    vm.form.content = '{"type":"FeatureCollection","features":[]}';
    vm.form.type = 'geojson';
    vm.form.srid = 4326;

    const submission = vm.handleSubmit();
    await flushPromises();
    expect(vm.saving).toBe(true);

    resolveApi({ success: true, data: { id: 'x' } });
    await submission;
    await flushPromises();

    expect(vm.saving).toBe(false);
  });
});
