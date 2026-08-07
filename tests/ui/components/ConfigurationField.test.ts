import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import ConfigurationField from '~/components/ConfigurationField.vue';

const stubs = {
  UFormField: { template: '<div><slot /></div>' },
  UInput: { props: ['modelValue'], template: '<input :value="modelValue" />' },
  UTextarea: {
    props: ['modelValue'],
    emits: ['update:modelValue'],
    template:
      '<textarea :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)"></textarea>',
  },
  UCheckbox: { props: ['modelValue'], template: '<input type="checkbox" />' },
  USelect: { props: ['modelValue'], template: '<select />' },
  UBadge: { template: '<span><slot /></span>' },
  UIcon: true,
};

const mountField = (props: Record<string, unknown>) =>
  mount(ConfigurationField, {
    props: { fieldKey: 'credentials', field: {}, value: undefined, ...props },
    global: { stubs },
  });

describe('ConfigurationField', () => {
  it('edits an object value as JSON instead of rendering "[object Object]"', () => {
    const w = mountField({
      value: { account_sid: 'AC1', auth_token: 'secret' },
    });
    expect(w.text()).not.toContain('[object Object]');
    const ta = w.find('textarea');
    expect(ta.exists()).toBe(true);
    expect((ta.element as HTMLTextAreaElement).value).toContain('account_sid');
    expect((ta.element as HTMLTextAreaElement).value).toContain('AC1');
  });

  it('emits the parsed object when the JSON is edited', async () => {
    const w = mountField({ value: { a: 1 } });
    await w.find('textarea').setValue('{"a": 2, "b": "x"}');
    const updates = w.emitted('update');
    expect(updates).toBeTruthy();
    const last = updates![updates!.length - 1];
    expect(last[0]).toBe('credentials');
    expect(last[1]).toEqual({ a: 2, b: 'x' });
  });

  it('does not emit while the JSON is invalid', async () => {
    const w = mountField({ value: { a: 1 } });
    await w.find('textarea').setValue('{ not valid');
    expect(w.emitted('update')).toBeFalsy();
    expect(w.text()).toContain('Invalid JSON');
  });

  it('still renders a text input for a scalar string value', () => {
    const w = mountField({
      fieldKey: 'name',
      field: { type: 'string' },
      value: 'hello',
    });
    expect(w.find('input').exists()).toBe(true);
    expect(w.find('textarea').exists()).toBe(false);
  });
});
