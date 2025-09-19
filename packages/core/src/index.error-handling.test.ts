import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CoreAgent, AgentEvent, WorkflowLogger } from './index.js';
import { createMockWorkflowContext } from './test-utils.js';
import { WorkflowEventEmitterInterface } from './workflows/context.js';
import { WorkflowDefinition } from './workflows/functional-types.js';

describe('CoreAgent - Error Handling and Recovery', () => {
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

  describe('Workflow Execution Errors', () => {
    it('should recover from synchronous errors in workflow execution', async () => {
      const errorWorkflow: WorkflowDefinition = {
        name: 'error-workflow',
        description: 'Workflow that throws synchronous error',
        executor: () => {
          throw new Error('Synchronous error in workflow');
        },
      };

      const event: AgentEvent = {
        type: 'ERROR_EVENT',
        payload: {},
        timestamp: new Date(),
      };

      const mockContext = createMockWorkflowContext();
      // Logger is now part of context
      const mockEmitter: WorkflowEventEmitterInterface = {
        emit: vi.fn(),
      };

      const result = await agent.executeWorkflow(
        errorWorkflow,
        event,
        mockContext,
        
        mockEmitter
      );

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error?.message).toBe('Synchronous error in workflow');
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Error executing workflow error-workflow:',
        expect.any(Error)
      );
    });

    it('should recover from asynchronous errors in workflow execution', async () => {
      const asyncErrorWorkflow: WorkflowDefinition = {
        name: 'async-error-workflow',
        description: 'Workflow that throws asynchronous error',
        executor: async () => {
          await new Promise((resolve) => setTimeout(resolve, 10));
          throw new Error('Asynchronous error in workflow');
        },
      };

      const event: AgentEvent = {
        type: 'ASYNC_ERROR_EVENT',
        payload: {},
        timestamp: new Date(),
      };

      const mockContext = createMockWorkflowContext();
      // Logger is now part of context
      const mockEmitter: WorkflowEventEmitterInterface = {
        emit: vi.fn(),
      };

      const result = await agent.executeWorkflow(
        asyncErrorWorkflow,
        event,
        mockContext,
        
        mockEmitter
      );

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error?.message).toBe('Asynchronous error in workflow');
    });

    it('should handle timeout scenarios in workflows', async () => {
      const slowWorkflow: WorkflowDefinition = {
        name: 'slow-workflow',
        description: 'Workflow with long-running operation',
        executor: async () => {
          // 長時間の処理をシミュレート
          await new Promise((resolve) => setTimeout(resolve, 100));
          return {
            success: true,
            context: createMockWorkflowContext(),
            output: { completed: true },
          };
        },
      };

      const event: AgentEvent = {
        type: 'SLOW_EVENT',
        payload: {},
        timestamp: new Date(),
      };

      const mockContext = createMockWorkflowContext();
      // Logger is now part of context
      const mockEmitter: WorkflowEventEmitterInterface = {
        emit: vi.fn(),
      };

      const startTime = Date.now();
      const result = await agent.executeWorkflow(
        slowWorkflow,
        event,
        mockContext,
        
        mockEmitter
      );
      const duration = Date.now() - startTime;

      expect(result.success).toBe(true);
      expect(duration).toBeGreaterThanOrEqual(100);
      expect(result.output).toEqual({ completed: true });
    });
  });

  describe('Resource Exhaustion Scenarios', () => {
    it('should handle large payloads in workflows', async () => {
      const largePayloadWorkflow: WorkflowDefinition = {
        name: 'large-payload-workflow',
        description: 'Workflow handling large payloads',
        executor: async (event) => {
          const payload = event.payload as { largeArray?: unknown[] };
          return {
            success: true,
            context: createMockWorkflowContext(),
            output: {
              processedItems: payload.largeArray?.length || 0,
            },
          };
        },
      };

      const event: AgentEvent = {
        type: 'LARGE_PAYLOAD_EVENT',
        payload: {
          largeArray: new Array(10000).fill('data'),
          nestedObject: {
            level1: {
              level2: {
                level3: {
                  data: new Array(1000).fill('nested'),
                },
              },
            },
          },
        },
        timestamp: new Date(),
      };

      const mockContext = createMockWorkflowContext();
      // Logger is now part of context
      const mockEmitter: WorkflowEventEmitterInterface = {
        emit: vi.fn(),
      };

      const result = await agent.executeWorkflow(
        largePayloadWorkflow,
        event,
        mockContext,
        
        mockEmitter
      );

      expect(result.success).toBe(true);
      expect(result.output).toEqual({ processedItems: 10000 });
    });

    it('should handle rapid repeated errors in workflows', async () => {
      let errorCount = 0;

      const errorProneWorkflow: WorkflowDefinition = {
        name: 'error-prone-workflow',
        description: 'Workflow that may throw errors',
        executor: async (event) => {
          const payload = event.payload as { shouldError?: boolean };
          if (payload.shouldError) {
            errorCount++;
            throw new Error(`Error ${errorCount}`);
          }
          return {
            success: true,
            context: createMockWorkflowContext(),
          };
        },
      };

      const mockContext = createMockWorkflowContext();
      // Logger is now part of context
      const mockEmitter: WorkflowEventEmitterInterface = {
        emit: vi.fn(),
      };

      // エラーと成功を交互に実行
      for (let i = 0; i < 20; i++) {
        const event: AgentEvent = {
          type: 'REPEATED_ERROR',
          payload: { shouldError: i % 2 === 0 },
          timestamp: new Date(),
        };

        const result = await agent.executeWorkflow(
          errorProneWorkflow,
          event,
          mockContext,
          
          mockEmitter
        );

        if (i % 2 === 0) {
          expect(result.success).toBe(false);
        } else {
          expect(result.success).toBe(true);
        }
      }

      expect(errorCount).toBe(10);
    });
  });

  describe('Edge Cases and Boundary Conditions', () => {
    it('should handle empty event type', async () => {
      const workflow: WorkflowDefinition = {
        name: 'empty-type-workflow',
        description: 'Workflow for empty event type',
        executor: async (event) => {
          return {
            success: !event.type || event.type === '',
            context: createMockWorkflowContext(),
          };
        },
      };

      const event: AgentEvent = {
        type: '',
        payload: {},
        timestamp: new Date(),
      };

      const mockContext = createMockWorkflowContext();
      // Logger is now part of context
      const mockEmitter: WorkflowEventEmitterInterface = {
        emit: vi.fn(),
      };

      const result = await agent.executeWorkflow(
        workflow,
        event,
        mockContext,
        
        mockEmitter
      );

      expect(result.success).toBe(true);
    });

    it('should handle very long event types', async () => {
      const longEventType = 'A'.repeat(1000);

      const workflow: WorkflowDefinition = {
        name: 'long-type-workflow',
        description: 'Workflow for long event type',
        executor: async (event) => {
          return {
            success: true,
            context: createMockWorkflowContext(),
            output: { typeLength: event.type.length },
          };
        },
      };

      const event: AgentEvent = {
        type: longEventType,
        payload: {},
        timestamp: new Date(),
      };

      const mockContext = createMockWorkflowContext();
      // Logger is now part of context
      const mockEmitter: WorkflowEventEmitterInterface = {
        emit: vi.fn(),
      };

      const result = await agent.executeWorkflow(
        workflow,
        event,
        mockContext,
        
        mockEmitter
      );

      expect(result.success).toBe(true);
      expect(result.output).toEqual({ typeLength: 1000 });
    });

    it('should handle undefined payload gracefully', async () => {
      const workflow: WorkflowDefinition = {
        name: 'undefined-payload-workflow',
        description: 'Workflow for undefined payload',
        executor: async (event) => {
          return {
            success: true,
            context: createMockWorkflowContext(),
            output: { hasPayload: event.payload !== undefined },
          };
        },
      };

      const event: AgentEvent = {
        type: 'UNDEFINED_PAYLOAD',
        payload: undefined as unknown as Record<string, unknown>,
        timestamp: new Date(),
      };

      const mockContext = createMockWorkflowContext();
      // Logger is now part of context
      const mockEmitter: WorkflowEventEmitterInterface = {
        emit: vi.fn(),
      };

      const result = await agent.executeWorkflow(
        workflow,
        event,
        mockContext,
        
        mockEmitter
      );

      expect(result.success).toBe(true);
      expect(result.output).toEqual({ hasPayload: false });
    });

    it('should handle invalid priority values', async () => {
      const workflow: WorkflowDefinition = {
        name: 'invalid-priority-workflow',
        description: 'Workflow for invalid priority',
        executor: async (event) => {
          return {
            success: true,
            context: createMockWorkflowContext(),
          };
        },
      };

      const invalidEvent = {
        type: 'INVALID_PRIORITY',
        payload: {},
        timestamp: new Date(),
      };

      const mockContext = createMockWorkflowContext();
      // Logger is now part of context
      const mockEmitter: WorkflowEventEmitterInterface = {
        emit: vi.fn(),
      };

      const result = await agent.executeWorkflow(
        workflow,
        invalidEvent as AgentEvent,
        mockContext,
        
        mockEmitter
      );

      expect(result.success).toBe(true);
    });
  });

  describe('Concurrent Workflow Scenarios', () => {
    it('should handle concurrent workflow executions', async () => {
      const concurrentWorkflow: WorkflowDefinition = {
        name: 'concurrent-workflow',
        description: 'Workflow for concurrent execution',
        executor: async (event) => {
          // ランダムな処理時間
          await new Promise((resolve) => setTimeout(resolve, Math.random() * 20));

          // ランダムにエラーを発生させる
          if (Math.random() < 0.3) {
            throw new Error('Random error during processing');
          }

          const payload = event.payload as { index?: number };
          return {
            success: true,
            context: createMockWorkflowContext(),
            output: { processed: payload.index },
          };
        },
      };

      const mockContext = createMockWorkflowContext();
      // Logger is now part of context
      const mockEmitter: WorkflowEventEmitterInterface = {
        emit: vi.fn(),
      };

      // 複数のワークフローを並行実行
      const promises = [];
      for (let i = 0; i < 10; i++) {
        const event: AgentEvent = {
          type: `CONCURRENT_${i}`,
          payload: { index: i },
          timestamp: new Date(),
        };

        promises.push(
          agent.executeWorkflow(concurrentWorkflow, event, mockContext, mockEmitter)
        );
      }

      const results = await Promise.all(promises);
      const successCount = results.filter((r) => r.success).length;
      const errorCount = results.filter((r) => !r.success).length;

      expect(successCount + errorCount).toBe(10);
      expect(successCount).toBeGreaterThan(0);
    });
  });

  describe('Recovery Mechanisms', () => {
    it('should handle nested workflow errors', async () => {
      const nestedWorkflow: WorkflowDefinition = {
        name: 'nested-workflow',
        description: 'Workflow with nested error handling',
        executor: async (event, context, emitter) => {
          try {
            // 内部でエラーを発生させる
            throw new Error('Inner error');
          } catch (error) {
            // エラーをキャッチして処理
            emitter.emit({
              type: 'ERROR_LOGGED',
              payload: { error: (error as Error).message },
            });

            // リカバリー処理
            return {
              success: true,
              context,
              output: { recovered: true },
            };
          }
        },
      };

      const event: AgentEvent = {
        type: 'NESTED_ERROR',
        payload: {},
        timestamp: new Date(),
      };

      const mockContext = createMockWorkflowContext();
      // Logger is now part of context
      const mockEmitter: WorkflowEventEmitterInterface = {
        emit: vi.fn(),
      };

      const result = await agent.executeWorkflow(
        nestedWorkflow,
        event,
        mockContext,
        
        mockEmitter
      );

      expect(result.success).toBe(true);
      expect(result.output).toEqual({ recovered: true });
      expect(mockEmitter.emit).toHaveBeenCalledWith({
        type: 'ERROR_LOGGED',
        payload: { error: 'Inner error' },
      });
    });

    it('should handle promise rejection in workflow', async () => {
      const rejectionWorkflow: WorkflowDefinition = {
        name: 'rejection-workflow',
        description: 'Workflow with promise rejection',
        executor: async () => {
          return Promise.reject(new Error('Promise rejection in workflow'));
        },
      };

      const event: AgentEvent = {
        type: 'REJECTION_EVENT',
        payload: {},
        timestamp: new Date(),
      };

      const mockContext = createMockWorkflowContext();
      // Logger is now part of context
      const mockEmitter: WorkflowEventEmitterInterface = {
        emit: vi.fn(),
      };

      const result = await agent.executeWorkflow(
        rejectionWorkflow,
        event,
        mockContext,
        
        mockEmitter
      );

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error?.message).toBe('Promise rejection in workflow');
    });
  });
});
