import { describe, it, expect } from 'vitest';
import {
  redactPii,
  redactPiiFromString,
  REDACTED,
} from '../../../core/src/notifications/pii-redaction.js';
import { NotificationSecurity } from '../../../core/src/notifications/notification-security.js';

// `security.filter_pii` — what the notification system PERSISTS has personal
// data redacted. It is never applied to a message on its way to its recipient.

describe('redactPiiFromString', () => {
  it('redacts email addresses, phone numbers, card and SSN-shaped numbers', () => {
    expect(redactPiiFromString('write to Jo.Bloggs+x@Town.example today')).toBe(
      `write to ${REDACTED} today`
    );
    expect(redactPiiFromString('call 5145551234')).toBe(`call ${REDACTED}`);
    expect(redactPiiFromString('card 4111 1111 1111 1111')).toBe(
      `card ${REDACTED}`
    );
    expect(redactPiiFromString('sin 123-45-6789')).toBe(`sin ${REDACTED}`);
  });

  it('leaves ordinary text, short numbers and record ids alone', () => {
    expect(redactPiiFromString('Bylaw 2026-014 adopted at 19:30')).toBe(
      'Bylaw 2026-014 adopted at 19:30'
    );
  });

  it('redacts the recipient quoted inside a delivery error', () => {
    expect(
      redactPiiFromString(
        'email: Error: 550 5.1.1 <nobody@town.example> User unknown'
      )
    ).toBe(`email: Error: 550 5.1.1 <${REDACTED}> User unknown`);
  });
});

describe('redactPiiFromString on hostile input', () => {
  it('stays fast on the input that made the unbounded email pattern quadratic', () => {
    const hostile = 'a@' + 'a.'.repeat(50_000); // 100 kB, no terminating TLD
    const started = Date.now();
    redactPiiFromString(hostile);
    expect(Date.now() - started).toBeLessThan(1000);
  });
});

describe('redactPii', () => {
  it('walks arrays and nested objects, leaving keys and non-strings as they are', () => {
    const when = new Date('2026-10-02T00:00:00Z');
    const out = redactPii({
      errors: ['smtp: <a@b.example> rejected'],
      meta: { userId: 7, email: 'a@b.example', when, ok: true },
      note: null,
    });
    expect(out).toEqual({
      errors: [`smtp: <${REDACTED}> rejected`],
      meta: { userId: 7, email: REDACTED, when, ok: true },
      note: null,
    });
  });

  it('returns a copy — the input is not changed', () => {
    const input = { email: 'a@b.example' };
    redactPii(input);
    expect(input.email).toBe('a@b.example');
  });
});

describe('NotificationSecurity.sanitizeContent', () => {
  it('redacts personal data and nothing else — markup is not its job', () => {
    const out = new NotificationSecurity().sanitizeContent({
      body: 'Email <b>me</b> at user@example.com',
    });
    expect(out.body).toBe(`Email <b>me</b> at ${REDACTED}`);
  });
});
