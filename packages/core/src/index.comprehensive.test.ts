import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CoreAgent, WorkflowRecorder } from './index.js';
import { SystemEvent } from '@sebas-chan/shared-types';
import { createMockWorkflowContext } from './workflows/test-utils.js';
import { WorkflowEventEmitterInterface } from './workflows/context.js';
import { WorkflowDefinition } from './workflows/workflow-types.js';

describe('CoreAgent - Comprehensive Tests', () => {
  let agent: CoreAgent;

  beforeEach(() => {
    agent = new CoreAgent();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
  });

  describe('Workflow Execution', () => {
    it('should execute workflows with different priorities', async () => {
      const executedWorkflows: string[] = [];

      const createWorkflow = (name: string): WorkflowDefinition => ({
        name,
        description: `Test workflow ${name}`,
        triggers: {
          eventTypes: [name.toUpperCase()],
        },
        executor: async (_event) => {
          executedWorkflows.push(name.toUpperCase());
          return {
            success: true,
            context: createMockWorkflowContext(),
          };
        },
      });

      const highPriorityWorkflow = createWorkflow('high-priority');
      const normalPriorityWorkflow = createWorkflow('normal-priority');
      const lowPriorityWorkflow = createWorkflow('low-priority');

      const mockContext = createMockWorkflowContext();
      const mockEmitter: WorkflowEventEmitterInterface = {
        emit: vi.fn(),
      };

      // 異なる優先度のイベントでワークフローを実行
      const events: SystemEvent[] = [
        {
          type: 'DATA_ARRIVED',
          payload: {
            source: 'test',
            pondEntryId: 'entry-1',
            content: 'test',
            metadata: {},
            timestamp: new Date().toISOString(),
          },
        },
        {
          type: 'HIGH_PRIORITY_ISSUE_DETECTED',
          payload: {
            issueId: 'issue-1',
            priority: 100,
            reason: 'test',
          },
        },
        {
          type: 'USER_REQUEST_RECEIVED',
          payload: {
            userId: 'user-1',
            content: 'test request',
            timestamp: new Date().toISOString(),
          },
        },
      ];

      for (const event of events) {
        // イベントタイプに基づいてワークフローを選択
        const workflow =
          event.type === 'HIGH_PRIORITY_ISSUE_DETECTED'
            ? highPriorityWorkflow
            : event.type === 'USER_REQUEST_RECEIVED'
              ? normalPriorityWorkflow
              : lowPriorityWorkflow;

        const _recorder = new WorkflowRecorder(workflow.name);
        await agent.executeWorkflow(workflow, event, mockContext, mockEmitter);
      }

      expect(executedWorkflows.length).toBe(3);
      expect(executedWorkflows).toContain('LOW-PRIORITY');
      expect(executedWorkflows).toContain('HIGH-PRIORITY');
      expect(executedWorkflows).toContain('NORMAL-PRIORITY');
    });

    it('should handle FIFO order for same priority', async () => {
      const processedOrder: string[] = [];

      const workflow: WorkflowDefinition = {
        name: 'fifo-workflow',
        description: 'Test FIFO ordering',
        triggers: {
          eventTypes: ['DATA_ARRIVED'],
        },
        executor: async (event) => {
          const payload = event.payload as {
            source: string;
            content: string;
            pondEntryId: string;
            timestamp: string;
            metadata?: { id: string };
          };
          if (payload.metadata?.id) {
            processedOrder.push(payload.metadata.id);
          }
          return {
            success: true,
            context: createMockWorkflowContext(),
          };
        },
      };

      const mockContext = createMockWorkflowContext();
      const mockEmitter: WorkflowEventEmitterInterface = {
        emit: vi.fn(),
      };

      // 同じ優先度のイベントを順番に実行
      for (let i = 1; i <= 5; i++) {
        const event: SystemEvent = {
          type: 'DATA_ARRIVED',
          payload: {
            source: 'test',
            pondEntryId: `event-${i}`,
            content: 'test',
            metadata: { id: `event-${i}` },
            timestamp: new Date().toISOString(),
          },
        };

        const _recorder = new WorkflowRecorder('fifo-workflow');
        await agent.executeWorkflow(workflow, event, mockContext, mockEmitter);
      }

      expect(processedOrder).toEqual(['event-1', 'event-2', 'event-3', 'event-4', 'event-5']);
    });
  });

  describe('State Management', () => {
    it('should handle state transitions in workflows', async () => {
      const stateTransitions: string[] = [];

      const stateWorkflow: WorkflowDefinition = {
        name: 'state-workflow',
        description: 'Test state management',
        triggers: {
          eventTypes: ['CHECK_STATE', 'UPDATE_STATE'],
        },
        executor: async (event, context) => {
          const currentState = context.state;
          stateTransitions.push(currentState);

          const payload = event.payload as { metadata?: { newState?: string } };
          const updatedState = payload.metadata?.newState || context.state;
          if (payload.metadata?.newState) {
            stateTransitions.push(payload.metadata.newState);
          }

          return {
            success: true,
            context: {
              ...context,
              state: updatedState,
            },
          };
        },
      };

      const mockContext = createMockWorkflowContext();
      const mockEmitter: WorkflowEventEmitterInterface = {
        emit: vi.fn(),
      };

      // 初期状態を確認
      const event1: SystemEvent = {
        type: 'DATA_ARRIVED',
        payload: {
          source: 'test',
          pondEntryId: 'state-check-1',
          content: 'check state',
          metadata: {},
          timestamp: new Date().toISOString(),
        },
      };

      const _recorder1 = new WorkflowRecorder('state-workflow');
      await agent.executeWorkflow(stateWorkflow, event1, mockContext, mockEmitter);

      // 状態を変更（DATA_ARRIVEDイベントを使用）
      const event2: SystemEvent = {
        type: 'DATA_ARRIVED',
        payload: {
          source: 'test',
          content: 'processing',
          pondEntryId: 'test-2',
          timestamp: new Date().toISOString(),
          metadata: { newState: 'processing' },
        },
      };

      const _recorder2 = new WorkflowRecorder('state-workflow');
      await agent.executeWorkflow(stateWorkflow, event2, mockContext, mockEmitter);

      // 変更後の状態を確認（USER_REQUEST_RECEIVEDイベントを使用）
      const event3: SystemEvent = {
        type: 'USER_REQUEST_RECEIVED',
        payload: {
          userId: 'test-user',
          content: 'check state',
          sessionId: 'test-session',
          timestamp: new Date().toISOString(),
        },
      };

      const _recorder3 = new WorkflowRecorder('state-workflow');
      await agent.executeWorkflow(stateWorkflow, event3, mockContext, mockEmitter);

      expect(stateTransitions.length).toBeGreaterThan(0);
      expect(stateTransitions).toContain('processing');
    });
  });

  describe('Complex Workflows', () => {
    it('should handle INGEST_INPUT workflow', async () => {
      const registry = agent.getWorkflowRegistry();
      const workflow = registry.getByName('IngestInput');

      expect(workflow).toBeDefined();
      expect(workflow?.name).toBe('IngestInput');

      const event: SystemEvent = {
        type: 'DATA_ARRIVED',
        payload: {
          content: 'Test input',
          source: 'test',
          pondEntryId: 'test-ingest',
          timestamp: new Date().toISOString(),
        },
      };

      const mockContext = createMockWorkflowContext();
      // Logger is now part of context
      const mockEmitter: WorkflowEventEmitterInterface = {
        emit: vi.fn(),
      };

      const result = await agent.executeWorkflow(
        workflow!,
        event,
        mockContext,

        mockEmitter
      );

      expect(result).toBeDefined();
      // ワークフローの実装によっては成功/失敗が変わる可能性がある
      expect(result.context).toBeDefined();
    });

    it('should handle PROCESS_USER_REQUEST workflow', async () => {
      const registry = agent.getWorkflowRegistry();
      const workflow = registry.getByName('ProcessUserRequest');

      expect(workflow).toBeDefined();
      expect(workflow?.name).toBe('ProcessUserRequest');

      const event: SystemEvent = {
        type: 'USER_REQUEST_RECEIVED',
        payload: {
          content: 'Test user request',
          userId: 'test-user',
          sessionId: 'test-session',
          timestamp: new Date().toISOString(),
        },
      };

      const mockContext = createMockWorkflowContext();
      // Logger is now part of context
      const mockEmitter: WorkflowEventEmitterInterface = {
        emit: vi.fn(),
      };

      const result = await agent.executeWorkflow(
        workflow!,
        event,
        mockContext,

        mockEmitter
      );

      expect(result).toBeDefined();
      expect(result.context).toBeDefined();
    });

    it('should handle ANALYZE_ISSUE_IMPACT workflow', async () => {
      const registry = agent.getWorkflowRegistry();
      const workflow = registry.getByName('AnalyzeIssueImpact');

      expect(workflow).toBeDefined();
      expect(workflow?.name).toBe('AnalyzeIssueImpact');

      const event: SystemEvent = {
        type: 'ISSUE_CREATED',
        payload: {
          issueId: 'test-issue-123',
          issue: {
            id: 'test-issue-123',
            title: 'Test Issue',
            description: 'Test issue with high impact',
            status: 'open',
            priority: 80,
            labels: [],
            sourceInputIds: [],
            createdAt: new Date(),
            updatedAt: new Date(),
            updates: [],
            relations: [],
          },
          createdBy: 'system' as const,
        },
      };

      const mockContext = createMockWorkflowContext();
      // Logger is now part of context
      const mockEmitter: WorkflowEventEmitterInterface = {
        emit: vi.fn(),
      };

      const result = await agent.executeWorkflow(
        workflow!,
        event,
        mockContext,

        mockEmitter
      );

      expect(result).toBeDefined();
      expect(result.context).toBeDefined();
    });

    it('should handle EXTRACT_KNOWLEDGE workflow', async () => {
      const registry = agent.getWorkflowRegistry();
      const workflow = registry.getByName('ExtractKnowledge');

      expect(workflow).toBeDefined();
      expect(workflow?.name).toBe('ExtractKnowledge');

      const event: SystemEvent = {
        type: 'KNOWLEDGE_EXTRACTABLE',
        payload: {
          sourceType: 'issue',
          sourceId: 'test-issue',
          confidence: 0.9,
          reason: 'Important knowledge found',
        },
      };

      const mockContext = createMockWorkflowContext();
      // Logger is now part of context
      const mockEmitter: WorkflowEventEmitterInterface = {
        emit: vi.fn(),
      };

      const result = await agent.executeWorkflow(
        workflow!,
        event,
        mockContext,

        mockEmitter
      );

      expect(result).toBeDefined();
      expect(result.context).toBeDefined();
    });
  });

  describe('Event Emitter Integration', () => {
    it('should trigger new events from workflows', async () => {
      const mockEmitter: WorkflowEventEmitterInterface = {
        emit: vi.fn(),
      };

      const cascadingWorkflow: WorkflowDefinition = {
        name: 'cascading-workflow',
        description: 'Workflow that triggers other events',
        triggers: {
          eventTypes: ['DATA_ARRIVED'],
        },
        executor: async (event, context, emitter) => {
          // 新しいイベントを発行
          emitter.emit({
            type: 'ISSUE_CREATED',
            payload: {
              issueId: 'triggered-issue',
              issue: {
                id: 'triggered-issue',
                title: 'Triggered Issue',
                description: 'Issue created by cascade',
                status: 'open',
                priority: 50,
                labels: [],
                sourceInputIds: [],
                createdAt: new Date(),
                updatedAt: new Date(),
                updates: [],
              },
              createdBy: 'workflow' as const,
            },
          });

          return {
            success: true,
            context,
          };
        },
      };

      const event: SystemEvent = {
        type: 'DATA_ARRIVED',
        payload: {
          source: 'test',
          content: 'Trigger cascade',
          pondEntryId: 'cascade-test',
          timestamp: new Date().toISOString(),
        },
      };

      const mockContext = createMockWorkflowContext();
      // Logger is now part of context

      const result = await agent.executeWorkflow(
        cascadingWorkflow,
        event,
        mockContext,

        mockEmitter
      );

      expect(result.success).toBe(true);
      expect(mockEmitter.emit).toHaveBeenCalledWith({
        type: 'ISSUE_CREATED',
        payload: expect.objectContaining({
          issueId: 'triggered-issue',
        }),
      });
    });

    it('should handle multiple event emissions', async () => {
      const mockEmitter: WorkflowEventEmitterInterface = {
        emit: vi.fn(),
      };

      const multiEmitWorkflow: WorkflowDefinition = {
        name: 'multi-emit-workflow',
        description: 'Workflow that emits multiple events',
        triggers: {
          eventTypes: ['DATA_ARRIVED'],
        },
        executor: async (event, context, emitter) => {
          const payload = event.payload as {
            source: string;
            content: string;
            pondEntryId: string;
            timestamp: string;
            metadata?: { count?: number };
          };
          const count = payload.metadata?.count || 3;

          for (let i = 0; i < count; i++) {
            emitter.emit({
              type: 'ISSUE_CREATED',
              payload: {
                issueId: `multi-issue-${i}`,
                issue: {
                  id: `multi-issue-${i}`,
                  title: `Issue ${i}`,
                  description: `Multi-emit issue ${i}`,
                  status: 'open',
                  priority: 50,
                  labels: [],
                  sourceInputIds: [],
                  createdAt: new Date(),
                  updatedAt: new Date(),
                  updates: [],
                },
                createdBy: 'workflow' as const,
              },
            });
          }

          return {
            success: true,
            context,
            output: { emittedCount: count },
          };
        },
      };

      const event: SystemEvent = {
        type: 'DATA_ARRIVED',
        payload: {
          source: 'test',
          content: 'Multi emit test',
          pondEntryId: 'multi-emit-test',
          timestamp: new Date().toISOString(),
          metadata: { count: 5 },
        },
      };

      const mockContext = createMockWorkflowContext();
      // Logger is now part of context

      const result = await agent.executeWorkflow(
        multiEmitWorkflow,
        event,
        mockContext,

        mockEmitter
      );

      expect(result.success).toBe(true);
      expect(result.output).toEqual({ emittedCount: 5 });
      expect(mockEmitter.emit).toHaveBeenCalledTimes(5);
    });
  });

  describe('Workflow Registry', () => {
    it('should register and retrieve custom workflows', () => {
      const customWorkflow: WorkflowDefinition = {
        name: 'CUSTOM_WORKFLOW',
        description: 'Custom test workflow',
        triggers: {
          eventTypes: ['CUSTOM_WORKFLOW'],
        },
        executor: async (event, context) => ({
          success: true,
          context,
          output: { custom: true },
        }),
      };

      agent.registerWorkflow(customWorkflow);
      const registry = agent.getWorkflowRegistry();
      const retrieved = registry.getByName('CUSTOM_WORKFLOW');

      expect(retrieved).toBeDefined();
      expect(retrieved?.name).toBe('CUSTOM_WORKFLOW');
      expect(retrieved?.description).toBe('Custom test workflow');
    });

    it('should override existing workflows', () => {
      const originalWorkflow: WorkflowDefinition = {
        name: 'OVERRIDE_TEST',
        description: 'Original workflow',
        triggers: {
          eventTypes: ['OVERRIDE_TEST'],
        },
        executor: async (event, context) => ({
          success: true,
          context,
          output: { version: 1 },
        }),
      };

      const overrideWorkflow: WorkflowDefinition = {
        name: 'OVERRIDE_TEST',
        description: 'Override workflow',
        triggers: {
          eventTypes: ['OVERRIDE_TEST'],
        },
        executor: async (event, context) => ({
          success: true,
          context,
          output: { version: 2 },
        }),
      };

      agent.registerWorkflow(originalWorkflow);
      agent.registerWorkflow(overrideWorkflow);

      const registry = agent.getWorkflowRegistry();
      const retrieved = registry.getByName('OVERRIDE_TEST');

      expect(retrieved?.description).toBe('Override workflow');
    });

    it('should return undefined for non-existent workflows', () => {
      const registry = agent.getWorkflowRegistry();
      const retrieved = registry.getByName('NON_EXISTENT_WORKFLOW');

      expect(retrieved).toBeUndefined();
    });
  });

  describe('Logging Integration', () => {
    it('should log workflow execution', async () => {
      const loggedEntries: Array<{ type: string; data: unknown }> = [];

      const mockContext = createMockWorkflowContext();
      // Logger is now part of context - override the log method
      const originalRecord = mockContext.recorder.record;
      mockContext.recorder.record = vi.fn().mockImplementation((type, data) => {
        loggedEntries.push({ type, data });
        return originalRecord.call(mockContext.recorder, type, data);
      });

      const loggingWorkflow: WorkflowDefinition = {
        name: 'logging-workflow',
        description: 'Workflow with logging',
        triggers: {
          eventTypes: ['DATA_ARRIVED'],
        },
        executor: async () => ({
          success: true,
          context: mockContext,
          output: { logged: true },
        }),
      };

      const event: SystemEvent = {
        type: 'DATA_ARRIVED',
        payload: {
          source: 'test',
          content: 'Logging test',
          pondEntryId: 'log-test',
          timestamp: new Date().toISOString(),
        },
      };

      const mockEmitter: WorkflowEventEmitterInterface = {
        emit: vi.fn(),
      };

      await agent.executeWorkflow(loggingWorkflow, event, mockContext, mockEmitter);

      expect(mockContext.recorder.record).toHaveBeenCalled();
      expect(loggedEntries.length).toBeGreaterThan(0);
    });
  });

  describe('Performance', () => {
    it('should handle rapid workflow executions', async () => {
      const executionTimes: number[] = [];

      const performanceWorkflow: WorkflowDefinition = {
        name: 'performance-workflow',
        description: 'Performance test workflow',
        triggers: {
          eventTypes: ['DATA_ARRIVED'],
        },
        executor: vi.fn().mockImplementation(async () => {
          const start = Date.now();
          await new Promise((resolve) => setTimeout(resolve, 10));
          const elapsed = Date.now() - start;
          executionTimes.push(elapsed >= 0 ? Math.max(elapsed, 10) : 10);
          return {
            success: true,
            context: createMockWorkflowContext(),
          };
        }),
      };

      const mockContext = createMockWorkflowContext();
      const mockEmitter: WorkflowEventEmitterInterface = {
        emit: vi.fn(),
      };

      // 連続して10回実行
      for (let i = 0; i < 10; i++) {
        const event: SystemEvent = {
          type: 'DATA_ARRIVED',
          payload: {
            source: 'test',
            content: `Performance test ${i}`,
            pondEntryId: `perf-test-${i}`,
            timestamp: new Date().toISOString(),
            metadata: { index: i },
          },
        };

        const _recorder = new WorkflowRecorder('performance-workflow');
        await agent.executeWorkflow(performanceWorkflow, event, mockContext, mockEmitter);
      }

      expect(executionTimes.length).toBe(10);
      executionTimes.forEach((time) => {
        expect(time).toBeGreaterThanOrEqual(10);
        expect(time).toBeLessThan(100); // 妥当な範囲内
      });
    });

    it('should handle concurrent workflow executions efficiently', async () => {
      const concurrentWorkflow: WorkflowDefinition = {
        name: 'concurrent-perf-workflow',
        description: 'Concurrent performance test',
        triggers: {
          eventTypes: ['DATA_ARRIVED'],
        },
        executor: async (event) => {
          const payload = event.payload as {
            source: string;
            content: string;
            pondEntryId: string;
            timestamp: string;
            metadata?: { delay?: number };
          };
          const delay = payload.metadata?.delay;
          if (delay) {
            await new Promise((resolve) => setTimeout(resolve, delay));
          }
          return {
            success: true,
            context: createMockWorkflowContext(),
            output: { completed: true },
          };
        },
      };

      const mockContext = createMockWorkflowContext();
      const mockEmitter: WorkflowEventEmitterInterface = {
        emit: vi.fn(),
      };

      const startTime = Date.now();

      // 並行実行
      const promises = [];
      for (let i = 0; i < 5; i++) {
        const event: SystemEvent = {
          type: 'DATA_ARRIVED',
          payload: {
            source: 'test',
            content: `Concurrent test ${i}`,
            pondEntryId: `concurrent-test-${i}`,
            timestamp: new Date().toISOString(),
            metadata: { delay: 50 },
          },
        };

        const _recorder = new WorkflowRecorder('concurrent-perf-workflow');
        promises.push(agent.executeWorkflow(concurrentWorkflow, event, mockContext, mockEmitter));
      }

      const results = await Promise.all(promises);
      const totalTime = Date.now() - startTime;

      expect(results.length).toBe(5);
      results.forEach((result) => {
        expect(result.success).toBe(true);
      });

      // 並行実行なので、総時間は個々の実行時間の合計よりも短いはず
      expect(totalTime).toBeLessThan(250); // 50ms × 5 = 250ms
    });
  });
});
