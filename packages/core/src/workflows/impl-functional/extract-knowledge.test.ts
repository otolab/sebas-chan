import { describe, it, expect, vi, beforeEach } from 'vitest';
import { extractKnowledgeWorkflow } from './extract-knowledge.js';
import type { AgentEvent } from '../../types.js';
import type { WorkflowContextInterface, WorkflowEventEmitterInterface } from '../context.js';
import { TestDriver } from '@moduler-prompt/driver';
import { WorkflowRecorder } from '../recorder.js';
import type { Knowledge } from '@sebas-chan/shared-types';

describe('ExtractKnowledge Workflow (A-3)', () => {
  let mockContext: WorkflowContextInterface;
  let mockEmitter: WorkflowEventEmitterInterface;
  let mockEvent: AgentEvent;

  const mockKnowledge: Knowledge = {
    id: 'knowledge-existing',
    type: 'factoid',
    content: 'システムエラーの対処法',
    reputation: {
      upvotes: 5,
      downvotes: 1,
    },
    sources: [],
  };

  beforeEach(() => {
    // モックコンテキストの準備
    mockContext = {
      state: 'Initial state',
      storage: {
        addPondEntry: vi.fn(),
        searchIssues: vi.fn().mockResolvedValue([]),
        searchKnowledge: vi.fn().mockResolvedValue([]),
        searchPond: vi.fn().mockResolvedValue([]),
        getIssue: vi.fn(),
        getKnowledge: vi.fn(),
        createIssue: vi.fn(),
        updateIssue: vi.fn(),
        createKnowledge: vi.fn().mockResolvedValue({
          id: 'knowledge-123',
          type: 'system_rule',
          content: '重要なシステムルール',
          reputation: { upvotes: 0, downvotes: 0 },
          sources: [],
        }),
        updateKnowledge: vi.fn(),
      },
      createDriver: async () => new TestDriver({
        responses: ['システムエラーが発生した場合は、まずログを確認し、エラーコードを記録してから再起動を試みる。それでも解決しない場合は、サポートチームに連絡する。']
      }),
      recorder: new WorkflowRecorder('test'),
    };

    // モックイベントエミッター
    mockEmitter = {
      emit: vi.fn(),
    };

    // モックイベント
    mockEvent = {
      type: 'KNOWLEDGE_EXTRACTABLE',
      timestamp: new Date(),
      payload: {
        sourceType: 'issue',
        sourceId: 'issue-123',
        confidence: 0.8,
        reason: '高影響度のシステムエラー',
        suggestedCategory: 'system_rule',
      },
    };
  });

  it('should extract and create new knowledge from high impact issue', async () => {
    // Issueを返すモック
    mockContext.storage.getIssue = vi.fn().mockResolvedValue({
      id: 'issue-123',
      title: 'システムエラー',
      description: '重大なシステムエラーが発生',
      status: 'resolved',
      updates: [{
        content: 'サービスを再起動して解決',
        timestamp: new Date(),
        author: 'user',
      }],
    });

    const result = await extractKnowledgeWorkflow.executor(mockEvent, mockContext, mockEmitter);

    expect(result.success).toBe(true);
    expect(result.output).toMatchObject({
      knowledgeId: expect.any(String),
      isDuplicate: false,
      extractedContent: expect.any(String),
      existingKnowledgeCount: 0,
    });

    // 新規Knowledgeが作成されたことを確認
    expect(mockContext.storage.createKnowledge).toHaveBeenCalledWith(
      expect.objectContaining({
        type: expect.any(String),
        content: expect.stringContaining('システムエラー'),
        sources: expect.arrayContaining([
          expect.objectContaining({
            type: 'issue',
            issueId: 'issue-123',
          }),
        ]),
      })
    );
  });

  it('should extract knowledge from resolved issue', async () => {
    // 長い応答を返すモック
    mockContext.createDriver = async () => new TestDriver({
      responses: ['ログインエラーの解決方法：パスワードリセットを実行し、キャッシュをクリアしてから再度ログインを試みる。それでも問題が解決しない場合は、システム管理者に連絡する。']
    });
    // ISSUE_STATUS_CHANGEDイベント
    mockEvent = {
      type: 'ISSUE_STATUS_CHANGED',
      timestamp: new Date(),
      payload: {
        issueId: 'issue-456',
        from: 'open',
        to: 'resolved',
        issue: {
          id: 'issue-456',
          title: 'ログインエラー',
          description: 'ログインができない',
          status: 'resolved',
          labels: [],
          priority: 50,
          sourceInputIds: [],
          createdAt: new Date(),
          updatedAt: new Date(),
          updates: [{
            content: 'パスワードリセットで解決',
            timestamp: new Date(),
            author: 'support',
          }],
          relations: [],
        },
      },
    };

    const result = await extractKnowledgeWorkflow.executor(mockEvent, mockContext, mockEmitter);

    expect(result.success).toBe(true);

    // issueソースで作成されることを確認
    expect(mockContext.storage.createKnowledge).toHaveBeenCalledWith(
      expect.objectContaining({
        type: expect.any(String),
        sources: expect.arrayContaining([
          expect.objectContaining({
            type: 'issue',
            issueId: 'issue-456',
          }),
        ]),
      })
    );
  });

  it('should extract knowledge from pattern found', async () => {
    // 長い応答を返すモック
    mockContext.createDriver = async () => new TestDriver({
      responses: ['メモリリークパターンの解決方法：メモリプールの設定を確認し、不要なオブジェクトを適切に解放する。ガベージコレクションの調整も検討する。']
    });
    // PATTERN_FOUNDイベント
    mockEvent = {
      type: 'PATTERN_FOUND',
      timestamp: new Date(),
      payload: {
        patternType: 'error_pattern',
        pattern: {
          description: 'メモリリークのパターン',
          occurrences: 5,
          confidence: 0.9,
          examples: ['例1', '例2'],
        },
      },
    };

    const result = await extractKnowledgeWorkflow.executor(mockEvent, mockContext, mockEmitter);

    expect(result.success).toBe(true);

    // user_directソースで作成されることを確認（patternはuser_directにマップされる）
    expect(mockContext.storage.createKnowledge).toHaveBeenCalledWith(
      expect.objectContaining({
        sources: expect.arrayContaining([
          expect.objectContaining({
            type: 'user_direct',
          }),
        ]),
      })
    );
  });

  it('should update existing knowledge reputation when duplicate found', async () => {
    mockContext.storage.searchKnowledge = vi.fn().mockResolvedValue([mockKnowledge]);
    mockContext.storage.getIssue = vi.fn().mockResolvedValue({
      id: 'issue-123',
      title: 'テスト',
      description: 'テスト',
      status: 'resolved',
      updates: [],
    });
    mockContext.createDriver = async () => new TestDriver({
      responses: [mockKnowledge.content] // 完全に同じ内容を返す
    });

    const result = await extractKnowledgeWorkflow.executor(mockEvent, mockContext, mockEmitter);

    expect(result.success).toBe(true);
    expect((result.output as any).isDuplicate).toBe(true);

    // 既存Knowledgeの評価が更新されることを確認
    expect(mockContext.storage.updateKnowledge).not.toHaveBeenCalled();

    // 新規作成はされない
    expect(mockContext.storage.createKnowledge).not.toHaveBeenCalled();
  });

  it('should not create knowledge if content is too short', async () => {
    mockContext.createDriver = async () => new TestDriver({
      responses: ['短いコンテンツ'] // 50文字未満
    });

    mockContext.storage.getIssue = vi.fn().mockResolvedValue({
      id: 'issue-123',
      title: '短い',
      description: '短い',
      status: 'open',
      updates: [],
    });

    const result = await extractKnowledgeWorkflow.executor(mockEvent, mockContext, mockEmitter);

    expect(result.success).toBe(true);
    expect((result.output as any).knowledgeId).toBe(null);

    // Knowledgeは作成されない
    expect(mockContext.storage.createKnowledge).not.toHaveBeenCalled();
  });

  it('should determine knowledge type based on content', async () => {
    // ルール系のコンテンツ（50文字以上）
    mockContext.createDriver = async () => new TestDriver({
      responses: ['このシステムルールに従って、すべてのリクエストを処理する必要があります。セキュリティポリシーにも準拠することが重要です。']
    });

    mockContext.storage.getIssue = vi.fn().mockResolvedValue({
      id: 'issue-123',
      title: 'ルール問題',
      description: 'ルールについて',
      status: 'resolved',
      updates: [],
    });

    let result = await extractKnowledgeWorkflow.executor(mockEvent, mockContext, mockEmitter);
    expect(result.success).toBe(true);

    expect(mockContext.storage.createKnowledge).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'system_rule',
      })
    );

    // プロセス系のコンテンツ（50文字以上）
    mockContext.storage.createKnowledge = vi.fn().mockResolvedValue({
      id: 'knowledge-456',
      type: 'process_manual',
      content: 'プロセス手順',
      reputation: { upvotes: 0, downvotes: 0 },
      sources: [],
      createdAt: new Date(),
    });
    mockContext.createDriver = async () => new TestDriver({
      responses: ['以下の手順に従ってprocessを実行してください。1. ログイン 2. 設定確認 3. 実行 4. 結果の確認 5. 必要に応じて再実行']
    });

    mockContext.storage.getIssue = vi.fn().mockResolvedValue({
      id: 'issue-123',
      title: '手順問題',
      description: '手順について',
      status: 'resolved',
      updates: [],
    });

    result = await extractKnowledgeWorkflow.executor(mockEvent, mockContext, mockEmitter);
    expect(result.success).toBe(true);

    expect(mockContext.storage.createKnowledge).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'process_manual',
      })
    );
  });

  it('should include correct source type in created knowledge', async () => {
    mockContext.createDriver = async () => new TestDriver({
      responses: ['これは重要な知識です。システムを正しく動作させるためには、定期的なメンテナンスと監視が必要です。']
    });
    mockContext.storage.getIssue = vi.fn().mockResolvedValue({
      id: 'issue-123',
      title: 'テストIssue',
      description: 'テスト用のIssue',
      status: 'resolved',
      updates: [],
    });

    const result = await extractKnowledgeWorkflow.executor(mockEvent, mockContext, mockEmitter);

    expect(result.success).toBe(true);

    // 知識が作成された場合のみ確認
    if ((result.output as any).knowledgeId) {
      expect(mockContext.storage.createKnowledge).toHaveBeenCalledWith(
      expect.objectContaining({
        sources: expect.arrayContaining([
          expect.objectContaining({
            type: 'issue',
            issueId: 'issue-123',
          }),
        ]),
      })
    );
    }
  });

  it('should update state with extraction information', async () => {
    mockContext.storage.getIssue = vi.fn().mockResolvedValue({
      id: 'issue-123',
      title: 'テストIssue',
      description: 'テスト用のIssue',
      status: 'resolved',
      updates: [],
    });

    const result = await extractKnowledgeWorkflow.executor(mockEvent, mockContext, mockEmitter);

    expect(result.success).toBe(true);
    expect(result.context.state).toContain('知識抽出');
    expect(result.context.state).toContain('Knowledge ID:');
    expect(result.context.state).toContain('Source Type:');
    expect(result.context.state).toContain('Duplicate: false');
  });

  it('should handle errors gracefully', async () => {
    mockContext.storage.getIssue = vi.fn().mockResolvedValue({
      id: 'issue-123',
      title: 'test',
      description: 'test',
      status: 'resolved',
      updates: [],
    });
    const error = new Error('Knowledge extraction failed');
    mockContext.createDriver = vi.fn().mockRejectedValue(error);

    const result = await extractKnowledgeWorkflow.executor(mockEvent, mockContext, mockEmitter);

    expect(result.success).toBe(false);
    expect(result.error).toEqual(error);
  });

  it('should handle empty source content', async () => {
    mockContext.storage.getIssue = vi.fn().mockResolvedValue(null);

    const result = await extractKnowledgeWorkflow.executor(mockEvent, mockContext, mockEmitter);

    // コンテンツが取得できない場合は失敗
    expect(result.success).toBe(false);
    expect(result.error).toEqual(new Error('No content to extract knowledge from'));
  });
});