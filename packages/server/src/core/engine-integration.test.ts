import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CoreEngine } from './engine';
import { CoreAgent } from '@sebas-chan/core';
import { DBClient } from '@sebas-chan/db';

// モックを作成
vi.mock('@sebas-chan/core');
vi.mock('@sebas-chan/db');
vi.mock('../utils/logger', () => ({
  logger: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe('CoreEngine - CoreAgent Integration', () => {
  let engine: CoreEngine;
  let mockDbClient: any;
  let mockCoreAgent: any;

  beforeEach(() => {
    // DBClientモックの設定
    mockDbClient = {
      connect: vi.fn().mockResolvedValue(undefined),
      disconnect: vi.fn().mockResolvedValue(undefined),
      initModel: vi.fn().mockResolvedValue(true),
      addPondEntry: vi.fn().mockResolvedValue(true),
      searchPond: vi.fn().mockResolvedValue([]),
      searchIssues: vi.fn().mockResolvedValue([]),
    };
    
    vi.mocked(DBClient).mockImplementation(() => mockDbClient);

    // CoreAgentモックの設定
    mockCoreAgent = {
      start: vi.fn().mockResolvedValue(undefined),
      stop: vi.fn().mockResolvedValue(undefined),
      queueEvent: vi.fn(),
      setContext: vi.fn(),
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

  describe('CoreAgent initialization', () => {
    it('should initialize CoreAgent with proper context', async () => {
      await engine.initialize();

      // CoreAgentが作成されることを確認
      expect(CoreAgent).toHaveBeenCalled();

      // CoreAgent.startがcontextとともに呼ばれることを確認
      expect(mockCoreAgent.start).toHaveBeenCalledWith(
        expect.objectContaining({
          getState: expect.any(Function),
          searchIssues: expect.any(Function),
          searchKnowledge: expect.any(Function),
          searchPond: expect.any(Function),
          addPondEntry: expect.any(Function),
          emitEvent: expect.any(Function),
        })
      );
    });
  });

  describe('Event forwarding to CoreAgent', () => {
    it('should forward INGEST_INPUT event to CoreAgent', async () => {
      await engine.initialize();

      // createInputを呼び出してINGEST_INPUTイベントを生成
      const input = await engine.createInput({
        source: 'manual',
        content: 'Test input content',
        timestamp: new Date(),
      });

      // イベント処理を実行
      vi.advanceTimersByTime(1000);

      // CoreAgentのqueueEventが呼ばれることを確認
      expect(mockCoreAgent.queueEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'INGEST_INPUT',
          priority: 'normal',
          payload: expect.objectContaining({
            input: expect.objectContaining({
              id: input.id,
              source: 'manual',
              content: 'Test input content',
            }),
          }),
        })
      );
    });

    it('should forward multiple event types to CoreAgent', async () => {
      await engine.initialize();

      // 異なるタイプのイベントを追加
      engine.enqueueEvent({
        type: 'PROCESS_USER_REQUEST',
        priority: 'high',
        payload: { request: 'user request' },
      });

      engine.enqueueEvent({
        type: 'ANALYZE_ISSUE_IMPACT',
        priority: 'normal',
        payload: { issueId: 'issue-123' },
      });

      // イベント処理を実行
      vi.advanceTimersByTime(2000);

      // 両方のイベントがCoreAgentに転送されることを確認
      expect(mockCoreAgent.queueEvent).toHaveBeenCalledTimes(2);
      
      const calls = mockCoreAgent.queueEvent.mock.calls;
      expect(calls[0][0].type).toBe('PROCESS_USER_REQUEST');
      expect(calls[1][0].type).toBe('ANALYZE_ISSUE_IMPACT');
    });
  });

  describe('AgentContext functionality', () => {
    it('should provide working DB operations through context', async () => {
      await engine.initialize();

      // contextを取得
      const contextArg = mockCoreAgent.start.mock.calls[0][0];

      // addPondEntry のテスト
      const pondEntry = {
        content: 'Test pond content',
        source: 'test',
        timestamp: new Date(),
      };

      const result = await contextArg.addPondEntry(pondEntry);

      expect(mockDbClient.addPondEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          id: expect.any(String),
          content: pondEntry.content,
          source: pondEntry.source,
        })
      );

      expect(result).toMatchObject(pondEntry);
      expect(result.id).toBeDefined();
    });

    it('should handle DB operation failures gracefully', async () => {
      await engine.initialize();
      
      // DBエラーをシミュレート
      mockDbClient.addPondEntry.mockResolvedValue(false);

      const contextArg = mockCoreAgent.start.mock.calls[0][0];
      const pondEntry = {
        content: 'Test content',
        source: 'test',
        timestamp: new Date(),
      };

      await expect(contextArg.addPondEntry(pondEntry)).rejects.toThrow('Failed to add pond entry');
    });

    it('should provide state access through context', async () => {
      await engine.initialize();

      const contextArg = mockCoreAgent.start.mock.calls[0][0];
      const state = contextArg.getState();

      expect(state).toBeDefined();
      expect(typeof state).toBe('string');
    });

    it('should allow event emission through context', async () => {
      await engine.initialize();

      const contextArg = mockCoreAgent.start.mock.calls[0][0];
      
      // contextのemitEventを呼び出し
      contextArg.emitEvent({
        type: 'CUSTOM_EVENT',
        priority: 'low',
        payload: { test: true },
      });

      // イベントキューにイベントが追加されることを確認
      const event = engine.dequeueEvent();
      expect(event).not.toBeNull();
      expect(event?.type).toBe('CUSTOM_EVENT');
      expect(event?.payload).toEqual({ test: true });
    });
  });

  describe('DB Client integration', () => {
    it('should initialize DB client properly', async () => {
      await engine.initialize();

      expect(DBClient).toHaveBeenCalled();
      expect(mockDbClient.connect).toHaveBeenCalled();
      expect(mockDbClient.initModel).toHaveBeenCalled();
    });

    it('should handle DB connection failure', async () => {
      mockDbClient.connect.mockRejectedValue(new Error('Connection failed'));

      await expect(engine.initialize()).rejects.toThrow('Connection failed');
      
      // CoreAgentが初期化されないことを確認
      expect(mockCoreAgent.start).not.toHaveBeenCalled();
    });

    it('should handle DB model initialization failure', async () => {
      mockDbClient.initModel.mockRejectedValue(new Error('Model init failed'));

      await expect(engine.initialize()).rejects.toThrow('Model init failed');
    });
  });

  describe('Input to Pond flow', () => {
    it('should complete full flow: createInput -> INGEST_INPUT -> CoreAgent', async () => {
      await engine.initialize();

      // 1. Input作成
      const inputData = {
        source: 'manual',
        content: 'Complete flow test',
        timestamp: new Date(),
      };
      
      const input = await engine.createInput(inputData);
      
      // Inputが正しく作成される
      expect(input.id).toBeDefined();
      expect(input.source).toBe('manual');
      expect(input.content).toBe('Complete flow test');

      // 2. イベント処理
      vi.advanceTimersByTime(1000);

      // 3. CoreAgentにイベントが転送される
      expect(mockCoreAgent.queueEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'INGEST_INPUT',
          payload: expect.objectContaining({
            input: expect.objectContaining({
              id: input.id,
              content: 'Complete flow test',
            }),
          }),
        })
      );
    });

    it('should handle multiple inputs in sequence', async () => {
      await engine.initialize();

      // 複数のInputを作成
      const inputs = [];
      for (let i = 0; i < 3; i++) {
        const input = await engine.createInput({
          source: 'test',
          content: `Input ${i}`,
          timestamp: new Date(),
        });
        inputs.push(input);
      }

      // すべてのイベントを処理
      for (let i = 0; i < 3; i++) {
        vi.advanceTimersByTime(1000);
      }

      // すべてのイベントがCoreAgentに転送される
      expect(mockCoreAgent.queueEvent).toHaveBeenCalledTimes(3);
      
      // 各イベントの内容を確認
      for (let i = 0; i < 3; i++) {
        const call = mockCoreAgent.queueEvent.mock.calls[i];
        expect(call[0].payload.input.content).toBe(`Input ${i}`);
      }
    });
  });

  describe('Search operations through context', () => {
    it('should search pond entries through context', async () => {
      await engine.initialize();

      const mockPondResults = [
        { id: 'pond-1', content: 'Result 1', source: 'test', timestamp: '2024-01-01T00:00:00Z' },
        { id: 'pond-2', content: 'Result 2', source: 'test', timestamp: '2024-01-02T00:00:00Z' },
      ];
      
      mockDbClient.searchPond.mockResolvedValue(mockPondResults);

      const contextArg = mockCoreAgent.start.mock.calls[0][0];
      const results = await contextArg.searchPond('test query');

      expect(mockDbClient.searchPond).toHaveBeenCalledWith('test query');
      expect(results).toHaveLength(2);
      expect(results[0].timestamp).toBeInstanceOf(Date);
      expect(results[1].timestamp).toBeInstanceOf(Date);
    });

    it('should search issues through context', async () => {
      await engine.initialize();

      const mockIssueResults = [
        {
          id: 'issue-1',
          title: 'Test Issue',
          description: 'Test description',
          status: 'open',
          labels: [],
          updates: [],
          relations: [],
          sourceInputIds: [],
        },
      ];
      
      mockDbClient.searchIssues.mockResolvedValue(mockIssueResults);

      const contextArg = mockCoreAgent.start.mock.calls[0][0];
      const results = await contextArg.searchIssues('test query');

      expect(mockDbClient.searchIssues).toHaveBeenCalledWith('test query');
      expect(results).toEqual(mockIssueResults);
    });
  });

  describe('Error handling without CoreAgent', () => {
    it('should handle events locally when CoreAgent is not initialized', async () => {
      // initializeを呼ばずにengineを使用
      engine = new CoreEngine();
      
      const listener = vi.fn();
      engine.on('event:processed', listener);

      engine.enqueueEvent({
        type: 'PROCESS_USER_REQUEST',
        priority: 'high',
        payload: { test: true },
      });

      // privateメソッドを直接呼び出してテスト
      const event = engine.dequeueEvent();
      if (event) {
        await engine['handleEvent'](event);
      }

      // イベントが処理されることを確認
      expect(listener).toHaveBeenCalled();
    });
  });
});