/**
 * B-3: UPDATE_FLOW_PRIORITIES ワークフローのテスト
 *
 * テスト方針：
 * - ユニットテスト：コードカバレッジ重視、TestDriverでモック
 * - AI駆動テスト：実際のAI品質確認、環境変数で制御
 */

import { describe, it, expect, beforeEach, beforeAll, vi } from 'vitest';
import type { SystemEvent, Issue } from '@sebas-chan/shared-types';
import { updateFlowPrioritiesWorkflow } from './index.js';
import { updateFlowPriorities } from './actions.js';
import {
  createCustomMockContext,
  createMockWorkflowEmitter,
  createMockFlow,
  createMockIssue,
} from '../test-utils.js';
import { setupAIServiceForTest, shouldSkipAITests } from '../test-ai-helper.js';
import type { WorkflowContextInterface } from '../context.js';
import { RecordType } from '../recorder.js';

describe('B-3: UPDATE_FLOW_PRIORITIES Workflow', () => {
  // ========================================
  // ユニットテスト（カバレッジ重視）
  // ========================================
  describe('Unit Tests', () => {
    let mockContext: WorkflowContextInterface;
    let mockEmitter: ReturnType<typeof createMockWorkflowEmitter>;

    beforeEach(() => {
      vi.clearAllMocks();
      mockEmitter = createMockWorkflowEmitter();
    });

    describe('ワークフロー実行', () => {
      it('正常系：Flowの優先度を更新できる', async () => {
        // 準備：テスト用のFlowとIssue
        const mockFlow = createMockFlow({
          id: 'flow-1',
          title: 'テストFlow',
          priorityScore: 0.5,
          updatedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), // 2日前
        });

        const mockIssue = createMockIssue({
          id: 'issue-1',
          title: '緊急タスク',
          priority: 90,
        });

        // カスタムコンテキストの作成
        mockContext = createCustomMockContext({
          state: '# 現在の状況\n\n重要なプロジェクトが進行中です。',
          driverResponses: [
            // analyzeIndividualFlow の応答
            JSON.stringify({
              absoluteImportance: 0.8,
              urgencyLevel: 'high',
              stalenessImpact: '適度な更新頻度',
              keyFactors: ['高優先度Issue', '2日前の更新'],
              needsUserAttention: false,
              analysisConfidence: 0.85,
            }),
            // calculateFlowPriorities の応答
            JSON.stringify({
              updates: [
                {
                  flowId: 'flow-1',
                  newPriority: 0.75,
                  mainFactor: '高優先度Issueを含む',
                  reasoning: 'Issueの重要度が高く、適度に更新されている',
                },
              ],
              overallAssessment: {
                confidence: 0.8,
                contextQuality: 'good',
              },
            }),
            // updateStateDocument の応答
            JSON.stringify({
              updatedState:
                '# 現在の状況\n\n優先度を更新しました。\n\n## 更新内容\n- flow-1: 0.50 → 0.75',
            }),
          ],
          storageOverrides: {
            searchFlows: vi.fn().mockResolvedValue([mockFlow]),
            getIssue: vi.fn().mockResolvedValue(mockIssue),
            updateFlow: vi.fn().mockResolvedValue({ ...mockFlow, priorityScore: 0.75 }),
          },
        });

        // 実行
        const event: SystemEvent = {
          type: 'SCHEDULE_TRIGGERED',
          payload: {
            issueId: 'issue-1',
            scheduleId: 'schedule-1',
            scheduledTime: new Date().toISOString(),
            action: 'reminder' as const,
          },
        };

        const result = await updateFlowPrioritiesWorkflow.executor(event, mockContext, mockEmitter);

        // 検証
        expect(result.success).toBe(true);
        expect(result.context.state).toContain('優先度を更新しました');
        expect(mockContext.storage.updateFlow).toHaveBeenCalledWith('flow-1', {
          priorityScore: 0.75,
        });
      });

      it('高優先度Flowを検出してイベントを発行する', async () => {
        const highPriorityFlow = createMockFlow({
          id: 'flow-high',
          title: '緊急Flow',
          priorityScore: 0.9,
        });

        mockContext = createCustomMockContext({
          driverResponses: [
            JSON.stringify({
              absoluteImportance: 0.9,
              urgencyLevel: 'critical',
              stalenessImpact: '即座の対応が必要',
              keyFactors: ['緊急度が高い'],
              needsUserAttention: true,
              analysisConfidence: 0.9,
            }),
            JSON.stringify({
              updates: [
                {
                  flowId: 'flow-high',
                  newPriority: 0.95,
                  mainFactor: '緊急対応が必要',
                  reasoning: '即座の対応が必要な状態',
                },
              ],
              overallAssessment: {
                confidence: 0.9,
                contextQuality: 'good',
              },
            }),
            JSON.stringify({
              updatedState: '# 緊急対応が必要',
            }),
          ],
          storageOverrides: {
            searchFlows: vi.fn().mockResolvedValue([highPriorityFlow]),
            getIssue: vi.fn().mockResolvedValue(null),
            updateFlow: vi.fn().mockResolvedValue({ ...highPriorityFlow, priorityScore: 0.95 }),
          },
        });

        const event: SystemEvent = {
          type: 'FLOW_STATUS_CHANGED',
          payload: {
            flowId: 'flow-high',
            oldStatus: 'active' as const,
            newStatus: 'completed' as const,
          },
        };

        await updateFlowPrioritiesWorkflow.executor(event, mockContext, mockEmitter);

        // HIGH_PRIORITY_FLOW_DETECTEDイベントが発行されることを確認
        expect(mockEmitter.emit).toHaveBeenCalledWith(
          expect.objectContaining({
            type: 'HIGH_PRIORITY_FLOW_DETECTED',
            payload: expect.objectContaining({
              flowId: 'flow-high',
              priority: 95, // 0.95 * 100
            }),
          })
        );
      });

      it('エラー時に適切にエラーを返す', async () => {
        const error = new Error('AI処理エラー');
        mockContext = createCustomMockContext({
          storageOverrides: {
            searchFlows: vi.fn().mockRejectedValue(error),
          },
        });

        // recorderのrecordメソッドをspyする
        vi.spyOn(mockContext.recorder, 'record');

        const event: SystemEvent = {
          type: 'SCHEDULE_TRIGGERED',
          payload: {
            issueId: 'issue-1',
            scheduleId: 'schedule-1',
            scheduledTime: new Date().toISOString(),
            action: 'reminder' as const,
          },
        };

        const result = await updateFlowPrioritiesWorkflow.executor(event, mockContext, mockEmitter);

        expect(result.success).toBe(false);
        expect(result.error).toBe(error);
        expect(mockContext.recorder.record).toHaveBeenCalledWith(
          RecordType.ERROR,
          expect.any(Object)
        );
      });
    });

    describe('停滞チェック機能', () => {
      it('1日経過したFlowは「active_check」状態', async () => {
        const flow = createMockFlow({
          updatedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
        });

        mockContext = createCustomMockContext({
          driverResponses: [
            JSON.stringify({
              absoluteImportance: 0.5,
              urgencyLevel: 'medium',
              stalenessImpact: '正常な更新頻度',
              keyFactors: ['1日前の更新'],
              needsUserAttention: false,
              analysisConfidence: 0.8,
            }),
            JSON.stringify({
              updates: [],
              overallAssessment: { confidence: 0.8, contextQuality: 'good' },
            }),
            JSON.stringify({ updatedState: 'Updated' }),
          ],
          storageOverrides: {
            searchFlows: vi.fn().mockResolvedValue([flow]),
            getIssue: vi.fn().mockResolvedValue(null),
          },
        });

        const event: SystemEvent = {
          type: 'SCHEDULE_TRIGGERED',
          payload: {
            issueId: 'issue-1',
            scheduleId: 'schedule-1',
            scheduledTime: new Date().toISOString(),
            action: 'reminder' as const,
          },
        };
        const result = await updateFlowPrioritiesWorkflow.executor(event, mockContext, mockEmitter);

        expect(result.success).toBe(true);
        // 1日程度なら特別な確認は不要
      });

      it('7日経過したFlowは「stale」判定され確認メッセージが生成される', async () => {
        const staleFlow = createMockFlow({
          id: 'stale-flow',
          title: '停滞Flow',
          updatedAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
        });

        mockContext = createCustomMockContext({
          driverResponses: [
            JSON.stringify({
              absoluteImportance: 0.4,
              urgencyLevel: 'low',
              stalenessImpact: '停滞している可能性',
              keyFactors: ['7日間更新なし'],
              needsUserAttention: true,
              analysisConfidence: 0.7,
            }),
            JSON.stringify({
              updates: [
                {
                  flowId: 'stale-flow',
                  newPriority: 0.3,
                  mainFactor: '長期間更新なし',
                  reasoning: '停滞の可能性があるため優先度を下げる',
                  userQuery: {
                    type: 'confirm_stale',
                    message: '「停滞Flow」は7日間更新されていません。まだ進行中ですか？',
                  },
                },
              ],
              overallAssessment: { confidence: 0.7, contextQuality: 'partial' },
            }),
            JSON.stringify({
              updatedState:
                '# 現在の状況\n\n## ユーザーへの確認事項\n- 「停滞Flow」は7日間更新されていません',
            }),
          ],
          storageOverrides: {
            searchFlows: vi.fn().mockResolvedValue([staleFlow]),
            getIssue: vi.fn().mockResolvedValue(null),
            updateFlow: vi.fn().mockResolvedValue({ ...staleFlow, priorityScore: 0.3 }),
          },
        });

        const event: SystemEvent = {
          type: 'SCHEDULE_TRIGGERED',
          payload: {
            issueId: 'issue-1',
            scheduleId: 'schedule-1',
            scheduledTime: new Date().toISOString(),
            action: 'reminder' as const,
          },
        };
        const result = await updateFlowPrioritiesWorkflow.executor(event, mockContext, mockEmitter);

        expect(result.success).toBe(true);
        expect(result.context.state).toContain('ユーザーへの確認事項');
      });

      it('14日以上経過したFlowは「abandoned」判定される', async () => {
        const abandonedFlow = createMockFlow({
          id: 'abandoned-flow',
          title: '放置Flow',
          updatedAt: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000),
        });

        mockContext = createCustomMockContext({
          driverResponses: [
            JSON.stringify({
              absoluteImportance: 0.2,
              urgencyLevel: 'low',
              stalenessImpact: '放置されている可能性が高い',
              keyFactors: ['14日間更新なし'],
              needsUserAttention: true,
              analysisConfidence: 0.6,
            }),
            JSON.stringify({
              updates: [
                {
                  flowId: 'abandoned-flow',
                  newPriority: 0.1,
                  mainFactor: '長期間放置',
                  reasoning: '2週間以上更新がないため、クローズを検討',
                  userQuery: {
                    type: 'confirm_stale',
                    message:
                      '「放置Flow」は14日間更新されていません。まだ必要ですか？クローズしますか？',
                  },
                },
              ],
              overallAssessment: { confidence: 0.6, contextQuality: 'poor' },
            }),
            JSON.stringify({
              updatedState: '# 現在の状況\n\n## ユーザーへの確認事項\n- クローズを検討',
            }),
          ],
          storageOverrides: {
            searchFlows: vi.fn().mockResolvedValue([abandonedFlow]),
            getIssue: vi.fn().mockResolvedValue(null),
            updateFlow: vi.fn().mockResolvedValue({ ...abandonedFlow, priorityScore: 0.1 }),
          },
        });

        const event: SystemEvent = {
          type: 'SCHEDULE_TRIGGERED',
          payload: {
            issueId: 'issue-1',
            scheduleId: 'schedule-1',
            scheduledTime: new Date().toISOString(),
            action: 'reminder' as const,
          },
        };
        const result = await updateFlowPrioritiesWorkflow.executor(event, mockContext, mockEmitter);

        expect(result.success).toBe(true);
        expect(result.context.state).toContain('クローズを検討');
      });
    });

    describe('複数Flowの処理', () => {
      it('複数のFlowを同時に処理できる', async () => {
        const flows = [
          createMockFlow({ id: 'flow-1', priorityScore: 0.3 }),
          createMockFlow({ id: 'flow-2', priorityScore: 0.5 }),
          createMockFlow({ id: 'flow-3', priorityScore: 0.7 }),
        ];

        mockContext = createCustomMockContext({
          driverResponses: [
            // 各Flowの個別分析（3回）
            JSON.stringify({
              absoluteImportance: 0.3,
              urgencyLevel: 'low',
              stalenessImpact: '通常',
              keyFactors: [],
              needsUserAttention: false,
              analysisConfidence: 0.8,
            }),
            JSON.stringify({
              absoluteImportance: 0.5,
              urgencyLevel: 'medium',
              stalenessImpact: '通常',
              keyFactors: [],
              needsUserAttention: false,
              analysisConfidence: 0.8,
            }),
            JSON.stringify({
              absoluteImportance: 0.7,
              urgencyLevel: 'high',
              stalenessImpact: '通常',
              keyFactors: [],
              needsUserAttention: false,
              analysisConfidence: 0.8,
            }),
            // 全体の優先度計算
            JSON.stringify({
              updates: [
                {
                  flowId: 'flow-1',
                  newPriority: 0.2,
                  mainFactor: '低優先度',
                  reasoning: '他と比較して低い',
                },
                { flowId: 'flow-2', newPriority: 0.5, mainFactor: '中優先度', reasoning: '平均的' },
                {
                  flowId: 'flow-3',
                  newPriority: 0.8,
                  mainFactor: '高優先度',
                  reasoning: '最も重要',
                },
              ],
              overallAssessment: { confidence: 0.8, contextQuality: 'good' },
            }),
            // state更新
            JSON.stringify({ updatedState: '# 優先度更新完了' }),
          ],
          storageOverrides: {
            searchFlows: vi.fn().mockResolvedValue(flows),
            getIssue: vi.fn().mockResolvedValue(null),
            updateFlow: vi.fn().mockImplementation((id, update) => {
              const flow = flows.find((f) => f.id === id);
              return Promise.resolve({ ...flow, ...update });
            }),
          },
        });

        const event: SystemEvent = {
          type: 'SCHEDULE_TRIGGERED',
          payload: {
            issueId: 'issue-1',
            scheduleId: 'schedule-1',
            scheduledTime: new Date().toISOString(),
            action: 'reminder' as const,
          },
        };
        const result = await updateFlowPrioritiesWorkflow.executor(event, mockContext, mockEmitter);

        expect(result.success).toBe(true);
        expect(mockContext.storage.updateFlow).toHaveBeenCalledTimes(3);
      });
    });

    describe('エッジケース', () => {
      it('Flowが0個の場合でもエラーにならない', async () => {
        const updateFlowMock = vi.fn();
        mockContext = createCustomMockContext({
          driverResponses: [
            JSON.stringify({
              updates: [],
              overallAssessment: { confidence: 1.0, contextQuality: 'good' },
            }),
            JSON.stringify({ updatedState: '# Flowなし' }),
          ],
          storageOverrides: {
            searchFlows: vi.fn().mockResolvedValue([]),
            updateFlow: updateFlowMock, // mockをセット
          },
        });

        const event: SystemEvent = {
          type: 'SCHEDULE_TRIGGERED',
          payload: {
            issueId: 'issue-1',
            scheduleId: 'schedule-1',
            scheduledTime: new Date().toISOString(),
            action: 'reminder' as const,
          },
        };
        const result = await updateFlowPrioritiesWorkflow.executor(event, mockContext, mockEmitter);

        expect(result.success).toBe(true);
        expect(updateFlowMock).not.toHaveBeenCalled();
      });

      it('state文書が空でも動作する', async () => {
        const flow = createMockFlow();
        mockContext = createCustomMockContext({
          state: '', // 空のstate
          driverResponses: [
            JSON.stringify({
              absoluteImportance: 0.5,
              urgencyLevel: 'medium',
              stalenessImpact: '通常',
              keyFactors: [],
              needsUserAttention: false,
              analysisConfidence: 0.5,
            }),
            JSON.stringify({
              updates: [
                {
                  flowId: flow.id,
                  newPriority: 0.5,
                  mainFactor: '情報不足',
                  reasoning: 'コンテキストなし',
                },
              ],
              overallAssessment: { confidence: 0.5, contextQuality: 'poor' },
            }),
            JSON.stringify({ updatedState: '# 初期状態' }),
          ],
          storageOverrides: {
            searchFlows: vi.fn().mockResolvedValue([flow]),
            getIssue: vi.fn().mockResolvedValue(null),
            updateFlow: vi.fn().mockResolvedValue(flow),
          },
        });

        const event: SystemEvent = {
          type: 'SCHEDULE_TRIGGERED',
          payload: {
            issueId: 'issue-1',
            scheduleId: 'schedule-1',
            scheduledTime: new Date().toISOString(),
            action: 'reminder' as const,
          },
        };
        const result = await updateFlowPrioritiesWorkflow.executor(event, mockContext, mockEmitter);

        expect(result.success).toBe(true);
      });
    });
  });

  // ========================================
  // AI駆動テスト（実際のAI品質確認）
  // ========================================
  describe.skipIf(shouldSkipAITests)('AI Tests', () => {
    let aiService: Awaited<ReturnType<typeof setupAIServiceForTest>>;

    beforeAll(async () => {
      aiService = await setupAIServiceForTest();
    });

    it('実際のAIで優先度判定の品質を確認', async () => {
      if (!aiService) {
        console.log('AIService not available, skipping test');
        return;
      }

      const driver = await aiService.createDriverFromCapabilities(['structured'], {
        lenient: true,
      });

      if (!driver) {
        console.log('Driver creation failed');
        return;
      }

      // テスト用のFlowデータ
      const flows = [
        createMockFlow({
          id: 'urgent-flow',
          title: '締切が明日のプレゼン準備',
          description: '重要な顧客向けプレゼンテーション',
          priorityScore: 0.5,
          updatedAt: new Date(),
        }),
        createMockFlow({
          id: 'stale-flow',
          title: '検討中の改善案',
          description: '将来的な改善提案',
          priorityScore: 0.5,
          updatedAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
        }),
      ];

      const issuesByFlow = new Map<string, Issue[]>([
        [
          'urgent-flow',
          [
            createMockIssue({
              title: 'スライド作成',
              priority: 90,
            }),
          ],
        ],
        ['stale-flow', []],
      ]);

      const stateDocument =
        '# 現在の状況\n\n明日重要な顧客プレゼンがあります。準備を急ぐ必要があります。';

      // 実際のAIで優先度更新を実行
      const updatedState = await updateFlowPriorities(
        driver,
        flows,
        issuesByFlow,
        stateDocument,
        {
          storage: {
            updateFlow: vi.fn().mockResolvedValue(flows[0]),
          },
        } as unknown as WorkflowContextInterface,
        createMockWorkflowEmitter()
      );

      // AI出力の構造的妥当性を検証
      expect(updatedState).toBeDefined();
      expect(typeof updatedState).toBe('string');
      expect(updatedState.length).toBeGreaterThan(0);

      // 意味的な整合性の検証
      // - 緊急のFlowについて言及があるか
      // - 停滞しているFlowについて適切な判断がされているか
      expect(updatedState.toLowerCase()).toMatch(/プレゼン|urgent|緊急|優先/);
    });

    it('停滞Flowに対する適切な確認メッセージ生成を確認', async () => {
      if (!aiService) {
        console.log('AIService not available, skipping test');
        return;
      }

      const driver = await aiService.createDriverFromCapabilities(['structured'], {
        lenient: true,
      });

      if (!driver) {
        console.log('Driver creation failed');
        return;
      }

      const abandonedFlow = createMockFlow({
        id: 'abandoned-project',
        title: '古いプロジェクト',
        description: '以前検討していたが進展がない',
        priorityScore: 0.3,
        updatedAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 30日前
      });

      const issuesByFlow = new Map<string, Issue[]>([['abandoned-project', []]]);

      const stateDocument = '# 現在の状況\n\n新しいプロジェクトに集中しています。';

      const updatedState = await updateFlowPriorities(
        driver,
        [abandonedFlow],
        issuesByFlow,
        stateDocument,
        {
          storage: {
            updateFlow: vi.fn(),
          },
        } as unknown as WorkflowContextInterface,
        createMockWorkflowEmitter()
      );

      // 停滞に関する適切な判断がされているか
      expect(updatedState).toMatch(/確認|停滞|更新されていない|クローズ/);
    });

    it('複数Flowの相対的な優先順位付けを確認', async () => {
      if (!aiService) {
        console.log('AIService not available, skipping test');
        return;
      }

      const driver = await aiService.createDriverFromCapabilities(['structured'], {
        lenient: true,
      });

      if (!driver) {
        console.log('Driver creation failed');
        return;
      }

      const flows = [
        createMockFlow({
          id: 'flow-a',
          title: 'バグ修正',
          description: 'クリティカルなバグの修正',
          priorityScore: 0.5,
        }),
        createMockFlow({
          id: 'flow-b',
          title: '機能追加',
          description: '新機能の実装',
          priorityScore: 0.5,
        }),
        createMockFlow({
          id: 'flow-c',
          title: 'ドキュメント更新',
          description: 'README の更新',
          priorityScore: 0.5,
        }),
      ];

      const issuesByFlow = new Map<string, Issue[]>([
        ['flow-a', [createMockIssue({ priority: 90, title: 'システムダウンのバグ' })]],
        ['flow-b', [createMockIssue({ priority: 50, title: '便利機能' })]],
        ['flow-c', []],
      ]);

      const stateDocument = '# 現在の状況\n\nシステムの安定性を最優先に考えています。';

      const updatedState = await updateFlowPriorities(
        driver,
        flows,
        issuesByFlow,
        stateDocument,
        {
          storage: {
            updateFlow: vi.fn(),
          },
        } as unknown as WorkflowContextInterface,
        createMockWorkflowEmitter()
      );

      // 優先順位に関する言及があるか
      expect(updatedState).toMatch(/優先|重要|最初に|バグ|修正/);
    });
  });
});
