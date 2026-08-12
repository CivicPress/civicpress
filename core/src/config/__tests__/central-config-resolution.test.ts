import { describe, it, expect, afterEach } from 'vitest';
import { join } from 'path';
import { tmpdir } from 'os';
import { resolveSystemDataDir, resolveProjectRoot } from '../central-config.js';
import {
  resolveInstanceContext,
  setInstanceContext,
  resetInstanceContext,
} from '../instance-context.js';

/**
 * `resolveSystemDataDir` used to resolve a RELATIVE `dataDir` against
 * `process.cwd()`, so a config built directly (no `.civicrc` anchor — chiefly
 * unit tests and embedders) produced a different `.system-data` depending on
 * where the process was launched. It now anchors to the resolved instance root.
 */
describe('resolveSystemDataDir / resolveProjectRoot anchoring', () => {
  afterEach(() => resetInstanceContext());

  it('anchors a relative dataDir to the instance root, not cwd', () => {
    const root = join(tmpdir(), 'civic-anchor-test');
    setInstanceContext(resolveInstanceContext({ root }));

    // `dirname('data')` is '.', so the system data dir sits directly at the root.
    expect(resolveSystemDataDir({ dataDir: 'data' })).toBe(
      join(root, '.system-data')
    );
    expect(resolveProjectRoot({ dataDir: 'data' })).toBe(root);
  });

  it('still derives from an absolute dataDir without consulting the context', () => {
    setInstanceContext(
      resolveInstanceContext({ root: join(tmpdir(), 'other') })
    );

    const dataDir = join(tmpdir(), 'somewhere', 'data');
    expect(resolveSystemDataDir({ dataDir })).toBe(
      join(tmpdir(), 'somewhere', '.system-data')
    );
  });

  it('always prefers an explicit systemDataDir', () => {
    const explicit = join(tmpdir(), 'explicit-system-data');
    expect(
      resolveSystemDataDir({ dataDir: 'data', systemDataDir: explicit })
    ).toBe(explicit);
  });
});
