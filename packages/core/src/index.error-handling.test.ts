import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CoreAgent } from './index.js';
import { SystemEvent } from '@sebas-chan/shared-types';
import { createMockWorkflowContext } from './workflows/test-utils.js';
import { WorkflowEventEmitterInterface } from './workflows/context.js';
import { WorkflowDefinition } from './workflows/workflow-types.js';

describe('CoreAgent - Error Handling and Recovery', () => {
  let agent: CoreAgent;

  beforeEach(() => {
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
        triggers: {
          eventTypes: ['DATA_ARRIVED'],
        },
        executor: () => {
          throw new Error('Synchronous error in workflow');
        },
      };

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
      // エラーはrecorderで記録されるため、console.errorの検証は削除
    });

    it('should recover from asynchronous errors in workflow execution', async () => {
      const asyncErrorWorkflow: WorkflowDefinition = {
        name: 'async-error-workflow',
        description: 'Workflow that throws asynchronous error',
        triggers: {
          eventTypes: ['DATA_ARRIVED'],
        },
        executor: async () => {
          await new Promise((resolve) => setTimeout(resolve, 10));
          throw new Error('Asynchronous error in workflow');
        },
      };

      const event: SystemEvent = {
        type: 'DATA_ARRIVED',
        payload: {
          source: 'test',
          content: 'Test content',
          pondEntryId: 'test-' + Date.now(),
          timestamp: new Date().toISOString(),
        },
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
        triggers: {
          eventTypes: ['SLOW_WORKFLOW'],
        },
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

      const event: SystemEvent = {
        type: 'DATA_ARRIVED',
        payload: {
          source: 'test',
          content: 'Test content',
          pondEntryId: 'test-' + Date.now(),
          timestamp: new Date().toISOString(),
        },
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
      expect(duration).toBeGreaterThanOrEqual(95); // Allow 5ms tolerance for CI timing variations
      expect(result.output).toEqual({ completed: true });
    });
  });

  describe('Resource Exhaustion Scenarios', () => {
    it('should handle large payloads in workflows', async () => {
      const largePayloadWorkflow: WorkflowDefinition = {
        name: 'large-payload-workflow',
        description: 'Workflow handling large payloads',
        triggers: {
          eventTypes: ['LARGE_PAYLOAD_WORKFLOW'],
        },
        executor: async (_event) => {
          const payload = _event.payload as { metadata?: { largeArray?: unknown[] } };
          return {
            success: true,
            context: createMockWorkflowContext(),
            output: {
              processedItems: payload.metadata?.largeArray?.length || 0,
            },
          };
        },
      };

      const event: SystemEvent = {
        type: 'DATA_ARRIVED',
        payload: {
          source: 'test',
          content: 'Large payload test',
          pondEntryId: 'large-test',
          timestamp: new Date().toISOString(),
          metadata: {
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
        },
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
        triggers: {
          eventTypes: ['ERROR_PRONE_WORKFLOW'],
        },
        executor: async (_event) => {
          const payload = _event.payload as { metadata?: { shouldError?: boolean } };
          if (payload.metadata?.shouldError) {
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
        const event: SystemEvent = {
          type: 'DATA_ARRIVED',
          payload: {
            source: 'test',
            content: `Repeated test ${i}`,
            pondEntryId: `repeated-test-${i}`,
            timestamp: new Date().toISOString(),
            metadata: { shouldError: i % 2 === 0 },
          },
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
        triggers: {
          eventTypes: ['EMPTY_TYPE_WORKFLOW'],
        },
        executor: async (_event) => {
          return {
            success: !event.type || (event.type as string) === '',
            context: createMockWorkflowContext(),
          };
        },
      };

      const event = {
        type: '' as const,
        payload: {
          source: 'test',
          content: 'Test content',
          pondEntryId: 'test-' + Date.now(),
          timestamp: new Date().toISOString(),
        },
      } as unknown as SystemEvent;

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
        triggers: {
          eventTypes: ['LONG_TYPE_WORKFLOW'],
        },
        executor: async (_event) => {
          return {
            success: true,
            context: createMockWorkflowContext(),
            output: { typeLength: event.type.length },
          };
        },
      };

      const event = {
        type: longEventType,
        payload: {
          source: 'test',
          content: 'Test content',
          pondEntryId: 'test-' + Date.now(),
          timestamp: new Date().toISOString(),
        },
      } as unknown as SystemEvent;

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
        triggers: {
          eventTypes: ['UNDEFINED_PAYLOAD_WORKFLOW'],
        },
        executor: async (_event) => {
          return {
            success: true,
            context: createMockWorkflowContext(),
            output: { hasPayload: event.payload !== undefined },
          };
        },
      };

      const event = {
        type: 'DATA_ARRIVED',
        payload: undefined as any,
      } as SystemEvent;

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
        triggers: {
          eventTypes: ['INVALID_PRIORITY_WORKFLOW'],
        },
        executor: async (_event) => {
          return {
            success: true,
            context: createMockWorkflowContext(),
          };
        },
      };

      const invalidEvent = {
        type: 'INVALID_PRIORITY',
        payload: {
          source: 'test',
          content: 'Test content',
          pondEntryId: 'test-' + Date.now(),
          timestamp: new Date().toISOString(),
        },
      };

      const mockContext = createMockWorkflowContext();
      // Logger is now part of context
      const mockEmitter: WorkflowEventEmitterInterface = {
        emit: vi.fn(),
      };

      const result = await agent.executeWorkflow(
        workflow,
        invalidEvent as SystemEvent,
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
        triggers: {
          eventTypes: ['CONCURRENT_WORKFLOW'],
        },
        executor: async (_event) => {
          // ランダムな処理時間
          await new Promise((resolve) => setTimeout(resolve, Math.random() * 20));

          // ランダムにエラーを発生させる
          if (Math.random() < 0.3) {
            throw new Error('Random error during processing');
          }

          const payload = _event.payload as { index?: number };
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
        const event: SystemEvent = {
          type: 'DATA_ARRIVED',
          payload: {
            source: 'test',
            content: `Concurrent test ${i}`,
            pondEntryId: `concurrent-${i}`,
            timestamp: new Date().toISOString(),
            metadata: { index: i },
          },
        };

        promises.push(agent.executeWorkflow(concurrentWorkflow, event, mockContext, mockEmitter));
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
        triggers: {
          eventTypes: ['NESTED_WORKFLOW'],
        },
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

      const event: SystemEvent = {
        type: 'DATA_ARRIVED',
        payload: {
          source: 'test',
          content: 'Test content',
          pondEntryId: 'test-' + Date.now(),
          timestamp: new Date().toISOString(),
        },
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
        triggers: {
          eventTypes: ['REJECTION_WORKFLOW'],
        },
        executor: async () => {
          return Promise.reject(new Error('Promise rejection in workflow'));
        },
      };

      const event: SystemEvent = {
        type: 'DATA_ARRIVED',
        payload: {
          source: 'test',
          content: 'Test content',
          pondEntryId: 'test-' + Date.now(),
          timestamp: new Date().toISOString(),
        },
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
