import { describe, it, expect } from 'vitest';
import { execSync } from 'child_process';
import { resolve, join } from 'path';

describe('CLI Debug', () => {
  it('should execute CLI help command', () => {
    const projectRoot = resolve(__dirname, '../..');
    const cliPath = join(projectRoot, 'cli', 'dist', 'index.js');

    try {
      const result = execSync(`node "${cliPath}" --help`, {
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      expect(result).toContain('civic');
    } catch (error: any) {
      throw error;
    }
  });

  it('should execute init help command', () => {
    const projectRoot = resolve(__dirname, '../..');
    const cliPath = join(projectRoot, 'cli', 'dist', 'index.js');

    try {
      const result = execSync(`node "${cliPath}" init --help`, {
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      expect(result).toContain('civic init');
    } catch (error: any) {
      throw error;
    }
  });

  it('should execute init command (should fail due to interactive)', () => {
    const projectRoot = resolve(__dirname, '../..');
    const cliPath = join(projectRoot, 'cli', 'dist', 'index.js');

    try {
      const result = execSync(`node "${cliPath}" init`, {
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      expect(result).toContain('Initializing CivicPress repository');
    } catch (error: any) {
      // This should fail due to interactive prompts, but we should see output
      expect(error.stdout).toContain('Initializing CivicPress repository');
    }
  });
});
