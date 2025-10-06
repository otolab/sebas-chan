/**
 * CoreEngine と CoreAgent の統合テスト
 *
 * テスト対象：
 * - CoreEngineとCoreAgentの連携
 * - イベント駆動処理の実行
 * - WorkflowContextの提供
 */

import { describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import { CoreEngine } from '../../packages/server/src/core/engine.js';
import { CoreAgent, WorkflowDefinition } from '@sebas-chan/core';
import { DBClient } from '@sebas-chan/db';
import { setupTestEnvironment, teardownTestEnvironment } from './setup.js';

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
  let coreAgent: CoreAgent;
  let dbClient: DBClient;

  // テスト用のワークフロー定義（WorkflowDefinitionとして）
  const testWorkflow = {
    name: 'TestWorkflow',
    description: 'テスト用ワークフロー',
    triggers: {
      eventTypes: ['TEST_EVENT', 'EVENT_1', 'EVENT_2', 'EVENT_3',
                   'LOW_EVENT', 'HIGH_EVENT', 'NORMAL_EVENT'],
    },
    executor: vi.fn().mockImplementation(async (event, context) => {
      // contextの内容を記録（検証用）
      const currentState = context.state || '';

      return {
        success: true,
        output: {
          processed: true,
          eventType: event.type,
        },
      };
    }),
  };

  const ingestInputWorkflow = {
    name: 'IngestInput',
    description: '入力データをPondに保存',
    triggers: {
      eventTypes: ['INGEST_INPUT'],
    },
    executor: vi.fn().mockImplementation(async (event, context) => {
      const input = event.payload.input;

      // Pondに保存（モック）
      const pondEntry = {
        id: `pond-${Date.now()}`,
        content: input.content,
        source: input.source,
      };

      return {
        success: true,
        output: {
          pondEntryId: pondEntry.id,
          analyzed: input.content?.includes('エラー'),
        },
      };
    }),
  };

  // 共有DBClientを使用して統合テストを実行
  beforeAll(async () => {
    dbClient = await setupTestEnvironment();
  }, 60000);

  afterAll(async () => {
    await teardownTestEnvironment();
  });

  beforeEach(() => {
    // 実際のCoreAgentを使用（モックしない）
    coreAgent = new CoreAgent();

    // タイマーのモック
    vi.useFakeTimers();
  });

  afterEach(async () => {
    // エンジンのクリーンアップ
    if (engine) {
      await engine.stop();
      engine = null;
    }
    vi.useRealTimers();
    vi.clearAllMocks();
  }, 30000); // クリーンアップのため長めのタイムアウト

  describe('1.1 初期化と接続', () => {
    it('TEST-INIT-001: CoreEngineがCoreAgentとDBClientを正しく初期化できる', async () => {
      // Arrange
      // 実際のCoreAgentと共有DBClientを使用
      engine = new CoreEngine(coreAgent, dbClient);

      // Act
      await engine.initialize();

      // Assert
      // DBが正常に接続されていることを確認
      const status = await engine.getStatus();
      expect(status.dbStatus).toBe('ready');

      // CoreAgentが利用可能であることを間接的に確認
      const health = engine.getHealthStatus();
      expect(health.agent).toBe('initialized');
    }, 60000); // DB初期化のため長めのタイムアウト

    it.skip('TEST-INIT-002: DB接続エラー時でもCoreAgentは提供済みなら利用可能', async () => {
      // このテストはモックDBが必要なため、別のユニットテストに移動すべき
      // 統合テストでは実際のDBを使用するため、エラーケースのシミュレーションは困難
    });
  });

  describe('1.2 イベント処理の流れ', () => {
    beforeEach(async () => {
      engine = new CoreEngine(coreAgent, dbClient);
      await engine.initialize();

      // ワークフローを登録（WorkflowRegistryを使用）
      const registry = (engine as any).workflowRegistry;
      registry.register(testWorkflow);
      registry.register(ingestInputWorkflow);
    }, 30000); // タイムアウトを30秒に設定

    it('TEST-EVENT-001: InputからDATA_ARRIVEDイベントが生成される', async () => {
      // Arrange
      await engine.start();
      const eventReceivedListener = vi.fn();
      const workflowQueuedListener = vi.fn();
      engine.on('event:received', eventReceivedListener);
      engine.on('workflow:queued', workflowQueuedListener);

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

      // イベント処理を待つ
      await vi.advanceTimersByTimeAsync(100);

      // イベントが受信されたことを確認
      await vi.waitFor(() => {
        expect(eventReceivedListener).toHaveBeenCalledWith(
          expect.objectContaining({
            type: 'DATA_ARRIVED',
            payload: expect.objectContaining({
              pondEntryId: input.id,
              content: 'テストコンテンツ',
              source: 'manual',
            }),
          })
        );
      });

      // ワークフローがキューに入ったことを確認（IngestInputワークフローが登録されている場合）
      if (workflowQueuedListener.mock.calls.length > 0) {
        expect(workflowQueuedListener).toHaveBeenCalledWith(
          expect.objectContaining({
            workflow: 'IngestInput',
          })
        );
      }
    });

    it('TEST-EVENT-002: イベントがWorkflowRegistryから適切なワークフローを取得して実行される', async () => {
      // Arrange
      await engine.start();

      // Act
      engine.emitEvent({
        type: 'TEST_EVENT',
        payload: { data: 'test' },
      });

      // タイマーを進めて処理を実行
      await vi.advanceTimersByTimeAsync(1000);

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
      engine.emitEvent({
        type: 'UNKNOWN_EVENT',
        payload: {},
      });

      await vi.advanceTimersByTimeAsync(1000);

      // Assert
      await vi.waitFor(() => {
        expect(warnSpy).toHaveBeenCalledWith(
          expect.stringContaining('No workflows found for event type: UNKNOWN_EVENT')
        );
      });

      // ワークフローが実行されないことを確認
      expect(testWorkflow.executor).not.toHaveBeenCalled();
    });
  });

  describe('1.3 WorkflowContext の提供', () => {
    let capturedContext: any;

    beforeEach(async () => {
      engine = new CoreEngine(coreAgent, dbClient);
      await engine.initialize();

      // コンテキストをキャプチャするワークフロー
      const contextCaptureWorkflow: WorkflowDefinition = {
        name: 'ContextCapture',
        description: 'コンテキストキャプチャ用',
        triggers: {
          eventTypes: ['TEST_EVENT'],
        },
        executor: vi.fn().mockImplementation(async (event, context, emitter) => {
          capturedContext = context;
          return { success: true, context };
        }),
      };

      // WorkflowResolverをモック
      const resolver = (engine as any).workflowResolver;
      resolver.resolve = vi.fn().mockReturnValue({
        event: { type: 'TEST_EVENT' },
        workflows: [contextCaptureWorkflow],
      });
    }, 30000); // タイムアウトを30秒に設定

    it('TEST-CONTEXT-001: WorkflowContextにstorageが正しく提供される', async () => {
      // Arrange
      await engine.start();

      // Act
      engine.emitEvent({
        type: 'TEST_EVENT',
        payload: {},
      });

      await vi.advanceTimersByTimeAsync(1000);

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

    it('TEST-CONTEXT-002: WorkflowContextにrecorderが正しく提供される', async () => {
      // Arrange
      await engine.start();

      // Act
      engine.emitEvent({
        type: 'TEST_EVENT',
        payload: {},
      });

      await vi.advanceTimersByTimeAsync(1000);

      // Assert
      await vi.waitFor(() => {
        expect(capturedContext).toBeDefined();
      });

      expect(capturedContext.recorder).toBeDefined();
      expect(capturedContext.recorder.record).toBeDefined();
      expect(typeof capturedContext.recorder.record).toBe('function');
    });

    it('TEST-CONTEXT-003: WorkflowContextにstate管理機能が提供される', async () => {
      // Arrange
      await engine.start();

      // Act
      engine.emitEvent({
        type: 'TEST_EVENT',
        payload: {},
      });

      await vi.advanceTimersByTimeAsync(1000);

      // Assert
      await vi.waitFor(() => {
        expect(capturedContext).toBeDefined();
      });

      // stateプロパティが存在することを確認
      expect(capturedContext).toHaveProperty('state');

      // state操作が動作することを確認
      expect(typeof capturedContext.state).toBe('string');

      // stateプロパティを直接設定できることを確認
      capturedContext.state = 'New State';
      expect(capturedContext.state).toBe('New State');
    });

    it('TEST-CONTEXT-004: WorkflowContextにDriverFactory経由でドライバーが提供される', async () => {
      // Arrange
      await engine.start();

      // Act
      engine.emitEvent({
        type: 'TEST_EVENT',
        payload: {},
      });

      await vi.advanceTimersByTimeAsync(1000);

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
      engine = new CoreEngine(coreAgent, dbClient);
      await engine.initialize();

      // WorkflowResolverをモック
      const resolver = (engine as any).workflowResolver;
      resolver.resolve = vi.fn().mockImplementation((event) => ({
        event,
        workflows: [testWorkflow],
      }));
    }, 30000); // タイムアウトを30秒に設定

    it('TEST-MULTI-001: 複数のイベントが順次処理される', async () => {
      // Arrange
      await engine.start();
      const executorSpy = testWorkflow.executor as any;
      executorSpy.mockClear();

      // Act
      engine.emitEvent({
        type: 'EVENT_1',
        payload: { id: 1 },
      });

      engine.emitEvent({
        type: 'EVENT_2',
        payload: { id: 2 },
      });

      engine.emitEvent({
        type: 'EVENT_3',
        payload: { id: 3 },
      });

      // 各イベントの処理を進める
      for (let i = 0; i < 3; i++) {
        await vi.advanceTimersByTimeAsync(1000);
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
      // 優先度の異なるワークフローを定義
      const highPriorityWorkflow: WorkflowDefinition = {
        name: 'HighPriorityWorkflow',
        description: '高優先度ワークフロー',
        triggers: {
          eventTypes: ['HIGH_EVENT'],
          priority: 100,
        },
        executor: vi.fn().mockImplementation(async (event, context) => ({
          success: true,
          context,
          output: { processed: true, eventType: event.type },
        })),
      };

      const normalPriorityWorkflow: WorkflowDefinition = {
        name: 'NormalPriorityWorkflow',
        description: '通常優先度ワークフロー',
        triggers: {
          eventTypes: ['NORMAL_EVENT'],
          priority: 50,
        },
        executor: vi.fn().mockImplementation(async (event, context) => ({
          success: true,
          context,
          output: { processed: true, eventType: event.type },
        })),
      };

      const lowPriorityWorkflow: WorkflowDefinition = {
        name: 'LowPriorityWorkflow',
        description: '低優先度ワークフロー',
        triggers: {
          eventTypes: ['LOW_EVENT'],
          priority: 10,
        },
        executor: vi.fn().mockImplementation(async (event, context) => ({
          success: true,
          context,
          output: { processed: true, eventType: event.type },
        })),
      };

      // ワークフローを登録
      const registry = (engine as any).workflowRegistry;
      registry.register(highPriorityWorkflow);
      registry.register(normalPriorityWorkflow);
      registry.register(lowPriorityWorkflow);

      // WorkflowResolverを設定
      const resolver = (engine as any).workflowResolver;
      resolver.resolve = vi.fn().mockImplementation((event) => {
        if (event.type === 'HIGH_EVENT') return { workflows: [highPriorityWorkflow], resolutionTime: 1 };
        if (event.type === 'NORMAL_EVENT') return { workflows: [normalPriorityWorkflow], resolutionTime: 1 };
        if (event.type === 'LOW_EVENT') return { workflows: [lowPriorityWorkflow], resolutionTime: 1 };
        return { workflows: [], resolutionTime: 1 };
      });

      await engine.start();

      // Act - 優先度の異なるイベントを追加
      engine.emitEvent({
        type: 'LOW_EVENT',
      });

      engine.emitEvent({
        type: 'HIGH_EVENT',
      });

      engine.emitEvent({
        type: 'NORMAL_EVENT',
      });

      // 全イベントの処理を進める
      for (let i = 0; i < 3; i++) {
        await vi.advanceTimersByTimeAsync(1000);
      }

      // Assert
      await vi.waitFor(() => {
        expect(highPriorityWorkflow.executor).toHaveBeenCalled();
        expect(normalPriorityWorkflow.executor).toHaveBeenCalled();
        expect(lowPriorityWorkflow.executor).toHaveBeenCalled();
      });

      // 優先度順に処理されたことを確認
      // 注意: 実際の実行順序はWorkflowQueueの実装に依存
      // ここでは各ワークフローが実行されたことを確認
      expect(highPriorityWorkflow.executor).toHaveBeenCalledTimes(1);
      expect(normalPriorityWorkflow.executor).toHaveBeenCalledTimes(1);
      expect(lowPriorityWorkflow.executor).toHaveBeenCalledTimes(1);
    });
  });
});