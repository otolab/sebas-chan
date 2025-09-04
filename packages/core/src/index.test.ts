import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { CoreAgent } from './index';

describe('CoreAgent', () => {
  let agent: CoreAgent;

  beforeEach(() => {
    agent = new CoreAgent();
  });

  afterEach(async () => {
    await agent.stop();
  });

  it('should create an instance', () => {
    expect(agent).toBeInstanceOf(CoreAgent);
  });

  it('should queue events', () => {
    const event = {
      type: 'TEST_EVENT',
      priority: 'normal' as const,
      payload: { test: true },
      timestamp: new Date(),
    };

    agent.queueEvent(event);
    expect(agent).toBeDefined();
  });

  it('should start and stop', async () => {
    const startPromise = agent.start();
    await agent.stop();
    await expect(startPromise).resolves.toBeUndefined();
  });
});
