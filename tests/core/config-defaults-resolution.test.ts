import { describe, it, expect } from 'vitest';
import { spawnSync } from 'child_process';
import { mkdtempSync, mkdirSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import { pathToFileURL } from 'url';

/**
 * ConfigurationService falls back to the default templates that ship with the
 * core package whenever an instance has no user file for a config type (a
 * fresh `civic init` writes only a subset: roles/workflows/hooks/org-config/
 * config/analytics/geography-presets, not attachment-types or link-categories).
 *
 * That fallback path used to be the cwd-RELATIVE string 'core/src/defaults', so
 * it only ever resolved when the process ran from the monorepo root. In the
 * Docker image the API runs from /instance and the templates live in /app, so
 * `GET /api/v1/config/attachment-types` and `/config/link-categories` returned
 * 500 FAILED_TO_GET_ATTACHMENT_TYPES on every deployment.
 *
 * Running the check in a CHILD PROCESS with cwd set to an empty temp directory
 * is the point: in-process the repo-root cwd would mask the bug.
 */
describe('ConfigurationService — bundled defaults resolution', () => {
  const coreEntry = resolve(__dirname, '../../core/dist/index.js');

  const loadFromForeignCwd = (configType: string) => {
    const cwd = mkdtempSync(join(tmpdir(), 'civic-cfg-cwd-'));
    const dataPath = join(cwd, 'data', '.civic');
    mkdirSync(dataPath, { recursive: true });

    const script = `
      const { ConfigurationService } = await import(${JSON.stringify(pathToFileURL(coreEntry).href)});
      // No defaultsPath: exercise the constructor default, which is what the
      // API's getConfigurationService() relies on.
      const svc = new ConfigurationService({ dataPath: ${JSON.stringify(dataPath)} });
      const config = await svc.loadConfiguration(${JSON.stringify(configType)});
      process.stdout.write(JSON.stringify({ ok: !!config }));
    `;

    return spawnSync(process.execPath, ['--input-type=module', '-e', script], {
      cwd,
      encoding: 'utf-8',
    });
  };

  for (const configType of ['attachment-types', 'link-categories']) {
    it(`loads the bundled '${configType}' template from an unrelated cwd`, () => {
      const result = loadFromForeignCwd(configType);
      expect(result.stderr).not.toMatch(/Configuration file not found/);
      expect(result.status).toBe(0);
      expect(JSON.parse(result.stdout)).toEqual({ ok: true });
    });
  }
});
