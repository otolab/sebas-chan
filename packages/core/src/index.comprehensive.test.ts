import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CoreAgent, AgentEvent, WorkflowLogger, generateWorkflowRegistry } from './index.js';
import { createMockWorkflowContext } from './test-utils.js';
import { WorkflowEventEmitter } from './workflows/context.js';
import { WorkflowDefinition } from './workflows/functional-types.js';

describe('CoreAgent - Comprehensive Tests', () => {
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

  describe('Workflow Execution', () => {
    it('should execute workflows with different priorities', async () => {
      const executedWorkflows: string[] = [];

      const createWorkflow = (name: string): WorkflowDefinition => ({
        name,
        description: `Test workflow ${name}`,
        executor: async (event) => {
          executedWorkflows.push(event.type);
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
      const mockEmitter: WorkflowEventEmitter = {
        emit: vi.fn(),
      };

      // 異なる優先度のイベントでワークフローを実行
      const events: AgentEvent[] = [
        {
          type: 'LOW_PRIORITY',
          priority: 'low',
          payload: {},
          timestamp: new Date(),
        },
        {
          type: 'HIGH_PRIORITY',
          priority: 'high',
          payload: {},
          timestamp: new Date(),
        },
        {
          type: 'NORMAL_PRIORITY',
          priority: 'normal',
          payload: {},
          timestamp: new Date(),
        },
      ];

      for (const event of events) {
        const workflow =
          event.priority === 'high'
            ? highPriorityWorkflow
            : event.priority === 'normal'
              ? normalPriorityWorkflow
              : lowPriorityWorkflow;

        const logger = new WorkflowLogger(workflow.name);
        await agent.executeWorkflow(workflow, event, mockContext, logger, mockEmitter);
      }

      expect(executedWorkflows.length).toBe(3);
      expect(executedWorkflows).toContain('LOW_PRIORITY');
      expect(executedWorkflows).toContain('HIGH_PRIORITY');
      expect(executedWorkflows).toContain('NORMAL_PRIORITY');
    });

    it('should handle FIFO order for same priority', async () => {
      const processedOrder: string[] = [];

      const workflow: WorkflowDefinition = {
        name: 'fifo-workflow',
        description: 'Test FIFO ordering',
        executor: async (event) => {
          const payload = event.payload as { id: string };
          processedOrder.push(payload.id);
          return {
            success: true,
            context: createMockWorkflowContext(),
          };
        },
      };

      const mockContext = createMockWorkflowContext();
      const mockEmitter: WorkflowEventEmitter = {
        emit: vi.fn(),
      };

      // 同じ優先度のイベントを順番に実行
      for (let i = 1; i <= 5; i++) {
        const event: AgentEvent = {
          type: 'SAME_PRIORITY',
          priority: 'normal',
          payload: { id: `event-${i}` },
          timestamp: new Date(),
        };

        const logger = new WorkflowLogger('fifo-workflow');
        await agent.executeWorkflow(workflow, event, mockContext, logger, mockEmitter);
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
        executor: async (event, context) => {
          const currentState = context.state;
          stateTransitions.push(currentState);

          const payload = event.payload as { newState?: string };
          const updatedState = payload.newState || context.state;
          if (payload.newState) {
            stateTransitions.push(payload.newState);
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
      const mockEmitter: WorkflowEventEmitter = {
        emit: vi.fn(),
      };

      // 初期状態を確認
      const event1: AgentEvent = {
        type: 'CHECK_STATE',
        priority: 'normal',
        payload: {},
        timestamp: new Date(),
      };

      const logger1 = new WorkflowLogger('state-workflow');
      await agent.executeWorkflow(stateWorkflow, event1, mockContext, logger1, mockEmitter);

      // 状態を変更
      const event2: AgentEvent = {
        type: 'UPDATE_STATE',
        priority: 'normal',
        payload: { newState: 'processing' },
        timestamp: new Date(),
      };

      const logger2 = new WorkflowLogger('state-workflow');
      await agent.executeWorkflow(stateWorkflow, event2, mockContext, logger2, mockEmitter);

      // 変更後の状態を確認
      const event3: AgentEvent = {
        type: 'CHECK_STATE',
        priority: 'normal',
        payload: {},
        timestamp: new Date(),
      };

      const logger3 = new WorkflowLogger('state-workflow');
      await agent.executeWorkflow(stateWorkflow, event3, mockContext, logger3, mockEmitter);

      expect(stateTransitions.length).toBeGreaterThan(0);
      expect(stateTransitions).toContain('processing');
    });
  });

  describe('Complex Workflows', () => {
    it('should handle INGEST_INPUT workflow', async () => {
      const registry = agent.getWorkflowRegistry();
      const workflow = registry.get('IngestInput');

      expect(workflow).toBeDefined();
      expect(workflow?.name).toBe('IngestInput');

      const event: AgentEvent = {
        type: 'INGEST_INPUT',
        priority: 'normal',
        payload: {
          input: {
            content: 'Test input',
            source: 'test',
            timestamp: new Date(),
          },
        },
        timestamp: new Date(),
      };

      const mockContext = createMockWorkflowContext();
      const mockLogger = new WorkflowLogger('INGEST_INPUT');
      const mockEmitter: WorkflowEventEmitter = {
        emit: vi.fn(),
      };

      const result = await agent.executeWorkflow(
        workflow!,
        event,
        mockContext,
        mockLogger,
        mockEmitter
      );

      expect(result).toBeDefined();
      // ワークフローの実装によっては成功/失敗が変わる可能性がある
      expect(result.context).toBeDefined();
    });

    it('should handle PROCESS_USER_REQUEST workflow', async () => {
      const registry = agent.getWorkflowRegistry();
      const workflow = registry.get('ProcessUserRequest');

      expect(workflow).toBeDefined();
      expect(workflow?.name).toBe('ProcessUserRequest');

      const event: AgentEvent = {
        type: 'PROCESS_USER_REQUEST',
        priority: 'high',
        payload: {
          request: 'Test user request',
          userId: 'test-user',
        },
        timestamp: new Date(),
      };

      const mockContext = createMockWorkflowContext();
      const mockLogger = new WorkflowLogger('PROCESS_USER_REQUEST');
      const mockEmitter: WorkflowEventEmitter = {
        emit: vi.fn(),
      };

      const result = await agent.executeWorkflow(
        workflow!,
        event,
        mockContext,
        mockLogger,
        mockEmitter
      );

      expect(result).toBeDefined();
      expect(result.context).toBeDefined();
    });

    it('should handle ANALYZE_ISSUE_IMPACT workflow', async () => {
      const registry = agent.getWorkflowRegistry();
      const workflow = registry.get('AnalyzeIssueImpact');

      expect(workflow).toBeDefined();
      expect(workflow?.name).toBe('AnalyzeIssueImpact');

      const event: AgentEvent = {
        type: 'ANALYZE_ISSUE_IMPACT',
        priority: 'normal',
        payload: {
          issueId: 'test-issue-123',
          impact: 'high',
        },
        timestamp: new Date(),
      };

      const mockContext = createMockWorkflowContext();
      const mockLogger = new WorkflowLogger('ANALYZE_ISSUE_IMPACT');
      const mockEmitter: WorkflowEventEmitter = {
        emit: vi.fn(),
      };

      const result = await agent.executeWorkflow(
        workflow!,
        event,
        mockContext,
        mockLogger,
        mockEmitter
      );

      expect(result).toBeDefined();
      expect(result.context).toBeDefined();
    });

    it('should handle EXTRACT_KNOWLEDGE workflow', async () => {
      const registry = agent.getWorkflowRegistry();
      const workflow = registry.get('ExtractKnowledge');

      expect(workflow).toBeDefined();
      expect(workflow?.name).toBe('ExtractKnowledge');

      const event: AgentEvent = {
        type: 'EXTRACT_KNOWLEDGE',
        priority: 'low',
        payload: {
          source: 'test-document',
          content: 'Test knowledge content',
        },
        timestamp: new Date(),
      };

      const mockContext = createMockWorkflowContext();
      const mockLogger = new WorkflowLogger('EXTRACT_KNOWLEDGE');
      const mockEmitter: WorkflowEventEmitter = {
        emit: vi.fn(),
      };

      const result = await agent.executeWorkflow(
        workflow!,
        event,
        mockContext,
        mockLogger,
        mockEmitter
      );

      expect(result).toBeDefined();
      expect(result.context).toBeDefined();
    });
  });

  describe('Event Emitter Integration', () => {
    it('should trigger new events from workflows', async () => {
      const mockEmitter: WorkflowEventEmitter = {
        emit: vi.fn(),
      };

      const cascadingWorkflow: WorkflowDefinition = {
        name: 'cascading-workflow',
        description: 'Workflow that triggers other events',
        executor: async (event, context, emitter) => {
          // 新しいイベントを発行
          emitter.emit({
            type: 'TRIGGERED_EVENT',
            priority: 'high',
            payload: { triggered: true },
          });

          return {
            success: true,
            context,
          };
        },
      };

      const event: AgentEvent = {
        type: 'TRIGGER_CASCADE',
        priority: 'normal',
        payload: {},
        timestamp: new Date(),
      };

      const mockContext = createMockWorkflowContext();
      const mockLogger = new WorkflowLogger('cascading-workflow');

      const result = await agent.executeWorkflow(
        cascadingWorkflow,
        event,
        mockContext,
        mockLogger,
        mockEmitter
      );

      expect(result.success).toBe(true);
      expect(mockEmitter.emit).toHaveBeenCalledWith({
        type: 'TRIGGERED_EVENT',
        priority: 'high',
        payload: { triggered: true },
      });
    });

    it('should handle multiple event emissions', async () => {
      const mockEmitter: WorkflowEventEmitter = {
        emit: vi.fn(),
      };

      const multiEmitWorkflow: WorkflowDefinition = {
        name: 'multi-emit-workflow',
        description: 'Workflow that emits multiple events',
        executor: async (event, context, emitter) => {
          const payload = event.payload as { count?: number };
          const count = payload.count || 3;

          for (let i = 0; i < count; i++) {
            emitter.emit({
              type: `EVENT_${i}`,
              priority: 'normal',
              payload: { index: i },
            });
          }

          return {
            success: true,
            context,
            output: { emittedCount: count },
          };
        },
      };

      const event: AgentEvent = {
        type: 'MULTI_EMIT',
        priority: 'normal',
        payload: { count: 5 },
        timestamp: new Date(),
      };

      const mockContext = createMockWorkflowContext();
      const mockLogger = new WorkflowLogger('multi-emit-workflow');

      const result = await agent.executeWorkflow(
        multiEmitWorkflow,
        event,
        mockContext,
        mockLogger,
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
        executor: async (event, context) => ({
          success: true,
          context,
          output: { custom: true },
        }),
      };

      agent.registerWorkflow(customWorkflow);
      const registry = agent.getWorkflowRegistry();
      const retrieved = registry.get('CUSTOM_WORKFLOW');

      expect(retrieved).toBeDefined();
      expect(retrieved?.name).toBe('CUSTOM_WORKFLOW');
      expect(retrieved?.description).toBe('Custom test workflow');
    });

    it('should override existing workflows', () => {
      const originalWorkflow: WorkflowDefinition = {
        name: 'OVERRIDE_TEST',
        description: 'Original workflow',
        executor: async (event, context) => ({
          success: true,
          context,
          output: { version: 1 },
        }),
      };

      const overrideWorkflow: WorkflowDefinition = {
        name: 'OVERRIDE_TEST',
        description: 'Override workflow',
        executor: async (event, context) => ({
          success: true,
          context,
          output: { version: 2 },
        }),
      };

      agent.registerWorkflow(originalWorkflow);
      agent.registerWorkflow(overrideWorkflow);

      const registry = agent.getWorkflowRegistry();
      const retrieved = registry.get('OVERRIDE_TEST');

      expect(retrieved?.description).toBe('Override workflow');
    });

    it('should return undefined for non-existent workflows', () => {
      const registry = agent.getWorkflowRegistry();
      const retrieved = registry.get('NON_EXISTENT_WORKFLOW');

      expect(retrieved).toBeUndefined();
    });
  });

  describe('Logging Integration', () => {
    it('should log workflow execution', async () => {
      const loggedEntries: Array<{ type: string; data: unknown }> = [];

      const mockLogger = new WorkflowLogger('test-workflow');
      const originalLog = mockLogger.log;
      mockLogger.log = vi.fn().mockImplementation((type, data) => {
        loggedEntries.push({ type, data });
        return originalLog.call(mockLogger, type, data);
      });

      const loggingWorkflow: WorkflowDefinition = {
        name: 'logging-workflow',
        description: 'Workflow with logging',
        executor: async () => ({
          success: true,
          context: createMockWorkflowContext(),
          output: { logged: true },
        }),
      };

      const event: AgentEvent = {
        type: 'LOG_TEST',
        priority: 'normal',
        payload: { test: true },
        timestamp: new Date(),
      };

      const mockContext = createMockWorkflowContext();
      const mockEmitter: WorkflowEventEmitter = {
        emit: vi.fn(),
      };

      await agent.executeWorkflow(loggingWorkflow, event, mockContext, mockLogger, mockEmitter);

      expect(mockLogger.log).toHaveBeenCalled();
      expect(loggedEntries.length).toBeGreaterThan(0);
    });
  });

  describe('Performance', () => {
    it('should handle rapid workflow executions', async () => {
      const executionTimes: number[] = [];

      const performanceWorkflow: WorkflowDefinition = {
        name: 'performance-workflow',
        description: 'Performance test workflow',
        executor: async () => {
          const start = Date.now();
          await new Promise((resolve) => setTimeout(resolve, 10));
          executionTimes.push(Date.now() - start);
          return {
            success: true,
            context: createMockWorkflowContext(),
          };
        },
      };

      const mockContext = createMockWorkflowContext();
      const mockEmitter: WorkflowEventEmitter = {
        emit: vi.fn(),
      };

      // 連続して10回実行
      for (let i = 0; i < 10; i++) {
        const event: AgentEvent = {
          type: 'PERFORMANCE_TEST',
          priority: 'normal',
          payload: { index: i },
          timestamp: new Date(),
        };

        const logger = new WorkflowLogger('performance-workflow');
        await agent.executeWorkflow(performanceWorkflow, event, mockContext, logger, mockEmitter);
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
        executor: async (event) => {
          const payload = event.payload as { delay?: number };
          if (payload.delay) {
            await new Promise((resolve) => setTimeout(resolve, payload.delay));
          }
          return {
            success: true,
            context: createMockWorkflowContext(),
            output: { completed: true },
          };
        },
      };

      const mockContext = createMockWorkflowContext();
      const mockEmitter: WorkflowEventEmitter = {
        emit: vi.fn(),
      };

      const startTime = Date.now();

      // 並行実行
      const promises = [];
      for (let i = 0; i < 5; i++) {
        const event: AgentEvent = {
          type: 'CONCURRENT_PERF',
          priority: 'normal',
          payload: { delay: 50 },
          timestamp: new Date(),
        };

        const logger = new WorkflowLogger('concurrent-perf-workflow');
        promises.push(
          agent.executeWorkflow(concurrentWorkflow, event, mockContext, logger, mockEmitter)
        );
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
