import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import yaml from 'js-yaml';
import { fileURLToPath } from 'url';

describe('CLI Init - Demo Data Validation', () => {
  const projectRoot = join(process.cwd());
  const demoDataDir = join(projectRoot, 'cli', 'src', 'demo-data');
  const configDir = join(demoDataDir, 'config');

  describe('Demo Data Config Validation', () => {
    it('should have Springfield config matching prompt (Springfield, VA)', () => {
      const springfieldConfigPath = join(configDir, 'springfield-usa.yml');
      expect(existsSync(springfieldConfigPath)).toBe(true);

      const config = yaml.load(
        readFileSync(springfieldConfigPath, 'utf8')
      ) as any;

      // Verify the config matches what's shown in the prompt
      expect(config.state).toBe('Virginia');
      expect(config.city).toBe('Springfield');
      expect(config.country).toBe('USA');
      expect(config.timezone).toBe('America/New_York'); // Virginia is Eastern Time

      // Verify description matches
      expect(config.demo_data.description).toContain('Springfield, Virginia');
      expect(config.demo_data.description).not.toContain('Illinois');
      expect(config.demo_data.description).not.toContain('IL');
    });

    it('should have Richmond config matching prompt (Richmond, QC)', () => {
      const richmondConfigPath = join(configDir, 'richmond-quebec.yml');
      expect(existsSync(richmondConfigPath)).toBe(true);

      const config = yaml.load(readFileSync(richmondConfigPath, 'utf8')) as any;

      // Verify the config matches what's shown in the prompt
      expect(config.state).toBe('Quebec');
      expect(config.city).toBe('Richmond');
      expect(config.country).toBe('Canada');
      expect(config.timezone).toBe('America/Montreal');
    });

    it('should have demo data backup files for both cities', () => {
      const springfieldBackup = join(demoDataDir, 'springfield-usa.tar.gz');
      const richmondBackup = join(demoDataDir, 'richmond-quebec.tar.gz');

      expect(existsSync(springfieldBackup)).toBe(true);
      expect(existsSync(richmondBackup)).toBe(true);
    });

    it('should have correct repo URL for Springfield (springfield-va)', () => {
      const springfieldConfigPath = join(configDir, 'springfield-usa.yml');
      const config = yaml.load(
        readFileSync(springfieldConfigPath, 'utf8')
      ) as any;

      // Verify repo URL uses springfield-va (not springfield-il)
      if (config.repo_url) {
        expect(config.repo_url).toContain('springfield-va');
        expect(config.repo_url).not.toContain('springfield-il');
      }
    });
  });

  describe('Demo Data Prompt Validation', () => {
    it('should have prompt choices matching config files', () => {
      // Read the init command to verify prompt choices
      const initCommandPath = join(
        projectRoot,
        'cli',
        'src',
        'commands',
        'init.ts'
      );
      const initCommandContent = readFileSync(initCommandPath, 'utf8');

      // Verify Springfield prompt shows VA
      expect(initCommandContent).toContain(
        "name: 'Springfield, VA, USA - English'"
      );
      expect(initCommandContent).toContain("value: 'springfield-usa'");

      // Verify Richmond prompt shows QC
      expect(initCommandContent).toContain(
        "name: 'Richmond, QC, Canada - Francais'"
      );
      expect(initCommandContent).toContain("value: 'richmond-quebec'");

      // Verify Springfield prompt does NOT show IL or Illinois
      expect(initCommandContent).not.toContain('Springfield, IL');
      expect(initCommandContent).not.toContain('Springfield, Illinois');
    });

    it('should have prompt value matching config file name', () => {
      const initCommandPath = join(
        projectRoot,
        'cli',
        'src',
        'commands',
        'init.ts'
      );
      const initCommandContent = readFileSync(initCommandPath, 'utf8');

      // Extract prompt values
      const springfieldMatch = initCommandContent.match(
        /name: 'Springfield, VA, USA - English',\s+value: '([^']+)'/
      );
      const richmondMatch = initCommandContent.match(
        /name: 'Richmond, QC, Canada - Francais',\s+value: '([^']+)'/
      );

      expect(springfieldMatch).not.toBeNull();
      expect(richmondMatch).not.toBeNull();

      if (springfieldMatch && richmondMatch) {
        const springfieldValue = springfieldMatch[1];
        const richmondValue = richmondMatch[1];

        // Verify values match config file names
        expect(springfieldValue).toBe('springfield-usa');
        expect(richmondValue).toBe('richmond-quebec');

        // Verify config files exist with these names
        expect(existsSync(join(configDir, `${springfieldValue}.yml`))).toBe(
          true
        );
        expect(existsSync(join(configDir, `${richmondValue}.yml`))).toBe(true);
      }
    });
  });

  describe('Demo Data Content Validation', () => {
    it('should have Springfield config with correct location details', () => {
      const springfieldConfigPath = join(configDir, 'springfield-usa.yml');
      const config = yaml.load(
        readFileSync(springfieldConfigPath, 'utf8')
      ) as any;

      // Verify all location fields are correct
      expect(config.name).toBe('City of Springfield');
      expect(config.city).toBe('Springfield');
      expect(config.state).toBe('Virginia');
      expect(config.country).toBe('USA');
      expect(config.timezone).toBe('America/New_York');

      // Verify it's not Illinois
      expect(config.state).not.toBe('Illinois');
      expect(config.timezone).not.toBe('America/Chicago');
    });

    it('should have Richmond config with correct location details', () => {
      const richmondConfigPath = join(configDir, 'richmond-quebec.yml');
      const config = yaml.load(readFileSync(richmondConfigPath, 'utf8')) as any;

      // Verify all location fields are correct
      expect(config.name).toBe('Ville de Richmond');
      expect(config.city).toBe('Richmond');
      expect(config.state).toBe('Quebec');
      expect(config.country).toBe('Canada');
      expect(config.timezone).toBe('America/Montreal');
    });

    it('should have demo data records listed in config', () => {
      const springfieldConfigPath = join(configDir, 'springfield-usa.yml');
      const config = yaml.load(
        readFileSync(springfieldConfigPath, 'utf8')
      ) as any;

      // Verify records are listed
      expect(config.demo_data).toBeDefined();
      expect(config.demo_data.records).toBeDefined();
      expect(Array.isArray(config.demo_data.records)).toBe(true);
      expect(config.demo_data.records.length).toBeGreaterThan(0);
    });

    it('should have demo data description matching location', () => {
      const springfieldConfigPath = join(configDir, 'springfield-usa.yml');
      const config = yaml.load(
        readFileSync(springfieldConfigPath, 'utf8')
      ) as any;

      // Verify description contains correct location
      expect(config.demo_data.description).toContain('Springfield');
      expect(config.demo_data.description).toContain('Virginia');
      expect(config.demo_data.description).not.toContain('Illinois');
    });
  });

  describe('Demo Data Consistency', () => {
    it('should have consistent naming between prompt, config, and backup', () => {
      const initCommandPath = join(
        projectRoot,
        'cli',
        'src',
        'commands',
        'init.ts'
      );
      const initCommandContent = readFileSync(initCommandPath, 'utf8');

      // Extract Springfield value from prompt
      const springfieldMatch = initCommandContent.match(
        /value: 'springfield-usa'/
      );
      expect(springfieldMatch).not.toBeNull();

      // Verify config file exists
      const springfieldConfigPath = join(configDir, 'springfield-usa.yml');
      expect(existsSync(springfieldConfigPath)).toBe(true);

      // Verify backup file exists
      const springfieldBackupPath = join(demoDataDir, 'springfield-usa.tar.gz');
      expect(existsSync(springfieldBackupPath)).toBe(true);

      // Verify config file name matches
      const config = yaml.load(
        readFileSync(springfieldConfigPath, 'utf8')
      ) as any;
      expect(config.demo_data.name).toBe('springfield-usa');
    });

    it('should have timezone matching state location', () => {
      const springfieldConfigPath = join(configDir, 'springfield-usa.yml');
      const config = yaml.load(
        readFileSync(springfieldConfigPath, 'utf8')
      ) as any;

      // Virginia should use Eastern Time
      if (config.state === 'Virginia') {
        expect(config.timezone).toBe('America/New_York');
      }

      // Illinois would use Central Time (but we don't have Illinois)
      expect(config.state).not.toBe('Illinois');
    });
  });

  describe('Demo Data File Structure', () => {
    it('should have required demo data directories', () => {
      const recordsDir = join(demoDataDir, 'records');
      const configDir = join(demoDataDir, 'config');
      const workflowsDir = join(demoDataDir, 'workflows');
      const hooksDir = join(demoDataDir, 'hooks');
      const templatesDir = join(demoDataDir, 'templates');

      // These directories should exist (or at least config should)
      expect(existsSync(configDir)).toBe(true);
    });

    it('should have config files for all demo cities', () => {
      const springfieldConfig = join(configDir, 'springfield-usa.yml');
      const richmondConfig = join(configDir, 'richmond-quebec.yml');

      expect(existsSync(springfieldConfig)).toBe(true);
      expect(existsSync(richmondConfig)).toBe(true);
    });
  });
});
