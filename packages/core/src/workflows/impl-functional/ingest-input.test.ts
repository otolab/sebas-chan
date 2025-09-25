import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ingestInputWorkflow } from './ingest-input.js';
import type { AgentEvent } from '../../types.js';
import type { WorkflowContextInterface, WorkflowEventEmitterInterface } from '../context.js';
import { TestDriver } from '@moduler-prompt/driver';
import { WorkflowRecorder } from '../recorder.js';

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
    };

    // モックイベントエミッター
    mockEmitter = {
      emit: vi.fn(),
    };

    // モックイベント
    mockEvent = {
      type: 'DATA_ARRIVED',
      timestamp: new Date(),
      payload: {
        source: 'slack',
        content: 'システムでエラーが発生しました',
        format: 'text',
        pondEntryId: 'pond-123',
        timestamp: new Date().toISOString(),
      },
    };
  });

  it('should successfully ingest input to pond', async () => {
    // AIが分析結果を返すモック
    mockContext.createDriver = async () => new TestDriver({
      responses: [JSON.stringify({
        relatedIssueIds: [],
        needsNewIssue: true,
        newIssueTitle: 'システムエラー',
        severity: 'medium',
        updateContent: 'エラーが発生しました',
        labels: ['error', 'slack'],
      })],
    });

    mockContext.storage.createIssue = vi.fn().mockResolvedValue({
      id: 'issue-123',
      title: 'システムエラー',
      description: 'システムでエラーが発生しました',
      status: 'open',
      labels: ['error', 'slack'],
      priority: 50,
      sourceInputIds: ['pond-123'],
      createdAt: new Date(),
      updatedAt: new Date(),
      updates: [],
      relations: [],
    });

    const result = await ingestInputWorkflow.executor(mockEvent, mockContext, mockEmitter);

    expect(result.success).toBe(true);
    expect(result.output).toMatchObject({
      pondEntryId: 'pond-123',
      analyzedContent: true,
      severity: 'medium',
    });
  });

  it('should trigger ISSUE_CREATED event when new issue is created', async () => {
    mockContext.createDriver = async () => new TestDriver({
      responses: [JSON.stringify({
        relatedIssueIds: [],
        needsNewIssue: true,
        newIssueTitle: 'システムエラー',
        severity: 'high',
        updateContent: 'Critical error detected',
        labels: ['error', 'critical'],
      })],
    });

    mockContext.storage.createIssue = vi.fn().mockResolvedValue({
      id: 'issue-123',
      title: 'システムエラー',
      description: 'システムでエラーが発生しました',
      status: 'open',
      labels: ['error', 'critical'],
      priority: 80,
      sourceInputIds: ['pond-123'],
      createdAt: new Date(),
      updatedAt: new Date(),
      updates: [],
      relations: [],
    });

    const result = await ingestInputWorkflow.executor(mockEvent, mockContext, mockEmitter);

    expect(result.success).toBe(true);

    // ISSUE_CREATEDイベントが発行されたことを確認
    expect(mockEmitter.emit).toHaveBeenCalledWith({
      type: 'ISSUE_CREATED',
      payload: expect.objectContaining({
        issueId: 'issue-123',
        createdBy: 'system',
        sourceWorkflow: 'IngestInput',
      }),
    });

    // 高severity時にERROR_DETECTEDイベントも発行される
    expect(mockEmitter.emit).toHaveBeenCalledWith({
      type: 'ERROR_DETECTED',
      payload: expect.objectContaining({
        severity: 'high',
      }),
    });
  });

  it('should update existing issue when related issue found', async () => {
    const existingIssue = {
      id: 'issue-456',
      title: '既存のエラー',
      description: '既存のエラー説明',
      status: 'open',
      labels: ['error'],
      priority: 50,
      sourceInputIds: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      updates: [],
      relations: [],
    };

    mockContext.storage.searchIssues = vi.fn().mockResolvedValue([existingIssue]);
    mockContext.storage.getIssue = vi.fn().mockResolvedValue(existingIssue);
    mockContext.storage.updateIssue = vi.fn();

    mockContext.createDriver = async () => new TestDriver({
      responses: [JSON.stringify({
        relatedIssueIds: ['issue-456'],
        needsNewIssue: false,
        severity: 'medium',
        updateContent: '関連データを受信しました',
        labels: ['error'],
      })],
    });

    const result = await ingestInputWorkflow.executor(mockEvent, mockContext, mockEmitter);

    expect(result.success).toBe(true);
    expect((result.output as any).updatedIssueIds).toContain('issue-456');

    // 既存Issueが更新されたことを確認
    expect(mockContext.storage.updateIssue).toHaveBeenCalledWith(
      'issue-456',
      expect.objectContaining({
        sourceInputIds: expect.arrayContaining(['pond-123']),
      })
    );
  });

  it('should update state with processing information', async () => {
    mockContext.createDriver = async () => new TestDriver({
      responses: [JSON.stringify({
        relatedIssueIds: [],
        needsNewIssue: false,
        severity: 'low',
        labels: [],
      })],
    });

    const result = await ingestInputWorkflow.executor(mockEvent, mockContext, mockEmitter);

    expect(result.success).toBe(true);
    // Stateが更新されたことを確認
    expect(result.context.state).toContain('データ取り込み処理');
    expect(result.context.state).toContain('Source: slack');
    expect(result.context.state).toContain('Pond Entry ID: pond-123');
    expect(result.context.state).toContain('Severity: low');
  });

  it('should handle errors gracefully', async () => {
    const error = new Error('Database connection failed');
    mockContext.storage.searchIssues = vi.fn().mockRejectedValue(error);

    const result = await ingestInputWorkflow.executor(mockEvent, mockContext, mockEmitter);

    expect(result.success).toBe(false);
    expect(result.error).toBe(error);
  });

  it('should handle critical severity and trigger appropriate events', async () => {
    mockContext.createDriver = async () => new TestDriver({
      responses: [JSON.stringify({
        relatedIssueIds: [],
        needsNewIssue: true,
        newIssueTitle: 'Critical System Failure',
        severity: 'critical',
        updateContent: 'System is completely down',
        labels: ['critical', 'outage'],
      })],
    });

    mockContext.storage.createIssue = vi.fn().mockResolvedValue({
      id: 'issue-critical',
      title: 'Critical System Failure',
      description: 'システムでエラーが発生しました',
      status: 'open',
      labels: ['critical', 'outage'],
      priority: 100,
      sourceInputIds: ['pond-123'],
      createdAt: new Date(),
      updatedAt: new Date(),
      updates: [],
      relations: [],
    });

    const result = await ingestInputWorkflow.executor(mockEvent, mockContext, mockEmitter);

    expect(result.success).toBe(true);
    expect((result.output as any).severity).toBe('critical');

    // ERROR_DETECTEDイベントが発行されることを確認
    expect(mockEmitter.emit).toHaveBeenCalledWith({
      type: 'ERROR_DETECTED',
      payload: expect.objectContaining({
        severity: 'critical',
        affectedComponent: 'slack',
      }),
    });
  });
});
