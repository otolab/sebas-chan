/**
 * CoreEngine と CoreAgent の統合テスト
 *
 * テスト対象：
 * - CoreEngineとCoreAgentの連携
 * - イベント駆動処理の実行
 * - WorkflowContextの提供
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CoreEngine } from '../../packages/server/src/core/engine.js';
import { CoreAgent, WorkflowDefinition } from '@sebas-chan/core';
import { DBClient } from '@sebas-chan/db';

// 最小限のモック - DBClientのみ（外部システム）
vi.mock('@sebas-chan/db');

// ロガーのモック（ノイズ削減）
vi.mock('../../packages/server/src/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe('CoreEngine と CoreAgent の統合テスト', () => {
  let engine: CoreEngine;
  let mockDbClient: Partial<DBClient>;
  let coreAgent: CoreAgent;

  // テスト用のワークフロー定義
  const testWorkflow: WorkflowDefinition = {
    name: 'TestWorkflow',
    description: 'テスト用ワークフロー',
    executor: vi.fn().mockImplementation(async (event, context, emitter) => {
      // contextの内容を記録（検証用）
      const currentState = typeof context.getState === 'function'
        ? context.getState()
        : context.state || '';

      return {
        success: true,
        context: {
          ...context,
          state: currentState + '\n[TestWorkflow executed]',
        },
        output: {
          processed: true,
          eventType: event.type,
        },
      };
    }),
  };

  const ingestInputWorkflow: WorkflowDefinition = {
    name: 'IngestInput',
    description: '入力データをPondに保存',
    executor: vi.fn().mockImplementation(async (event, context, emitter) => {
      const input = event.payload.input;

      // Pondに保存
      const pondEntry = await context.storage.addPondEntry({
        content: input.content,
        source: input.source,
      });

      // エラーキーワード検出
      if (input.content.includes('エラー')) {
        await emitter.emit({
          type: 'ANALYZE_ISSUE_IMPACT',
          priority: 'normal',
          payload: {
            pondEntryId: pondEntry.id,
            originalInput: input,
          },
        });
      }

      return {
        success: true,
        context,
        output: {
          pondEntryId: pondEntry.id,
          analyzed: input.content.includes('エラー'),
        },
      };
    }),
  };

  beforeEach(() => {
    // DBClientの最小限のモック
    mockDbClient = {
      connect: vi.fn().mockResolvedValue(undefined),
      disconnect: vi.fn().mockResolvedValue(undefined),
      initModel: vi.fn().mockResolvedValue(true),
      getStatus: vi.fn().mockResolvedValue({
        status: 'ok',
        model_loaded: true,
        tables: ['issues', 'pond', 'state'],
        vector_dimension: 256,
      }),
      addPondEntry: vi.fn().mockImplementation(async (entry) => ({
        ...entry,
        id: `pond-${Date.now()}`,
        timestamp: entry.timestamp || new Date(),
      })),
      searchPond: vi.fn().mockResolvedValue({
        data: [],
        meta: { total: 0, limit: 20, offset: 0, hasMore: false },
      }),
    };

    vi.mocked(DBClient).mockImplementation(() => mockDbClient as DBClient);

    // 実際のCoreAgentを使用（モックしない）
    coreAgent = new CoreAgent();

    // タイマーのモック
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe('1.1 初期化と接続', () => {
    it('TEST-INIT-001: CoreEngineがCoreAgentとDBClientを正しく初期化できる', async () => {
      // Arrange
      engine = new CoreEngine();

      // Act
      await engine.initialize();

      // Assert
      expect(mockDbClient.connect).toHaveBeenCalled();
      expect(mockDbClient.initModel).toHaveBeenCalled();

      const status = await engine.getStatus();
      expect(status.dbStatus).toBe('ready');

      // CoreAgentが利用可能であることを間接的に確認
      const health = engine.getHealthStatus();
      expect(health.agent).toBe('initialized');
    });

    it('TEST-INIT-002: DB接続エラー時にCoreAgentを初期化しない', async () => {
      // Arrange
      mockDbClient.connect = vi.fn().mockRejectedValue(new Error('Connection failed'));
      engine = new CoreEngine();

      // Act & Assert
      await expect(engine.initialize()).rejects.toThrow('Connection failed');

      // CoreAgentが初期化されていないことを確認
      const health = engine.getHealthStatus();
      expect(health.agent).toBe('not initialized');
    });
  });

  describe('1.2 イベント処理の流れ', () => {
    beforeEach(async () => {
      engine = new CoreEngine();
      await engine.initialize();

      // ワークフローを登録
      const registry = (engine as any).coreAgent.getWorkflowRegistry();
      registry.register(testWorkflow);
      registry.get = vi.fn((eventType) => {
        if (eventType === 'TEST_EVENT') return testWorkflow;
        if (eventType === 'INGEST_INPUT') return ingestInputWorkflow;
        return undefined;
      });
    });

    it('TEST-EVENT-001: InputからINGEST_INPUTイベントが生成される', async () => {
      // Arrange
      await engine.start();
      const eventListener = vi.fn();
      engine.on('event:queued', eventListener);

      // Act
      const input = await engine.createInput({
        source: 'manual',
        content: 'テストコンテンツ',
        timestamp: new Date(),
      });

      // Assert
      expect(input.id).toBeDefined();
      expect(input.source).toBe('manual');
      expect(input.content).toBe('テストコンテンツ');

      // イベントがキューに追加されたことを確認
      expect(eventListener).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'INGEST_INPUT',
          priority: 'normal',
          payload: expect.objectContaining({
            input: expect.objectContaining({
              id: input.id,
              content: 'テストコンテンツ',
            }),
          }),
        })
      );
    });

    it('TEST-EVENT-002: イベントがWorkflowRegistryから適切なワークフローを取得して実行される', async () => {
      // Arrange
      await engine.start();

      // Act
      engine.enqueueEvent({
        type: 'TEST_EVENT',
        priority: 'normal',
        payload: { data: 'test' },
      });

      // タイマーを進めて処理を実行
      vi.advanceTimersByTime(1000);

      // Assert
      await vi.waitFor(() => {
        expect(testWorkflow.executor).toHaveBeenCalled();
      });

      // executorが正しい引数で呼ばれたことを確認
      const executorCall = (testWorkflow.executor as any).mock.calls[0];
      expect(executorCall[0].type).toBe('TEST_EVENT');
      expect(executorCall[0].payload).toEqual({ data: 'test' });
    });

    it('TEST-EVENT-003: 未知のイベントタイプは警告を出して無視される', async () => {
      // Arrange
      await engine.start();
      const { logger } = await import('../../packages/server/src/utils/logger.js');
      const warnSpy = vi.mocked(logger.warn);

      // Act
      engine.enqueueEvent({
        type: 'UNKNOWN_EVENT',
        priority: 'normal',
        payload: {},
      });

      vi.advanceTimersByTime(1000);

      // Assert
      await vi.waitFor(() => {
        expect(warnSpy).toHaveBeenCalledWith(
          expect.stringContaining('No workflow found for event type: UNKNOWN_EVENT')
        );
      });

      // ワークフローが実行されないことを確認
      expect(testWorkflow.executor).not.toHaveBeenCalled();
    });
  });

  describe('1.3 WorkflowContext の提供', () => {
    let capturedContext: any;

    beforeEach(async () => {
      engine = new CoreEngine();
      await engine.initialize();

      // コンテキストをキャプチャするワークフロー
      const contextCaptureWorkflow: WorkflowDefinition = {
        name: 'ContextCapture',
        executor: vi.fn().mockImplementation(async (event, context, emitter) => {
          capturedContext = context;
          return { success: true, context };
        }),
      };

      const registry = (engine as any).coreAgent.getWorkflowRegistry();
      registry.get = vi.fn(() => contextCaptureWorkflow);
    });

    it('TEST-CONTEXT-001: WorkflowContextにstorageが正しく提供される', async () => {
      // Arrange
      await engine.start();

      // Act
      engine.enqueueEvent({
        type: 'TEST_EVENT',
        priority: 'normal',
        payload: {},
      });

      vi.advanceTimersByTime(1000);

      // Assert
      await vi.waitFor(() => {
        expect(capturedContext).toBeDefined();
      });

      expect(capturedContext.storage).toBeDefined();
      expect(capturedContext.storage.addPondEntry).toBeDefined();
      expect(capturedContext.storage.searchPond).toBeDefined();
      expect(capturedContext.storage.searchIssues).toBeDefined();

      // storageメソッドが動作することを確認
      const pondEntry = await capturedContext.storage.addPondEntry({
        content: 'test',
        source: 'test',
      });
      expect(pondEntry.id).toBeDefined();
    });

    it('TEST-CONTEXT-002: WorkflowContextにloggerが正しく提供される', async () => {
      // Arrange
      await engine.start();

      // Act
      engine.enqueueEvent({
        type: 'TEST_EVENT',
        priority: 'normal',
        payload: {},
      });

      vi.advanceTimersByTime(1000);

      // Assert
      await vi.waitFor(() => {
        expect(capturedContext).toBeDefined();
      });

      expect(capturedContext.logger).toBeDefined();
      expect(capturedContext.logger.log).toBeDefined();
      expect(typeof capturedContext.logger.log).toBe('function');
    });

    it('TEST-CONTEXT-003: WorkflowContextにstate管理機能が提供される', async () => {
      // Arrange
      await engine.start();

      // Act
      engine.enqueueEvent({
        type: 'TEST_EVENT',
        priority: 'normal',
        payload: {},
      });

      vi.advanceTimersByTime(1000);

      // Assert
      await vi.waitFor(() => {
        expect(capturedContext).toBeDefined();
      });

      expect(capturedContext.getState).toBeDefined();
      expect(capturedContext.setState).toBeDefined();

      // state操作が動作することを確認
      const initialState = capturedContext.getState();
      expect(typeof initialState).toBe('string');

      capturedContext.setState('New State');
      expect(capturedContext.state).toBe('New State');
    });

    it('TEST-CONTEXT-004: WorkflowContextにDriverFactory経由でドライバーが提供される', async () => {
      // Arrange
      await engine.start();

      // Act
      engine.enqueueEvent({
        type: 'TEST_EVENT',
        priority: 'normal',
        payload: {},
      });

      vi.advanceTimersByTime(1000);

      // Assert
      await vi.waitFor(() => {
        expect(capturedContext).toBeDefined();
      });

      expect(capturedContext.createDriver).toBeDefined();
      expect(typeof capturedContext.createDriver).toBe('function');
    });
  });

  describe('1.4 複数イベントの処理', () => {
    beforeEach(async () => {
      engine = new CoreEngine();
      await engine.initialize();

      // ワークフローを登録
      const registry = (engine as any).coreAgent.getWorkflowRegistry();
      registry.get = vi.fn(() => testWorkflow);
    });

    it('TEST-MULTI-001: 複数のイベントが順次処理される', async () => {
      // Arrange
      await engine.start();
      const executorSpy = testWorkflow.executor as any;
      executorSpy.mockClear();

      // Act
      engine.enqueueEvent({
        type: 'EVENT_1',
        priority: 'normal',
        payload: { id: 1 },
      });

      engine.enqueueEvent({
        type: 'EVENT_2',
        priority: 'normal',
        payload: { id: 2 },
      });

      engine.enqueueEvent({
        type: 'EVENT_3',
        priority: 'normal',
        payload: { id: 3 },
      });

      // 各イベントの処理を進める
      for (let i = 0; i < 3; i++) {
        vi.advanceTimersByTime(1000);
      }

      // Assert
      await vi.waitFor(() => {
        expect(executorSpy).toHaveBeenCalledTimes(3);
      });

      // 各イベントが処理されたことを確認
      const calls = executorSpy.mock.calls;
      expect(calls[0][0].payload).toEqual({ id: 1 });
      expect(calls[1][0].payload).toEqual({ id: 2 });
      expect(calls[2][0].payload).toEqual({ id: 3 });
    });

    it('TEST-MULTI-002: イベント優先度に従って処理される', async () => {
      // Arrange
      await engine.start();
      const executorSpy = testWorkflow.executor as any;
      executorSpy.mockClear();

      // Act - 優先度の異なるイベントを追加
      engine.enqueueEvent({
        type: 'LOW_EVENT',
        priority: 'low',
        payload: { priority: 'low' },
      });

      engine.enqueueEvent({
        type: 'HIGH_EVENT',
        priority: 'high',
        payload: { priority: 'high' },
      });

      engine.enqueueEvent({
        type: 'NORMAL_EVENT',
        priority: 'normal',
        payload: { priority: 'normal' },
      });

      // 全イベントの処理を進める
      for (let i = 0; i < 3; i++) {
        vi.advanceTimersByTime(1000);
      }

      // Assert
      await vi.waitFor(() => {
        expect(executorSpy).toHaveBeenCalledTimes(3);
      });

      // 優先度順に処理されたことを確認
      const calls = executorSpy.mock.calls;
      expect(calls[0][0].payload.priority).toBe('high');
      expect(calls[1][0].payload.priority).toBe('normal');
      expect(calls[2][0].payload.priority).toBe('low');
    });
  });
});