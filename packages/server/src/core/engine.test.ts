import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CoreEngine } from './engine.js';
import { CoreAgent } from '@sebas-chan/core';
import { DBClient } from '@sebas-chan/db';
import { Event } from '@sebas-chan/shared-types';

vi.mock('@sebas-chan/core', () => ({
  CoreAgent: vi.fn(),
  WorkflowLogger: vi.fn().mockImplementation(() => ({
    log: vi.fn(),
    child: vi.fn().mockReturnThis(),
  })),
  WorkflowRegistry: vi.fn().mockImplementation(() => ({
    register: vi.fn(),
    get: vi.fn(),
    list: vi.fn().mockReturnValue([]),
    getByEventType: vi.fn().mockReturnValue([]),
  })),
  WorkflowResolver: vi.fn().mockImplementation(() => ({
    resolve: vi.fn().mockReturnValue({
      workflows: [
        {
          name: 'MockWorkflow',
          description: 'Test workflow',
          triggers: {
            eventTypes: ['PROCESS_USER_REQUEST', 'INGEST_INPUT'],
            priority: 10,
          },
          executor: vi.fn(),
        },
      ],
      resolutionTime: 1,
    }),
  })),
  registerDefaultWorkflows: vi.fn(),
}));
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

      engine.emitEvent({
        type: 'PROCESS_USER_REQUEST',
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

      engine.emitEvent({
        type: 'INGEST_INPUT',
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
        payload: {},
      };

      engine.emitEvent(event);

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
    it('should enqueue events and resolve to workflows', async () => {
      engine.emitEvent({
        type: 'INGEST_INPUT',
        payload: { input: { id: '123', content: 'test', source: 'test' } },
      });

      // workflowQueueを直接アクセスして確認
      const workflowQueue = (engine as unknown as { workflowQueue: { size: () => number } })
        .workflowQueue;

      // INGEST_INPUTイベントは複数のワークフローに解決される可能性がある
      expect(workflowQueue.size()).toBeGreaterThan(0);
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

      await engine.stop();

      const listener = vi.fn();
      engine.on('event:queued', listener);

      engine.emitEvent({
        type: 'PROCESS_USER_REQUEST',
        payload: {},
      });

      // イベントはキューに入るが処理されない
      expect(listener).toHaveBeenCalled();
    });
  });

  // WorkflowQueueが優先度処理を担うため、エンジンレベルの優先度テストは削除

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
      engine.emitEvent({
        type: 'PROCESS_USER_REQUEST',
        payload: {},
      });

      engine.emitEvent({
        type: 'INGEST_INPUT',
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
