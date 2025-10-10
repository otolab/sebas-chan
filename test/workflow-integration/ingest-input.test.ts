import { describe, it, expect, beforeEach, afterEach, beforeAll, vi } from 'vitest';
import type { WorkflowContextInterface, WorkflowEventEmitterInterface } from '@sebas-chan/core';
import type { AgentEvent } from '@sebas-chan/core';
import { RecordType } from '@sebas-chan/core';
import { ingestInputWorkflow } from '@sebas-chan/core/workflows/impl-functional';
import { createTestContext, shouldSkipAITests } from './helpers/test-context';

/**
 * IngestInput ワークフロー統合テスト
 *
 * テストシナリオ仕様書（TEST_SCENARIOS.md）のシナリオ1を実装
 * 実際のAI処理を含む、データ取り込みからIssue作成/更新までの流れを検証
 */
describe('IngestInput Workflow Integration', () => {
  let context: WorkflowContextInterface | null;
  let emitter: WorkflowEventEmitterInterface;
  let emittedEvents: AgentEvent[] = [];
  let skipTests = false;

  beforeAll(async () => {
    skipTests = await shouldSkipAITests();
    if (skipTests) {
      console.warn('Skipping AI integration tests - no drivers available');
    }
  });

  beforeEach(async () => {
    if (skipTests) return;

    context = await createTestContext('IngestInput', {
      searchIssues: vi.fn().mockResolvedValue([]),
      createIssue: vi.fn().mockImplementation(async (issue) => ({
        ...issue,
        id: issue.id || `issue-${Date.now()}`,
        createdAt: new Date(),
        updatedAt: new Date(),
      })),
    });

    if (!context) {
      skipTests = true;
      return;
    }

    emittedEvents = [];
    emitter = {
      emit: (event: AgentEvent) => {
        emittedEvents.push(event);
        context!.recorder.record(RecordType.INFO, {
          message: 'Event emitted',
          eventType: event.type,
          payload: event.payload,
        });
      },
    };
  });

  afterEach(() => {
    if (context) {
      context.recorder.clear();
    }
    emittedEvents = [];
  });

  describe('シナリオ1-1: エラーレポートから新規Issue作成', () => {
    it.skipIf(skipTests)('本番環境のエラーを高優先度Issueとして作成する', async () => {
      /**
       * テストシナリオ:
       * 本番環境でのDBエラーレポートを受信し、
       * AIが深刻度を判定して高優先度Issueを作成する
       */
      const event: AgentEvent = {
        type: 'DATA_ARRIVED',
        payload: {
          source: 'slack',
          content:
            '本番環境でログイン処理が失敗しています。DBへの接続がタイムアウトになり、500エラーが返されます。',
          format: 'text',
          pondEntryId: 'pond-test-001',
          timestamp: new Date().toISOString(),
        },
      };

      const result = await ingestInputWorkflow.executor(event, context!, emitter);

      // 基本的な成功確認
      expect(result.success).toBe(true);
      expect(result.output).toBeDefined();

      // AIが深刻度を適切に判定
      const severity = result.output?.severity;
      expect(['high', 'critical']).toContain(severity);

      // 新規Issueが作成される
      expect(result.output?.createdIssueIds).toHaveLength(1);
      expect(result.output?.updatedIssueIds).toHaveLength(0);

      // ERROR_DETECTEDイベントが発行される（高深刻度の場合）
      if (severity === 'high' || severity === 'critical') {
        const errorEvents = emittedEvents.filter((e) => e.type === 'ERROR_DETECTED');
        expect(errorEvents).toHaveLength(1);
        if (errorEvents.length > 0) {
          expect(errorEvents[0].payload).toHaveProperty('severity', severity);
          expect(errorEvents[0].payload).toHaveProperty('errorType', 'application');
        }
      }

      // ISSUE_CREATEDイベントが発行される
      const issueEvents = emittedEvents.filter((e) => e.type === 'ISSUE_CREATED');
      expect(issueEvents).toHaveLength(1);

      // Recorderに処理が記録される
      const logs = context!.recorder.getBuffer();
      expect(logs.length).toBeGreaterThan(0);

      // State更新の確認
      expect(result.context.state).toContain('データ取り込み処理');
      expect(result.context.state).toContain('slack');
      expect(result.context.state).toContain(severity || '');
    });

    it.skipIf(skipTests)('エラーキーワードを含む入力を適切に分類する', async () => {
      /**
       * テストシナリオ:
       * エラー、失敗、問題などのキーワードを含む入力が
       * 適切にIssueとして処理される
       */
      const testCases = [
        { content: 'システムエラーが発生しました', expectedLabels: ['error'] },
        { content: 'ログイン処理が失敗します', expectedLabels: ['error'] },
        { content: 'パフォーマンスに問題があります', expectedLabels: ['performance'] },
      ];

      for (const testCase of testCases) {
        const event: AgentEvent = {
          type: 'DATA_ARRIVED',
          payload: {
            source: 'email',
            content: testCase.content,
            format: 'text',
            pondEntryId: `pond-${Date.now()}`,
            timestamp: new Date().toISOString(),
          },
        };

        const result = await ingestInputWorkflow.executor(event, context!, emitter);

        expect(result.success).toBe(true);

        // Issue作成またはエラー検出
        const hasIssue =
          result.output?.createdIssueIds.length > 0 || result.output?.updatedIssueIds.length > 0;
        expect(hasIssue).toBe(true);
      }
    });
  });

  describe('シナリオ1-2: 既存Issueへの情報追加', () => {
    it.skipIf(skipTests)('関連する既存Issueを更新する', async () => {
      /**
       * テストシナリオ:
       * 既存のIssueと関連する内容を受信した場合、
       * 新規作成ではなく既存Issueを更新する
       */
      const existingIssue = {
        id: 'issue-existing-001',
        title: 'ログイン機能の不具合',
        description: 'ログインができない問題',
        status: 'open',
        labels: ['bug', 'authentication'],
        priority: 50,
        updates: [],
        relations: [],
        sourceInputIds: [],
      };

      // 既存Issueが検索で見つかるようにモック
      context!.storage.searchIssues = vi.fn().mockResolvedValue([existingIssue]);
      context!.storage.getIssue = vi.fn().mockResolvedValue(existingIssue);

      const event: AgentEvent = {
        type: 'DATA_ARRIVED',
        payload: {
          source: 'email',
          content: 'ログイン画面で同じエラーが再発。特定のユーザーアカウントでのみ発生する模様。',
          format: 'text',
          pondEntryId: 'pond-test-002',
          timestamp: new Date().toISOString(),
        },
      };

      const result = await ingestInputWorkflow.executor(event, context!, emitter);

      expect(result.success).toBe(true);

      // AIが関連性を判定して既存Issueを更新
      // 注: AIの判定に依存するため、どちらかのパターンを許容
      const updated = result.output?.updatedIssueIds.length > 0;
      const created = result.output?.createdIssueIds.length > 0;

      expect(updated || created).toBe(true);

      if (updated) {
        // 既存Issue更新の場合
        expect(result.output?.updatedIssueIds).toContain('issue-existing-001');

        // ISSUE_UPDATEDイベント確認
        const updateEvents = emittedEvents.filter((e) => e.type === 'ISSUE_UPDATED');
        expect(updateEvents.length).toBeGreaterThan(0);
      }

      // Recorderに関連Issue情報が記録される
      const logs = context!.recorder.getBuffer();
      expect(logs.length).toBeGreaterThan(0);
    });
  });

  describe('シナリオ1-3: 通常の情報共有（Issue作成不要）', () => {
    it.skipIf(skipTests)('問題報告以外の内容は低優先度として処理する', async () => {
      /**
       * テストシナリオ:
       * 会議変更などの通常連絡は、Pondに保存されるが
       * 高優先度イベントは発行されない
       */
      const event: AgentEvent = {
        type: 'DATA_ARRIVED',
        payload: {
          source: 'teams',
          content: '来週の定例会議は月曜日の午後3時に変更になりました。',
          format: 'text',
          pondEntryId: 'pond-test-003',
          timestamp: new Date().toISOString(),
        },
      };

      const result = await ingestInputWorkflow.executor(event, context!, emitter);

      expect(result.success).toBe(true);

      // 深刻度は低いはず
      const severity = result.output?.severity;
      expect(['low', 'medium']).toContain(severity);

      // ERROR_DETECTEDイベントは発行されない
      const errorEvents = emittedEvents.filter((e) => e.type === 'ERROR_DETECTED');
      expect(errorEvents).toHaveLength(0);

      // HIGH_PRIORITY_DETECTEDイベントも発行されない
      const priorityEvents = emittedEvents.filter((e) => e.type === 'HIGH_PRIORITY_DETECTED');
      expect(priorityEvents).toHaveLength(0);

      // Pondには保存される（pondEntryIdが返される）
      expect(result.output?.pondEntryId).toBe('pond-test-003');
    });
  });

  describe('AI処理とRecorderの検証', () => {
    it.skipIf(skipTests)('AIの分析結果が構造化されて処理される', async () => {
      /**
       * テストシナリオ:
       * AIが返す構造化出力が正しく処理され、
       * 期待通りのフィールドが含まれる
       */
      const event: AgentEvent = {
        type: 'DATA_ARRIVED',
        payload: {
          source: 'api',
          content: 'テストデータの処理',
          format: 'json',
          pondEntryId: 'pond-test-004',
          timestamp: new Date().toISOString(),
        },
      };

      const result = await ingestInputWorkflow.executor(event, context!, emitter);

      expect(result.success).toBe(true);

      // 出力の構造確認
      expect(result.output).toHaveProperty('pondEntryId');
      expect(result.output).toHaveProperty('analyzedContent', true);
      expect(result.output).toHaveProperty('severity');
      expect(result.output).toHaveProperty('updatedIssueIds');
      expect(result.output).toHaveProperty('createdIssueIds');

      // Recorderログの構造確認
      const logs = context!.recorder.getBuffer();
      logs.forEach((log) => {
        expect(log).toHaveProperty('timestamp');
        expect(log).toHaveProperty('workflowName', 'IngestInput');
        expect(log).toHaveProperty('type');
      });
    });

    it.skipIf(skipTests)('処理の各ステップがRecorderに時系列で記録される', async () => {
      /**
       * テストシナリオ:
       * ワークフローの実行ステップが順序通りに
       * Recorderに記録される
       */
      const event: AgentEvent = {
        type: 'DATA_ARRIVED',
        payload: {
          source: 'webhook',
          content: 'ステップ記録テスト',
          format: 'text',
          pondEntryId: 'pond-test-005',
          timestamp: new Date().toISOString(),
        },
      };

      await ingestInputWorkflow.executor(event, context!, emitter);

      const logs = context!.recorder.getBuffer();

      // ログが存在する
      expect(logs.length).toBeGreaterThan(0);

      // タイムスタンプが時系列順
      for (let i = 1; i < logs.length; i++) {
        const prevTime = new Date(logs[i - 1].timestamp).getTime();
        const currTime = new Date(logs[i].timestamp).getTime();
        expect(currTime).toBeGreaterThanOrEqual(prevTime);
      }

      // 主要なログタイプが含まれる
      const logTypes = logs.map((l) => l.type);
      expect(logTypes).toContain(RecordType.INFO);
    });
  });

  describe('エラーハンドリング', () => {
    it.skipIf(skipTests)('不正なペイロードでエラーが適切に処理される', async () => {
      /**
       * テストシナリオ:
       * 必須フィールドが欠落している場合の
       * エラーハンドリング
       */
      const event: AgentEvent = {
        type: 'DATA_ARRIVED',
        payload: {
          // pondEntryIdが欠落
          source: 'invalid',
          content: '',
        } as any,
      };

      const result = await ingestInputWorkflow.executor(event, context!, emitter);

      // エラーでもRecorderには記録される
      const logs = context!.recorder.getBuffer();

      // 空のcontentでも処理は試みられる
      expect(result).toBeDefined();

      // 結果の成否はAIの判定に依存
      if (!result.success) {
        expect(result.error).toBeDefined();
      }
    });
  });
});
