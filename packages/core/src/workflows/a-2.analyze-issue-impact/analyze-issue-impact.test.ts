import { describe, it, expect, vi, beforeEach } from 'vitest';
import { analyzeIssueImpactWorkflow } from './index.js';
import type { AgentEvent } from '../../types.js';
import type { WorkflowContextInterface, WorkflowEventEmitterInterface } from '../context.js';
import { TestDriver } from '@moduler-prompt/driver';
import { WorkflowRecorder } from '../recorder.js';
import type { Issue } from '@sebas-chan/shared-types';

describe('AnalyzeIssueImpact Workflow (A-2)', () => {
  let mockContext: WorkflowContextInterface;
  let mockEmitter: WorkflowEventEmitterInterface;
  let mockEvent: AgentEvent;

  // テスト用ユーティリティ: createDriverのモックを設定
  const setupDriverMocks = (analyzeIssueResponse: any) => {
    // 1つのドライバーインスタンスで1つの応答を返す（updatedStateは分析結果に含まれる）
    mockContext.createDriver = vi.fn().mockResolvedValue(
      new TestDriver({
        responses: [JSON.stringify(analyzeIssueResponse)],
      })
    );
  };

  const mockIssue: Issue = {
    id: 'issue-456',
    title: '既存のエラー',
    description: '以前のエラー報告',
    status: 'open',
    labels: [],
    updates: [],
    relations: [],
    sourceInputIds: [],
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
  };

  beforeEach(() => {
    // モックコンテキストの準備
    mockContext = {
      state: 'Initial state',
      storage: {
        addPondEntry: vi.fn(),
        searchIssues: vi.fn().mockResolvedValue([mockIssue]),
        searchKnowledge: vi.fn().mockResolvedValue([]),
        searchPond: vi.fn().mockResolvedValue([]),
        getIssue: vi.fn(),
        getKnowledge: vi.fn(),
        createIssue: vi.fn().mockResolvedValue({
          id: 'new-issue-123',
          title: 'New Issue',
          description: 'Critical system error',
          status: 'open',
          labels: ['high-priority'],
          updates: [],
          relations: [],
          sourceInputIds: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
        updateIssue: vi.fn(),
        createKnowledge: vi.fn(),
        updateKnowledge: vi.fn(),
        // Flow操作
        getFlow: vi.fn(),
        searchFlows: vi.fn().mockResolvedValue([]),
        createFlow: vi.fn(),
        updateFlow: vi.fn(),
      },
      createDriver: vi.fn(), // 各テストケースで設定
      recorder: new WorkflowRecorder('test'),
    };

    // モックイベントエミッター
    mockEmitter = {
      emit: vi.fn(),
    };

    // モックイベント
    mockEvent = {
      type: 'ISSUE_CREATED',
      timestamp: new Date(),
      payload: {
        issueId: 'issue-123',
        issue: {
          id: 'issue-123',
          title: 'Critical system error occurred',
          description: 'The system is down',
          status: 'open',
          labels: [],
          updates: [],
          relations: [],
          sourceInputIds: ['input-123'],
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      },
    };
  });

  it('should analyze issue and return impact score', async () => {
    mockContext.storage.getIssue = vi.fn().mockResolvedValue(mockEvent.payload.issue);

    setupDriverMocks({
      shouldClose: false,
      closeReason: '',
      suggestedPriority: 80,
      shouldMergeWith: [],
      impactedComponents: ['ユーザー管理', '認証'],
      hasKnowledge: false,
      knowledgeSummary: '',
      impactScore: 0.8,
      updatedState: 'Initial state\n## Issue影響分析\nIssue ID: issue-123\nImpact Score: 0.8',
    });

    const result = await analyzeIssueImpactWorkflow.executor(mockEvent, mockContext, mockEmitter);

    expect(result.success).toBe(true);
    expect(result.output).toMatchObject({
      issueId: 'issue-123',
      impactScore: expect.any(Number),
      shouldClose: expect.any(Boolean),
      suggestedPriority: expect.any(Number),
      relatedIssuesCount: 1,
      analysis: expect.objectContaining({
        impactScore: expect.any(Number),
      }),
    });

    // 影響度スコアが存在することを確認
    expect((result.output as any).impactScore).toBeDefined();
  });

  it('should trigger HIGH_PRIORITY_DETECTED for high impact issues', async () => {
    (mockEvent.payload as any).issue.title = 'Critical urgent crash - system completely down';
    mockContext.storage.getIssue = vi.fn().mockResolvedValue(mockEvent.payload.issue);

    setupDriverMocks({
      shouldClose: false,
      closeReason: '',
      suggestedPriority: 90,
      shouldMergeWith: [],
      impactedComponents: ['system', 'database'],
      hasKnowledge: true,
      knowledgeSummary: 'Critical system issue',
      impactScore: 0.9,
      updatedState: 'Initial state\nCritical issue detected\nHigh priority event triggered',
    });

    const result = await analyzeIssueImpactWorkflow.executor(mockEvent, mockContext, mockEmitter);

    expect(result.success).toBe(true);

    // 高優先度検出イベントが発行される
    expect(mockEmitter.emit).toHaveBeenCalledWith({
      type: 'HIGH_PRIORITY_DETECTED',
      payload: expect.objectContaining({
        entityType: 'issue',
        entityId: 'issue-123',
      }),
    });
  });

  it('should update issue priority when significant difference detected', async () => {
    mockContext.storage.getIssue = vi.fn().mockResolvedValue(mockEvent.payload.issue);

    setupDriverMocks({
      shouldClose: false,
      closeReason: '',
      suggestedPriority: 85,
      shouldMergeWith: [],
      impactedComponents: [],
      hasKnowledge: false,
      knowledgeSummary: '',
      impactScore: 0.7,
      updatedState: 'Initial state\nPriority updated to 85',
    });

    const result = await analyzeIssueImpactWorkflow.executor(mockEvent, mockContext, mockEmitter);

    expect(result.success).toBe(true);

    // 優先度更新が呼ばれることを確認
    expect(mockContext.storage.updateIssue).toHaveBeenCalledWith(
      'issue-123',
      expect.objectContaining({
        priority: 85,
      })
    );
  });

  it('should handle different impact scores', async () => {
    mockContext.storage.getIssue = vi.fn().mockResolvedValue(mockEvent.payload.issue);

    // 通常の影響度
    setupDriverMocks({
      shouldClose: false,
      closeReason: '',
      suggestedPriority: 50,
      shouldMergeWith: [],
      impactedComponents: [],
      hasKnowledge: false,
      knowledgeSummary: '',
      impactScore: 0.5,
      updatedState: 'Initial state\nImpact score: 0.5',
    });

    let result = await analyzeIssueImpactWorkflow.executor(mockEvent, mockContext, mockEmitter);
    const normalScore = (result.output as any).impactScore;
    expect(normalScore).toBe(0.5);

    // 高影響度
    setupDriverMocks({
      shouldClose: false,
      closeReason: '',
      suggestedPriority: 90,
      shouldMergeWith: [],
      impactedComponents: ['core', 'api'],
      hasKnowledge: true,
      knowledgeSummary: 'Critical core issue',
      impactScore: 0.9,
      updatedState: 'Initial state\nHigh impact score: 0.9',
    });

    result = await analyzeIssueImpactWorkflow.executor(mockEvent, mockContext, mockEmitter);
    const criticalScore = (result.output as any).impactScore;
    expect(criticalScore).toBe(0.9);
  });

  it('should update state with analysis information', async () => {
    setupDriverMocks({
      shouldClose: false,
      closeReason: '',
      suggestedPriority: 75,
      shouldMergeWith: [],
      impactedComponents: ['ユーザー管理', '認証'],
      hasKnowledge: false,
      knowledgeSummary: '',
      impactScore: 0.75,
      updatedState:
        'Initial state\n## Issue影響分析 (2024-01-01T00:00:00.000Z)\n- Issue ID: issue-123\n- Impact Score: 0.75\n- Should Close: false\n- Suggested Priority: 75\n- Impacted Components: ユーザー管理, 認証',
    });

    const result = await analyzeIssueImpactWorkflow.executor(mockEvent, mockContext, mockEmitter);

    expect(result.success).toBe(true);
    expect(result.context.state).toContain('Issue影響分析');
    expect(result.context.state).toContain('Issue ID:');
    expect(result.context.state).toContain('Impact Score:');
    expect(result.context.state).toContain('Impacted Components:');

    // Related issues countは outputに含まれる
    expect((result.output as any).relatedIssuesCount).toBe(1);
  });

  it('should handle missing issue in payload', async () => {
    (mockEvent.payload as any).issue = undefined;
    mockContext.storage.getIssue = vi.fn().mockResolvedValue(null);

    const result = await analyzeIssueImpactWorkflow.executor(mockEvent, mockContext, mockEmitter);

    expect(result.success).toBe(false);
    expect(result.error).toEqual(new Error('Issue not found'));
  });

  it('should handle errors gracefully', async () => {
    const error = new Error('AI analysis failed');
    mockContext.createDriver = vi.fn().mockRejectedValue(error);

    const result = await analyzeIssueImpactWorkflow.executor(mockEvent, mockContext, mockEmitter);

    expect(result.success).toBe(false);
    expect(result.error).toEqual(error);
  });

  it('should add relations when merge is suggested', async () => {
    mockContext.storage.getIssue = vi.fn().mockResolvedValue(mockEvent.payload.issue);

    setupDriverMocks({
      shouldClose: false,
      closeReason: '',
      suggestedPriority: 50,
      shouldMergeWith: ['issue-456'],
      impactedComponents: [],
      hasKnowledge: false,
      knowledgeSummary: '',
      impactScore: 0.5,
      updatedState: 'Initial state\nDuplicate detected: issue-456',
    });

    const result = await analyzeIssueImpactWorkflow.executor(mockEvent, mockContext, mockEmitter);

    expect(result.success).toBe(true);

    // 重複関係が設定されることを確認
    expect(mockContext.storage.updateIssue).toHaveBeenCalledWith(
      'issue-123',
      expect.objectContaining({
        relations: expect.arrayContaining([
          {
            type: 'duplicates',
            targetIssueId: 'issue-456',
          },
        ]),
      })
    );
  });
});
