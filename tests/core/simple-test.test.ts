import { describe, it, expect } from 'vitest';

describe('Simple Test', () => {
  it('should work', () => {
    expect(1 + 1).toBe(2);
  });

  it('should test basic math', () => {
    expect(2 * 3).toBe(6);
    expect(10 - 5).toBe(5);
  });
});
