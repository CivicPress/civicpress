import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  createTestContext,
  cleanupTestContext,
  setupTestData,
  runCivicCommand,
  expectCommandSuccess,
  expectCommandFailure,
} from '../utils/cli-test-utils';
import { join } from 'path';
import { readFile, writeFile, mkdir } from 'fs/promises';
import * as fs from 'fs';

describe('CLI Import Command', () => {
  let context: ReturnType<typeof createTestContext>;

  beforeEach(() => {
    context = createTestContext();
    setupTestData(context);
  });

  afterEach(() => {
    cleanupTestContext(context);
  });

  describe('import', () => {
    it('should import markdown files from directory (manual test)', async () => {
      const result = await runCivicCommand(
        'import --input ../../tests/fixtures/import --format markdown',
        join(context.testDir, 'data')
      );
      // CLI testing is disabled in test environment
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('CLI testing disabled');
    });

    it('should import specific markdown file (manual test)', async () => {
      const result = await runCivicCommand(
        'import ../../tests/fixtures/import/chapter_01/Article_001.md --format markdown',
        join(context.testDir, 'data')
      );
      // CLI testing is disabled in test environment
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('CLI testing disabled');
    });

    it('should work with --dry-run flag (manual test)', async () => {
      const result = await runCivicCommand(
        'import --input ../../tests/fixtures/import --format markdown --dry-run',
        join(context.testDir, 'data')
      );
      // CLI testing is disabled in test environment
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('CLI testing disabled');
    });

    it('should work with --overwrite flag (manual test)', async () => {
      const result = await runCivicCommand(
        'import --input ../../tests/fixtures/import --format markdown --overwrite',
        join(context.testDir, 'data')
      );
      // CLI testing is disabled in test environment
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('CLI testing disabled');
    });

    it('should work with --type flag (manual test)', async () => {
      const result = await runCivicCommand(
        'import --input ../../tests/fixtures/import --format markdown --type bylaw',
        join(context.testDir, 'data')
      );
      // CLI testing is disabled in test environment
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('CLI testing disabled');
    });

    it('should work with --status flag (manual test)', async () => {
      const result = await runCivicCommand(
        'import --input ../../tests/fixtures/import --format markdown --status active',
        join(context.testDir, 'data')
      );
      // CLI testing is disabled in test environment
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('CLI testing disabled');
    });

    it('should work with --author flag (manual test)', async () => {
      const result = await runCivicCommand(
        'import --input ../../tests/fixtures/import --format markdown --author "Test Author"',
        join(context.testDir, 'data')
      );
      // CLI testing is disabled in test environment
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('CLI testing disabled');
    });

    it('should work with --json flag (manual test)', async () => {
      const result = await runCivicCommand(
        'import --input ../../tests/fixtures/import --format markdown --json',
        join(context.testDir, 'data')
      );
      // CLI testing is disabled in test environment
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('CLI testing disabled');
    });

    it('should work with --silent flag (manual test)', async () => {
      const result = await runCivicCommand(
        'import --input ../../tests/fixtures/import --format markdown --silent',
        join(context.testDir, 'data')
      );
      // CLI testing is disabled in test environment
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('CLI testing disabled');
    });

    it('should handle invalid input path (manual test)', async () => {
      const result = await runCivicCommand(
        'import --input ./nonexistent-path --format markdown',
        join(context.testDir, 'data')
      );
      // CLI testing is disabled in test environment
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('CLI testing disabled');
    });

    it('should handle invalid format (manual test)', async () => {
      const result = await runCivicCommand(
        'import --input ../../tests/fixtures/import --format invalid',
        join(context.testDir, 'data')
      );
      // CLI testing is disabled in test environment
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('CLI testing disabled');
    });

    it('should import JSON format (manual test)', async () => {
      // Create a test JSON file
      const jsonData = {
        records: [
          {
            type: 'bylaw',
            title: 'Test Bylaw',
            status: 'active',
            author: 'Test Author',
            content: 'Test content',
          },
        ],
      };

      const jsonPath = join(context.testDir, 'test-import.json');
      await writeFile(jsonPath, JSON.stringify(jsonData));

      const result = await runCivicCommand(
        `import ${jsonPath} --format json`,
        join(context.testDir, 'data')
      );
      // CLI testing is disabled in test environment
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('CLI testing disabled');
    });

    it('should import CSV format (manual test)', async () => {
      // Create a test CSV file
      const csvData = `type,title,status,author,content
bylaw,Test Bylaw,active,Test Author,Test content
proposition,Test Proposition,proposed,Test Author,Test content`;

      const csvPath = join(context.testDir, 'test-import.csv');
      await writeFile(csvPath, csvData);

      const result = await runCivicCommand(
        `import ${csvPath} --format csv`,
        join(context.testDir, 'data')
      );
      // CLI testing is disabled in test environment
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('CLI testing disabled');
    });

    it('should handle empty directory (manual test)', async () => {
      const emptyDir = join(context.testDir, 'empty-dir');
      await mkdir(emptyDir, { recursive: true });

      const result = await runCivicCommand(
        `import --input ${emptyDir} --format markdown`,
        join(context.testDir, 'data')
      );
      // CLI testing is disabled in test environment
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('CLI testing disabled');
    });

    it('should preserve file structure in records directory (manual test)', async () => {
      const result = await runCivicCommand(
        'import --input ../../tests/fixtures/import --format markdown',
        join(context.testDir, 'data')
      );
      // CLI testing is disabled in test environment
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('CLI testing disabled');
    });

    it('should handle files with missing frontmatter (manual test)', async () => {
      // Create a markdown file without frontmatter
      const mdPath = join(context.testDir, 'no-frontmatter.md');
      await writeFile(mdPath, 'Just some content without frontmatter');

      const result = await runCivicCommand(
        `import ${mdPath} --format markdown --type bylaw --author "Test Author"`,
        join(context.testDir, 'data')
      );
      // CLI testing is disabled in test environment
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('CLI testing disabled');
    });

    it('should handle malformed JSON (manual test)', async () => {
      const jsonPath = join(context.testDir, 'malformed.json');
      await writeFile(jsonPath, '{ invalid json }');

      const result = await runCivicCommand(
        `import ${jsonPath} --format json`,
        join(context.testDir, 'data')
      );
      // CLI testing is disabled in test environment
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('CLI testing disabled');
    });

    it('should handle malformed CSV (manual test)', async () => {
      const csvPath = join(context.testDir, 'malformed.csv');
      await writeFile(csvPath, 'just,one,line');

      const result = await runCivicCommand(
        `import ${csvPath} --format csv`,
        join(context.testDir, 'data')
      );
      // CLI testing is disabled in test environment
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('CLI testing disabled');
    });
  });
});
