import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CoreAgent, generateWorkflowRegistry } from './index.js';
import { SystemEvent } from '@sebas-chan/shared-types';
import { createMockWorkflowContext } from './workflows/test-utils.js';
import { WorkflowEventEmitterInterface } from './workflows/context.js';

describe('CoreAgent', () => {
  let agent: CoreAgent;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let consoleLogSpy: any;

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
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
    const event: SystemEvent = {
      type: 'USER_REQUEST_RECEIVED',
      payload: {
        userId: 'test-user',
        content: 'Test request',
        sessionId: 'test-session',
        timestamp: new Date().toISOString(),
      },
    };

    const mockContext = createMockWorkflowContext();
    const mockEmitter: WorkflowEventEmitterInterface = {
      emit: vi.fn(),
    };

    const registry = agent.getWorkflowRegistry();
    const workflow = registry.getByName('ProcessUserRequest');

    if (!workflow) {
      throw new Error('Workflow not found');
    }

    const result = await agent.executeWorkflow(workflow, event, mockContext, mockEmitter);

    expect(result).toBeDefined();
    expect(result.success).toBeDefined();
    // ログ出力の検証は削除（recorderを使用するように変更されたため）
  });

  it('should handle workflow errors', async () => {
    const event: SystemEvent = {
      type: 'DATA_ARRIVED',
      payload: {
        source: 'test',
        content: 'Error test',
        pondEntryId: 'error-test',
        timestamp: new Date().toISOString(),
      },
    };

    const mockContext = createMockWorkflowContext();
    const mockEmitter: WorkflowEventEmitterInterface = {
      emit: vi.fn(),
    };

    // エラーを投げるワークフローを登録
    const errorWorkflow = {
      name: 'error-workflow',
      description: 'Test workflow that throws an error',
      triggers: {
        eventTypes: ['TEST_ERROR'],
      },
      executor: async () => {
        throw new Error('Test error');
      },
    };

    agent.registerWorkflow(errorWorkflow);
    const registry = agent.getWorkflowRegistry();
    registry.register(errorWorkflow);

    const result = await agent.executeWorkflow(errorWorkflow, event, mockContext, mockEmitter);

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
    expect(result.error?.message).toBe('Test error');
    // エラーログの検証は削除（recorderを使用するように変更されたため）
  });

  it('should register and get workflows', () => {
    const customWorkflow = {
      name: 'CUSTOM_WORKFLOW',
      description: 'Custom test workflow',
      triggers: {
        eventTypes: ['CUSTOM_WORKFLOW'],
      },
      executor: async () => ({
        success: true,
        context: createMockWorkflowContext(),
      }),
    };

    agent.registerWorkflow(customWorkflow);
    const registry = agent.getWorkflowRegistry();
    const retrieved = registry.getByName('CUSTOM_WORKFLOW');

    expect(retrieved).toBeDefined();
    expect(retrieved?.name).toBe('CUSTOM_WORKFLOW');
  });

  it('should generate workflow registry with standard workflows', () => {
    const registry = generateWorkflowRegistry();

    // 標準ワークフローが登録されていることを確認
    expect(registry.getByName('IngestInput')).toBeDefined();
    expect(registry.getByName('ProcessUserRequest')).toBeDefined();
    expect(registry.getByName('AnalyzeIssueImpact')).toBeDefined();
    expect(registry.getByName('ExtractKnowledge')).toBeDefined();
  });
});
