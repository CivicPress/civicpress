// Redaction of personal data from what the notification system PERSISTS —
// the notification audit log and the operator-inbox rows — when
// `security.filter_pii` is on. Never applied to a message on its way to its
// recipient: a verification email whose address reads "[REDACTED]" is
// useless (notifications-003), and the recipient is the one person entitled
// to the content.
//
// The patterns are deliberately plain. They catch the shapes that end up in
// delivery errors and task payloads — addresses, phone numbers, card and
// social-insurance numbers — not every conceivable identifier.

export const REDACTED = '[REDACTED]';

// Every quantifier is bounded: these run on persisted text of any length,
// and an unbounded `[...]+@[...]+\.` backtracks quadratically on inputs like
// `a@a.a.a.a…` (js/polynomial-redos). The bounds are RFC 5321's: 64 for the
// local part, 255 for the domain.
export const PII_PATTERNS: readonly RegExp[] = [
  /\b\d{3}-\d{2}-\d{4}\b/g, // SSN / SIN-shaped
  /\b\d{4}[- ]?\d{4}[- ]?\d{4}[- ]?\d{4}\b/g, // card numbers
  /\b\d{10,11}\b/g, // phone numbers written as digits
  /\b[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9.-]{1,255}\.[A-Za-z]{2,24}\b/g, // email addresses
];

/** `text` with every PII-shaped span replaced by {@link REDACTED}. */
export function redactPiiFromString(text: string): string {
  let out = text;
  for (const pattern of PII_PATTERNS) {
    out = out.replace(pattern, REDACTED);
  }
  return out;
}

/**
 * A deep copy of `value` with PII redacted from every string in it. Strings
 * are redacted, arrays and plain objects are walked, everything else is
 * returned as is. Keys are never changed.
 */
export function redactPii<T>(value: T): T {
  if (typeof value === 'string') {
    return redactPiiFromString(value) as unknown as T;
  }
  if (Array.isArray(value)) {
    return value.map((item) => redactPii(item)) as unknown as T;
  }
  if (value && typeof value === 'object') {
    if (value instanceof Date) return value;
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(
      value as Record<string, unknown>
    )) {
      out[key] = redactPii(item);
    }
    return out as T;
  }
  return value;
}
