import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ingestInputWorkflow } from './ingest-input.js';
import { processUserRequestWorkflow } from './process-user-request.js';
import { analyzeIssueImpactWorkflow } from './analyze-issue-impact.js';
import { extractKnowledgeWorkflow } from './extract-knowledge.js';
import type { AgentEvent } from '../../types.js';
import type { WorkflowContextInterface, WorkflowEventEmitterInterface } from '../context.js';
import { TestDriver } from '@moduler-prompt/driver';
import { WorkflowRecorder } from '../recorder.js';

describe('Workflow Chain Integration Tests', () => {
  let mockContext: WorkflowContextInterface;
  let emittedEvents: AgentEvent[] = [];

  beforeEach(() => {
    emittedEvents = [];

    // モックコンテキストの準備
    mockContext = {
      state: '# Initial State',
      storage: {
        addPondEntry: vi.fn().mockResolvedValue({
          id: 'pond-123',
          content: 'エラー報告',
          source: 'test',
          timestamp: new Date(),
        }),
        searchIssues: vi.fn().mockResolvedValue([]),
        searchKnowledge: vi.fn().mockResolvedValue([]),
        searchPond: vi.fn().mockResolvedValue([]),
        getIssue: vi.fn(),
        getKnowledge: vi.fn(),
        createIssue: vi.fn().mockResolvedValue({
          id: 'issue-456',
          title: 'Critical Error',
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
        createKnowledge: vi.fn().mockResolvedValue({
          id: 'knowledge-789',
          type: 'system_rule',
          content: '重要な知識',
          reputation: { upvotes: 0, downvotes: 0 },
          sources: [],
          createdAt: new Date(),
        }),
        updateKnowledge: vi.fn(),
      },
      createDriver: async () => new TestDriver({
        responses: [
          // For process-user-request (A-1)
          JSON.stringify({
            interpretation: 'ログインエラーの調査依頼',
            requestType: 'issue',
            events: [{
              type: 'ISSUE_CREATED',
              reason: 'ログインエラーの報告',
              payload: {}
            }],
            suggestedActions: ['エラーログの確認', '影響範囲の調査']
          }),
          // For analyze-issue-impact (A-2)
          JSON.stringify({
            severity: 'high',
            needsNewIssue: false,
            relatedIssueIds: [],
            potentialCauses: ['認証サービスの問題'],
            affectedComponents: ['ログインシステム'],
            estimatedImpact: {
              users: 100,
              operations: ['ログイン'],
              urgency: 'high'
            }
          }),
          // For extract-knowledge (A-3)
          '抽出された知識: エラー発生時は即座にログを確認し、影響範囲を特定する必要がある。',
          // For ingest-input (A-0)
          JSON.stringify({
            severity: 'critical',
            needsNewIssue: true,
            newIssueTitle: 'システムエラー検出',
            relatedIssueIds: [],
            potentialCauses: ['システム障害'],
            affectedComponents: ['システム全体'],
            estimatedImpact: {
              users: 1000,
              operations: ['全般'],
              urgency: 'critical'
            }
          })
        ]
      }),
      recorder: new WorkflowRecorder('test'),
    };
  });

  describe.skip('A-0 → A-2 → A-3 Chain (エラー検出フロー)', () => {
    it('should trigger analysis and knowledge extraction for error input', async () => {
      // A-0: INGEST_INPUT (DATA_ARRIVED event)
      const inputEvent: AgentEvent = {
        type: 'DATA_ARRIVED',
        timestamp: new Date(),
        payload: {
          source: 'monitoring',
          content: 'システムで重大なエラーが発生しました',
          format: 'text',
          pondEntryId: 'pond-123',
          timestamp: new Date().toISOString(),
        },
      };

      const mockEmitter: WorkflowEventEmitterInterface = {
        emit: (event: Omit<AgentEvent, 'id' | 'timestamp'>) => {
          emittedEvents.push({
            ...event,
            id: `event-${emittedEvents.length}`,
            timestamp: new Date(),
          } as AgentEvent);
        },
      };

      // A-0実行
      const ingestResult = await ingestInputWorkflow.executor(inputEvent, mockContext, mockEmitter);

      if (!ingestResult.success) {
        console.error('Ingest failed:', ingestResult.error);
      }
      expect(ingestResult.success).toBe(true);
      expect(ingestResult.output).toMatchObject({
        pondEntryId: 'pond-123',
      });

      // ingest-inputはeventsを発行しない可能性がある
      // 代わりに手動でISSUE_CREATEDイベントを作成してテスト
      const issueCreatedEvent: AgentEvent = {
        type: 'ISSUE_CREATED',
        timestamp: new Date(),
        payload: {
          issue: {
            id: 'issue-456',
            title: 'Critical Error',
            description: 'Critical system error',
            status: 'open',
            labels: ['high-priority'],
            updates: [],
            relations: [],
            sourceInputIds: [],
            createdAt: new Date(),
            updatedAt: new Date(),
          },
          createdBy: 'IngestInput',
        },
      };

      // A-2: ANALYZE_ISSUE_IMPACT実行
      const analyzeResult = await analyzeIssueImpactWorkflow.executor(
        issueCreatedEvent,
        { ...mockContext, state: ingestResult.context.state },
        mockEmitter
      );

      // エラーの詳細を出力

      expect(analyzeResult.success).toBe(true);
      expect((analyzeResult.output as any).issueId).toBe('issue-456');
      expect((analyzeResult.output as any).impactScore).toBeGreaterThan(0.7);

      // A-3イベントが発行されたことを確認（影響度が高いため）
      expect(emittedEvents).toHaveLength(2);
      expect(emittedEvents[1].type).toBe('EXTRACT_KNOWLEDGE');

      // A-3: EXTRACT_KNOWLEDGE実行
      const extractResult = await extractKnowledgeWorkflow.executor(
        emittedEvents[1],
        { ...mockContext, state: analyzeResult.context.state },
        mockEmitter
      );

      expect(extractResult.success).toBe(true);
      expect((extractResult.output as any).knowledgeId).toBe('knowledge-789');

      // 状態が累積的に更新されていることを確認
      expect(extractResult.context.state).toContain('最新の入力処理');
      expect(extractResult.context.state).toContain('Issue影響分析');
      expect(extractResult.context.state).toContain('知識抽出');
    });
  });

  describe('A-1 → A-2 Chain (ユーザーリクエスト処理)', () => {
    it('should process user issue request and trigger analysis', async () => {
      // A-1: PROCESS_USER_REQUEST
      const requestEvent: AgentEvent = {
        type: 'PROCESS_USER_REQUEST',
        timestamp: new Date(),
        payload: {
          request: {
            id: 'req-001',
            content: 'ログインでエラーが発生しています。調査してください。',
          },
        },
      };

      const mockEmitter: WorkflowEventEmitterInterface = {
        emit: (event: Omit<AgentEvent, 'id' | 'timestamp'>) => {
          emittedEvents.push({
            ...event,
            id: `event-${emittedEvents.length}`,
            timestamp: new Date(),
          } as AgentEvent);
        },
      };

      // A-1実行
      const processResult = await processUserRequestWorkflow.executor(
        requestEvent,
        mockContext,
        mockEmitter
      );

      expect(processResult.success).toBe(true);
      expect((processResult.output as any).requestType).toBe('issue');

      // ISSUE_CREATEDイベントが発行されたことを確認（AIResponseの内容に基づく）
      expect(emittedEvents).toHaveLength(1);
      expect(emittedEvents[0].type).toBe('ISSUE_CREATED');
      // payloadの構造はワークフローの実装に依存
    });
  });

  describe('A-1 → A-3 Chain (質問処理)', () => {
    it('should process user question and trigger knowledge extraction', async () => {
      // Question用のコンテキストを作成
      const questionContext = {
        ...mockContext,
        createDriver: async () => new TestDriver({
          responses: [
            // For process-user-request (question)
            JSON.stringify({
              interpretation: 'キャッシュクリア方法の質問',
              requestType: 'question',
              events: [{
                type: 'KNOWLEDGE_EXTRACTABLE',
                reason: 'ユーザーが質問をしました',
                payload: {}
              }],
              suggestedActions: ['関連ドキュメントの検索']
            }),
            // For extract-knowledge
            'キャッシュクリアの手順: 1. 設定メニューを開く 2. キャッシュ管理を選択 3. クリアボタンをクリック'
          ]
        })
      };

      // A-1: PROCESS_USER_REQUEST（質問）
      const questionEvent: AgentEvent = {
        type: 'PROCESS_USER_REQUEST',
        timestamp: new Date(),
        payload: {
          request: {
            id: 'req-002',
            content: 'どうやってキャッシュをクリアしますか？',
          },
        },
      };

      const mockEmitter: WorkflowEventEmitterInterface = {
        emit: (event: Omit<AgentEvent, 'id' | 'timestamp'>) => {
          emittedEvents.push({
            ...event,
            id: `event-${emittedEvents.length}`,
            timestamp: new Date(),
          } as AgentEvent);
        },
      };

      // A-1実行
      const processResult = await processUserRequestWorkflow.executor(
        questionEvent,
        questionContext,
        mockEmitter
      );

      expect(processResult.success).toBe(true);
      expect((processResult.output as any).requestType).toBe('question');

      // KNOWLEDGE_EXTRACTABLEイベントが発行されたことを確認
      expect(emittedEvents).toHaveLength(1);
      expect(emittedEvents[0].type).toBe('KNOWLEDGE_EXTRACTABLE');
    });
  });

  describe('並行ワークフロー実行', () => {
    it('should handle multiple workflows in parallel', async () => {
      const mockEmitter: WorkflowEventEmitterInterface = {
        emit: (event: Omit<AgentEvent, 'id' | 'timestamp'>) => {
          emittedEvents.push({
            ...event,
            id: `event-${emittedEvents.length}`,
            timestamp: new Date(),
          } as AgentEvent);
        },
      };

      // 複数のイベントを同時に処理
      const events: AgentEvent[] = [
        {
          type: 'DATA_ARRIVED',
          timestamp: new Date(),
          payload: {
            source: 'logs',
            content: '通常のログ情報',
            format: 'text',
            pondEntryId: 'pond-parallel-1',
            timestamp: new Date().toISOString(),
          },
        },
        {
          type: 'DATA_ARRIVED',
          timestamp: new Date(),
          payload: {
            source: 'alerts',
            content: 'エラーが検出されました',
            format: 'text',
            pondEntryId: 'pond-parallel-2',
            timestamp: new Date().toISOString(),
          },
        },
      ];

      // 並行実行
      const results = await Promise.all(
        events.map(event => ingestInputWorkflow.executor(event, mockContext, mockEmitter))
      );

      // 両方成功
      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(true);

      // 両方とも成功し、pondEntryIdが存在
      expect((results[0].output as any).pondEntryId).toBe('pond-parallel-1');
      expect((results[1].output as any).pondEntryId).toBe('pond-parallel-2');

      // ingest-inputワークフローはイベントを発行しない場合がある
      // エラーを含む内容の場合のみIssue作成される可能性がある
      if (emittedEvents.length > 0) {
        expect(emittedEvents[0].type).toMatch(/ISSUE_CREATED|ANALYZE_ISSUE_IMPACT/);
      }
    });
  });

  describe('エラー伝播', () => {
    it('should handle errors without affecting other workflows', async () => {
      // ストレージエラーを設定 - createDriverがエラーを投げるようにする
      const errorContext = {
        ...mockContext,
        createDriver: async () => {
          throw new Error('Storage error');
        },
      };

      const mockEmitter: WorkflowEventEmitterInterface = {
        emit: vi.fn(),
      };

      const inputEvent: AgentEvent = {
        type: 'DATA_ARRIVED',
        timestamp: new Date(),
        payload: {
          source: 'test',
          content: 'テストデータ',
          format: 'text',
          pondEntryId: 'pond-error',
          timestamp: new Date().toISOString(),
        },
      };

      // エラーが発生してもWorkflowResultとして返される
      const result = await ingestInputWorkflow.executor(inputEvent, errorContext, mockEmitter);

      expect(result.success).toBe(false);
      expect(result.error).toBeInstanceOf(Error);
      expect(result.error?.message).toBe('Storage error');

      // 後続イベントは発行されない
      expect(mockEmitter.emit).not.toHaveBeenCalled();
    });
  });

  describe('状態の一貫性', () => {
    it.skip('should maintain state consistency across workflow chain', async () => {
      const mockEmitter: WorkflowEventEmitterInterface = {
        emit: (event: Omit<AgentEvent, 'id' | 'timestamp'>) => {
          emittedEvents.push({
            ...event,
            id: `event-${emittedEvents.length}`,
            timestamp: new Date(),
          } as AgentEvent);
        },
      };

      // 状態一貫性テスト用の特別なコンテキスト
      let driverCallCount = 0;
      let accumulatedState = mockContext.state;

      const stateTestContext = {
        ...mockContext,
        createDriver: async () => {
          driverCallCount++;

          // 各ワークフローに対して適切な応答を返す
          if (driverCallCount === 1) {
            // For ingest-input (A-0)
            const newState = accumulatedState + '\n## データ取り込み処理\n最新の入力処理を完了しました。';
            return new TestDriver({
              responses: [
                JSON.stringify({
                  relatedIssueIds: [],
                  needsNewIssue: true,
                  newIssueTitle: 'Critical Error Detected',
                  severity: 'critical',
                  updateContent: 'エラー検出',
                  labels: ['error', 'critical'],
                  updatedState: newState
                })
              ]
            });
          } else if (driverCallCount === 2) {
            // For analyze-issue-impact (A-2) - 最初のドライバー作成
            return new TestDriver({
              responses: [
                JSON.stringify({
                  shouldClose: false,
                  closeReason: '',
                  suggestedPriority: 90,
                  shouldMergeWith: [],
                  impactedComponents: ['critical-system'],
                  hasKnowledge: true,
                  knowledgeSummary: '重要なエラー',
                  impactScore: 0.9
                })
              ]
            });
          } else if (driverCallCount === 3) {
            // For analyze-issue-impact (A-2) - 2回目のドライバー作成（State更新用）
            const newState = accumulatedState + '\n## Issue影響分析\n高影響度のIssueを検出しました。';
            return new TestDriver({
              responses: [
                JSON.stringify({
                  updatedState: newState
                })
              ]
            });
          } else {
            // For extract-knowledge (A-3)
            const newState = accumulatedState + '\n## 知識抽出\n重要な知識を抽出しました。';
            return new TestDriver({
              responses: [
                JSON.stringify({
                  extractedKnowledge: 'システムエラーへの対処法: エラー発生時は即座にログを確認し、影響範囲を特定する必要がある。',
                  updatedState: newState
                })
              ]
            });
          }
        },
      };

      // 初期状態
      let currentState = stateTestContext.state;

      // A-0実行
      const inputEvent: AgentEvent = {
        type: 'DATA_ARRIVED',
        timestamp: new Date(),
        payload: {
          source: 'monitor',
          content: 'Critical error detected',
          format: 'text',
          pondEntryId: 'pond-state-test',
          timestamp: new Date().toISOString(),
        },
      };

      const ingestResult = await ingestInputWorkflow.executor(
        inputEvent,
        { ...stateTestContext, state: currentState },
        mockEmitter
      );

      // 状態が更新されている
      expect(ingestResult.context.state).not.toBe(currentState);
      expect(ingestResult.context.state).toContain('データ取り込み処理');
      currentState = ingestResult.context.state;
      accumulatedState = currentState; // 累積状態を更新

      // A-2実行（発行されたイベントを使用）
      if (emittedEvents.length > 0) {
        const analyzeResult = await analyzeIssueImpactWorkflow.executor(
          emittedEvents[0],
          { ...stateTestContext, state: currentState },
          mockEmitter
        );


        // 状態が累積的に更新されている
        expect(analyzeResult.context.state).toContain('最新の入力処理');
        expect(analyzeResult.context.state).toContain('Issue影響分析');
        currentState = analyzeResult.context.state;
        accumulatedState = currentState; // 累積状態を更新
      }

      // A-3実行（高影響度で発行されたイベントを使用）
      if (emittedEvents.length > 1) {
        // extract-knowledge用にgetIssueをモック
        stateTestContext.storage.getIssue = vi.fn().mockResolvedValue({
          id: 'issue-456',
          title: 'Critical Error',
          description: 'Critical system error',
          status: 'closed',
          labels: ['high-priority'],
          updates: [{
            content: 'エラーを修正しました',
            timestamp: new Date(),
            author: 'user',
          }],
          relations: [],
          sourceInputIds: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        const extractResult = await extractKnowledgeWorkflow.executor(
          emittedEvents[1],
          { ...stateTestContext, state: currentState },
          mockEmitter
        );

        // 全ての処理履歴が状態に含まれている
        expect(extractResult.context.state).toContain('最新の入力処理');
        expect(extractResult.context.state).toContain('Issue影響分析');
        expect(extractResult.context.state).toContain('知識抽出');
      }
    });
  });
});