import { describe, it, expect } from 'vitest';
import { Reporter } from './index';

describe('Reporter', () => {
  it('should create an instance with name', () => {
    const reporter = new Reporter('TestReporter');
    expect(reporter).toBeInstanceOf(Reporter);
    expect(reporter.name).toBe('TestReporter');
  });

  it('should have collect method', async () => {
    const reporter = new Reporter('TestReporter');
    const result = await reporter.collect();
    expect(result).toBeDefined();
    expect(result.data).toBe('sample');
  });
});
