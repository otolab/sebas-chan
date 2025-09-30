import { describe, it, expect, vi, beforeEach } from 'vitest';
import { processUserRequestWorkflow } from './index.js';
import type { AgentEvent } from '../../types.js';
import {
  createCustomMockContext,
  createMockWorkflowEmitter,
  createMockIssue,
  createMockPondEntry
} from '../test-utils.js';
import { TestDriver } from '@moduler-prompt/driver';

describe('ProcessUserRequest Workflow (A-1)', () => {
  let mockContext: ReturnType<typeof createCustomMockContext>;
  let mockEmitter: ReturnType<typeof createMockWorkflowEmitter>;
  let mockEvent: AgentEvent;

  beforeEach(() => {
    // モックコンテキストの準備
    mockContext = createCustomMockContext({
      driverResponses: [JSON.stringify({
        interpretation: 'システムエラーに関する報告',
        requestType: 'issue',
        events: [{
          type: 'ISSUE_CREATED',
          reason: 'エラー報告からIssueを作成',
          payload: {}
        }],
        actions: [{
          type: 'create',
          target: 'issue',
          details: 'システムエラーのIssue作成'
        }],
        response: 'エラー報告を受付しました。調査を開始します。',
        updatedState: 'Initial state\n## ユーザーリクエスト処理\n- User ID: user-123\n- Request Type: issue\n- Interpretation: システムエラーに関する報告'
      })],
      storageOverrides: {
        addPondEntry: vi.fn().mockResolvedValue(createMockPondEntry({
          id: 'pond-test-123',
          content: 'test content',
          source: 'user_request',
        })),
        createIssue: vi.fn().mockResolvedValue(createMockIssue({
          id: 'issue-test-123',
          title: 'Test Issue',
          description: 'Test Description',
          labels: ['user-reported'],
        })),
      }
    });

    // モックイベントエミッター
    mockEmitter = createMockWorkflowEmitter();

    // モックイベント
    mockEvent = {
      type: 'USER_REQUEST',
      timestamp: new Date(),
      payload: {
        userId: 'user-123',
        content: 'システムエラーが発生しています',
        type: 'message',
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
    expect((result.output as any).requestType).toBe('issue');
  });

  it('should emit events for issue creation', async () => {
    const result = await processUserRequestWorkflow.executor(mockEvent, mockContext, mockEmitter);

    expect(result.success).toBe(true);

    // 発行されたイベントを確認（eventsEmittedフィールドを確認）
    expect((result.output as any).eventsEmitted).toContain('ISSUE_CREATED');
  });

  it('should handle missing request content', async () => {
    mockEvent.payload.content = undefined;

    mockContext.createDriver = async () => new TestDriver({
      responses: [JSON.stringify({
        interpretation: '内容なしリクエスト',
        requestType: 'other',
        events: [],
        actions: [],
        response: 'リクエスト内容が空です。何かお手伝いできることはありますか？',
        reasoning: '内容が不明なため処理不可',
        updatedState: 'Initial state\n内容なしリクエスト処理'
      })]
    });

    const result = await processUserRequestWorkflow.executor(mockEvent, mockContext, mockEmitter);

    expect(result.success).toBe(true);
    expect((result.output as any).response).toContain('リクエスト内容が空です');
  });

  it('should classify schedule request', async () => {
    mockEvent.payload.content = '毎日10時にレポートを実行してください';

    mockContext.createDriver = async () => new TestDriver({
      responses: [JSON.stringify({
        interpretation: 'レポートの定期実行設定',
        requestType: 'schedule',
        events: [{
          type: 'SCHEDULE_TRIGGERED',
          payload: {
            schedule: '0 10 * * *',
            action: 'generate_report'
          }
        }],
        actions: [{
          type: 'create',
          target: 'schedule',
          details: { cron: '0 10 * * *' }
        }],
        response: '毎日10時にレポート実行をスケジュール設定しました。',
        reasoning: '定期実行の要求',
        updatedState: 'Initial state\nスケジュール設定: 毎日10時'
      })]
    });

    const result = await processUserRequestWorkflow.executor(mockEvent, mockContext, mockEmitter);

    expect(result.success).toBe(true);
    expect((result.output as any).requestType).toBe('schedule');
    expect((result.output as any).eventsEmitted).toContain('SCHEDULE_TRIGGERED');
  });

  it('should handle errors gracefully', async () => {
    const error = new Error('AI Driver connection failed');
    mockContext.createDriver = vi.fn().mockRejectedValue(error);

    const result = await processUserRequestWorkflow.executor(mockEvent, mockContext, mockEmitter);

    expect(result.success).toBe(false);
    expect(result.error).toBe(error);
  });
});