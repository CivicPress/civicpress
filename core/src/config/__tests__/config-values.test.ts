import { describe, it, expect } from 'vitest';
import { isConfigField, unwrapConfigValues } from '../config-values.js';

describe('unwrapConfigValues', () => {
  it('replaces a field with its value', () => {
    expect(
      unwrapConfigValues({
        value: 100,
        type: 'number',
        description: 'Maximum emails per hour',
        required: true,
      })
    ).toBe(100);
  });

  it('keeps a false value false — the case that matters', () => {
    // A field object is truthy. Read without unwrapping, a switch that is OFF
    // reads as on.
    const enabled = unwrapConfigValues({ value: false, type: 'boolean' });
    expect(enabled).toBe(false);
  });

  it('unwraps at any depth', () => {
    expect(
      unwrapConfigValues({
        channels: {
          email: {
            enabled: { value: false, type: 'boolean' },
            smtp: {
              port: { value: 587, type: 'number' },
              auth: { user: { value: 'u', type: 'string' } },
            },
          },
        },
      })
    ).toEqual({
      channels: {
        email: { enabled: false, smtp: { port: 587, auth: { user: 'u' } } },
      },
    });
  });

  it('leaves the plain shape exactly as it is', () => {
    const plain = {
      channels: { email: { enabled: true, smtp: { port: 587 } } },
      rules: { rate_limits: { email_per_hour: 100 } },
    };
    expect(unwrapConfigValues(plain)).toEqual(plain);
  });

  it('handles a file that mixes both shapes, as a hand-edited one does', () => {
    expect(
      unwrapConfigValues({
        rate_limits: {
          email_per_hour: { value: 100, type: 'number' },
          sms_per_hour: 50,
        },
      })
    ).toEqual({ rate_limits: { email_per_hour: 100, sms_per_hour: 50 } });
  });

  it('unwraps a field whose value is itself a group or a list', () => {
    expect(
      unwrapConfigValues({
        credentials: { value: { apiKey: 'k' }, type: 'object' },
        workflows: { value: ['update-index'], type: 'array' },
      })
    ).toEqual({ credentials: { apiKey: 'k' }, workflows: ['update-index'] });
  });

  it('unwraps a bare { value } with no attributes', () => {
    expect(unwrapConfigValues({ enabled: { value: true } })).toEqual({
      enabled: true,
    });
  });

  it('does not unwrap data that merely has a key named value', () => {
    // `unit` is not a field attribute, so this is somebody's data.
    const data = { threshold: { value: 5, unit: 'ms' } };
    expect(unwrapConfigValues(data)).toEqual(data);
    expect(isConfigField(data.threshold)).toBe(false);
  });

  it('keeps null, and a field whose value is null', () => {
    expect(unwrapConfigValues({ replyTo: null })).toEqual({ replyTo: null });
    expect(
      unwrapConfigValues({ replyTo: { value: null, type: 'string' } })
    ).toEqual({ replyTo: null });
  });

  it('passes through a missing file body', () => {
    // yaml.load of an empty file is undefined.
    expect(unwrapConfigValues(undefined)).toBeUndefined();
  });

  it('does not drop `options`, which is an attribute and not a setting', () => {
    expect(
      unwrapConfigValues({
        provider: {
          value: 'smtp',
          type: 'string',
          options: [{ value: 'smtp', label: 'SMTP Server' }],
        },
      })
    ).toEqual({ provider: 'smtp' });
  });
});
