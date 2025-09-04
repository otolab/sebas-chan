import { describe, it, expect } from 'vitest';
import type { Issue, Flow } from './index';

describe('shared-types', () => {
  it('should export type definitions', () => {
    const issue: Issue = {
      id: 'test-1',
      title: 'Test Issue',
      description: 'Test Description',
      status: 'open',
      labels: [],
      updates: [],
      relations: [],
      sourceInputIds: [],
    };

    expect(issue.id).toBe('test-1');
    expect(issue.status).toBe('open');
  });

  it('should handle Flow type', () => {
    const flow: Flow = {
      id: 'flow-1',
      title: 'Test Flow',
      description: 'Test Flow Description',
      status: 'active',
      priorityScore: 0.5,
      issueIds: [],
    };

    expect(flow.status).toBe('active');
    expect(flow.priorityScore).toBeGreaterThanOrEqual(0);
    expect(flow.priorityScore).toBeLessThanOrEqual(1);
  });
});
