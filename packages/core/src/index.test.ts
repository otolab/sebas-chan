import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CoreAgent, AgentEvent, generateWorkflowRegistry, WorkflowLogger } from './index.js';
import { createMockWorkflowContext } from './test-utils.js';
import { WorkflowEventEmitterInterface } from './workflows/context.js';

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
  });

  afterEach(async () => {
    vi.restoreAllMocks();
  });

  it('should create an instance', () => {
    expect(agent).toBeInstanceOf(CoreAgent);
    expect(consoleLogSpy).toHaveBeenCalledWith('Core Agent initialized with workflow support');
  });

  it('should execute workflow successfully', async () => {
    const event: AgentEvent = {
      type: 'PROCESS_USER_REQUEST',
      payload: { test: true },
      timestamp: new Date(),
    };

    const mockContext = createMockWorkflowContext();
    const mockEmitter: WorkflowEventEmitterInterface = {
      emit: vi.fn(),
    };

    const registry = agent.getWorkflowRegistry();
    const workflow = registry.get('ProcessUserRequest');

    if (!workflow) {
      throw new Error('Workflow not found');
    }

    const result = await agent.executeWorkflow(
      workflow,
      event,
      mockContext,
      mockEmitter
    );

    expect(result).toBeDefined();
    expect(result.success).toBeDefined();
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Executing workflow:'));
  });

  it('should handle workflow errors', async () => {
    const event: AgentEvent = {
      type: 'TEST_ERROR',
      payload: {},
      timestamp: new Date(),
    };

    const mockContext = createMockWorkflowContext();
    const mockEmitter: WorkflowEventEmitterInterface = {
      emit: vi.fn(),
    };

    // エラーを投げるワークフローを登録
    const errorWorkflow = {
      name: 'error-workflow',
      description: 'Test workflow that throws an error',
      executor: async () => {
        throw new Error('Test error');
      },
    };

    agent.registerWorkflow(errorWorkflow);
    const registry = agent.getWorkflowRegistry();
    registry.register({
      ...errorWorkflow,
      name: 'TEST_ERROR', // イベントタイプと一致させる
    });

    const result = await agent.executeWorkflow(
      errorWorkflow,
      event,
      mockContext,
      mockEmitter
    );

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Error executing workflow'),
      expect.any(Error)
    );
  });

  it('should register and get workflows', () => {
    const customWorkflow = {
      name: 'CUSTOM_WORKFLOW',
      description: 'Custom test workflow',
      executor: async () => ({
        success: true,
        context: createMockWorkflowContext(),
      }),
    };

    agent.registerWorkflow(customWorkflow);
    const registry = agent.getWorkflowRegistry();
    const retrieved = registry.get('CUSTOM_WORKFLOW');

    expect(retrieved).toBeDefined();
    expect(retrieved?.name).toBe('CUSTOM_WORKFLOW');
  });

  it('should generate workflow registry with standard workflows', () => {
    const registry = generateWorkflowRegistry();

    // 標準ワークフローが登録されていることを確認
    expect(registry.get('IngestInput')).toBeDefined();
    expect(registry.get('ProcessUserRequest')).toBeDefined();
    expect(registry.get('AnalyzeIssueImpact')).toBeDefined();
    expect(registry.get('ExtractKnowledge')).toBeDefined();
  });
});
