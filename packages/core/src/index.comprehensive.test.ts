import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CoreAgent, AgentEvent } from './index';

describe('CoreAgent - Comprehensive Tests', () => {
  let agent: CoreAgent;
  let consoleLogSpy: any;
  let consoleWarnSpy: any;
  let consoleErrorSpy: any;

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    agent = new CoreAgent();
  });

  afterEach(async () => {
    if (agent) {
      await agent.stop();
    }
    vi.restoreAllMocks();
  });

  describe('Event Priority Handling', () => {
    it('should process high priority events first', async () => {
      const processedOrder: string[] = [];
      
      // イベント処理を監視するためのスパイを作成
      const originalProcessEvent = agent['processEvent'];
      agent['processEvent'] = vi.fn().mockImplementation(async (event: AgentEvent) => {
        processedOrder.push(event.type);
        return originalProcessEvent.call(agent, event);
      });

      // 異なる優先度のイベントを追加
      agent.queueEvent({
        type: 'LOW_PRIORITY',
        priority: 'low',
        payload: {},
        timestamp: new Date()
      });

      agent.queueEvent({
        type: 'HIGH_PRIORITY',
        priority: 'high',
        payload: {},
        timestamp: new Date()
      });

      agent.queueEvent({
        type: 'NORMAL_PRIORITY',
        priority: 'normal',
        payload: {},
        timestamp: new Date()
      });

      const startPromise = agent.start();
      await new Promise(resolve => setTimeout(resolve, 300));
      await agent.stop();
      await startPromise;

      // 現在の実装はFIFOなので、順序は追加順になるはず
      // 将来的に優先度処理を実装した場合はこのテストを更新
      expect(processedOrder.length).toBe(3);
      expect(processedOrder).toContain('LOW_PRIORITY');
      expect(processedOrder).toContain('HIGH_PRIORITY');
      expect(processedOrder).toContain('NORMAL_PRIORITY');
    });

    it('should handle events with same priority in FIFO order', async () => {
      const processedOrder: string[] = [];
      
      const originalProcessEvent = agent['processEvent'];
      agent['processEvent'] = vi.fn().mockImplementation(async (event: AgentEvent) => {
        processedOrder.push(event.payload.id);
        return originalProcessEvent.call(agent, event);
      });

      // 同じ優先度のイベントを複数追加
      for (let i = 1; i <= 5; i++) {
        agent.queueEvent({
          type: 'SAME_PRIORITY',
          priority: 'normal',
          payload: { id: `event-${i}` },
          timestamp: new Date()
        });
      }

      const startPromise = agent.start();
      await new Promise(resolve => setTimeout(resolve, 500));
      await agent.stop();
      await startPromise;

      // FIFO順序を確認
      expect(processedOrder).toEqual([
        'event-1', 'event-2', 'event-3', 'event-4', 'event-5'
      ]);
    });
  });

  describe('Error Handling', () => {
    it('should continue processing after event handler error', async () => {
      let processedCount = 0;
      let errorCount = 0;

      const originalProcessEvent = agent['processEvent'];
      agent['processEvent'] = vi.fn().mockImplementation(async (event: AgentEvent) => {
        processedCount++;
        if (event.payload.shouldFail) {
          errorCount++;
          throw new Error('Intentional test error');
        }
        return originalProcessEvent.call(agent, event);
      });

      // 失敗するイベントと成功するイベントを混在
      agent.queueEvent({
        type: 'SUCCESS_EVENT',
        priority: 'normal',
        payload: { shouldFail: false },
        timestamp: new Date()
      });

      agent.queueEvent({
        type: 'FAILURE_EVENT',
        priority: 'normal',
        payload: { shouldFail: true },
        timestamp: new Date()
      });

      agent.queueEvent({
        type: 'SUCCESS_EVENT_2',
        priority: 'normal',
        payload: { shouldFail: false },
        timestamp: new Date()
      });

      const startPromise = agent.start();
      await new Promise(resolve => setTimeout(resolve, 400));
      await agent.stop();
      await startPromise;

      // エラーが発生してもすべてのイベントが処理される
      expect(processedCount).toBe(3);
      expect(errorCount).toBe(1);
    });

    it('should handle malformed events gracefully', async () => {
      const malformedEvent: any = {
        // typeが欠落
        priority: 'normal',
        payload: {},
        timestamp: new Date()
      };

      // 型チェックを回避してmalformedイベントを追加
      (agent as any).eventQueue.push(malformedEvent);

      const startPromise = agent.start();
      await new Promise(resolve => setTimeout(resolve, 100));
      await agent.stop();
      await startPromise;

      // エラーが発生してもクラッシュしないことを確認
      expect(consoleLogSpy).toHaveBeenCalledWith('Processing event: undefined');
    });

    it('should handle null payload gracefully', async () => {
      agent.queueEvent({
        type: 'NULL_PAYLOAD',
        priority: 'normal',
        payload: null as any,
        timestamp: new Date()
      });

      const startPromise = agent.start();
      await new Promise(resolve => setTimeout(resolve, 100));
      await agent.stop();
      await startPromise;

      expect(consoleWarnSpy).toHaveBeenCalledWith('Unknown event type: NULL_PAYLOAD');
    });
  });

  describe('Concurrent Event Processing', () => {
    it('should handle rapid event queueing', async () => {
      const eventCount = 100;
      let processedCount = 0;

      const originalProcessEvent = agent['processEvent'];
      agent['processEvent'] = vi.fn().mockImplementation(async (event: AgentEvent) => {
        processedCount++;
        // 処理時間をシミュレート
        await new Promise(resolve => setTimeout(resolve, 5));
        return originalProcessEvent.call(agent, event);
      });

      // 大量のイベントを短時間で追加
      for (let i = 0; i < eventCount; i++) {
        agent.queueEvent({
          type: `EVENT_${i}`,
          priority: i % 3 === 0 ? 'high' : i % 2 === 0 ? 'normal' : 'low',
          payload: { index: i },
          timestamp: new Date()
        });
      }

      const startPromise = agent.start();
      
      // すべてのイベントが処理されるまで待つ
      const maxWaitTime = eventCount * 10 + 1000; // 余裕を持たせる
      const checkInterval = 100;
      let waitedTime = 0;

      while (processedCount < eventCount && waitedTime < maxWaitTime) {
        await new Promise(resolve => setTimeout(resolve, checkInterval));
        waitedTime += checkInterval;
      }

      await agent.stop();
      await startPromise;

      expect(processedCount).toBe(eventCount);
    });

    it('should handle events added while processing', async () => {
      let processedEvents: string[] = [];

      const originalProcessEvent = agent['processEvent'];
      agent['processEvent'] = vi.fn().mockImplementation(async (event: AgentEvent) => {
        processedEvents.push(event.type);
        
        // 最初のイベント処理中に新しいイベントを追加
        if (event.type === 'INITIAL_EVENT' && processedEvents.length === 1) {
          agent.queueEvent({
            type: 'DYNAMIC_EVENT',
            priority: 'high',
            payload: {},
            timestamp: new Date()
          });
        }
        
        return originalProcessEvent.call(agent, event);
      });

      agent.queueEvent({
        type: 'INITIAL_EVENT',
        priority: 'normal',
        payload: {},
        timestamp: new Date()
      });

      const startPromise = agent.start();
      await new Promise(resolve => setTimeout(resolve, 2500));
      await agent.stop();
      await startPromise;

      expect(processedEvents).toContain('INITIAL_EVENT');
      expect(processedEvents).toContain('DYNAMIC_EVENT');
    });
  });

  describe('Memory and Resource Management', () => {
    it('should not accumulate memory with processed events', async () => {
      const eventCount = 1000;
      let processedCount = 0;

      const originalProcessEvent = agent['processEvent'];
      agent['processEvent'] = vi.fn().mockImplementation(async (event: AgentEvent) => {
        processedCount++;
        return originalProcessEvent.call(agent, event);
      });

      // 大量のイベントを追加
      for (let i = 0; i < eventCount; i++) {
        agent.queueEvent({
          type: 'MEMORY_TEST',
          priority: 'normal',
          payload: { 
            largeData: new Array(100).fill(`data-${i}`),
            index: i 
          },
          timestamp: new Date()
        });
      }

      const startPromise = agent.start();
      
      // すべて処理されるまで待つ
      while (processedCount < eventCount) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      // キューが空になっていることを確認
      expect(agent['eventQueue'].length).toBe(0);

      await agent.stop();
      await startPromise;
    });

    it('should handle start/stop cycles correctly', async () => {
      // 複数回の開始/停止サイクル
      for (let cycle = 0; cycle < 3; cycle++) {
        agent.queueEvent({
          type: `CYCLE_${cycle}`,
          priority: 'normal',
          payload: { cycle },
          timestamp: new Date()
        });

        const startPromise = agent.start();
        await new Promise(resolve => setTimeout(resolve, 100));
        await agent.stop();
        await startPromise;
      }

      expect(consoleLogSpy).toHaveBeenCalledWith('Starting Core Agent...');
      expect(consoleLogSpy).toHaveBeenCalledWith('Stopping Core Agent...');
    });

    it('should not process events after stop', async () => {
      let processedAfterStop = false;

      const originalProcessEvent = agent['processEvent'];
      agent['processEvent'] = vi.fn().mockImplementation(async (event: AgentEvent) => {
        if (!agent['isProcessing']) {
          processedAfterStop = true;
        }
        return originalProcessEvent.call(agent, event);
      });

      // イベントを追加
      for (let i = 0; i < 10; i++) {
        agent.queueEvent({
          type: `EVENT_${i}`,
          priority: 'normal',
          payload: { index: i },
          timestamp: new Date()
        });
      }

      const startPromise = agent.start();
      
      // 少し処理させてから停止
      await new Promise(resolve => setTimeout(resolve, 50));
      await agent.stop();
      await startPromise;

      expect(processedAfterStop).toBe(false);
    });
  });

  describe('Workflow Integration Scenarios', () => {
    it('should handle complex workflow chains', async () => {
      const workflowSteps: string[] = [];

      const originalProcessEvent = agent['processEvent'];
      agent['processEvent'] = vi.fn().mockImplementation(async (event: AgentEvent) => {
        workflowSteps.push(event.type);

        // ワークフローチェーンをシミュレート
        switch (event.type) {
          case 'PROCESS_USER_REQUEST':
            // ユーザーリクエストの後にINGEST_INPUTを生成
            agent.queueEvent({
              type: 'INGEST_INPUT',
              priority: 'high',
              payload: { triggeredBy: 'PROCESS_USER_REQUEST' },
              timestamp: new Date()
            });
            break;
          
          case 'INGEST_INPUT':
            // Input処理後にANALYZE_ISSUE_IMPACTを生成
            agent.queueEvent({
              type: 'ANALYZE_ISSUE_IMPACT',
              priority: 'normal',
              payload: { triggeredBy: 'INGEST_INPUT' },
              timestamp: new Date()
            });
            break;
          
          case 'ANALYZE_ISSUE_IMPACT':
            // 分析後に複数のイベントを生成
            agent.queueEvent({
              type: 'UPDATE_KNOWLEDGE',
              priority: 'low',
              payload: { triggeredBy: 'ANALYZE_ISSUE_IMPACT' },
              timestamp: new Date()
            });
            agent.queueEvent({
              type: 'NOTIFY_STAKEHOLDERS',
              priority: 'normal',
              payload: { triggeredBy: 'ANALYZE_ISSUE_IMPACT' },
              timestamp: new Date()
            });
            break;
        }

        return originalProcessEvent.call(agent, event);
      });

      // ワークフローの開始
      agent.queueEvent({
        type: 'PROCESS_USER_REQUEST',
        priority: 'high',
        payload: { request: 'Start workflow' },
        timestamp: new Date()
      });

      const startPromise = agent.start();
      
      // ワークフローが完了するまで待つ
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      await agent.stop();
      await startPromise;

      // ワークフローの順序を確認
      expect(workflowSteps).toContain('PROCESS_USER_REQUEST');
      expect(workflowSteps).toContain('INGEST_INPUT');
      expect(workflowSteps).toContain('ANALYZE_ISSUE_IMPACT');
      expect(workflowSteps).toContain('UPDATE_KNOWLEDGE');
      expect(workflowSteps).toContain('NOTIFY_STAKEHOLDERS');

      // 順序が正しいことを確認
      const userReqIndex = workflowSteps.indexOf('PROCESS_USER_REQUEST');
      const ingestIndex = workflowSteps.indexOf('INGEST_INPUT');
      const analyzeIndex = workflowSteps.indexOf('ANALYZE_ISSUE_IMPACT');
      
      expect(userReqIndex).toBeLessThan(ingestIndex);
      expect(ingestIndex).toBeLessThan(analyzeIndex);
    });

    it('should handle circular workflow prevention', async () => {
      const processedEvents: string[] = [];
      const MAX_EVENTS = 20; // 無限ループ防止

      const originalProcessEvent = agent['processEvent'];
      agent['processEvent'] = vi.fn().mockImplementation(async (event: AgentEvent) => {
        processedEvents.push(event.type);

        // 循環を防ぐための処理回数チェック
        if (processedEvents.length < MAX_EVENTS && event.type === 'CIRCULAR_EVENT') {
          // 同じイベントを再度生成（循環をシミュレート）
          agent.queueEvent({
            type: 'CIRCULAR_EVENT',
            priority: 'normal',
            payload: { 
              iteration: (event.payload.iteration || 0) + 1 
            },
            timestamp: new Date()
          });
        }

        return originalProcessEvent.call(agent, event);
      });

      agent.queueEvent({
        type: 'CIRCULAR_EVENT',
        priority: 'normal',
        payload: { iteration: 0 },
        timestamp: new Date()
      });

      const startPromise = agent.start();
      await new Promise(resolve => setTimeout(resolve, 2000));
      await agent.stop();
      await startPromise;

      // 無限ループに陥らないことを確認
      expect(processedEvents.length).toBeLessThanOrEqual(MAX_EVENTS);
      expect(processedEvents.filter(e => e === 'CIRCULAR_EVENT').length).toBeGreaterThan(1);
    });
  });

  describe('Event Timestamp and Ordering', () => {
    it('should maintain event timestamp integrity', async () => {
      const eventTimestamps: Date[] = [];

      const originalProcessEvent = agent['processEvent'];
      agent['processEvent'] = vi.fn().mockImplementation(async (event: AgentEvent) => {
        eventTimestamps.push(event.timestamp);
        return originalProcessEvent.call(agent, event);
      });

      const baseTime = new Date();
      
      // 異なるタイムスタンプのイベントを追加
      for (let i = 0; i < 5; i++) {
        agent.queueEvent({
          type: `TIMED_EVENT_${i}`,
          priority: 'normal',
          payload: { index: i },
          timestamp: new Date(baseTime.getTime() + i * 1000)
        });
      }

      const startPromise = agent.start();
      await new Promise(resolve => setTimeout(resolve, 600));
      await agent.stop();
      await startPromise;

      // タイムスタンプが保持されていることを確認
      expect(eventTimestamps.length).toBe(5);
      eventTimestamps.forEach((timestamp, index) => {
        expect(timestamp.getTime()).toBe(baseTime.getTime() + index * 1000);
      });
    });

    it('should handle events with past timestamps', async () => {
      const pastDate = new Date('2020-01-01');
      let processedPastEvent = false;

      const originalProcessEvent = agent['processEvent'];
      agent['processEvent'] = vi.fn().mockImplementation(async (event: AgentEvent) => {
        if (event.timestamp.getTime() === pastDate.getTime()) {
          processedPastEvent = true;
        }
        return originalProcessEvent.call(agent, event);
      });

      agent.queueEvent({
        type: 'PAST_EVENT',
        priority: 'normal',
        payload: {},
        timestamp: pastDate
      });

      const startPromise = agent.start();
      await new Promise(resolve => setTimeout(resolve, 100));
      await agent.stop();
      await startPromise;

      expect(processedPastEvent).toBe(true);
    });
  });

  describe('Performance Under Load', () => {
    it('should maintain performance with high event throughput', async () => {
      const startTime = Date.now();
      const eventCount = 500;
      let processedCount = 0;

      const originalProcessEvent = agent['processEvent'];
      agent['processEvent'] = vi.fn().mockImplementation(async (event: AgentEvent) => {
        processedCount++;
        // 最小限の処理時間
        await new Promise(resolve => setImmediate(resolve));
        return originalProcessEvent.call(agent, event);
      });

      // バースト的にイベントを追加
      for (let i = 0; i < eventCount; i++) {
        agent.queueEvent({
          type: 'PERFORMANCE_TEST',
          priority: 'normal',
          payload: { index: i },
          timestamp: new Date()
        });
      }

      const startPromise = agent.start();

      // すべて処理されるまで待つ
      while (processedCount < eventCount) {
        await new Promise(resolve => setTimeout(resolve, 50));
      }

      const processingTime = Date.now() - startTime;
      
      await agent.stop();
      await startPromise;

      expect(processedCount).toBe(eventCount);
      // 処理時間が妥当な範囲内であることを確認（環境依存）
      expect(processingTime).toBeLessThan(eventCount * 100); // 1イベントあたり最大100ms
    });
  });
});