import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CoreEngine } from './engine.js';
import { CoreAgent } from '@sebas-chan/core';
import { DBClient } from '@sebas-chan/db';
import { Event } from '@sebas-chan/shared-types';

// EventQueueImplのみ実際の実装を使用
vi.mock('@sebas-chan/core', async () => {
  const { EventQueueImpl } = await import('@sebas-chan/core/src/event-queue.js');
  return {
    CoreAgent: vi.fn(),
    EventQueueImpl,
    WorkflowLogger: vi.fn().mockImplementation(() => ({
      log: vi.fn(),
      child: vi.fn().mockReturnThis(),
    })),
  };
});
vi.mock('@sebas-chan/db');

describe('CoreEngine', () => {
  let engine: CoreEngine;
  let mockDbClient: Partial<import('@sebas-chan/db').DBClient>;
  let mockCoreAgent: Partial<import('@sebas-chan/core').CoreAgent>;

  beforeEach(async () => {
    // DBClientモックの設定
    mockDbClient = {
      connect: vi.fn().mockResolvedValue(undefined),
      disconnect: vi.fn().mockResolvedValue(undefined),
      initModel: vi.fn().mockResolvedValue(true),
      addPondEntry: vi.fn().mockResolvedValue(true),
      searchPond: vi.fn().mockResolvedValue([]),
      searchIssues: vi.fn().mockResolvedValue([]),
      updateStateDocument: vi.fn().mockResolvedValue(undefined),
      getStateDocument: vi.fn().mockResolvedValue(null), // デフォルトはnullを返す（新規状態）
    };

    vi.mocked(DBClient).mockImplementation(() => mockDbClient);

    // CoreAgentモックの設定
    mockCoreAgent = {
      start: vi.fn().mockResolvedValue(undefined),
      stop: vi.fn().mockResolvedValue(undefined),
      queueEvent: vi.fn(),
      setContext: vi.fn(),
      getWorkflowRegistry: vi.fn().mockReturnValue({
        get: vi.fn().mockReturnValue({
          name: 'MockWorkflow',
          executor: vi.fn().mockResolvedValue({
            success: true,
            context: {},
          }),
        }),
        register: vi.fn(),
        list: vi.fn().mockReturnValue([]),
      }),
      executeWorkflow: vi.fn().mockResolvedValue({
        success: true,
        context: {},
      }),
    };

    vi.mocked(CoreAgent).mockImplementation(() => mockCoreAgent);

    engine = new CoreEngine();
    vi.useFakeTimers();
  });

  afterEach(() => {
    engine.stop();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe('initialize', () => {
    it('should initialize and start the engine', async () => {
      await engine.initialize();
      await engine.start();

      const state = engine.getState();
      expect(state).toContain('sebas-chan State Document');
    });
  });

  describe('event processing', () => {
    it('should forward events to CoreAgent', async () => {
      await engine.initialize();
      await engine.start();

      engine.enqueueEvent({
        type: 'PROCESS_USER_REQUEST',
        priority: 'high',
        payload: { test: true },
      });

      // イベントループが処理されるのを待つ
      await vi.advanceTimersByTimeAsync(1000);

      // CoreAgentのexecuteWorkflowが呼ばれることを確認
      await vi.waitFor(() => {
        expect(mockCoreAgent.executeWorkflow).toHaveBeenCalled();
      });
    });

    it('should handle INGEST_INPUT events', async () => {
      await engine.initialize();
      await engine.start();

      engine.enqueueEvent({
        type: 'INGEST_INPUT',
        priority: 'normal',
        payload: { inputId: 'test-input' },
      });

      // イベントループが処理されるのを待つ
      await vi.advanceTimersByTimeAsync(1000);

      // CoreAgentのexecuteWorkflowが呼ばれることを確認
      await vi.waitFor(() => {
        expect(mockCoreAgent.executeWorkflow).toHaveBeenCalled();
      });
    });

    it('should handle workflow errors without retry', async () => {
      await engine.initialize();
      await engine.start();

      // executeWorkflowをモックして常にエラーを返す
      let callCount = 0;
      mockCoreAgent.executeWorkflow = vi.fn().mockImplementation(async () => {
        callCount++;
        throw new Error('Test error');
      });

      const event: Omit<Event, 'id' | 'timestamp'> = {
        type: 'PROCESS_USER_REQUEST',
        priority: 'high',
        payload: {},
      };

      engine.enqueueEvent(event);

      // イベントループが処理されるのを待つ
      await vi.advanceTimersByTimeAsync(1000);

      // 処理を待つ
      await vi.waitFor(() => {
        // エラーが発生しても1回だけ実行される（リトライなし）
        expect(callCount).toBe(1);
      });
    });
  });

  describe('Issue operations', () => {
    it('should create issue with generated id', async () => {
      const issue = await engine.createIssue({
        title: 'Test Issue',
        description: 'Test description',
        status: 'open',
        labels: ['bug'],
        updates: [],
        relations: [],
        sourceInputIds: [],
      });

      expect(issue.id).toMatch(/^issue-\d+$/);
      expect(issue.title).toBe('Test Issue');
      expect(issue.status).toBe('open');
      expect(issue.labels).toEqual(['bug']);
    });

    it('should search issues', async () => {
      const results = await engine.searchIssues('test query');
      expect(results).toEqual([]);
    });

    it('should throw error for unimplemented methods', async () => {
      await expect(engine.getIssue('test-id')).rejects.toThrow('Not implemented');
      await expect(engine.updateIssue('test-id', {})).rejects.toThrow('Not implemented');
    });
  });

  describe('Flow operations', () => {
    it('should create flow with generated id', async () => {
      const flow = await engine.createFlow({
        title: 'Test Flow',
        description: 'Test description',
        status: 'backlog',
        priorityScore: 0.7,
        issueIds: ['issue-1', 'issue-2'],
      });

      expect(flow.id).toMatch(/^flow-\d+$/);
      expect(flow.title).toBe('Test Flow');
      expect(flow.status).toBe('backlog');
      expect(flow.priorityScore).toBe(0.7);
      expect(flow.issueIds).toEqual(['issue-1', 'issue-2']);
    });

    it('should search flows', async () => {
      const results = await engine.searchFlows('test query');
      expect(results).toEqual([]);
    });
  });

  describe('Knowledge operations', () => {
    it('should create knowledge with generated id', async () => {
      const knowledge = await engine.createKnowledge({
        type: 'factoid',
        content: 'Test knowledge',
        reputation: { upvotes: 0, downvotes: 0 },
        sources: [],
      });

      expect(knowledge.id).toMatch(/^knowledge-\d+$/);
      expect(knowledge.type).toBe('factoid');
      expect(knowledge.content).toBe('Test knowledge');
      expect(knowledge.reputation).toEqual({ upvotes: 0, downvotes: 0 });
    });
  });

  describe('Input operations', () => {
    it('should create input and enqueue INGEST_INPUT event', async () => {
      await engine.initialize();
      await engine.start();

      const input = await engine.createInput({
        source: 'test',
        content: 'Test input',
        timestamp: new Date(),
      });

      expect(input.id).toBeDefined();
      expect(input.id.length).toBeGreaterThan(0);
      expect(input.source).toBe('test');
      expect(input.content).toBe('Test input');

      // イベントループが処理されるのを待つ
      await vi.advanceTimersByTimeAsync(1000);

      // イベントがCoreAgentに転送されたか確認
      await vi.waitFor(() => {
        expect(mockCoreAgent.executeWorkflow).toHaveBeenCalled();
      });
    });

    it('should list pending inputs', async () => {
      const inputs = await engine.listPendingInputs();
      expect(inputs).toEqual([]);
    });
  });

  describe('Pond operations', () => {
    it('should add entry to pond', async () => {
      const entry = await engine.addToPond({
        content: 'Test content',
        timestamp: new Date(),
        source: 'test',
      });

      expect(entry.id).toMatch(/^pond-\d+$/);
      expect(entry.content).toBe('Test content');
      expect(entry.source).toBe('test');
    });

    it('should search pond', async () => {
      const results = await engine.searchPond({ q: 'test query' });
      expect(results).toEqual({
        data: [],
        meta: {
          total: 0,
          limit: 20,
          offset: 0,
          hasMore: false,
        },
      });
    });
  });

  describe('State management', () => {
    it('should get and update state', async () => {
      await engine.initialize();
      await engine.start();

      const initialState = engine.getState();
      expect(initialState).toContain('sebas-chan State Document');

      const newState = '# Updated State\nNew content';
      engine.updateState(newState);

      expect(engine.getState()).toBe(newState);
    });

    it('should persist state to DB when updating', async () => {
      await engine.initialize();
      await engine.start();

      const newState = '# Persisted State\n\nThis should be saved to DB';
      engine.updateState(newState);

      // DBClientのupdateStateDocumentが呼ばれることを確認
      expect(mockDbClient.updateStateDocument).toHaveBeenCalledWith(newState);
    });

    it('should load state from DB on initialization', async () => {
      const dbState = '# State from Database\n\nPreviously saved state';
      mockDbClient.getStateDocument = vi.fn().mockResolvedValue(dbState);

      await engine.initialize();

      // DBから状態が読み込まれたことを確認
      expect(mockDbClient.getStateDocument).toHaveBeenCalled();
      const currentState = engine.getState();
      expect(currentState).toBe(dbState);
    });

    it('should handle DB state load failure gracefully', async () => {
      mockDbClient.getStateDocument = vi.fn().mockRejectedValue(new Error('DB read failed'));

      // エラーが発生してもinitializeは成功する
      await expect(engine.initialize()).resolves.not.toThrow();

      // デフォルトの状態が使用される
      const currentState = engine.getState();
      expect(currentState).toContain('sebas-chan State Document');
    });
  });

  describe('Event queue management', () => {
    it('should enqueue and dequeue events', () => {
      engine.enqueueEvent({
        type: 'PROCESS_USER_REQUEST',
        priority: 'high',
        payload: { test: true },
      });

      // eventQueueを直接アクセスして確認
      const eventQueue = (
        engine as unknown as { eventQueue: { size: () => number; dequeue: () => Event | null } }
      ).eventQueue;
      expect(eventQueue.size()).toBe(1);

      const event = eventQueue.dequeue();
      expect(event).not.toBeNull();
      expect(event?.type).toBe('PROCESS_USER_REQUEST');
      expect(event?.priority).toBe('high');
      expect(event?.payload).toEqual({ test: true });

      expect(eventQueue.dequeue()).toBeNull();
    });
  });

  describe('start/stop', () => {
    it('should not start if already running', async () => {
      await engine.initialize();
      await engine.start();

      // 2回目のstartは何もしない
      await engine.start();

      // isRunningフラグが変わらないことを確認
      const isRunning = (engine as unknown as { isRunning: boolean }).isRunning;
      expect(isRunning).toBe(true);
    });

    it('should stop processing when stopped', async () => {
      await engine.initialize();
      await engine.start();

      engine.stop();

      const listener = vi.fn();
      engine.on('event:processing', listener);

      engine.enqueueEvent({
        type: 'PROCESS_USER_REQUEST',
        priority: 'high',
        payload: {},
      });

      vi.advanceTimersByTime(2000);

      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('event priority handling', () => {
    it('should process high priority events first', () => {
      // EventQueueの優先度処理を直接テスト
      const eventQueue = (
        engine as unknown as {
          eventQueue: { enqueue: (event: Event) => void; dequeue: () => Event | null };
        }
      ).eventQueue;

      // 異なる優先度のイベントを追加
      eventQueue.enqueue({
        type: 'SALVAGE_FROM_POND',
        priority: 'low',
        payload: { id: 'low1' },
        timestamp: new Date(),
      });

      eventQueue.enqueue({
        type: 'INGEST_INPUT',
        priority: 'normal',
        payload: { id: 'normal1' },
        timestamp: new Date(),
      });

      eventQueue.enqueue({
        type: 'PROCESS_USER_REQUEST',
        priority: 'high',
        payload: { id: 'high1' },
        timestamp: new Date(),
      });

      // 優先度順に取り出し
      const first = eventQueue.dequeue();
      expect(first?.priority).toBe('high');

      const second = eventQueue.dequeue();
      expect(second?.priority).toBe('normal');

      const third = eventQueue.dequeue();
      expect(third?.priority).toBe('low');
    });

    it('should handle mixed priority events with timestamps', () => {
      // start()しないで、キューの優先度ソートのみをテスト
      const eventQueue = (
        engine as unknown as {
          eventQueue: { enqueue: (event: Event) => void; dequeue: () => Event | null };
        }
      ).eventQueue;
      const now = new Date();

      // 異なる優先度と異なるタイプのイベント
      const events = [
        {
          type: 'COLLECT_SYSTEM_STATS',
          priority: 'low' as const,
          timestamp: new Date(now.getTime() + 1),
        },
        {
          type: 'UPDATE_FLOW_PRIORITIES',
          priority: 'normal' as const,
          timestamp: new Date(now.getTime() + 2),
        },
        {
          type: 'ANALYZE_ISSUE_IMPACT',
          priority: 'high' as const,
          timestamp: new Date(now.getTime() + 3),
        },
        {
          type: 'EXTRACT_KNOWLEDGE',
          priority: 'normal' as const,
          timestamp: new Date(now.getTime() + 4),
        },
        {
          type: 'PROCESS_USER_REQUEST',
          priority: 'high' as const,
          timestamp: new Date(now.getTime() + 5),
        },
      ];

      // イベントを追加
      events.forEach((e) => {
        eventQueue.enqueue({
          type: e.type,
          priority: e.priority,
          payload: {},
          timestamp: e.timestamp,
        });
      });

      // 優先度順に取り出し
      const dequeued = [];
      let event;
      while ((event = eventQueue.dequeue())) {
        dequeued.push(event);
      }

      // high優先度のイベントが最初に処理される（同じ優先度ならタイムスタンプ順）
      expect(dequeued[0].priority).toBe('high');
      expect(dequeued[1].priority).toBe('high');
      expect(dequeued[0].type).toBe('ANALYZE_ISSUE_IMPACT'); // より古いタイムスタンプ
      expect(dequeued[1].type).toBe('PROCESS_USER_REQUEST');

      // normal優先度が次
      expect(dequeued[2].priority).toBe('normal');
      expect(dequeued[3].priority).toBe('normal');

      // low優先度が最後
      expect(dequeued[4].priority).toBe('low');
      expect(dequeued[4].type).toBe('COLLECT_SYSTEM_STATS');
    });
  });

  describe('error handling and recovery', () => {
    it('should continue processing after workflow error', async () => {
      await engine.initialize();
      await engine.start();

      let callCount = 0;
      let errorCount = 0;

      // ワークフローが交互に成功/失敗するようモック
      mockCoreAgent.executeWorkflow = vi.fn().mockImplementation(async () => {
        callCount++;
        if (callCount % 2 === 1) {
          errorCount++;
          throw new Error('Workflow execution failed');
        }
        return { success: true, context: {} };
      });

      // 複数のイベントを投入
      engine.enqueueEvent({
        type: 'PROCESS_USER_REQUEST',
        priority: 'high',
        payload: {},
      });

      engine.enqueueEvent({
        type: 'INGEST_INPUT',
        priority: 'normal',
        payload: {},
      });

      // イベントループが処理されるのを待つ
      await vi.advanceTimersByTimeAsync(2000); // 2つのイベント分

      // 処理を実行
      await vi.waitFor(() => {
        expect(mockCoreAgent.executeWorkflow).toHaveBeenCalled();
      });

      // エラーが発生しても処理が継続
      expect(errorCount).toBeGreaterThan(0);

      // エンジンは実行中のまま
      expect((engine as unknown as { isRunning: boolean }).isRunning).toBe(true);
    });

    // 削除: リトライロジックはEngine側では持たない仕様
  });

  // 削除されたテスト:
  // - カスケードテスト: core側またはE2Eテストで実施
  // - 同時処理テスト: アーキテクチャ上発生しない
  // - 状態整合性テスト: 結果整合性・ベストエフォートでOK
  // - パフォーマンステスト: 別途実施
});
