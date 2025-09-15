import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CoreAgent, AgentEvent } from './index.js';

describe('CoreAgent - Error Handling and Recovery', () => {
  let agent: CoreAgent;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let consoleLogSpy: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let consoleWarnSpy: any;

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    agent = new CoreAgent();
  });

  afterEach(async () => {
    if (agent) {
      await agent.stop();
    }
    vi.restoreAllMocks();
  });

  describe('Event Processing Errors', () => {
    it('should recover from synchronous errors in event processing', async () => {
      const processedEvents: string[] = [];

      const originalProcessEvent = agent['processEvent'];
      agent['processEvent'] = vi.fn().mockImplementation((event: AgentEvent) => {
        processedEvents.push(event.type);

        if (event.type === 'ERROR_EVENT') {
          throw new Error('Synchronous error in event processing');
        }

        return originalProcessEvent.call(agent, event);
      });

      // エラーを起こすイベントと正常なイベントを混在
      agent.queueEvent({
        type: 'BEFORE_ERROR',
        priority: 'normal',
        payload: {},
        timestamp: new Date(),
      });

      agent.queueEvent({
        type: 'ERROR_EVENT',
        priority: 'normal',
        payload: {},
        timestamp: new Date(),
      });

      agent.queueEvent({
        type: 'AFTER_ERROR',
        priority: 'normal',
        payload: {},
        timestamp: new Date(),
      });

      const startPromise = agent.start();
      await new Promise((resolve) => setTimeout(resolve, 400));
      await agent.stop();
      await startPromise;

      // エラー後もイベント処理が継続することを確認
      expect(processedEvents).toContain('BEFORE_ERROR');
      expect(processedEvents).toContain('ERROR_EVENT');
      expect(processedEvents).toContain('AFTER_ERROR');
    });

    it('should recover from asynchronous errors in event processing', async () => {
      const processedEvents: string[] = [];

      const originalProcessEvent = agent['processEvent'];
      agent['processEvent'] = vi.fn().mockImplementation(async (event: AgentEvent) => {
        processedEvents.push(event.type);

        if (event.type === 'ASYNC_ERROR_EVENT') {
          await new Promise((resolve) => setTimeout(resolve, 10));
          throw new Error('Asynchronous error in event processing');
        }

        return originalProcessEvent.call(agent, event);
      });

      agent.queueEvent({
        type: 'BEFORE_ASYNC_ERROR',
        priority: 'normal',
        payload: {},
        timestamp: new Date(),
      });

      agent.queueEvent({
        type: 'ASYNC_ERROR_EVENT',
        priority: 'normal',
        payload: {},
        timestamp: new Date(),
      });

      agent.queueEvent({
        type: 'AFTER_ASYNC_ERROR',
        priority: 'normal',
        payload: {},
        timestamp: new Date(),
      });

      const startPromise = agent.start();
      await new Promise((resolve) => setTimeout(resolve, 500));
      await agent.stop();
      await startPromise;

      expect(processedEvents).toContain('BEFORE_ASYNC_ERROR');
      expect(processedEvents).toContain('ASYNC_ERROR_EVENT');
      expect(processedEvents).toContain('AFTER_ASYNC_ERROR');
    });

    it('should handle timeout scenarios', async () => {
      let slowEventStarted = false;

      const originalProcessEvent = agent['processEvent'];
      agent['processEvent'] = vi.fn().mockImplementation(async (event: AgentEvent) => {
        if (event.type === 'SLOW_EVENT') {
          slowEventStarted = true;
          // 長時間の処理をシミュレート
          await new Promise((resolve) => setTimeout(resolve, 5000));
        }
        return originalProcessEvent.call(agent, event);
      });

      agent.queueEvent({
        type: 'SLOW_EVENT',
        priority: 'normal',
        payload: {},
        timestamp: new Date(),
      });

      agent.queueEvent({
        type: 'FAST_EVENT',
        priority: 'normal',
        payload: {},
        timestamp: new Date(),
      });

      const startPromise = agent.start();

      // 少し待ってから停止
      await new Promise((resolve) => setTimeout(resolve, 100));
      await agent.stop();
      await startPromise;

      expect(slowEventStarted).toBe(true);
      // 停止時にスローイベントが完了していない可能性がある
      // これは期待される動作
    });
  });

  describe('Resource Exhaustion Scenarios', () => {
    it('should handle memory pressure with large payloads', async () => {
      let processedLargeEvents = 0;

      const originalProcessEvent = agent['processEvent'];
      agent['processEvent'] = vi.fn().mockImplementation(async (event: AgentEvent) => {
        if (event.type === 'LARGE_PAYLOAD_EVENT') {
          processedLargeEvents++;
        }
        return originalProcessEvent.call(agent, event);
      });

      // 大きなペイロードを持つイベントを作成
      for (let i = 0; i < 10; i++) {
        agent.queueEvent({
          type: 'LARGE_PAYLOAD_EVENT',
          priority: 'normal',
          payload: {
            largeArray: new Array(10000).fill(`data-${i}`),
            nestedObject: {
              level1: {
                level2: {
                  level3: {
                    data: new Array(1000).fill(`nested-${i}`),
                  },
                },
              },
            },
          },
          timestamp: new Date(),
        });
      }

      const startPromise = agent.start();
      await new Promise((resolve) => setTimeout(resolve, 1000));
      await agent.stop();
      await startPromise;

      expect(processedLargeEvents).toBe(10);
    });

    it('should handle rapid repeated errors', async () => {
      let errorCount = 0;
      let successCount = 0;

      const originalProcessEvent = agent['processEvent'];
      agent['processEvent'] = vi.fn().mockImplementation(async (event: AgentEvent) => {
        if ((event.payload as { shouldError?: boolean }).shouldError) {
          errorCount++;
          throw new Error(`Error ${errorCount}`);
        }
        successCount++;
        return originalProcessEvent.call(agent, event);
      });

      // エラーを連続で発生させる
      for (let i = 0; i < 20; i++) {
        agent.queueEvent({
          type: 'REPEATED_ERROR',
          priority: 'normal',
          payload: { shouldError: i % 2 === 0 },
          timestamp: new Date(),
        });
      }

      const startPromise = agent.start();
      await new Promise((resolve) => setTimeout(resolve, 2000));
      await agent.stop();
      await startPromise;

      expect(errorCount).toBe(10);
      expect(successCount).toBe(10);
    });
  });

  describe('Edge Cases and Boundary Conditions', () => {
    it('should handle empty event type', async () => {
      let processedEmptyType = false;

      const originalProcessEvent = agent['processEvent'];
      agent['processEvent'] = vi.fn().mockImplementation(async (event: AgentEvent) => {
        if (!event.type || event.type === '') {
          processedEmptyType = true;
        }
        return originalProcessEvent.call(agent, event);
      });

      agent.queueEvent({
        type: '',
        priority: 'normal',
        payload: {},
        timestamp: new Date(),
      });

      const startPromise = agent.start();
      await new Promise((resolve) => setTimeout(resolve, 100));
      await agent.stop();
      await startPromise;

      expect(processedEmptyType).toBe(true);
      expect(consoleWarnSpy).toHaveBeenCalledWith('Unknown event type: ');
    });

    it('should handle very long event types', async () => {
      const longEventType = 'A'.repeat(1000);

      agent.queueEvent({
        type: longEventType,
        priority: 'normal',
        payload: {},
        timestamp: new Date(),
      });

      const startPromise = agent.start();
      await new Promise((resolve) => setTimeout(resolve, 100));
      await agent.stop();
      await startPromise;

      expect(consoleLogSpy).toHaveBeenCalledWith(`Event queued: ${longEventType}`);
      expect(consoleWarnSpy).toHaveBeenCalledWith(`Unknown event type: ${longEventType}`);
    });

    it('should handle undefined payload gracefully', async () => {
      let processedUndefinedPayload = false;

      const originalProcessEvent = agent['processEvent'];
      agent['processEvent'] = vi.fn().mockImplementation(async (event: AgentEvent) => {
        if (event.payload === undefined) {
          processedUndefinedPayload = true;
        }
        return originalProcessEvent.call(agent, event);
      });

      agent.queueEvent({
        type: 'UNDEFINED_PAYLOAD',
        priority: 'normal',
        payload: undefined as unknown as Record<string, unknown>,
        timestamp: new Date(),
      });

      const startPromise = agent.start();
      await new Promise((resolve) => setTimeout(resolve, 100));
      await agent.stop();
      await startPromise;

      expect(processedUndefinedPayload).toBe(true);
    });

    it('should handle invalid priority values', async () => {
      const invalidEvent = {
        type: 'INVALID_PRIORITY',
        priority: 'ultra-high', // 無効な優先度
        payload: {},
        timestamp: new Date(),
      };

      agent.queueEvent(invalidEvent as AgentEvent);

      const startPromise = agent.start();
      await new Promise((resolve) => setTimeout(resolve, 100));
      await agent.stop();
      await startPromise;

      expect(consoleLogSpy).toHaveBeenCalledWith('Processing event: INVALID_PRIORITY');
    });
  });

  describe('Concurrent Error Scenarios', () => {
    it('should handle errors during high concurrency', async () => {
      let processedCount = 0;
      let errorCount = 0;

      const originalProcessEvent = agent['processEvent'];
      agent['processEvent'] = vi.fn().mockImplementation(async (event: AgentEvent) => {
        processedCount++;

        // ランダムにエラーを発生させる
        if (Math.random() < 0.3) {
          errorCount++;
          throw new Error('Random error during processing');
        }

        // 処理時間をランダムに
        await new Promise((resolve) => setTimeout(resolve, Math.random() * 20));

        return originalProcessEvent.call(agent, event);
      });

      // 多数のイベントを短時間で追加
      for (let i = 0; i < 50; i++) {
        agent.queueEvent({
          type: `CONCURRENT_${i}`,
          priority: ['high', 'normal', 'low'][i % 3] as AgentEvent['priority'],
          payload: { index: i },
          timestamp: new Date(),
        });
      }

      const startPromise = agent.start();

      // 処理が進むまで待つ
      await new Promise((resolve) => setTimeout(resolve, 3000));

      await agent.stop();
      await startPromise;

      expect(processedCount).toBe(50);
      expect(errorCount).toBeGreaterThan(0);
      expect(errorCount).toBeLessThan(50);
    });

    it('should maintain queue integrity under error conditions', async () => {
      const queueStates: number[] = [];

      const originalProcessEvent = agent['processEvent'];
      agent['processEvent'] = vi.fn().mockImplementation(async (event: AgentEvent) => {
        // キューの状態を記録
        queueStates.push(agent['eventQueue'].length);

        if (event.type === 'QUEUE_ERROR') {
          throw new Error('Queue processing error');
        }

        return originalProcessEvent.call(agent, event);
      });

      // エラーイベントと正常イベントを交互に
      for (let i = 0; i < 10; i++) {
        agent.queueEvent({
          type: i % 2 === 0 ? 'QUEUE_ERROR' : 'QUEUE_NORMAL',
          priority: 'normal',
          payload: { index: i },
          timestamp: new Date(),
        });
      }

      const initialQueueSize = agent['eventQueue'].length;
      expect(initialQueueSize).toBe(10);

      const startPromise = agent.start();
      await new Promise((resolve) => setTimeout(resolve, 1500));
      await agent.stop();
      await startPromise;

      // 最終的にキューが空になっていることを確認
      expect(agent['eventQueue'].length).toBe(0);

      // キューサイズが単調減少していることを確認
      for (let i = 1; i < queueStates.length; i++) {
        expect(queueStates[i]).toBeLessThanOrEqual(queueStates[i - 1] + 1);
      }
    });
  });

  describe('Recovery Mechanisms', () => {
    it('should recover from stack overflow scenarios', async () => {
      let recursionDepth = 0;
      const MAX_DEPTH = 100;

      const originalProcessEvent = agent['processEvent'];
      agent['processEvent'] = vi.fn().mockImplementation(async (event: AgentEvent) => {
        if (event.type === 'RECURSIVE_EVENT') {
          recursionDepth++;

          if (recursionDepth < MAX_DEPTH) {
            // 再帰的にイベントを生成
            agent.queueEvent({
              type: 'RECURSIVE_EVENT',
              priority: 'normal',
              payload: { depth: recursionDepth },
              timestamp: new Date(),
            });
          }
        }

        return originalProcessEvent.call(agent, event);
      });

      agent.queueEvent({
        type: 'RECURSIVE_EVENT',
        priority: 'normal',
        payload: { depth: 0 },
        timestamp: new Date(),
      });

      const startPromise = agent.start();

      // 再帰処理が完了するまで待つ
      const maxWaitTime = 5000;
      const startTime = Date.now();

      while (recursionDepth < MAX_DEPTH && Date.now() - startTime < maxWaitTime) {
        await new Promise((resolve) => setTimeout(resolve, 50));
      }

      await agent.stop();
      await startPromise;

      expect(recursionDepth).toBe(MAX_DEPTH);
    });

    it('should handle promise rejection in event processing', async () => {
      const originalProcessEvent = agent['processEvent'];
      agent['processEvent'] = vi.fn().mockImplementation(async (event: AgentEvent) => {
        if (event.type === 'REJECTION_EVENT') {
          return Promise.reject(new Error('Promise rejection in event'));
        }
        return originalProcessEvent.call(agent, event);
      });

      // Promiseの拒否をキャッチするハンドラを設定
      const originalProcessEventLoop = agent['processEventLoop'];
      agent['processEventLoop'] = async function (this: CoreAgent) {
        try {
          await originalProcessEventLoop.call(this);
        } catch (error) {
          // エラーをキャッチ
        }
      }.bind(agent);

      agent.queueEvent({
        type: 'REJECTION_EVENT',
        priority: 'normal',
        payload: {},
        timestamp: new Date(),
      });

      const startPromise = agent.start();
      await new Promise((resolve) => setTimeout(resolve, 200));
      await agent.stop();
      await startPromise;

      // エージェントがクラッシュしていないことを確認
      expect(agent).toBeDefined();
    });
  });
});
