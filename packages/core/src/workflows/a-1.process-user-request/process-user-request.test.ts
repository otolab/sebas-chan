import { describe, it, expect, vi, beforeEach } from 'vitest';
import { processUserRequestWorkflow } from './index.js';
import type { SystemEvent } from '@sebas-chan/shared-types';
import {
  createCustomMockContext,
  createMockWorkflowEmitter,
  createMockIssue,
  createMockPondEntry,
} from '../test-utils.js';

describe('ProcessUserRequest Workflow (A-1)', () => {
  let mockContext: ReturnType<typeof createCustomMockContext>;
  let mockEmitter: ReturnType<typeof createMockWorkflowEmitter>;
  let mockEvent: SystemEvent;

  beforeEach(() => {
    // モックコンテキストの準備
    mockContext = createCustomMockContext({
      driverResponses: [
        JSON.stringify({
          interpretation: 'システムエラーに関する報告',
          requestType: 'issue',
          events: [
            {
              type: 'ISSUE_CREATED',
              reason: 'エラー報告からIssueを作成',
              payload: {},
            },
          ],
          actions: [
            {
              type: 'create',
              target: 'issue',
              details: 'システムエラーのIssue作成',
            },
          ],
          response: 'エラー報告を受付しました。調査を開始します。',
          updatedState:
            'Initial state\n## ユーザーリクエスト処理\n- User ID: user-123\n- Request Type: issue\n- Interpretation: システムエラーに関する報告',
        }),
      ],
      storageOverrides: {
        addPondEntry: vi.fn().mockResolvedValue(
          createMockPondEntry({
            id: 'pond-test-123',
            content: 'test content',
            source: 'user_request',
          })
        ),
        createIssue: vi.fn().mockResolvedValue(
          createMockIssue({
            id: 'issue-test-123',
            title: 'Test Issue',
            description: 'Test Description',
            labels: ['user-reported'],
          })
        ),
      },
    });

    // モックイベントエミッター
    mockEmitter = createMockWorkflowEmitter();

    // モックイベント
    mockEvent = {
      type: 'USER_REQUEST_RECEIVED',
      payload: {
        userId: 'user-123',
        content: 'システムエラーが発生しています',
        sessionId: 'session-123',
        timestamp: new Date().toISOString(),
        metadata: {
          source: 'web' as const,
        },
      },
    };
  });

  it('should successfully process user request', async () => {
    const result = await processUserRequestWorkflow.executor(mockEvent, mockContext, mockEmitter);

    expect(result.success).toBe(true);
    expect(result.output).toMatchObject({
      interpretation: 'システムエラーに関する報告',
      requestType: 'issue',
      response: 'エラー報告を受付しました。調査を開始します。',
    });

    // Stateが更新されたことを確認
    expect(result.context.state).toContain('ユーザーリクエスト処理');
  });

  it('should classify issue request', async () => {
    const result = await processUserRequestWorkflow.executor(mockEvent, mockContext, mockEmitter);

    expect(result.success).toBe(true);
    // contextへの操作から判断（Issue作成が呼ばれていることを確認）
    expect(mockContext.storage.createIssue).toHaveBeenCalled();
  });

  it('should emit events for issue creation', async () => {
    const result = await processUserRequestWorkflow.executor(mockEvent, mockContext, mockEmitter);

    expect(result.success).toBe(true);

    // 発行されたイベントを確認（emitterのスパイから確認）
    expect(mockEmitter.emit).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'ISSUE_CREATED',
      })
    );
  });

  it('should handle missing request content', async () => {
    // USER_REQUEST_RECEIVEDイベントのcontentを空文字にする
    (mockEvent.payload as { content: string }).content = '';

    mockContext = createCustomMockContext({
      driverResponses: [
        JSON.stringify({
          interpretation: '内容なしリクエスト',
          requestType: 'other',
          events: [],
          actions: [],
          response: 'リクエスト内容が空です。何かお手伝いできることはありますか？',
          reasoning: '内容が不明なため処理不可',
          updatedState: 'Initial state\n内容なしリクエスト処理',
        }),
      ],
    });
    mockEmitter = createMockWorkflowEmitter();

    const result = await processUserRequestWorkflow.executor(mockEvent, mockContext, mockEmitter);

    expect(result.success).toBe(true);
    // responseはDriverの応答に含まれるので、Stateに反映されることで確認
    expect(result.context.state).toContain('内容なしリクエスト処理');
  });

  it('should classify schedule request', async () => {
    (mockEvent.payload as { content: string }).content = '毎日10時にレポートを実行してください';

    mockContext = createCustomMockContext({
      driverResponses: [
        JSON.stringify({
          interpretation: 'レポートの定期実行設定',
          requestType: 'schedule',
          events: [
            {
              type: 'SCHEDULE_TRIGGERED',
              payload: {
                schedule: '0 10 * * *',
                action: 'generate_report',
              },
            },
          ],
          actions: [
            {
              type: 'create',
              target: 'schedule',
              details: { cron: '0 10 * * *' },
            },
          ],
          response: '毎日10時にレポート実行をスケジュール設定しました。',
          reasoning: '定期実行の要求',
          updatedState: 'Initial state\nスケジュール設定: 毎日10時',
        }),
      ],
    });
    mockEmitter = createMockWorkflowEmitter();

    const result = await processUserRequestWorkflow.executor(mockEvent, mockContext, mockEmitter);

    expect(result.success).toBe(true);
    // イベント発行をemitterのスパイから確認
    expect(mockEmitter.emit).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'SCHEDULE_TRIGGERED',
      })
    );
  });

  it('should handle errors gracefully', async () => {
    const error = new Error('AI Driver connection failed');
    mockContext.createDriver = vi.fn().mockRejectedValue(error);

    const result = await processUserRequestWorkflow.executor(mockEvent, mockContext, mockEmitter);

    expect(result.success).toBe(false);
    expect(result.error).toBe(error);
  });
});

describe.skipIf(!process.env.ENABLE_AI_TESTS)('ProcessUserRequest Workflow - AI Tests', () => {
  // AI駆動テストはここに追加
  // 実際のAIサービスを使用してワークフローの品質を確認

  it.todo('should correctly classify request types with actual AI');
  it.todo('should generate appropriate Flows from complex user requests');
  it.todo('should handle multi-intent requests properly');
});
