import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdirSync, promises as fsPromises, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { TemplateLoader } from '../../core/src/utils/template/loader.js';
import { GeographyManager } from '../../core/src/geography/geography-manager.js';
import { CivicPress } from '../../core/src/civic-core.js';
import {
  createTestInstance,
  type TestInstance,
} from '../fixtures/test-instance.js';

/**
 * The functions that turn a caller-supplied NAME into a path, driven with
 * names that are not names. Each test plants a file the function must not
 * reach and asks for it.
 *
 * The routes in front of these functions validate what they pass in. These
 * tests skip the routes on purpose: a guarantee that lives only in the caller
 * is one forgotten validator away from not existing.
 */
describe('names that become paths stay inside their root', () => {
  let instance: TestInstance;

  const write = (file: string, content: string) => {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, content);
  };

  const template = (title: string) =>
    `---\ntype: bylaw\nvalidation: {}\nsections: []\n---\n\n# ${title}\n`;

  beforeEach(() => {
    instance = createTestInstance({ prefix: 'containment' });
  });

  afterEach(() => instance.cleanup());

  describe('TemplateLoader', () => {
    let loader: TemplateLoader;
    let templates: string;

    beforeEach(() => {
      templates = join(instance.dataDir, '.civic', 'templates');
      write(join(templates, 'bylaw', 'default.md'), template('Real template'));
      // One level above the template directory, and further out.
      write(
        join(instance.dataDir, '.civic', 'private.md'),
        template('PRIVATE')
      );
      write(join(instance.root, 'outside', 'secret.md'), template('SECRET'));
      loader = new TemplateLoader(instance.dataDir);
    });

    it('loads and lists a real template', async () => {
      expect(
        (await loader.loadTemplate('bylaw', 'default'))?.content
      ).toContain('Real template');
      expect(loader.listTemplates('bylaw')).toEqual(['default']);
    });

    it.each([
      ['a type that climbs out', '../../../outside', 'secret'],
      ['a name that climbs out', 'bylaw', '../../../../outside/secret'],
      ['a type one level up', '..', 'private'],
    ])('does not load through %s', async (_label, type, name) => {
      expect(await loader.loadTemplate(type, name)).toBeNull();
    });

    it.each(['../../../outside', '..', '../..', 'bylaw/..'])(
      'lists nothing for the type %j',
      (type) => {
        expect(loader.listTemplates(type)).toEqual([]);
      }
    );

    it('does not throw when the type names a file', () => {
      // readdirSync on a file is ENOTDIR — a 500 over HTTP, where a missing
      // path was a 200.
      expect(() => loader.listTemplates('../private.md')).not.toThrow();
      expect(loader.listTemplates('../private.md')).toEqual([]);
    });

    it('does not follow `extends` out of the template directory', async () => {
      write(
        join(templates, 'bylaw', 'child.md'),
        `---\ntype: bylaw\nextends: ../private\nvalidation: {}\nsections: []\n---\n\n# Child\n`
      );

      const child = await loader.loadTemplate('bylaw', 'child');

      // `extends: '../private'` used to resolve to `.civic/private.md` and
      // merge it in as the parent.
      expect(child).not.toBeNull();
      expect(child?.parentTemplate).toBeUndefined();
      expect(JSON.stringify(child)).not.toContain('PRIVATE');
    });

    it('does not load a partial through its name', () => {
      write(
        join(instance.dataDir, '.civic', 'partials', 'header.md'),
        '---\n---\nHEADER\n'
      );

      expect(loader.loadPartial('header')?.content).toContain('HEADER');
      expect(loader.loadPartial('../private')).toBeNull();
      expect(loader.loadPartial('../../../outside/secret')).toBeNull();
    });
  });

  describe('GeographyManager.listGeographyFiles', () => {
    let civicPress: CivicPress;
    let manager: GeographyManager;

    const geography = (name: string) =>
      [
        '---',
        `id: ${name}`,
        `name: ${name}`,
        'type: geojson',
        'category: zone',
        'description: planted',
        "created_at: '2026-01-01T00:00:00Z'",
        "updated_at: '2026-01-01T00:00:00Z'",
        '---',
        '',
        '```json',
        '{"type":"FeatureCollection","features":[{"type":"Feature","geometry":{"type":"Point","coordinates":[0,0]},"properties":{}}]}',
        '```',
        '',
      ].join('\n');

    beforeEach(async () => {
      civicPress = new CivicPress({
        dataDir: instance.dataDir,
        database: {
          type: 'sqlite' as const,
          sqlite: { file: instance.dbFile },
        },
      });
      await civicPress.initialize();
      manager = new GeographyManager(
        instance.dataDir,
        civicPress.getDatabaseService()
      );
      write(
        join(instance.dataDir, 'geography', 'geojson', 'zone', 'real.md'),
        geography('real')
      );
      // Where each escape below lands: `<root>/outside` for the category,
      // `<root>/outside/zone` for the type.
      write(join(instance.root, 'outside', 'planted.md'), geography('planted'));
      write(
        join(instance.root, 'outside', 'zone', 'planted.md'),
        geography('planted')
      );
    });

    afterEach(async () => {
      await civicPress.shutdown();
    });

    it('lists a real geography file', async () => {
      const { files } = await manager.listGeographyFiles(
        'zone' as never,
        'geojson' as never
      );
      expect(files.map((file) => file.name)).toEqual(['real']);
    });

    it.each([
      // From `<root>/data/geography/geojson`, and from `<root>/data/geography`.
      ['category', '../../../outside', 'geojson'],
      ['type', 'zone', '../../outside'],
    ])(
      'reads nothing through a %s that climbs out',
      async (_l, category, type) => {
        // This one READ the files it found: readdir, then readFile on each
        // `.md`. It returned none of them only because each parsed file's own
        // category failed to equal the requested one — so the result cannot
        // show the difference, and the filesystem calls have to be watched.
        // The route's allowlist was the only thing in front of this, and the
        // route is anonymous.
        const outside = join(instance.root, 'outside');
        const readdir = vi.spyOn(fsPromises, 'readdir');
        const readFile = vi.spyOn(fsPromises, 'readFile');

        const { files, total } = await manager.listGeographyFiles(
          category as never,
          type as never
        );

        const touched = [...readdir.mock.calls, ...readFile.mock.calls]
          .map(([target]) => String(target))
          .filter((target) => target.startsWith(outside));
        readdir.mockRestore();
        readFile.mockRestore();

        expect(touched).toEqual([]);
        expect(files).toEqual([]);
        expect(total).toBe(0);
      }
    );
  });
});
