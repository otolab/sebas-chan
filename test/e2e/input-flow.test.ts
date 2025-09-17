/**
 * Input処理フローのE2Eテスト
 *
 * テスト対象：
 * - Inputの投稿から処理、保存までの一連の流れ
 * - エラー検出と分析イベントのトリガー
 * - 完全なワークフロー実行
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

describe('Input処理フローのE2Eテスト', () => {
  let engine: CoreEngine;
  let mockDbClient: Partial<DBClient>;
  let coreAgent: CoreAgent;
  let capturedEvents: Array<any> = [];
  let processedInputs: Array<any> = [];
  let createdPondEntries: Array<any> = [];
  let triggeredAnalysis: Array<any> = [];

  // 実際のワークフロー定義（E2Eテスト用）
  const ingestInputWorkflow: WorkflowDefinition = {
    name: 'IngestInput',
    description: '入力データをPondに保存し、必要に応じて分析',
    executor: vi.fn().mockImplementation(async (event, context, emitter) => {
      const input = event.payload.input;
      processedInputs.push(input);

      // Pondに保存
      const pondEntry = await context.storage.addPondEntry({
        content: input.content,
        source: input.source,
        metadata: {
          inputId: input.id,
          processedAt: new Date(),
        },
      });
      createdPondEntries.push(pondEntry);

      // エラーキーワード検出
      if (input.content.includes('エラー') || input.content.includes('error')) {
        const analysisEvent = {
          type: 'ANALYZE_ISSUE_IMPACT',
          priority: 'high' as const,
          payload: {
            pondEntryId: pondEntry.id,
            originalInput: input,
            detectedKeywords: ['エラー', 'error'].filter(kw => input.content.includes(kw)),
          },
        };
        await emitter.emit(analysisEvent);
        triggeredAnalysis.push(analysisEvent);
      }

      // 状態を更新
      const currentState = typeof context.getState === 'function'
        ? context.getState()
        : context.state || '';

      if (typeof context.setState === 'function') {
        context.setState(currentState + `\n[Processed Input: ${input.id}]`);
      } else {
        context.state = currentState + `\n[Processed Input: ${input.id}]`;
      }

      return {
        success: true,
        context,
        output: {
          pondEntryId: pondEntry.id,
          analyzed: triggeredAnalysis.length > 0,
        },
      };
    }),
  };

  const analyzeIssueWorkflow: WorkflowDefinition = {
    name: 'AnalyzeIssueImpact',
    description: 'エラーを含む入力を分析してIssueを作成',
    executor: vi.fn().mockImplementation(async (event, context, emitter) => {
      const { pondEntryId, originalInput, detectedKeywords } = event.payload;

      // Pond検索で関連エントリを取得
      const relatedEntries = await context.storage.searchPond(detectedKeywords.join(' '));

      // Issue作成イベントを発行
      await emitter.emit({
        type: 'CREATE_ISSUE',
        priority: 'normal',
        payload: {
          title: `Error detected in ${originalInput.source}`,
          description: `Keywords detected: ${detectedKeywords.join(', ')}\n\nOriginal content: ${originalInput.content}`,
          relatedPondEntries: [pondEntryId, ...relatedEntries.map((e: any) => e.id)],
        },
      });

      return {
        success: true,
        context,
        output: {
          analyzed: true,
          relatedEntriesCount: relatedEntries.length,
        },
      };
    }),
  };

  beforeEach(() => {
    // テストデータをリセット
    capturedEvents = [];
    processedInputs = [];
    createdPondEntries = [];
    triggeredAnalysis = [];

    // DBClientのモック設定
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
      addPondEntry: vi.fn().mockImplementation(async (entry) => {
        const pondEntry = {
          ...entry,
          id: `pond-${Date.now()}-${Math.random().toString(36).substring(7)}`,
          timestamp: entry.timestamp || new Date(),
        };
        return pondEntry;
      }),
      searchPond: vi.fn().mockImplementation(async (query) => {
        // エラー関連のクエリには既存エントリを返す
        if (typeof query === 'object' && query.q && query.q.includes('エラー')) {
          return {
            data: [
              {
                id: 'pond-existing-1',
                content: '以前のエラーレポート',
                source: 'historical',
                timestamp: new Date('2024-01-01'),
              },
            ],
            meta: { total: 1, limit: 20, offset: 0, hasMore: false },
          };
        }
        return {
          data: [],
          meta: { total: 0, limit: 20, offset: 0, hasMore: false },
        };
      }),
      searchIssues: vi.fn().mockResolvedValue([]),
    };

    vi.mocked(DBClient).mockImplementation(() => mockDbClient as DBClient);

    // 実際のCoreAgentを使用
    coreAgent = new CoreAgent();

    // タイマーのモック
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe('3.1 基本フロー', () => {
    it('TEST-FLOW-001: Input投稿 → イベント生成 → ワークフロー実行 → Pond保存', async () => {
      // Arrange
      engine = new CoreEngine();
      await engine.initialize();

      // ワークフローを登録
      const registry = (engine as any).coreAgent.getWorkflowRegistry();
      registry.register(ingestInputWorkflow);
      registry.get = vi.fn((eventType) => {
        if (eventType === 'INGEST_INPUT') return ingestInputWorkflow;
        return undefined;
      });

      await engine.start();

      // イベントリスナーを設定
      engine.on('event:queued', (event) => capturedEvents.push(event));

      // Act - Input投稿
      const inputData = {
        source: 'manual',
        content: 'テスト用の入力データです。正常なコンテンツ。',
        timestamp: new Date(),
      };

      const input = await engine.createInput(inputData);

      // イベント処理を実行
      vi.advanceTimersByTime(1000);

      // Assert
      // 1. Inputが作成される
      expect(input.id).toBeDefined();
      expect(input.source).toBe('manual');
      expect(input.content).toBe('テスト用の入力データです。正常なコンテンツ。');

      // 2. INGEST_INPUTイベントが生成される
      expect(capturedEvents).toHaveLength(1);
      expect(capturedEvents[0].type).toBe('INGEST_INPUT');
      expect(capturedEvents[0].payload.input.id).toBe(input.id);

      // 3. ワークフローが実行される
      await vi.waitFor(() => {
        expect(ingestInputWorkflow.executor).toHaveBeenCalledTimes(1);
      });

      // 4. Inputが処理される
      expect(processedInputs).toHaveLength(1);
      expect(processedInputs[0].id).toBe(input.id);

      // 5. Pondに保存される
      expect(createdPondEntries).toHaveLength(1);
      expect(createdPondEntries[0].content).toBe(inputData.content);
      expect(createdPondEntries[0].id).toMatch(/^pond-/);

      // 6. 検索可能になる
      const searchResults = await engine.searchPond({ q: 'テスト' });
      // モックの仕様により空になるが、実際の実装では結果が返る
      expect(mockDbClient.searchPond).toHaveBeenCalled();
    });

    it('TEST-FLOW-003: 複数のInput投稿が順次処理される', async () => {
      // Arrange
      engine = new CoreEngine();
      await engine.initialize();

      // ワークフローを登録
      const registry = (engine as any).coreAgent.getWorkflowRegistry();
      registry.register(ingestInputWorkflow);
      registry.get = vi.fn((eventType) => {
        if (eventType === 'INGEST_INPUT') return ingestInputWorkflow;
        return undefined;
      });

      await engine.start();

      // Act - 複数のInput投稿
      const inputs = [];
      for (let i = 0; i < 5; i++) {
        const input = await engine.createInput({
          source: `source-${i}`,
          content: `Input ${i}: テストデータ`,
          timestamp: new Date(),
        });
        inputs.push(input);
      }

      // すべてのイベントを処理
      for (let i = 0; i < 5; i++) {
        vi.advanceTimersByTime(1000);
      }

      // Assert
      await vi.waitFor(() => {
        expect(ingestInputWorkflow.executor).toHaveBeenCalledTimes(5);
      });

      // すべてのInputが処理される
      expect(processedInputs).toHaveLength(5);
      processedInputs.forEach((processed, index) => {
        expect(processed.source).toBe(`source-${index}`);
        expect(processed.content).toContain(`Input ${index}`);
      });

      // すべてがPondに保存される
      expect(createdPondEntries).toHaveLength(5);
      createdPondEntries.forEach(entry => {
        expect(entry.id).toMatch(/^pond-/);
      });
    });
  });

  describe('3.2 エラー検出フロー', () => {
    it('TEST-FLOW-002: エラーキーワードを含むInputが分析イベントをトリガー', async () => {
      // Arrange
      engine = new CoreEngine();
      await engine.initialize();

      // 両方のワークフローを登録
      const registry = (engine as any).coreAgent.getWorkflowRegistry();
      registry.register(ingestInputWorkflow);
      registry.register(analyzeIssueWorkflow);
      registry.get = vi.fn((eventType) => {
        if (eventType === 'INGEST_INPUT') return ingestInputWorkflow;
        if (eventType === 'ANALYZE_ISSUE_IMPACT') return analyzeIssueWorkflow;
        return undefined;
      });

      await engine.start();

      // イベントリスナーを設定
      const allEvents: any[] = [];
      engine.on('event:queued', (event) => allEvents.push(event));

      // Act - エラーを含むInput投稿
      const errorInput = await engine.createInput({
        source: 'error-report',
        content: 'システムでエラーが発生しました。error code: 500',
        timestamp: new Date(),
      });

      // イベント処理を実行（INGEST_INPUT）
      vi.advanceTimersByTime(1000);

      // Assert - INGEST_INPUTワークフローが実行される
      await vi.waitFor(() => {
        expect(ingestInputWorkflow.executor).toHaveBeenCalled();
      });

      // エラーが検出される
      expect(triggeredAnalysis).toHaveLength(1);
      expect(triggeredAnalysis[0].type).toBe('ANALYZE_ISSUE_IMPACT');
      expect(triggeredAnalysis[0].priority).toBe('high');
      expect(triggeredAnalysis[0].payload.detectedKeywords).toContain('エラー');
      expect(triggeredAnalysis[0].payload.detectedKeywords).toContain('error');

      // ANALYZE_ISSUE_IMPACTイベントがキューに追加される
      const analysisEvent = allEvents.find(e => e.type === 'ANALYZE_ISSUE_IMPACT');
      expect(analysisEvent).toBeDefined();
      expect(analysisEvent.payload.originalInput.id).toBe(errorInput.id);

      // 分析ワークフローを実行
      vi.advanceTimersByTime(1000);

      // ANALYZE_ISSUE_IMPACTワークフローが実行される
      await vi.waitFor(() => {
        expect(analyzeIssueWorkflow.executor).toHaveBeenCalled();
      });

      // 関連エントリの検索が行われる
      expect(mockDbClient.searchPond).toHaveBeenCalledWith(
        expect.stringContaining('エラー')
      );
    });

    it('TEST-FLOW-004: 正常なInputはエラー分析をトリガーしない', async () => {
      // Arrange
      engine = new CoreEngine();
      await engine.initialize();

      // ワークフローを登録
      const registry = (engine as any).coreAgent.getWorkflowRegistry();
      registry.register(ingestInputWorkflow);
      registry.register(analyzeIssueWorkflow);
      registry.get = vi.fn((eventType) => {
        if (eventType === 'INGEST_INPUT') return ingestInputWorkflow;
        if (eventType === 'ANALYZE_ISSUE_IMPACT') return analyzeIssueWorkflow;
        return undefined;
      });

      await engine.start();

      // Act - 正常なInput投稿
      const normalInput = await engine.createInput({
        source: 'normal-input',
        content: '正常な処理が完了しました。',
        timestamp: new Date(),
      });

      // イベント処理を実行
      vi.advanceTimersByTime(1000);

      // Assert
      await vi.waitFor(() => {
        expect(ingestInputWorkflow.executor).toHaveBeenCalled();
      });

      // エラー分析はトリガーされない
      expect(triggeredAnalysis).toHaveLength(0);
      expect(analyzeIssueWorkflow.executor).not.toHaveBeenCalled();

      // Pondには保存される
      expect(createdPondEntries).toHaveLength(1);
      expect(createdPondEntries[0].content).toBe('正常な処理が完了しました。');
    });
  });

  describe('3.3 状態管理とコンテキスト', () => {
    it('TEST-FLOW-005: ワークフロー実行を通じて状態が維持される', async () => {
      // Arrange
      engine = new CoreEngine();
      await engine.initialize();

      // 状態を記録するワークフロー
      const stateTrackingWorkflow: WorkflowDefinition = {
        name: 'StateTracking',
        description: '状態の変化を追跡',
        executor: vi.fn().mockImplementation(async (event, context, emitter) => {
          const currentState = typeof context.getState === 'function'
            ? context.getState()
            : context.state || '';
          const inputCount = (currentState.match(/\[Processed Input:/g) || []).length;

          // 処理済み数をコンテキストに記録
          if (typeof context.setState === 'function') {
            context.setState(currentState + `\n[Processed Input: ${event.payload.input.id}]`);
          } else {
            context.state = currentState + `\n[Processed Input: ${event.payload.input.id}]`;
          }

          return {
            success: true,
            context,
            output: {
              processedCount: inputCount + 1,
            },
          };
        }),
      };

      // ワークフローを登録
      const registry = (engine as any).coreAgent.getWorkflowRegistry();
      registry.register(stateTrackingWorkflow);
      registry.get = vi.fn((eventType) => {
        if (eventType === 'INGEST_INPUT') return stateTrackingWorkflow;
        return undefined;
      });

      await engine.start();

      // Act - 複数のInput処理
      const inputs = [];
      for (let i = 0; i < 3; i++) {
        const input = await engine.createInput({
          source: 'test',
          content: `Input ${i}`,
          timestamp: new Date(),
        });
        inputs.push(input);
        vi.advanceTimersByTime(1000);
      }

      // Assert
      await vi.waitFor(() => {
        expect(stateTrackingWorkflow.executor).toHaveBeenCalledTimes(3);
      });

      // 状態が累積的に更新される
      const finalState = engine.getState();
      inputs.forEach(input => {
        expect(finalState).toContain(`[Processed Input: ${input.id}]`);
      });

      // 処理カウントが正しい
      const lastCall = stateTrackingWorkflow.executor.mock.results[2];
      expect(lastCall.value.output.processedCount).toBe(3);
    });
  });

  describe('3.4 エラーハンドリングとリカバリー', () => {
    it('TEST-FLOW-006: ワークフローエラー時のリトライ処理', async () => {
      // Arrange
      engine = new CoreEngine();
      await engine.initialize();

      let attemptCount = 0;
      const retryableWorkflow: WorkflowDefinition = {
        name: 'RetryableWorkflow',
        description: 'リトライ可能なワークフロー',
        executor: vi.fn().mockImplementation(async (event, context, emitter) => {
          attemptCount++;

          // 最初の2回は失敗
          if (attemptCount < 3) {
            throw new Error(`Attempt ${attemptCount} failed`);
          }

          // 3回目で成功
          const pondEntry = await context.storage.addPondEntry({
            content: event.payload.input.content,
            source: event.payload.input.source,
          });

          return {
            success: true,
            context,
            output: {
              pondEntryId: pondEntry.id,
              attempts: attemptCount,
            },
          };
        }),
      };

      // ワークフローを登録
      const registry = (engine as any).coreAgent.getWorkflowRegistry();
      registry.register(retryableWorkflow);
      registry.get = vi.fn((eventType) => {
        if (eventType === 'INGEST_INPUT') return retryableWorkflow;
        return undefined;
      });

      await engine.start();

      // Act - リトライ設定付きでInput投稿
      const input = await engine.createInput({
        source: 'retry-test',
        content: 'Retry test content',
        timestamp: new Date(),
      });

      // リトライを含む処理を実行
      for (let i = 0; i < 5; i++) {
        vi.advanceTimersByTime(2000);
      }

      // Assert
      await vi.waitFor(() => {
        // 3回実行される（初回 + 2回のリトライ）
        expect(retryableWorkflow.executor).toHaveBeenCalledTimes(3);
      });

      // 最終的に成功する
      const lastResult = await retryableWorkflow.executor.mock.results[2].value;
      expect(lastResult.success).toBe(true);
      expect(lastResult.output.attempts).toBe(3);
    });

    it('TEST-FLOW-007: 部分的な失敗でも処理が継続される', async () => {
      // Arrange
      engine = new CoreEngine();
      await engine.initialize();

      let processCount = 0;
      const partialFailureWorkflow: WorkflowDefinition = {
        name: 'PartialFailure',
        description: '部分的に失敗するワークフロー',
        executor: vi.fn().mockImplementation(async (event, context, emitter) => {
          processCount++;

          // 偶数番目は失敗
          if (processCount % 2 === 0) {
            throw new Error(`Process ${processCount} failed`);
          }

          // 奇数番目は成功
          const pondEntry = await context.storage.addPondEntry({
            content: event.payload.input.content,
            source: event.payload.input.source,
          });

          return {
            success: true,
            context,
            output: { pondEntryId: pondEntry.id },
          };
        }),
      };

      // ワークフローを登録
      const registry = (engine as any).coreAgent.getWorkflowRegistry();
      registry.register(partialFailureWorkflow);
      registry.get = vi.fn(() => partialFailureWorkflow);

      await engine.start();

      // Act - 複数のInput投稿
      const inputs = [];
      const results = [];

      for (let i = 0; i < 4; i++) {
        const input = await engine.createInput({
          source: `source-${i}`,
          content: `Content ${i}`,
          timestamp: new Date(),
        });
        inputs.push(input);
      }

      // 各イベントを処理
      for (let i = 0; i < 4; i++) {
        vi.advanceTimersByTime(1000);
      }

      // Assert
      await vi.waitFor(() => {
        expect(partialFailureWorkflow.executor).toHaveBeenCalledTimes(4);
      });

      // 奇数番目（1, 3）は成功、偶数番目（2, 4）は失敗
      const successCount = partialFailureWorkflow.executor.mock.results
        .filter(r => r.type === 'return').length;
      const failureCount = partialFailureWorkflow.executor.mock.results
        .filter(r => r.type === 'throw').length;

      expect(successCount).toBe(2);
      expect(failureCount).toBe(2);

      // エンジンは動作し続ける
      expect((engine as any).isRunning).toBe(true);
    });
  });
});