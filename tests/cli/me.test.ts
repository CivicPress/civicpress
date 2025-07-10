import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execSync } from 'child_process';
import { join } from 'path';
import { existsSync, rmSync, mkdirSync } from 'fs';

describe('civic me command', () => {
  const cliPath = join(__dirname, '../../cli/dist/index.js');
  const testDataDir = join(__dirname, '../fixtures/me-test');

  beforeEach(() => {
    // Clean up test data directory
    if (existsSync(testDataDir)) {
      rmSync(testDataDir, { recursive: true, force: true });
    }
    // Ensure directory exists
    mkdirSync(testDataDir, { recursive: true });
  });

  afterEach(() => {
    // Clean up test data directory
    if (existsSync(testDataDir)) {
      rmSync(testDataDir, { recursive: true, force: true });
    }
  });

  it('should show authentication required when no token is provided', () => {
    let result = '';
    try {
      result = execSync(`node "${cliPath}" auth:me`, {
        encoding: 'utf8',
        cwd: testDataDir,
        stdio: 'pipe',
      });
    } catch (e: any) {
      result = e.stdout || e.message || '';
    }
    expect(result).toContain('💡 Use --token to provide a session token');
    expect(result).toContain(
      '💡 Run "civic auth:login" to get a session token'
    );
  });

  it('should output JSON format when --json flag is used (no token)', () => {
    let result = '';
    try {
      result = execSync(`node "${cliPath}" auth:me --json`, {
        encoding: 'utf8',
        cwd: testDataDir,
        stdio: 'pipe',
      });
    } catch (e: any) {
      result = e.stdout || e.message || '';
    }
    expect(result).toContain('"error": "Authentication required"');
    expect(result).toContain(
      '"details": "Use --token to provide a session token"'
    );
  });

  it.skip('should suppress output when --silent flag is used', () => {
    let result = '';
    try {
      result = execSync(`node "${cliPath}" auth:me --silent`, {
        encoding: 'utf8',
        cwd: testDataDir,
        stdio: 'pipe',
      });
    } catch (e: any) {
      result = e.stdout || e.message || '';
    }
    expect(result).not.toContain('💡 Use --token to provide a session token');
  });

  it('should validate session token when --token is provided (invalid token)', () => {
    let result = '';
    try {
      result = execSync(`node "${cliPath}" auth:me --token invalid-token`, {
        encoding: 'utf8',
        cwd: testDataDir,
        stdio: 'pipe',
      });
    } catch (e: any) {
      result = e.stdout || e.message || '';
    }
    expect(result).toContain(
      '💡 Run "civic auth:login" to get a new session token'
    );
  });

  it('should output JSON format when --json flag is used (invalid token)', () => {
    let result = '';
    try {
      result = execSync(
        `node "${cliPath}" auth:me --json --token invalid-token`,
        {
          encoding: 'utf8',
          cwd: testDataDir,
          stdio: 'pipe',
        }
      );
    } catch (e: any) {
      result = e.stdout || e.message || '';
    }
    expect(result).toContain('"error": "Invalid session token"');
    expect(result).toContain(
      '"details": "The provided session token is invalid or expired"'
    );
  });

  it('should show help when --help flag is used', () => {
    const result = execSync(`node "${cliPath}" auth:me --help`, {
      encoding: 'utf8',
      cwd: testDataDir,
      stdio: 'pipe',
    });

    expect(result).toContain('Usage:');
    expect(result).toContain('civic auth:me');
    expect(result).toContain('--token <token>');
    expect(result).toContain('--json');
    expect(result).toContain('--silent');
  });
});
