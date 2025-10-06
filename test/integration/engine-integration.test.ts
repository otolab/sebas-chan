import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CoreEngine } from '../../packages/server/src/core/engine.js';
import { CoreAgent } from '@sebas-chan/core';

vi.mock('../../packages/server/src/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe('CoreEngine - CoreAgent Integration', () => {
  let engine: CoreEngine;
  let coreAgent: CoreAgent;

  beforeEach(async () => {
    // 実際のCoreAgentを使用
    coreAgent = new CoreAgent();

    // 実際のコンポーネントでEngineを作成（DBClientは内部で作成される）
    engine = new CoreEngine(coreAgent);
    await engine.initialize();

    vi.useFakeTimers();
  }, 60000); // DB初期化のため長めのタイムアウト

  afterEach(async () => {
    if (engine) {
      await engine.stop();
    }
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe('CoreAgent initialization', () => {
    it('should initialize CoreAgent properly', async () => {
      // CoreAgentの再初期化（既に初期化済みだが、テストのため）
      await engine.initialize();
      await engine.start();

      // ヘルスステータスでCoreAgentが初期化済みであることを確認
      const health = engine.getHealthStatus();
      expect(health.agent).toBe('initialized');
      expect(health.status).toBe('healthy');
    });
  });

  describe('Event forwarding to CoreAgent', () => {
    it('should process DATA_ARRIVED event through CoreAgent', async () => {
      await engine.start();

      // ワークフローを登録
      const executorMock = vi.fn().mockResolvedValue({
        success: true,
        context: { state: {} },
        output: {},
      });

      const testWorkflow = {
        name: 'test-data-arrived',
        description: 'Test workflow for DATA_ARRIVED',
        triggers: {
          eventTypes: ['DATA_ARRIVED'],
        },
        executor: executorMock,
      };

      // @ts-ignore - private propertyにアクセス
      engine.workflowRegistry.register(testWorkflow);

      // createInputを呼び出してDATA_ARRIVEDイベントを生成
      const input = await engine.createInput({
        source: 'manual',
        content: 'Test input content',
        timestamp: new Date(),
      });

      // イベント処理を実行
      await vi.advanceTimersByTimeAsync(1100);

      // ワークフローが実行されたことを確認
      await vi.waitFor(() => {
        expect(executorMock).toHaveBeenCalled();
      });
    });

    it('should process multiple event types through CoreAgent', async () => {
      await engine.start();

      // デフォルトワークフローをクリア
      // @ts-ignore - private propertyにアクセス
      engine.workflowRegistry.clear();

      // 複数のワークフローを登録
      const executorMock1 = vi.fn().mockResolvedValue({ success: true, context: { state: {} }, output: {} });
      const executorMock2 = vi.fn().mockResolvedValue({ success: true, context: { state: {} }, output: {} });

      const workflows = [
        {
          name: 'test-process-user-request',
          description: 'Test workflow for USER_REQUEST_RECEIVED',
          triggers: { eventTypes: ['USER_REQUEST_RECEIVED'] },
          executor: executorMock1,
        },
        {
          name: 'test-issue-created',
          description: 'Test workflow for ISSUE_CREATED',
          triggers: { eventTypes: ['ISSUE_CREATED'] },
          executor: executorMock2,
        },
      ];

      // @ts-ignore - private propertyにアクセス
      workflows.forEach(w => engine.workflowRegistry.register(w));

      // 異なるタイプのイベントを追加
      engine.emitEvent({
        type: 'USER_REQUEST_RECEIVED',
        payload: { request: 'user request' },
      });

      engine.emitEvent({
        type: 'ISSUE_CREATED',
        payload: { issueId: 'issue-123' },
      });

      // イベント処理を実行
      await vi.advanceTimersByTimeAsync(2000);

      // 両方のワークフローが実行されたことを確認
      await vi.waitFor(() => {
        expect(executorMock1).toHaveBeenCalled();
        expect(executorMock2).toHaveBeenCalled();
      });
    });
  });

  describe('WorkflowContext functionality', () => {
    it('should provide working DB operations through storage', async () => {
      await engine.start();

      // 実際にPondエントリを追加してDB操作が動作することを確認
      const pondEntry = {
        content: 'Test pond content',
        source: 'test',
        timestamp: new Date(),
        context: null,
        metadata: null,
      };

      const result = await engine.addToPond(pondEntry);

      // 結果の検証
      expect(result).toMatchObject({
        content: pondEntry.content,
        source: pondEntry.source,
      });
      expect(result.id).toBeDefined();
      expect(result.timestamp).toBeInstanceOf(Date);
    });

    it('should provide state management', async () => {
      await engine.start();

      // 状態取得と更新が動作することを確認
      const initialState = engine.getState();
      expect(initialState).toBeDefined();
      expect(typeof initialState).toBe('string');
      expect(initialState).toContain('sebas-chan State Document');

      // 状態の更新
      const newState = '# Updated State\n\nTest content';
      engine.updateState(newState);

      const updatedState = engine.getState();
      expect(updatedState).toBe(newState);
    });
  });

  describe('Input to Pond flow', () => {
    it('should complete full flow: createInput -> DATA_ARRIVED -> CoreAgent', async () => {
      await engine.start();

      // ワークフローを登録
      const executorMock = vi.fn().mockResolvedValue({ success: true, context: { state: {} }, output: {} });
      const testWorkflow = {
        name: 'test-data-arrived-flow',
        description: 'Test workflow for DATA_ARRIVED flow',
        triggers: { eventTypes: ['DATA_ARRIVED'] },
        executor: executorMock,
      };

      // @ts-ignore - private propertyにアクセス
      engine.workflowRegistry.register(testWorkflow);

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
      await vi.advanceTimersByTimeAsync(1000);

      // 3. ワークフローが実行される
      await vi.waitFor(() => {
        expect(executorMock).toHaveBeenCalled();
        const call = executorMock.mock.calls[0];
        expect(call[0].type).toBe('DATA_ARRIVED');
        expect(call[0].payload).toMatchObject({
          pondEntryId: input.id,
          content: 'Complete flow test',
          source: 'manual',
        });
      });
    });

    it('should handle multiple inputs in sequence', async () => {
      await engine.start();

      // デフォルトワークフローをクリアして、テスト用ワークフローのみを登録
      // @ts-ignore - private propertyにアクセス
      engine.workflowRegistry.clear();

      const executorMock = vi.fn().mockResolvedValue({ success: true, context: { state: {} }, output: {} });
      const testWorkflow = {
        name: 'test-multiple-inputs',
        description: 'Test workflow for multiple inputs',
        triggers: { eventTypes: ['DATA_ARRIVED'] },
        executor: executorMock,
      };

      // @ts-ignore - private propertyにアクセス
      engine.workflowRegistry.register(testWorkflow);

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
        await vi.advanceTimersByTimeAsync(1000);
      }

      // すべてのイベントが処理される
      await vi.waitFor(() => {
        expect(executorMock).toHaveBeenCalledTimes(3);
      });

      // 各イベントの内容を確認
      for (let i = 0; i < 3; i++) {
        const call = executorMock.mock.calls[i];
        expect(call[0].payload.content).toBe(`Input ${i}`);
      }
    });
  });

  describe('Search operations through context', () => {
    it('should search pond entries through context', async () => {
      await engine.start();

      // 実際にデータを追加
      await engine.addToPond({
        content: 'Test search content 1',
        source: 'test',
        timestamp: new Date(),
        context: null,
        metadata: null,
      });

      await engine.addToPond({
        content: 'Test search content 2',
        source: 'test',
        timestamp: new Date(),
        context: null,
        metadata: null,
      });

      // 検索実行
      const results = await engine.searchPond({ q: 'Test search' });

      expect(results).toBeDefined();
      expect(results.data).toBeDefined();
      expect(Array.isArray(results.data)).toBe(true);
      expect(results.meta).toBeDefined();
    });

    it('should search issues through context', async () => {
      await engine.start();

      // Issue検索（実DBでは空の結果が返る）
      const results = await engine.searchIssues('test query');

      expect(results).toBeDefined();
      expect(Array.isArray(results)).toBe(true);
      expect(results).toEqual([]);
    });
  });

  describe('Error handling without CoreAgent', () => {
    it('should handle events for undefined workflows gracefully', async () => {
      // 新しいEngineインスタンスを作成
      const testEngine = new CoreEngine();

      // 初期化と開始
      await testEngine.initialize();
      await testEngine.start();

      const { logger } = await import('../../packages/server/src/utils/logger.js');
      const warnSpy = vi.mocked(logger.warn);

      // ワークフローが定義されていないイベントを追加
      testEngine.emitEvent({
        type: 'UNKNOWN_EVENT_TYPE',
        payload: { test: true },
      });

      // タイマーを進めてイベント処理を待つ
      await vi.advanceTimersByTimeAsync(1000);

      // 警告が出力されることを確認
      await vi.waitFor(() => {
        expect(warnSpy).toHaveBeenCalledWith(
          expect.stringContaining('No workflows found for event type: UNKNOWN_EVENT_TYPE')
        );
      });

      await testEngine.stop();
    });
  });
});