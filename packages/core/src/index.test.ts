import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CoreAgent, AgentEvent } from './index.js';
import { createMockWorkflowContext } from './test-utils.js';

describe('CoreAgent', () => {
  let agent: CoreAgent;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let consoleLogSpy: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let consoleWarnSpy: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let consoleErrorSpy: any;

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    agent = new CoreAgent();
    // テスト用のWorkflowContextを設定
    agent.setContext(createMockWorkflowContext());
  });

  afterEach(async () => {
    await agent.stop();
    vi.restoreAllMocks();
  });

  it('should create an instance', () => {
    expect(agent).toBeInstanceOf(CoreAgent);
    expect(consoleLogSpy).toHaveBeenCalledWith('Core Agent initialized with workflow support');
  });

  it('should queue events', () => {
    const event: AgentEvent = {
      type: 'TEST_EVENT',
      priority: 'normal',
      payload: { test: true },
      timestamp: new Date(),
    };

    agent.queueEvent(event);
    expect(consoleLogSpy).toHaveBeenCalledWith('Event queued: TEST_EVENT');
  });

  it('should start and stop', async () => {
    const startPromise = agent.start();
    expect(consoleLogSpy).toHaveBeenCalledWith('Starting Core Agent...');

    await agent.stop();
    expect(consoleLogSpy).toHaveBeenCalledWith('Stopping Core Agent...');

    await expect(startPromise).resolves.toBeUndefined();
  });

  it('should process events', async () => {
    const event: AgentEvent = {
      type: 'PROCESS_USER_REQUEST',
      priority: 'high',
      payload: { test: true },
      timestamp: new Date(),
    };

    agent.queueEvent(event);
    const startPromise = agent.start();

    // Give it time to process
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(consoleLogSpy).toHaveBeenCalledWith('Processing event: PROCESS_USER_REQUEST');

    await agent.stop();
    await startPromise;
  });

  it('should handle unknown event types', async () => {
    const event: AgentEvent = {
      type: 'UNKNOWN_EVENT',
      priority: 'normal',
      payload: {},
      timestamp: new Date(),
    };

    agent.queueEvent(event);
    const startPromise = agent.start();

    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Error processing event UNKNOWN_EVENT:',
      expect.any(Error)
    );

    await agent.stop();
    await startPromise;
  });
});
