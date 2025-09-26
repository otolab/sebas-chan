import { describe, it, expect, vi, beforeEach } from 'vitest';
import { processUserRequestWorkflow } from './process-user-request.js';
import type { AgentEvent } from '../../types.js';
import type { WorkflowContextInterface, WorkflowEventEmitterInterface } from '../context.js';
import { TestDriver } from '@moduler-prompt/driver';
import { WorkflowRecorder } from '../recorder.js';

describe('ProcessUserRequest Workflow (A-1)', () => {
  let mockContext: WorkflowContextInterface;
  let mockEmitter: WorkflowEventEmitterInterface;
  let mockEvent: AgentEvent;

  beforeEach(() => {
    // モックコンテキストの準備
    mockContext = {
      state: 'Initial state',
      storage: {
        addPondEntry: vi.fn().mockResolvedValue({
          id: 'pond-test-123',
          content: 'test content',
          source: 'user_request',
          timestamp: new Date(),
        }),
        searchIssues: vi.fn().mockResolvedValue([]),
        searchKnowledge: vi.fn().mockResolvedValue([]),
        searchPond: vi.fn().mockResolvedValue([]),
        getIssue: vi.fn(),
        getKnowledge: vi.fn(),
        createIssue: vi.fn().mockResolvedValue({
          id: 'issue-test-123',
          title: 'Test Issue',
          description: 'Test Description',
          status: 'open',
          labels: ['user-reported'],
          updates: [],
          relations: [],
          sourceInputIds: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
        updateIssue: vi.fn(),
        createKnowledge: vi.fn(),
        updateKnowledge: vi.fn(),
      },
      createDriver: async () => new TestDriver({
        responses: [JSON.stringify({
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
          response: 'エラー報告を受付しました。調査を開始します。'
        })]
      }),
      recorder: new WorkflowRecorder('test'),
    };

    // モックイベントエミッター
    mockEmitter = {
      emit: vi.fn(),
    };

    // モックイベント
    mockEvent = {
      type: 'PROCESS_USER_REQUEST',
      timestamp: new Date(),
      payload: {
        userId: 'user-123',
        content: 'システムでエラーが発生しています。調査してください。',
        sessionId: 'session-123',
        metadata: {},
      },
    };
  });

  it('should classify issue request and trigger ANALYZE_ISSUE_IMPACT', async () => {
    const result = await processUserRequestWorkflow.executor(mockEvent, mockContext, mockEmitter);

    expect(result.success).toBe(true);
    expect(result.output).toMatchObject({
      requestType: 'issue',
      response: expect.any(String),
    });

    // ISSUE_CREATEDイベントが発行されることを確認
    expect(mockEmitter.emit).toHaveBeenCalled();
  });

  it('should classify question request and trigger EXTRACT_KNOWLEDGE', async () => {
    (mockEvent.payload as any).content = 'どうやってログインしますか？';
    mockContext.createDriver = async () => new TestDriver({
      responses: [JSON.stringify({
        interpretation: 'ログイン方法に関する質問',
        requestType: 'question',
        events: [{
          type: 'KNOWLEDGE_EXTRACTABLE',
          reason: '質問から知識を抽出',
          payload: {}
        }],
        actions: [{
          type: 'search',
          target: 'knowledge',
          details: 'ログイン方法の知識検索'
        }],
        response: 'ログイン方法について説明します。'
      })]
    });

    const result = await processUserRequestWorkflow.executor(mockEvent, mockContext, mockEmitter);

    expect(result.success).toBe(true);
    expect(result.output).toMatchObject({
      requestType: 'question',
    });

    // KNOWLEDGE_EXTRACTABLEイベントが発行されることを確認
    expect(mockEmitter.emit).toHaveBeenCalledWith({
      type: 'KNOWLEDGE_EXTRACTABLE',
      payload: expect.any(Object),
    });
  });

  it('should classify feedback request', async () => {
    (mockEvent.payload as any).content = 'UIが使いやすくなりました。ありがとうございます。';
    mockContext.createDriver = async () => new TestDriver({
      responses: [JSON.stringify({
        interpretation: 'UI改善に対する感謝のフィードバック',
        requestType: 'feedback',
        events: [{
          type: 'KNOWLEDGE_EXTRACTABLE',
          reason: 'フィードバックから知識を抽出',
          payload: {}
        }],
        actions: [],
        response: 'フィードバックありがとうございます。'
      })]
    });

    const result = await processUserRequestWorkflow.executor(mockEvent, mockContext, mockEmitter);

    expect(result.success).toBe(true);
    expect(result.output).toMatchObject({
      requestType: 'feedback',
    });

    // KNOWLEDGE_EXTRACTABLEイベントが発行されることを確認
    expect(mockEmitter.emit).toHaveBeenCalledWith({
      type: 'KNOWLEDGE_EXTRACTABLE',
      payload: expect.any(Object),
    });
  });

  it('should update state with processing information', async () => {
    const result = await processUserRequestWorkflow.executor(mockEvent, mockContext, mockEmitter);

    expect(result.success).toBe(true);
    expect(result.context.state).toContain('ユーザーリクエスト処理');
    expect(result.context.state).toContain('User ID:');
    expect(result.context.state).toContain('Request Type: issue');
    expect(result.context.state).toContain('Interpretation:');
  });

  it('should handle errors gracefully', async () => {
    const error = new Error('AI driver failed');
    mockContext.createDriver = vi.fn().mockRejectedValue(error);

    const result = await processUserRequestWorkflow.executor(mockEvent, mockContext, mockEmitter);

    expect(result.success).toBe(false);
    expect(result.error).toBe(error);
  });

  it('should handle missing request content', async () => {
    (mockEvent.payload as any).content = undefined;

    // undefinedコンテンツの場合のレスポンスを設定
    mockContext.createDriver = async () => new TestDriver({
      responses: [JSON.stringify({
        interpretation: '内容なし',
        requestType: 'feedback',
        events: [],
        actions: [],
        response: 'リクエスト内容が空です。'
      })]
    });

    const result = await processUserRequestWorkflow.executor(mockEvent, mockContext, mockEmitter);

    // undefinedでもString()で変換されるため、処理は続行される
    expect(result.success).toBe(true);
    expect(result.output).toMatchObject({
      requestType: 'feedback', // デフォルト分類
    });
  });
});