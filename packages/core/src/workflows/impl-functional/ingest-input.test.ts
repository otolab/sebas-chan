import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ingestInputWorkflow } from './ingest-input.js';
import type { AgentEvent } from '../../types.js';
import type { WorkflowContextInterface, WorkflowEventEmitterInterface } from '../context.js';
import { TestDriver } from '@moduler-prompt/driver';
import { RecordType, WorkflowRecorder } from '../recorder.js';

describe('IngestInput Workflow (Functional)', () => {
  let mockContext: WorkflowContextInterface;
  let mockEmitter: WorkflowEventEmitterInterface;
  let mockEvent: AgentEvent;

  beforeEach(() => {
    // モックコンテキストの準備
    mockContext = {
      state: 'Initial state',
      storage: {
        addPondEntry: vi.fn().mockResolvedValue({ id: 'pond-123', content: 'test content' }),
        searchIssues: vi.fn().mockResolvedValue([]),
        searchKnowledge: vi.fn().mockResolvedValue([]),
        searchPond: vi.fn().mockResolvedValue([]),
        getIssue: vi.fn(),
        getKnowledge: vi.fn(),
        createIssue: vi.fn(),
        updateIssue: vi.fn(),
        createKnowledge: vi.fn(),
        updateKnowledge: vi.fn(),
      },
      createDriver: async () => new TestDriver({ responses: ['AI response for testing'] }),
      recorder: new WorkflowRecorder('test'),
      metadata: {},
    };

    // モックイベントエミッター
    mockEmitter = {
      emit: vi.fn(),
    };

    // モックイベント
    mockEvent = {
      type: 'INGEST_INPUT',
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
    const mockRecorder = new WorkflowRecorder('test-workflow');
    vi.spyOn(mockRecorder, 'record');

    const result = await ingestInputWorkflow.executor(mockEvent, mockContext, mockEmitter);

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
  });

  it('should trigger analysis when error keywords are detected', async () => {
    const result = await ingestInputWorkflow.executor(mockEvent, mockContext, mockEmitter);

    expect(result.success).toBe(true);

    // ANALYZE_ISSUE_IMPACTイベントが発行されたことを確認
    expect(mockEmitter.emit).toHaveBeenCalledWith({
      type: 'ANALYZE_ISSUE_IMPACT',
      payload: {
        pondEntryId: 'pond-123',
        originalInput: (mockEvent.payload as any).input,
      },
    });
  });

  it('should not trigger analysis when no keywords are detected', async () => {
    (mockEvent.payload as any).input.content = '今日の天気はどうですか？';

    const result = await ingestInputWorkflow.executor(mockEvent, mockContext, mockEmitter);

    expect(result.success).toBe(true);
    expect((result.output as any).analyzed).toBe(false);

    // イベントが発行されないことを確認
    expect(mockEmitter.emit).not.toHaveBeenCalled();
  });

  it('should update state with processing information', async () => {
    const result = await ingestInputWorkflow.executor(mockEvent, mockContext, mockEmitter);

    expect(result.success).toBe(true);
    // Stateが更新されたことを確認
    expect(result.context.state).toContain('最新の入力処理');
    expect(result.context.state).toContain('Input ID: input-123');
    expect(result.context.state).toContain('Source: slack');
    expect(result.context.state).toContain('Pond Entry ID: pond-123');
  });

  it('should handle errors gracefully', async () => {
    const error = new Error('Database connection failed');
    mockContext.storage.addPondEntry = vi.fn().mockRejectedValue(error);

    const result = await ingestInputWorkflow.executor(mockEvent, mockContext, mockEmitter);

    expect(result.success).toBe(false);
    expect(result.error).toBe(error);
  });

  it('should work with different driver responses', async () => {
    // 複数の応答を設定
    mockContext.createDriver = async () =>
      new TestDriver({
        responses: ['First response', 'Second response', 'Third response'],
      });

    const result = await ingestInputWorkflow.executor(mockEvent, mockContext, mockEmitter);

    expect(result.success).toBe(true);
  });
});
