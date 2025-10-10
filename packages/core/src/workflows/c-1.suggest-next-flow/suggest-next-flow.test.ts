/**
 * C-1: SUGGEST_NEXT_FLOW ワークフローのテスト
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { suggestNextFlowWorkflow } from './index.js';
import type { Flow, SystemEvent } from '@sebas-chan/shared-types';
import type { FlowSuggestionResult } from './actions.js';
import {
  createCustomMockContext,
  createMockWorkflowEmitter,
  createMockWorkflowRecorder,
} from '../test-utils.js';
import { RecordType } from '../recorder.js';

// 出力の型定義
interface SuggestNextFlowOutput {
  primarySuggestion?: FlowSuggestionResult['suggestions'][0];
  alternatives?: FlowSuggestionResult['suggestions'];
  insights?: FlowSuggestionResult['contextInsights'];
  fallback?: FlowSuggestionResult['fallbackSuggestion'];
  message?: string;
}

describe('C-1: SuggestNextFlow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('正常系', () => {
    it('アクティブなFlowから次のFlowを提案できる', async () => {
      const mockFlows: Flow[] = [
        {
          id: 'flow-1',
          title: 'Daily Review',
          description: '日次レビュー',
          status: 'active',
          priorityScore: 80,
          issueIds: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 'flow-2',
          title: 'Weekly Planning',
          description: '週次計画',
          status: 'active',
          priorityScore: 70,
          issueIds: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      const mockRecorder = createMockWorkflowRecorder();
      const mockContext = createCustomMockContext({
        driverResponses: [
          JSON.stringify({
            suggestions: [
              {
                flowId: 'flow-1',
                score: 0.9,
                reason: '現在の時間帯と作業パターンに最適',
                estimatedTime: 30,
                prerequisites: [],
              },
              {
                flowId: 'flow-2',
                score: 0.7,
                reason: '明日の準備として推奨',
                estimatedTime: 45,
                prerequisites: [],
              },
            ],
            contextInsights: {
              currentFocus: 'morning routine',
              productivityAdvice: '高エネルギー状態で効率的に作業',
              bottleneck: undefined,
            },
            fallbackSuggestion: null,
            updatedState: 'Flow suggestions generated',
          }),
        ],
        storageOverrides: {
          searchFlows: vi.fn().mockResolvedValue(mockFlows),
          getFlow: vi.fn().mockImplementation(async (id: string) => {
            return mockFlows.find((f) => f.id === id) || null;
          }),
        },
      });
      mockContext.recorder = mockRecorder;

      const mockEmitter = createMockWorkflowEmitter();

      const event: SystemEvent = {
        type: 'FLOW_STATUS_CHANGED',
        payload: {
          flowId: 'flow-0',
          oldStatus: 'active' as const,
          newStatus: 'completed' as const,
        },
      };

      const result = await suggestNextFlowWorkflow.executor(event, mockContext, mockEmitter);

      // 基本的な成功確認
      expect(result.success).toBe(true);
      expect(result.output).toBeDefined();

      // 提案の構造確認
      const output = result.output as SuggestNextFlowOutput;
      expect(output.primarySuggestion).toBeDefined();
      expect(output.primarySuggestion?.flowId).toBe('flow-1');
      expect(output.primarySuggestion?.score).toBe(0.9);

      // 代替案の確認
      expect(output.alternatives).toHaveLength(1);
      expect(output.alternatives?.[0]?.flowId).toBe('flow-2');

      // インサイトの確認
      expect(output.insights).toBeDefined();
      expect(output.insights?.currentFocus).toBe('morning routine');
      expect(output.insights?.productivityAdvice).toContain('高エネルギー');

      // 高スコアによるイベント発行の確認
      expect(mockEmitter.emit).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'PERSPECTIVE_TRIGGERED',
          payload: expect.objectContaining({
            flowId: 'flow-1',
          }),
        })
      );

      // レコーダーの呼び出し確認
      expect(mockRecorder.record).toHaveBeenCalledWith(
        RecordType.INFO,
        expect.objectContaining({
          workflowName: 'SuggestNextFlow',
        })
      );
    });

    it('朝のルーチン時に適切な提案を生成できる', async () => {
      const mockRecorder = createMockWorkflowRecorder();
      const mockContext = createCustomMockContext({
        driverResponses: [
          JSON.stringify({
            suggestions: [
              {
                flowId: 'morning-review',
                score: 0.95,
                reason: '朝のルーチンとして最適',
                matchFactors: [
                  {
                    factor: 'time_fit',
                    score: 0.9,
                    description: '朝の時間帯に最適',
                  },
                ],
                estimatedDuration: 15,
                energyRequired: 'medium',
                estimatedTime: 15,
                prerequisites: [],
              },
            ],
            contextInsights: {
              currentFocus: '朝のルーチン',
              productivityAdvice: '朝の時間を有効活用',
              workingHours: true,
              timeOfDay: 'morning',
            },
            fallbackSuggestion: null,
            updatedState: 'Morning routine suggestion',
          }),
        ],
        storageOverrides: {
          searchFlows: vi.fn().mockResolvedValue([
            {
              id: 'morning-review',
              title: 'Morning Review',
              status: 'active',
              issueIds: [],
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          ]),
          getFlow: vi.fn().mockResolvedValue({
            id: 'morning-review',
            title: 'Morning Review',
            description: '朝のレビュー',
            status: 'active',
            issueIds: [],
            createdAt: new Date(),
            updatedAt: new Date(),
          }),
        },
      });
      mockContext.recorder = mockRecorder;

      const mockEmitter = createMockWorkflowEmitter();

      const event: SystemEvent = {
        type: 'SCHEDULE_TRIGGERED',
        payload: {
          issueId: 'issue-1',
          scheduleId: 'schedule-1',
          scheduledTime: '2024-01-01T09:00:00Z',
          action: 'reminder',
        },
      };

      const result = await suggestNextFlowWorkflow.executor(event, mockContext, mockEmitter);

      // デバッグ: エラー内容を確認
      if (!result.success) {
        console.error('Test failed with error:', result.error);
      }

      expect(result.success).toBe(true);
      const output = result.output as SuggestNextFlowOutput;
      expect(output.primarySuggestion?.flowId).toBe('morning-review');
      expect(output.primarySuggestion?.score).toBeGreaterThan(0.9);
    });

    it('ユーザーコンテキストを考慮した提案ができる', async () => {
      const mockRecorder = createMockWorkflowRecorder();
      const mockContext = createCustomMockContext({
        driverResponses: [
          JSON.stringify({
            suggestions: [
              {
                flowId: 'quick-task',
                score: 0.85,
                reason: '低エネルギー状態に適した短時間タスク',
                matchFactors: [
                  {
                    factor: 'energy_match',
                    score: 0.9,
                    description: '低エネルギーに適合',
                  },
                ],
                estimatedDuration: 10,
                energyRequired: 'low',
                estimatedTime: 10,
                prerequisites: [],
              },
            ],
            contextInsights: {
              currentFocus: '軽作業',
              productivityAdvice: '無理せず短時間で',
              energyConsideration: 'low energy detected',
            },
            fallbackSuggestion: {
              action: 'take_break',
              reason: 'Rest is also an option',
              duration: 15,
            },
            updatedState: 'Low energy suggestions',
          }),
        ],
        storageOverrides: {
          searchFlows: vi.fn().mockResolvedValue([
            {
              id: 'quick-task',
              title: 'Quick Task',
              status: 'active',
              issueIds: [],
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          ]),
        },
      });
      mockContext.recorder = mockRecorder;

      const mockEmitter = createMockWorkflowEmitter();

      const event: SystemEvent = {
        type: 'USER_REQUEST_RECEIVED',
        payload: {
          userId: 'user-1',
          content: 'Next flow suggestion with low energy',
          timestamp: new Date().toISOString(),
        },
      };

      const result = await suggestNextFlowWorkflow.executor(event, mockContext, mockEmitter);

      expect(result.success).toBe(true);
      const output = result.output as SuggestNextFlowOutput;
      expect(output.primarySuggestion?.reason).toContain('短時間タスク');
      expect(output.fallback).toBeDefined();
    });
  });

  describe('エッジケース', () => {
    it('アクティブなFlowがない場合は適切なメッセージを返す', async () => {
      const mockRecorder = createMockWorkflowRecorder();
      const mockContext = createCustomMockContext({
        storageOverrides: {
          searchFlows: vi.fn().mockResolvedValue([]),
        },
      });
      mockContext.recorder = mockRecorder;

      const mockEmitter = createMockWorkflowEmitter();

      const event: SystemEvent = {
        type: 'USER_REQUEST_RECEIVED',
        payload: {
          userId: 'user-1',
          content: 'Test request',
          timestamp: new Date().toISOString(),
        },
      };

      const result = await suggestNextFlowWorkflow.executor(event, mockContext, mockEmitter);

      expect(result.success).toBe(true);
      expect(result.output).toEqual({
        message: 'No active flows to suggest',
      });
      expect(mockEmitter.emit).not.toHaveBeenCalled();
    });

    it('Flow取得に失敗しても処理を継続できる', async () => {
      const mockRecorder = createMockWorkflowRecorder();
      const mockContext = createCustomMockContext({
        driverResponses: [
          JSON.stringify({
            suggestions: [
              {
                flowId: 'flow-1',
                score: 0.85,
                reason: 'Best available option',
                matchFactors: [
                  {
                    factor: 'priority',
                    score: 0.8,
                    description: '優先度考慮',
                  },
                ],
                estimatedDuration: 30,
                energyRequired: 'medium',
              },
            ],
            contextInsights: {
              currentFocus: '一般タスク',
              productivityAdvice: '継続的な作業',
            },
            fallbackSuggestion: null,
            updatedState: 'Processed with missing flow',
          }),
        ],
        storageOverrides: {
          searchFlows: vi.fn().mockResolvedValue([
            {
              id: 'flow-1',
              status: 'active',
              title: 'Flow 1',
              description: 'Description',
              issueIds: [],
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          ]),
          getFlow: vi.fn().mockResolvedValue(null), // Flow取得失敗
        },
      });
      mockContext.recorder = mockRecorder;

      const mockEmitter = createMockWorkflowEmitter();

      const event: SystemEvent = {
        type: 'FLOW_STATUS_CHANGED',
        payload: {
          flowId: 'non-existent',
          oldStatus: 'active' as const,
          newStatus: 'completed' as const,
        },
      };

      const result = await suggestNextFlowWorkflow.executor(event, mockContext, mockEmitter);

      expect(result.success).toBe(true);
      // Flow取得失敗のためPERSPECTIVE_TRIGGEREDイベントは発行されない
      expect(mockEmitter.emit).not.toHaveBeenCalled();
    });

    it('制約条件を考慮した提案ができる', async () => {
      const mockRecorder = createMockWorkflowRecorder();
      const mockContext = createCustomMockContext({
        driverResponses: [
          JSON.stringify({
            suggestions: [
              {
                flowId: 'flow-3',
                score: 0.8,
                reason: 'Matches constraints',
                matchFactors: [
                  {
                    factor: 'priority',
                    score: 0.75,
                    description: '制約に適合',
                  },
                ],
                estimatedDuration: 45,
                energyRequired: 'medium',
              },
            ],
            contextInsights: {
              currentFocus: '制約適用タスク',
              productivityAdvice: '制約内での最適化',
              constraintsApplied: true,
            },
            fallbackSuggestion: null,
            updatedState: 'Constrained suggestions',
          }),
        ],
        storageOverrides: {
          searchFlows: vi.fn().mockResolvedValue([
            {
              id: 'flow-1',
              status: 'active',
              title: 'Flow 1',
              description: 'Description 1',
              issueIds: [],
              createdAt: new Date(),
              updatedAt: new Date(),
            },
            {
              id: 'flow-2',
              status: 'active',
              title: 'Flow 2',
              description: 'Description 2',
              issueIds: [],
              createdAt: new Date(),
              updatedAt: new Date(),
            },
            {
              id: 'flow-3',
              status: 'active',
              title: 'Flow 3',
              description: 'Description 3',
              issueIds: [],
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          ]),
        },
      });
      mockContext.recorder = mockRecorder;

      const mockEmitter = createMockWorkflowEmitter();

      const event: SystemEvent = {
        type: 'USER_REQUEST_RECEIVED',
        payload: {
          userId: 'user-1',
          content: 'Context switch with constraints',
          timestamp: new Date().toISOString(),
        },
      };

      const result = await suggestNextFlowWorkflow.executor(event, mockContext, mockEmitter);

      expect(result.success).toBe(true);
      const output = result.output as SuggestNextFlowOutput;
      expect(output.primarySuggestion?.flowId).toBe('flow-3');
    });
  });

  describe('エラーハンドリング', () => {
    it('ストレージエラーを適切に処理できる', async () => {
      const error = new Error('Storage connection failed');
      const mockRecorder = createMockWorkflowRecorder();
      const mockContext = createCustomMockContext({
        storageOverrides: {
          searchFlows: vi.fn().mockRejectedValue(error),
        },
      });
      mockContext.recorder = mockRecorder;

      const mockEmitter = createMockWorkflowEmitter();

      const event: SystemEvent = {
        type: 'USER_REQUEST_RECEIVED',
        payload: {
          userId: 'user-1',
          content: 'Test request',
          timestamp: new Date().toISOString(),
        },
      };

      const result = await suggestNextFlowWorkflow.executor(event, mockContext, mockEmitter);

      expect(result.success).toBe(false);
      expect(result.error).toBe(error);
      expect(mockRecorder.record).toHaveBeenCalledWith(
        RecordType.ERROR,
        expect.objectContaining({
          error: 'Storage connection failed',
        })
      );
    });

    it('AIドライバーエラーを適切に処理できる', async () => {
      const error = new Error('AI service unavailable');
      const mockRecorder = createMockWorkflowRecorder();
      const mockContext = createCustomMockContext({
        storageOverrides: {
          searchFlows: vi.fn().mockResolvedValue([
            {
              id: 'flow-1',
              status: 'active',
              title: 'Flow 1',
              description: 'Description',
              issueIds: [],
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          ]),
        },
      });
      mockContext.recorder = mockRecorder;

      // AIドライバーのエラーをシミュレート
      mockContext.createDriver = async () => {
        throw error;
      };

      const mockEmitter = createMockWorkflowEmitter();

      const event: SystemEvent = {
        type: 'USER_REQUEST_RECEIVED',
        payload: {
          userId: 'user-1',
          content: 'Test request',
          timestamp: new Date().toISOString(),
        },
      };

      const result = await suggestNextFlowWorkflow.executor(event, mockContext, mockEmitter);

      expect(result.success).toBe(false);
      expect(result.error).toBe(error);
      expect(mockRecorder.record).toHaveBeenCalledWith(
        RecordType.ERROR,
        expect.objectContaining({
          error: 'AI service unavailable',
        })
      );
    });
  });

  describe('トリガー条件', () => {
    it('FLOW_STATUS_CHANGEDイベントで起動する', () => {
      const event: SystemEvent = {
        type: 'FLOW_STATUS_CHANGED',
        payload: {
          flowId: 'flow-1',
          oldStatus: 'active' as const,
          newStatus: 'completed' as const,
        },
      };

      const canTrigger = suggestNextFlowWorkflow.triggers.condition?.(event);
      expect(canTrigger).toBe(true);
      expect(suggestNextFlowWorkflow.triggers.eventTypes).toContain('FLOW_STATUS_CHANGED');
    });

    it('SCHEDULE_TRIGGEREDイベントで起動する', () => {
      const event: SystemEvent = {
        type: 'SCHEDULE_TRIGGERED',
        payload: {
          issueId: 'issue-1',
          scheduleId: 'schedule-1',
          scheduledTime: new Date().toISOString(),
          action: 'reminder' as const,
        },
      };

      const canTrigger = suggestNextFlowWorkflow.triggers.condition?.(event);
      expect(canTrigger).toBe(true);
      expect(suggestNextFlowWorkflow.triggers.eventTypes).toContain('SCHEDULE_TRIGGERED');
    });

    it('優先度が適切に設定されている', () => {
      expect(suggestNextFlowWorkflow.triggers.priority).toBe(25);
    });
  });
});
