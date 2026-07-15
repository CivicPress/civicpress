import { describe, it, expect } from 'vitest';
import { isSimulatedAuthEnabled } from '../simulated-auth-policy.js';

describe('isSimulatedAuthEnabled (FA-API-001 / FA-CLI-001 fail-closed policy)', () => {
  it('denies when NODE_ENV is unset — the realistic deployment default', () => {
    expect(isSimulatedAuthEnabled({})).toBe(false);
  });

  it('denies in production, even if the opt-in flag is set', () => {
    expect(isSimulatedAuthEnabled({ NODE_ENV: 'production' })).toBe(false);
    expect(
      isSimulatedAuthEnabled({
        NODE_ENV: 'production',
        CIVIC_ALLOW_SIMULATED_AUTH: 'true',
      })
    ).toBe(false);
  });

  it('denies unknown / non-dev NODE_ENV values', () => {
    expect(isSimulatedAuthEnabled({ NODE_ENV: 'staging' })).toBe(false);
    expect(isSimulatedAuthEnabled({ NODE_ENV: 'prod' })).toBe(false);
  });

  it('allows under the test runner (never a deployed environment)', () => {
    expect(isSimulatedAuthEnabled({ NODE_ENV: 'test' })).toBe(true);
  });

  it('denies in development without the explicit opt-in flag', () => {
    expect(isSimulatedAuthEnabled({ NODE_ENV: 'development' })).toBe(false);
    expect(
      isSimulatedAuthEnabled({
        NODE_ENV: 'development',
        CIVIC_ALLOW_SIMULATED_AUTH: 'false',
      })
    ).toBe(false);
  });

  it('allows in development only with CIVIC_ALLOW_SIMULATED_AUTH=true', () => {
    expect(
      isSimulatedAuthEnabled({
        NODE_ENV: 'development',
        CIVIC_ALLOW_SIMULATED_AUTH: 'true',
      })
    ).toBe(true);
  });
});
