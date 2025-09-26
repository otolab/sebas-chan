import { describe, it, expect, beforeEach, afterEach, beforeAll, vi } from 'vitest';
import type { WorkflowContextInterface, WorkflowEventEmitterInterface } from '@sebas-chan/core';
import type { AgentEvent } from '@sebas-chan/core';
import { RecordType } from '@sebas-chan/core';
import { processUserRequestWorkflow } from '@sebas-chan/core/workflows/impl-functional';
import { createTestContext, shouldSkipAITests } from './helpers/test-context';

/**
 * ProcessUserRequest ワークフロー統合テスト
 *
 * 目的: AI処理を含む実際のワークフロー動作を検証
 * Recorderの出力を確認し、意図した分類と処理が行われることを確認
 *
 * 注: 利用可能なAIドライバーがない場合はテストをスキップ
 */
describe('ProcessUserRequest Workflow Integration', () => {
  let context: WorkflowContextInterface | null;
  let emitter: WorkflowEventEmitterInterface;
  let emittedEvents: AgentEvent[] = [];
  let skipTests = false;

  beforeAll(async () => {
    // AIドライバーの利用可能性をチェック
    skipTests = await shouldSkipAITests();
    if (skipTests) {
      console.warn('Skipping AI integration tests - no drivers available');
    }
  });

  beforeEach(async () => {
    if (skipTests) return;

    // テスト用コンテキストの作成（AIService自動選択）
    context = await createTestContext('ProcessUserRequest', {
      // 必要に応じてStorageのモックをカスタマイズ
      searchIssues: vi.fn().mockResolvedValue([]),
      searchKnowledge: vi.fn().mockResolvedValue([]),
      searchPond: vi.fn().mockResolvedValue([])
    });

    if (!context) {
      skipTests = true;
      return;
    }

    // EventEmitterのセットアップ
    emittedEvents = [];
    emitter = {
      emit: (event: AgentEvent) => {
        emittedEvents.push(event);
        context!.recorder.record(RecordType.INFO, {
          message: 'Event emitted',
          eventType: event.type,
          payload: event.payload
        });
      }
    };
  });

  afterEach(() => {
    if (context) {
      context.recorder.clear();
    }
    emittedEvents = [];
  });

  describe('リクエスト分類の検証', () => {
    it.skipIf(skipTests)('エラーレポートをissueとして正しく分類する', async () => {
      // テストデータ
      const event: AgentEvent = {
        type: 'PROCESS_USER_REQUEST',
        payload: {
          userId: 'test-user',
          content: 'ログイン画面でエラーが発生しています。「認証に失敗しました」というメッセージが表示されます。',
          sessionId: 'test-session'
        }
      };

      // 実行
      const result = await processUserRequestWorkflow.executor(event, context!, emitter);

      // 検証
      expect(result.success).toBe(true);
      expect(result.output?.requestType).toBe('issue');

      // ISSUE_CREATEDイベントが発行されることを確認
      const issueEvents = emittedEvents.filter(e => e.type === 'ISSUE_CREATED');
      expect(issueEvents.length).toBeGreaterThan(0);

      // Recorder出力の確認
      const logs = context!.recorder.getBuffer();
      const infoLogs = logs.filter(l => l.type === RecordType.INFO);
      expect(infoLogs.length).toBeGreaterThan(0);

      // AIがエラーとして認識したことを確認
      const interpretation = result.output?.interpretation;
      expect(interpretation).toBeTruthy();
      expect(interpretation.toLowerCase()).toMatch(/エラー|error|問題|issue/);
    });

    it.skipIf(skipTests)('質問をquestionとして正しく分類する', async () => {
      const event: AgentEvent = {
        type: 'PROCESS_USER_REQUEST',
        payload: {
          userId: 'test-user',
          content: 'APIの使い方を教えてください。認証トークンはどうやって取得しますか？',
          sessionId: 'test-session'
        }
      };

      const result = await processUserRequestWorkflow.executor(event, context!, emitter);

      expect(result.success).toBe(true);
      expect(result.output?.requestType).toBe('question');

      // KNOWLEDGE_EXTRACTABLEイベントの発行を確認
      const knowledgeEvents = emittedEvents.filter(e => e.type === 'KNOWLEDGE_EXTRACTABLE');
      expect(knowledgeEvents.length).toBeGreaterThan(0);

      if (knowledgeEvents.length > 0) {
        expect(knowledgeEvents[0].payload).toHaveProperty('suggestedCategory');
        expect(knowledgeEvents[0].payload.suggestedCategory).toBe('reference');
      }
    });

    it.skipIf(skipTests)('フィードバックをfeedbackとして正しく分類する', async () => {
      const event: AgentEvent = {
        type: 'PROCESS_USER_REQUEST',
        payload: {
          userId: 'test-user',
          content: '新しいUIは使いやすくて良いですね。特に検索機能が改善されました。',
          sessionId: 'test-session'
        }
      };

      const result = await processUserRequestWorkflow.executor(event, context!, emitter);

      expect(result.success).toBe(true);
      expect(result.output?.requestType).toBe('feedback');

      // KNOWLEDGE_EXTRACTABLEイベントの確認
      const knowledgeEvents = emittedEvents.filter(e => e.type === 'KNOWLEDGE_EXTRACTABLE');
      expect(knowledgeEvents.length).toBeGreaterThan(0);

      if (knowledgeEvents.length > 0) {
        expect(knowledgeEvents[0].payload.suggestedCategory).toBe('best_practice');
      }
    });

    it.skipIf(skipTests)('緊急アクション要求を適切に処理する', async () => {
      const event: AgentEvent = {
        type: 'PROCESS_USER_REQUEST',
        payload: {
          userId: 'test-user',
          content: '緊急！本番環境のデータベースが応答しません。すぐに確認してください。',
          sessionId: 'test-session'
        }
      };

      const result = await processUserRequestWorkflow.executor(event, context!, emitter);

      expect(result.success).toBe(true);

      // HIGH_PRIORITY_DETECTEDイベントの確認
      const priorityEvents = emittedEvents.filter(e => e.type === 'HIGH_PRIORITY_DETECTED');

      // AIが緊急性を認識した場合
      if (priorityEvents.length > 0) {
        const payload = priorityEvents[0].payload as any;
        expect(payload.priority).toBeGreaterThanOrEqual(85);
        expect(payload.requiredAction).toBeTruthy();
      }
    });
  });

  describe('AI処理の検証', () => {
    it.skipIf(skipTests)('構造化出力が正しく処理される', async () => {
      const event: AgentEvent = {
        type: 'PROCESS_USER_REQUEST',
        payload: {
          userId: 'test-user',
          content: 'テストメッセージです。',
          sessionId: 'test-session'
        }
      };

      const result = await processUserRequestWorkflow.executor(event, context!, emitter);

      expect(result.success).toBe(true);

      // 結果の構造を確認
      expect(result.output).toHaveProperty('requestType');
      expect(result.output).toHaveProperty('interpretation');
      expect(result.output).toHaveProperty('response');

      // RecorderにAI処理が記録されていることを確認
      const logs = context!.recorder.getBuffer();
      expect(logs.length).toBeGreaterThan(0);
    });
  });

  describe('Recorder出力の詳細検証', () => {
    it.skipIf(skipTests)('実行の各ステップがRecorderに記録される', async () => {
      const event: AgentEvent = {
        type: 'PROCESS_USER_REQUEST',
        payload: {
          userId: 'test-user',
          content: 'テスト用のリクエストです。',
          sessionId: 'test-session'
        }
      };

      const result = await processUserRequestWorkflow.executor(event, context!, emitter);

      expect(result.success).toBe(true);

      const logs = context!.recorder.getBuffer();

      // 最低限のログが記録されていることを確認
      expect(logs.length).toBeGreaterThan(0);

      // ログタイプの確認
      const logTypes = logs.map(l => l.type);
      expect(logTypes).toContain(RecordType.INFO);

      // workflowNameが自動付与されていることを確認
      logs.forEach(log => {
        expect(log).toHaveProperty('workflowName', 'ProcessUserRequest');
        expect(log).toHaveProperty('timestamp');
      });
    });

    it.skipIf(skipTests)('タイムスタンプが時系列順になっている', async () => {
      const event: AgentEvent = {
        type: 'PROCESS_USER_REQUEST',
        payload: {
          userId: 'test-user',
          content: 'タイムスタンプテスト',
          sessionId: 'test-session'
        }
      };

      await processUserRequestWorkflow.executor(event, context!, emitter);

      const logs = context!.recorder.getBuffer();

      // タイムスタンプが時系列順であることを確認
      for (let i = 1; i < logs.length; i++) {
        const prevTime = new Date(logs[i - 1].timestamp).getTime();
        const currTime = new Date(logs[i].timestamp).getTime();
        expect(currTime).toBeGreaterThanOrEqual(prevTime);
      }
    });
  });
});