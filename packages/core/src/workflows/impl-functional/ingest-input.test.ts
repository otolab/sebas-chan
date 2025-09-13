import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TestDriver } from '@moduler-prompt/driver';
import { ingestInputWorkflow } from './ingest-input.js';
import { executeWorkflow } from '../functional-types.js';
import type { AgentEvent } from '../../index.js';
import type { WorkflowContext, WorkflowEventEmitter } from '../context.js';
import { createMockWorkflowLogger } from '../test-utils.js';

describe('IngestInput Workflow (Functional)', () => {
  let mockContext: WorkflowContext;
  let mockEmitter: WorkflowEventEmitter;
  let mockEvent: AgentEvent;
  let testDriver: TestDriver;

  beforeEach(() => {
    // テストドライバーの作成
    testDriver = new TestDriver({
      responses: ['AI response for testing'],
      delay: 0,
    });

    // モックコンテキストの準備
    mockContext = {
      state: 'Initial state',
      storage: {
        addPondEntry: vi.fn().mockResolvedValue({ id: 'pond-123', content: 'test content' }),
        searchIssues: vi.fn().mockResolvedValue([]),
        searchKnowledge: vi.fn().mockResolvedValue([]),
        searchPond: vi.fn().mockResolvedValue([]),
        getIssue: vi.fn(),
        createIssue: vi.fn(),
        updateIssue: vi.fn(),
        createKnowledge: vi.fn(),
        updateKnowledge: vi.fn(),
      },
      logger: createMockWorkflowLogger(),
      driver: testDriver,
      metadata: {},
    };

    // モックイベントエミッター
    mockEmitter = {
      emit: vi.fn(),
    };

    // モックイベント
    mockEvent = {
      type: 'INGEST_INPUT',
      priority: 'normal',
      timestamp: new Date(),
      payload: {
        input: {
          id: 'input-123',
          content: 'システムでエラーが発生しました',
          source: 'slack',
        },
      },
    };
  });

  it('should successfully ingest input to pond', async () => {
    const result = await executeWorkflow(
      ingestInputWorkflow,
      mockEvent,
      mockContext,
      mockEmitter
    );

    expect(result.success).toBe(true);
    expect(result.output).toEqual({
      pondEntryId: 'pond-123',
      analyzed: true, // "エラー"キーワードを含むため
    });

    // Pondエントリが作成されたことを確認
    expect(mockContext.storage.addPondEntry).toHaveBeenCalledWith({
      content: 'システムでエラーが発生しました',
      source: 'slack',
    });

    // ログが記録されたことを確認
    expect(mockContext.logger.logInput).toHaveBeenCalled();
    expect(mockContext.logger.logOutput).toHaveBeenCalled();
  });

  it('should trigger analysis when error keywords are detected', async () => {
    const result = await executeWorkflow(
      ingestInputWorkflow,
      mockEvent,
      mockContext,
      mockEmitter
    );

    expect(result.success).toBe(true);

    // ANALYZE_ISSUE_IMPACTイベントが発行されたことを確認
    expect(mockEmitter.emit).toHaveBeenCalledWith({
      type: 'ANALYZE_ISSUE_IMPACT',
      priority: 'normal',
      payload: {
        pondEntryId: 'pond-123',
        originalInput: (mockEvent.payload as any).input,
      },
    });
  });

  it('should not trigger analysis when no keywords are detected', async () => {
    (mockEvent.payload as any).input.content = '今日の天気はどうですか？';

    const result = await executeWorkflow(
      ingestInputWorkflow,
      mockEvent,
      mockContext,
      mockEmitter
    );

    expect(result.success).toBe(true);
    expect((result.output as any).analyzed).toBe(false);

    // イベントが発行されないことを確認
    expect(mockEmitter.emit).not.toHaveBeenCalled();
  });

  it('should update state with processing information', async () => {
    const result = await executeWorkflow(
      ingestInputWorkflow,
      mockEvent,
      mockContext,
      mockEmitter
    );

    expect(result.success).toBe(true);
    expect(result.context.state).toContain('最新の入力処理');
    expect(result.context.state).toContain('Input ID: input-123');
    expect(result.context.state).toContain('Source: slack');
    expect(result.context.state).toContain('Pond Entry ID: pond-123');
  });

  it('should handle errors gracefully', async () => {
    const error = new Error('Database connection failed');
    mockContext.storage.addPondEntry = vi.fn().mockRejectedValue(error);

    const result = await executeWorkflow(
      ingestInputWorkflow,
      mockEvent,
      mockContext,
      mockEmitter
    );

    expect(result.success).toBe(false);
    expect(result.error).toBe(error);

    // エラーログが記録されたことを確認
    expect(mockContext.logger.logError).toHaveBeenCalledWith(
      error,
      expect.objectContaining({ event: mockEvent })
    );
  });

  it('should work with different driver responses', async () => {
    // 複数の応答を設定
    const multiResponseDriver = new TestDriver({
      responses: ['First response', 'Second response', 'Third response'],
    });
    mockContext.driver = multiResponseDriver;

    const result = await executeWorkflow(
      ingestInputWorkflow,
      mockEvent,
      mockContext,
      mockEmitter
    );

    expect(result.success).toBe(true);
  });
});