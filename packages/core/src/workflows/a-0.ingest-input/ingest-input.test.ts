import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { ingestInputWorkflow } from './index.js';
import type { SystemEvent } from '@sebas-chan/shared-types';
import {
  createCustomMockContext,
  createMockWorkflowEmitter,
  createMockIssue,
  createMockPondEntry
} from '../test-utils.js';
import { TestDriver } from '@moduler-prompt/driver';
import type { AIService } from '@moduler-prompt/driver';

describe('IngestInput Workflow (Functional)', () => {
  // このテストは「ユーザーに代わってAIが追跡すべき事項」を
  // システムがどう取り込み、Issueとして管理するかを検証します
  let mockContext: ReturnType<typeof createCustomMockContext>;
  let mockEmitter: ReturnType<typeof createMockWorkflowEmitter>;
  let mockEvent: SystemEvent;

  beforeEach(() => {
    // モックコンテキストの準備
    mockContext = createCustomMockContext({
      driverResponses: [JSON.stringify({
        relatedIssueIds: [],
        needsNewIssue: true,
        newIssueTitle: '来週のミーティング準備',
        severity: 'medium',
        updateContent: 'プレゼン資料の作成が必要',
        labels: ['meeting', 'preparation'],
        updatedState: 'Initial state\nデータ取り込み完了'
      })],
      storageOverrides: {
        addPondEntry: vi.fn().mockResolvedValue(createMockPondEntry({
          id: 'pond-123',
          content: 'test content'
        })),
      }
    });

    // モックイベントエミッター
    mockEmitter = createMockWorkflowEmitter();

    // モックイベント
    mockEvent = {
      type: 'DATA_ARRIVED',
      payload: {
        source: 'slack',
        content: '来週の水曜日に重要なミーティングがあるそうです。プレゼン資料を準備しておいてください。',
        format: 'text',
        pondEntryId: 'pond-123',
        timestamp: new Date().toISOString(),
      },
    };
  });

  it('should successfully ingest input to pond', async () => {
    // ユーザーからの情報をAIが分析し、追跡すべき事項として判断
    // TestDriverレスポンスを別途設定
    mockContext = createCustomMockContext({
      driverResponses: [JSON.stringify({
        relatedIssueIds: [],
        needsNewIssue: true,
        newIssueTitle: 'プレゼン資料の準備',
        severity: 'medium',
        updateContent: '来週のミーティングまでに作成が必要',
        labels: ['meeting', 'task'],
        updatedState: 'Initial state\n新規Issue作成: プレゼン資料の準備'
      })]
    });
    mockEmitter = createMockWorkflowEmitter();

    mockContext.storage.createIssue = vi.fn().mockResolvedValue(createMockIssue({
      id: 'issue-123',
      title: 'プレゼン資料の準備',
      description: '来週の水曜日に重要なミーティングがあるそうです。プレゼン資料を準備しておいてください。',
      labels: ['meeting', 'task'],
      sourceInputIds: ['pond-123'],
    }));

    const result = await ingestInputWorkflow.executor(mockEvent, mockContext, mockEmitter);

    expect(result.success).toBe(true);
    expect(result.output).toMatchObject({
      pondEntryId: 'pond-123',
      analyzedContent: true,
      severity: 'medium',
    });
  });

  it('should trigger ISSUE_CREATED event when new issue is created', async () => {
    // 重要度が高い追跡事項を作成するケース
    mockContext = createCustomMockContext({
      driverResponses: [JSON.stringify({
        relatedIssueIds: [],
        needsNewIssue: true,
        newIssueTitle: '重要顧客との契約更新',
        severity: 'high',
        updateContent: '今月末までに契約更新の決定が必要',
        labels: ['contract', 'urgent'],
        updatedState: 'Initial state\n緊急度の高い追跡事項を作成'
      })]
    });
    mockEmitter = createMockWorkflowEmitter();

    mockContext.storage.createIssue = vi.fn().mockResolvedValue(createMockIssue({
      id: 'issue-123',
      title: '重要顧客との契約更新',
      description: '今月末までに契約更新の決定が必要',
      labels: ['contract', 'urgent'],
      priority: 80,
      sourceInputIds: ['pond-123'],
    }));

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

    // 高severity時にHIGH_PRIORITY_ISSUE_DETECTEDイベントも発行される
    expect(mockEmitter.emit).toHaveBeenCalledWith({
      type: 'HIGH_PRIORITY_ISSUE_DETECTED',
      payload: expect.objectContaining({
        priority: 70,
        issueId: 'issue-123',
      }),
    });
  });

  it('should update existing issue when related issue found', async () => {
    // 既存の追跡事項に関連情報を追加するケース
    const existingIssue = createMockIssue({
      id: 'issue-456',
      title: 'プロジェクトXの進捗',
      description: 'プロジェクトXの進捗状況を追跡',
      labels: ['project'],
      sourceInputIds: [],
    });

    mockContext = createCustomMockContext({
      driverResponses: [JSON.stringify({
        relatedIssueIds: ['issue-456'],
        needsNewIssue: false,
        severity: 'medium',
        updateContent: '関連データを受信しました',
        labels: ['error'],
        updatedState: 'Initial state\n既存Issue更新: issue-456'
      })]
    });
    mockEmitter = createMockWorkflowEmitter();

    // モックを設定（createCustomMockContextの後に設定）
    mockContext.storage.searchIssues = vi.fn().mockResolvedValue([existingIssue]);
    mockContext.storage.getIssue = vi.fn().mockResolvedValue(existingIssue);
    mockContext.storage.updateIssue = vi.fn();

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
    mockContext = createCustomMockContext({
      driverResponses: [JSON.stringify({
        relatedIssueIds: [],
        needsNewIssue: false,
        severity: 'low',
        labels: [],
        updatedState: 'Initial state\nデータ取り込み処理\nSource: slack\nPond Entry ID: pond-123\nSeverity: low'
      })]
    });
    mockEmitter = createMockWorkflowEmitter();

    const result = await ingestInputWorkflow.executor(mockEvent, mockContext, mockEmitter);

    expect(result.success).toBe(true);
    // Stateが更新されたことを確認（AIが生成したupdatedStateを使用）
    expect(result.context.state).not.toBe('Initial state');
    expect(result.context.state).toBeTruthy();
  });

  it('should handle errors gracefully', async () => {
    const error = new Error('Database connection failed');
    mockContext.storage.searchIssues = vi.fn().mockRejectedValue(error);

    const result = await ingestInputWorkflow.executor(mockEvent, mockContext, mockEmitter);

    expect(result.success).toBe(false);
    expect(result.error).toBe(error);
  });

  it('should handle critical severity and trigger appropriate events', async () => {
    mockContext = createCustomMockContext({
      driverResponses: [JSON.stringify({
        relatedIssueIds: [],
        needsNewIssue: true,
        newIssueTitle: 'Critical System Failure',
        severity: 'critical',
        updateContent: 'System is completely down',
        labels: ['critical', 'outage'],
        updatedState: 'Initial state\nCritical: System is completely down'
      })]
    });
    mockEmitter = createMockWorkflowEmitter();

    mockContext.storage.createIssue = vi.fn().mockResolvedValue(createMockIssue({
      id: 'issue-critical',
      title: 'Critical System Failure',
      description: 'システムでエラーが発生しました',
      labels: ['critical', 'outage'],
      priority: 100,
      sourceInputIds: ['pond-123'],
    }));

    const result = await ingestInputWorkflow.executor(mockEvent, mockContext, mockEmitter);

    expect(result.success).toBe(true);
    expect((result.output as any).severity).toBe('critical');

    // HIGH_PRIORITY_ISSUE_DETECTEDイベントが発行されることを確認
    expect(mockEmitter.emit).toHaveBeenCalledWith({
      type: 'HIGH_PRIORITY_ISSUE_DETECTED',
      payload: expect.objectContaining({
        priority: 90,
        issueId: 'issue-critical',
        reason: 'High severity critical issue detected',
      }),
    });
  });
});

// AI品質確認テスト（AIServiceが利用可能な場合のみ実行）
describe('IngestInput Workflow - with AI Quality Checks', () => {
  let aiService: AIService | null = null;

  beforeAll(async () => {
    // AIServiceの利用可能性をチェック
    const { setupAIServiceForTest } = await import('../test-ai-helper.js');
    aiService = await setupAIServiceForTest();
  });

  it.skipIf(() => !aiService)('should classify user inputs with actual AI service', async () => {
    // 実際のAIを使った品質確認テスト
    // TODO: 実装
  });

  it.skipIf(() => !aiService)('should extract appropriate tags from real content', async () => {
    // 実際のAIを使ったタグ抽出の品質確認
    // TODO: 実装
  });

  it.skipIf(() => !aiService)('should handle ambiguous input with AI reasoning', async () => {
    // 実際のAIを使った曖昧な入力の処理確認
    // TODO: 実装
  });
});
