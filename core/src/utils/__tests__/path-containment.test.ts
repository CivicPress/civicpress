import { describe, it, expect } from 'vitest';
import * as path from 'path';
import {
  isSafeSegment,
  resolveChild,
  resolveInside,
} from '../path-containment.js';

const ROOT = path.resolve('/srv/civic/data/records');

describe('isSafeSegment', () => {
  it.each(['bylaw', 'meeting-minutes', 'policy_2026', 'a.b', 'Bylaw', '2024'])(
    'accepts the name %j',
    (name) => {
      expect(isSafeSegment(name)).toBe(true);
    }
  );

  it.each([
    ['the empty string', ''],
    ['the current directory', '.'],
    ['the parent directory', '..'],
    ['a relative path', '../outside'],
    ['a nested path', 'bylaw/2024'],
    ['an absolute path', '/etc'],
    ['a backslash path', '..\\outside'],
    ['a NUL byte', 'bylaw\0.md'],
  ])('refuses %s', (_label, name) => {
    expect(isSafeSegment(name)).toBe(false);
  });

  it.each([
    ['an array', ['bylaw']],
    ['an object', { type: 'bylaw' }],
    ['a number', 7],
    ['undefined', undefined],
    ['null', null],
  ])('refuses %s — a repeated query parameter arrives as one', (_l, value) => {
    expect(isSafeSegment(value)).toBe(false);
  });
});

describe('resolveInside', () => {
  it('resolves a name under the root', () => {
    expect(resolveInside(ROOT, 'bylaw')).toBe(path.join(ROOT, 'bylaw'));
    expect(resolveInside(ROOT, 'bylaw', '2024', 'a.md')).toBe(
      path.join(ROOT, 'bylaw', '2024', 'a.md')
    );
  });

  it.each([
    ['one level up', ['..']],
    ['several levels up', ['..', '..', 'etc', 'passwd']],
    ['up, hidden in the middle', ['bylaw', '..', '..', 'outside']],
    ['up, inside one segment', ['../../outside']],
    ['an absolute path, which would replace the root', ['/etc/passwd']],
    ['the root itself', ['.']],
    ['the root itself, the long way', ['bylaw', '..']],
    ['a NUL byte', ['bylaw\0']],
  ])('refuses %s', (_label, segments) => {
    expect(resolveInside(ROOT, ...segments)).toBeNull();
  });

  it('is not fooled by a sibling that shares the root as a prefix', () => {
    // The case a bare `resolved.startsWith(root)` gets wrong:
    // `/srv/templates-evil` starts with `/srv/templates`.
    const templates = path.resolve('/srv/civic/.civic/templates');
    expect(resolveInside(templates, '..', 'templates-evil', 'x.md')).toBeNull();
    expect(
      path
        .resolve(templates, '..', 'templates-evil', 'x.md')
        .startsWith(templates)
    ).toBe(true);
  });

  it('allows a path that leaves and comes back, because it ends inside', () => {
    expect(resolveInside(ROOT, 'bylaw', '..', 'policy')).toBe(
      path.join(ROOT, 'policy')
    );
  });

  it('works from a relative root', () => {
    expect(resolveInside('data/.civic', 'roles.yml')).toBe(
      path.resolve('data/.civic', 'roles.yml')
    );
    expect(resolveInside('data/.civic', '..', '..', 'x')).toBeNull();
  });

  it('refuses a segment that is not a string', () => {
    expect(resolveInside(ROOT, ['bylaw'] as unknown as string)).toBeNull();
  });
});

describe('resolveChild', () => {
  it('resolves a plain name', () => {
    expect(resolveChild(ROOT, 'bylaw')).toBe(path.join(ROOT, 'bylaw'));
  });

  it.each(['..', '../outside', 'bylaw/2024', '/etc', '', '.'])(
    'refuses %j — a child is one level down, no more',
    (name) => {
      expect(resolveChild(ROOT, name)).toBeNull();
    }
  );
});
