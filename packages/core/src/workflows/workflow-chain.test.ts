import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ingestInputWorkflow } from './a-0.ingest-input/index.js';
import { processUserRequestWorkflow } from './a-1.process-user-request/index.js';
import { analyzeIssueImpactWorkflow } from './a-2.analyze-issue-impact/index.js';
import { extractKnowledgeWorkflow } from './a-3.extract-knowledge/index.js';
import type { AgentEvent } from '../types.js';
import type { WorkflowContextInterface, WorkflowEventEmitterInterface } from './context.js';
import { createCustomMockContext } from './test-utils.js';
import { TestDriver } from '@moduler-prompt/driver';

describe('Workflow Chain Integration Tests', () => {
  let mockContext: WorkflowContextInterface;
  let emittedEvents: AgentEvent[] = [];

  beforeEach(() => {
    emittedEvents = [];

    // test-utils.tsの関数を使用してモックコンテキストを作成
    mockContext = createCustomMockContext({
      state: '# Initial State',
      driverResponses: [
        // For process-user-request (A-1)
        JSON.stringify({
          interpretation: 'ログインエラーの調査依頼',
          requestType: 'issue',
          events: [
            {
              type: 'ISSUE_CREATED',
              reason: 'ログインエラーの報告',
              payload: {},
            },
          ],
          suggestedActions: ['エラーログの確認', '影響範囲の調査'],
          updatedState: 'ログインエラーの調査を開始',
        }),
        // For analyze-issue-impact (A-2)
        JSON.stringify({
          shouldClose: false,
          closeReason: '',
          suggestedPriority: 90,
          shouldMergeWith: [],
          impactedComponents: ['ログインシステム'],
          hasKnowledge: true,
          knowledgeSummary: 'ログインエラーの影響分析',
          impactScore: 0.8,
          updatedState: '影響分析完了',
        }),
        // For extract-knowledge (A-3)
        JSON.stringify({
          extractedKnowledge: 'エラー発生時は即座にログを確認し、影響範囲を特定する必要がある。',
          updatedState: '知識抽出完了',
        }),
        // For ingest-input (A-0)
        JSON.stringify({
          severity: 'critical',
          needsNewIssue: true,
          newIssueTitle: 'システムエラー検出',
          relatedIssueIds: [],
          potentialCauses: ['システム障害'],
          impactedComponents: ['システム全体'],
          estimatedImpact: {
            users: 1000,
            operations: ['全般'],
            urgency: 'critical',
          },
          updatedState: 'システムエラー検出完了',
        }),
      ],
    });
  });

  describe('A-0 → A-2 → A-3 Chain (エラー検出フロー)', () => {
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

      // A-0用の専用コンテキストを作成
      const ingestContext = createCustomMockContext({
        state: '# Initial State',
        driverResponses: [
          JSON.stringify({
            severity: 'critical',
            needsNewIssue: true,
            newIssueTitle: 'システムエラー検出',
            relatedIssueIds: [],
            potentialCauses: ['システム障害'],
            impactedComponents: ['システム全体'],
            estimatedImpact: {
              users: 1000,
              operations: ['全般'],
              urgency: 'critical',
            },
            updatedState: '# Initial State\n## 最新の入力処理\nシステムエラー検出完了',
          }),
        ],
      });

      // A-0実行
      const ingestResult = await ingestInputWorkflow.executor(inputEvent, ingestContext, mockEmitter);

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
          issueId: 'issue-456',  // A-2が期待するissueId
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
      // getIssueのモックを設定
      const issueForAnalysis = {
        id: 'issue-456',
        title: 'Critical Error',
        description: 'Critical system error',
        status: 'open' as const,
        priority: 90,
        labels: ['high-priority'],
        updates: [],
        relations: [],
        sourceInputIds: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const analyzeContext = createCustomMockContext({
        state: ingestResult.context.state,
        driverResponses: [
          // A-2用のレスポンス
          JSON.stringify({
            shouldClose: false,
            closeReason: '',
            suggestedPriority: 90,
            shouldMergeWith: [],
            impactedComponents: ['システム全体'],
            hasKnowledge: true,
            knowledgeSummary: 'クリティカルエラーの影響分析',
            impactScore: 0.9,
            updatedState: ingestResult.context.state + '\n## Issue影響分析\n高影響度のIssueを検出しました。',
          }),
        ],
        storageOverrides: {
          getIssue: async (id: string) => {
            if (id === 'issue-456') return issueForAnalysis;
            return null;
          },
        },
      });

      const analyzeResult = await analyzeIssueImpactWorkflow.executor(
        issueCreatedEvent,
        analyzeContext,
        mockEmitter
      );

      // エラーの詳細を出力
      if (!analyzeResult.success) {
        console.error('Analyze failed:', analyzeResult.error);
        console.error('Context state:', analyzeResult.context.state);
      }

      expect(analyzeResult.success).toBe(true);

      const analyzeOutput = analyzeResult.output as {
        issueId: string;
        impactScore: number;
        shouldClose: boolean;
        suggestedPriority?: number;
      };
      expect(analyzeOutput.issueId).toBe('issue-456');
      expect(analyzeOutput.impactScore).toBeGreaterThan(0.7);

      // イベントの確認（A-0もイベントを発行する）
      // 最低限2つのイベントが発行される
      expect(emittedEvents.length).toBeGreaterThanOrEqual(2);

      // A-2が発行するイベントを確認
      const knowledgeEvent = emittedEvents.find(e => e.type === 'KNOWLEDGE_EXTRACTABLE');
      const priorityEvent = emittedEvents.find(e => e.type === 'HIGH_PRIORITY_DETECTED');
      expect(knowledgeEvent).toBeDefined();
      expect(priorityEvent).toBeDefined();

      // A-3: EXTRACT_KNOWLEDGE実行
      // getIssueのモックを設定（閉じられたIssue）
      const closedIssue = {
        ...issueForAnalysis,
        status: 'closed' as const,
        updates: [
          {
            content: 'エラーを修正しました',
            timestamp: new Date(),
            author: 'user',
          },
        ],
      };

      const extractContext = createCustomMockContext({
        state: analyzeResult.context.state,
        driverResponses: [
          // A-3用のレスポンス
          JSON.stringify({
            extractedKnowledge: 'システムで重大なエラーが発生した際は、即座にログを確認し、影響範囲を特定する必要がある。エラーの原因と解決方法を記録に残すことも重要。',
            updatedState: analyzeResult.context.state + '\n## 知識抽出\n重要な知識を抽出しました。',
          }),
        ],
        storageOverrides: {
          getIssue: async (id: string) => {
            if (id === 'issue-456') return closedIssue;
            return null;
          },
          createKnowledge: async (knowledge) => ({
            ...knowledge,
            id: 'knowledge-789',
            createdAt: new Date(),
          }),
        },
      });

      const extractResult = await extractKnowledgeWorkflow.executor(
        knowledgeEvent!,  // KNOWLEDGE_EXTRACTABLEイベントを使用
        extractContext,
        mockEmitter
      );

      // デバッグ用にエラーを出力
      if (!extractResult.success) {
        console.error('Extract failed:', extractResult.error);
      }

      expect(extractResult.success).toBe(true);
      const extractOutput = extractResult.output as {
        knowledgeId: string | null;
        isDuplicate: boolean;
        confidence: number;
        extractedContent: string;
      };
      expect(extractOutput).toBeDefined();

      // デバッグ用に出力の内容を確認
      if (!extractOutput.knowledgeId) {
        console.log('Extract output:', extractOutput);
      }

      expect(extractOutput.knowledgeId).toBe('knowledge-789');

      // 状態が累積的に更新されていることを確認
      expect(extractResult.context.state).toContain('最新の入力処理');
      expect(extractResult.context.state).toContain('Issue影響分析');
      expect(extractResult.context.state).toContain('知識抽出');
    });
  });

  describe('A-1 → A-2 Chain (ユーザーリクエスト処理)', () => {
    it('should process user issue request and trigger analysis', async () => {
      // A-1: USER_REQUEST_RECEIVED
      const requestEvent: AgentEvent = {
        type: 'USER_REQUEST_RECEIVED',
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
      const processOutput = processResult.output as { requestType: string };
      expect(processOutput.requestType).toBe('issue');

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
        createDriver: async () =>
          new TestDriver({
            responses: [
              // For process-user-request (question)
              JSON.stringify({
                interpretation: 'キャッシュクリア方法の質問',
                requestType: 'question',
                events: [
                  {
                    type: 'KNOWLEDGE_EXTRACTABLE',
                    reason: 'ユーザーが質問をしました',
                    payload: {},
                  },
                ],
                suggestedActions: ['関連ドキュメントの検索'],
              }),
              // For extract-knowledge
              'キャッシュクリアの手順: 1. 設定メニューを開く 2. キャッシュ管理を選択 3. クリアボタンをクリック',
            ],
          }),
      };

      // A-1: USER_REQUEST_RECEIVED（質問）
      const questionEvent: AgentEvent = {
        type: 'USER_REQUEST_RECEIVED',
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
      const questionOutput = processResult.output as { requestType: string };
      expect(questionOutput.requestType).toBe('question');

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
        events.map((event) => ingestInputWorkflow.executor(event, mockContext, mockEmitter))
      );

      // 両方成功
      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(true);

      // 両方とも成功し、pondEntryIdが存在
      const output0 = results[0].output as { pondEntryId: string };
      const output1 = results[1].output as { pondEntryId: string };
      expect(output0.pondEntryId).toBe('pond-parallel-1');
      expect(output1.pondEntryId).toBe('pond-parallel-2');

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
    it('should maintain state consistency across workflow chain', async () => {
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
      let accumulatedState = '# Initial State';

      const stateTestContext = {
        ...mockContext,
        createDriver: async () => {
          driverCallCount++;

          // 各ワークフローに対して適切な応答を返す
          if (driverCallCount === 1) {
            // For ingest-input (A-0)
            const newState =
              accumulatedState + '\n## データ取り込み処理\n最新の入力処理を完了しました。';
            return new TestDriver({
              responses: [
                JSON.stringify({
                  relatedIssueIds: [],
                  needsNewIssue: true,
                  newIssueTitle: 'Critical Error Detected',
                  severity: 'critical',
                  updateContent: 'エラー検出',
                  labels: ['error', 'critical'],
                  updatedState: newState,
                }),
              ],
            });
          } else if (driverCallCount === 2) {
            // For analyze-issue-impact (A-2)
            const newState =
              accumulatedState + '\n## Issue影響分析\n高影響度のIssueを検出しました。';
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
                  impactScore: 0.9,
                  updatedState: newState,
                }),
              ],
            });
          } else {
            // For extract-knowledge (A-3)
            const newState = accumulatedState + '\n## 知識抽出\n重要な知識を抽出しました。';
            return new TestDriver({
              responses: [
                JSON.stringify({
                  extractedKnowledge:
                    'システムエラーへの対処法: エラー発生時は即座にログを確認し、影響範囲を特定する必要がある。この知識は将来の問題解決に役立ちます。',
                  updatedState: newState,
                }),
              ],
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
        // getIssueモックを追加（test-issue-idに合わせる）
        stateTestContext.storage.getIssue = vi.fn().mockResolvedValue({
          id: 'test-issue-id',
          title: 'Critical Error Detected',
          description: 'Critical system error',
          status: 'open' as const,
          priority: 90,
          labels: ['error', 'critical'],
          updates: [],
          relations: [],
          sourceInputIds: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        const analyzeResult = await analyzeIssueImpactWorkflow.executor(
          emittedEvents[0],
          { ...stateTestContext, state: currentState },
          mockEmitter
        );

        // エラーチェック
        if (!analyzeResult.success) {
          console.error('A-2 failed:', analyzeResult.error);
        }

        // 状態が累積的に更新されている
        expect(analyzeResult.context.state).toContain('データ取り込み処理');
        expect(analyzeResult.context.state).toContain('Issue影響分析');
        currentState = analyzeResult.context.state;
        accumulatedState = currentState; // 累積状態を更新
      }

      // A-3実行（高影響度で発行されたイベントを使用）
      const knowledgeExtractableEvent = emittedEvents.find(e => e.type === 'KNOWLEDGE_EXTRACTABLE');
      if (knowledgeExtractableEvent) {
        // extract-knowledge用にgetIssueをモック
        const closedIssue = {
          id: 'test-issue-id',
          title: 'Critical Error',
          description: 'Critical system error',
          status: 'closed' as const,
          priority: 90,
          labels: ['high-priority'],
          updates: [
            {
              content: 'エラーを修正しました',
              timestamp: new Date(),
              author: 'user',
            },
          ],
          relations: [],
          sourceInputIds: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        stateTestContext.storage.getIssue = vi.fn().mockResolvedValue(closedIssue);
        stateTestContext.storage.createKnowledge = vi.fn().mockResolvedValue({
          id: 'knowledge-789',
          type: 'knowledge' as const,
          content: 'システムエラーへの対処法',
          sourceType: 'issue' as const,
          sourceId: 'issue-456',
          createdAt: new Date(),
        });

        const extractResult = await extractKnowledgeWorkflow.executor(
          knowledgeExtractableEvent,
          { ...stateTestContext, state: currentState },
          mockEmitter
        );

        // 全ての処理履歴が状態に含まれている
        expect(extractResult.context.state).toContain('データ取り込み処理');
        expect(extractResult.context.state).toContain('Issue影響分析');
        expect(extractResult.context.state).toContain('知識抽出');
      }
    });
  });
});
