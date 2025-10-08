/**
 * C-2: SUGGEST_NEXT_ACTION_FOR_ISSUE ワークフローのテスト
 */

import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { suggestNextActionWorkflow } from './index.js';
import type { SystemEvent, Issue, Knowledge, Flow } from '@sebas-chan/shared-types';
import { createCustomMockContext, createMockWorkflowEmitter, createMockIssue, createMockKnowledge, createMockWorkflowRecorder } from '../test-utils.js';
import { RecordType } from '../recorder.js';

describe('C-2: SuggestNextActionForIssue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('正常系', () => {
    it('Issueに対して適切なアクションを提案できる', async () => {
      const mockIssue = createMockIssue({
        id: 'issue-1',
        title: 'Performance issue',
        description: 'Application is running slowly',
        status: 'open',
        priority: 80,
      });

      const mockKnowledge = [
        createMockKnowledge({
          id: 'knowledge-1',
          content: 'Performance optimization techniques',
        }),
      ];

      const mockRecorder = createMockWorkflowRecorder();
      const mockContext = createCustomMockContext({
        driverResponses: [
          JSON.stringify({
            actions: [
              {
                title: 'Profile the application',
                type: 'investigation',
                description: 'Use profiling tools to identify bottlenecks',
                steps: [
                  'Install profiling tools',
                  'Run the profiler',
                  'Analyze results',
                ],
                estimatedTotalTime: 60,
                confidence: 0.9,
                prerequisites: ['Access to production environment'],
              },
              {
                title: 'Check recent changes',
                type: 'analysis',
                description: 'Review recent commits for potential causes',
                steps: ['Check git log', 'Review PRs'],
                estimatedTotalTime: 30,
                confidence: 0.8,
                prerequisites: [],
              },
            ],
            rootCauseAnalysis: {
              identified: true,
              description: 'Likely database query optimization needed',
              confidence: 0.75,
            },
            splitSuggestion: null,
            escalationSuggestion: null,
            updatedState: 'Action suggestions generated',
          }),
        ],
        storageOverrides: {
          getIssue: vi.fn().mockResolvedValue(mockIssue),
          searchKnowledge: vi.fn().mockResolvedValue(mockKnowledge),
          searchIssues: vi.fn().mockResolvedValue([]),
          getFlow: vi.fn().mockResolvedValue(null),
        },
      });
      mockContext.recorder = mockRecorder;

      const mockEmitter = createMockWorkflowEmitter();

      const event: SystemEvent = {
        type: 'HIGH_PRIORITY_ISSUE_DETECTED',
        payload: {
          issueId: 'issue-1',
          trigger: 'requested',
        },
      };

      const result = await suggestNextActionWorkflow.executor(event, mockContext, mockEmitter);

      // 基本的な成功確認
      expect(result.success).toBe(true);
      expect(result.output).toBeDefined();

      // 主要アクションの確認
      const output = result.output as any;
      expect(output.primaryAction).toBeDefined();
      expect(output.primaryAction.title).toBe('Profile the application');
      expect(output.primaryAction.type).toBe('investigation');
      expect(output.primaryAction.steps).toHaveLength(3);
      expect(output.primaryAction.confidence).toBe(0.9);

      // 代替アクションの確認
      expect(output.alternativeActions).toHaveLength(1);
      expect(output.alternativeActions[0].title).toBe('Check recent changes');

      // インサイトの確認
      expect(output.insights).toBeDefined();
      expect(output.insights.rootCause).toBeDefined();
      expect(output.insights.rootCause.identified).toBe(true);

      // レコーダーの呼び出し確認
      expect(mockRecorder.record).toHaveBeenCalledWith(
        RecordType.AI_CALL,
        expect.objectContaining({
          purpose: 'suggest_issue_actions',
          actionsCount: 2,
        })
      );
    });

    it('停滞しているIssueに対して分割提案ができる', async () => {
      const mockRecorder = createMockWorkflowRecorder();
      const mockIssue = createMockIssue({
        id: 'stalled-issue',
        title: 'Complex refactoring task',
        description: 'Large scale refactoring needed',
        updatedAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // 7日前
      });

      const mockContext = createCustomMockContext({
        driverResponses: [
          JSON.stringify({
            actions: [
              {
                title: 'Break down the task',
                type: 'planning',
                description: 'Split into smaller subtasks',
                steps: ['Identify modules', 'Create subtasks', 'Prioritize'],
                estimatedTotalTime: 120,
                confidence: 0.85,
                prerequisites: [],
              },
            ],
            rootCauseAnalysis: {
              identified: true,
              description: 'Task too large to tackle at once',
              confidence: 0.9,
            },
            splitSuggestion: {
              recommended: true,
              subtasks: [
                'Refactor authentication module',
                'Refactor data layer',
                'Refactor UI components',
              ],
            },
            escalationSuggestion: null,
            updatedState: 'Split suggestion provided',
          }),
        ],
        storageOverrides: {
          getIssue: vi.fn().mockResolvedValue(mockIssue),
          searchKnowledge: vi.fn().mockResolvedValue([]),
          searchIssues: vi.fn().mockResolvedValue([]),
        },
      });
      mockContext.recorder = mockRecorder;

      const mockEmitter = createMockWorkflowEmitter();

      const event: SystemEvent = {
        type: 'ISSUE_STALLED',
        payload: {
          issueId: 'stalled-issue',
          trigger: 'stalled',
          stalledDays: 7,
        },
      };

      const result = await suggestNextActionWorkflow.executor(event, mockContext, mockEmitter);

      expect(result.success).toBe(true);
      const output = result.output as any;
      expect(output.insights.splitSuggestion).toBeDefined();
      expect(output.insights.splitSuggestion.recommended).toBe(true);
      expect(output.insights.splitSuggestion.subtasks).toHaveLength(3);
    });

    it('ユーザーコンテキストを考慮した提案ができる', async () => {
      const mockRecorder = createMockWorkflowRecorder();
      const mockIssue = createMockIssue({
        id: 'issue-2',
        title: 'Bug in login flow',
      });

      const mockContext = createCustomMockContext({
        driverResponses: [
          JSON.stringify({
            actions: [
              {
                title: 'Try alternative approach',
                type: 'implementation',
                description: 'Since previous attempts failed, try a different approach',
                steps: ['Review error logs', 'Try OAuth integration'],
                estimatedTotalTime: 90,
                confidence: 0.7,
                prerequisites: [],
              },
            ],
            rootCauseAnalysis: null,
            splitSuggestion: null,
            escalationSuggestion: {
              recommended: true,
              reason: 'Multiple failed attempts detected',
            },
            updatedState: 'Alternative approach suggested',
          }),
        ],
        storageOverrides: {
          getIssue: vi.fn().mockResolvedValue(mockIssue),
          searchKnowledge: vi.fn().mockResolvedValue([]),
          searchIssues: vi.fn().mockResolvedValue([]),
        },
      });
      mockContext.recorder = mockRecorder;

      const mockEmitter = createMockWorkflowEmitter();

      const event: SystemEvent = {
        type: 'USER_REQUEST_RECEIVED',
        payload: {
          issueId: 'issue-2',
          trigger: 'user_stuck',
          userContext: {
            previousAttempts: ['Direct fix attempt 1', 'Direct fix attempt 2'],
            blockers: ['Cannot reproduce locally'],
          },
        },
      };

      const result = await suggestNextActionWorkflow.executor(event, mockContext, mockEmitter);

      expect(result.success).toBe(true);
      const output = result.output as any;
      expect(output.primaryAction.title).toContain('alternative approach');
      expect(output.insights.escalation).toBeDefined();
      expect(output.insights.escalation.recommended).toBe(true);
    });

    it('類似の解決済みIssueから学習した提案ができる', async () => {
      const mockRecorder = createMockWorkflowRecorder();
      const mockIssue = createMockIssue({
        id: 'current-issue',
        title: 'Database timeout error',
      });

      const similarIssues = [
        createMockIssue({
          id: 'resolved-issue-1',
          title: 'Similar DB timeout',
          status: 'closed',
          resolution: 'Increased connection pool size',
        }),
      ];

      const mockContext = createCustomMockContext({
        driverResponses: [
          JSON.stringify({
            actions: [
              {
                title: 'Apply similar solution',
                type: 'implementation',
                description: 'Based on similar resolved issues',
                steps: ['Check connection pool settings', 'Increase pool size'],
                estimatedTotalTime: 30,
                confidence: 0.95,
                prerequisites: [],
              },
            ],
            rootCauseAnalysis: {
              identified: true,
              description: 'Connection pool exhaustion',
              confidence: 0.9,
            },
            splitSuggestion: null,
            escalationSuggestion: null,
            updatedState: 'Solution from similar issues',
          }),
        ],
        storageOverrides: {
          getIssue: vi.fn().mockResolvedValue(mockIssue),
          searchKnowledge: vi.fn().mockResolvedValue([]),
          searchIssues: vi.fn().mockResolvedValue(similarIssues),
        },
      });
      mockContext.recorder = mockRecorder;

      const mockEmitter = createMockWorkflowEmitter();

      const event: SystemEvent = {
        type: 'HIGH_PRIORITY_ISSUE_DETECTED',
        payload: {
          issueId: 'current-issue',
          priority: 90,
        },
      };

      const result = await suggestNextActionWorkflow.executor(event, mockContext, mockEmitter);

      expect(result.success).toBe(true);
      const output = result.output as any;
      expect(output.primaryAction.confidence).toBeGreaterThan(0.9);
      expect(output.primaryAction.title).toContain('similar solution');
    });
  });

  describe('エッジケース', () => {
    it('Issueが見つからない場合はエラーを返す', async () => {
      const mockRecorder = createMockWorkflowRecorder();
      const mockContext = createCustomMockContext({
        storageOverrides: {
          getIssue: vi.fn().mockResolvedValue(null),
        },
      });
      mockContext.recorder = mockRecorder;

      const mockEmitter = createMockWorkflowEmitter();

      const event: SystemEvent = {
        type: 'HIGH_PRIORITY_ISSUE_DETECTED',
        payload: {
          issueId: 'non-existent',
        },
      };

      const result = await suggestNextActionWorkflow.executor(event, mockContext, mockEmitter);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error?.message).toContain('Issue not found');
      expect(mockRecorder.record).toHaveBeenCalledWith(
        RecordType.ERROR,
        expect.objectContaining({
          message: 'Issue not found',
        })
      );
    });

    it('知識ベースが空でも処理を継続できる', async () => {
      const mockRecorder = createMockWorkflowRecorder();
      const mockIssue = createMockIssue({
        id: 'issue-no-knowledge',
        title: 'New type of issue',
      });

      const mockContext = createCustomMockContext({
        driverResponses: [
          JSON.stringify({
            actions: [
              {
                title: 'Investigate further',
                type: 'investigation',
                description: 'No prior knowledge available',
                steps: ['Research', 'Document findings'],
                estimatedTotalTime: 120,
                confidence: 0.6,
                prerequisites: [],
              },
            ],
            rootCauseAnalysis: null,
            splitSuggestion: null,
            escalationSuggestion: null,
            updatedState: 'Exploratory actions suggested',
          }),
        ],
        storageOverrides: {
          getIssue: vi.fn().mockResolvedValue(mockIssue),
          searchKnowledge: vi.fn().mockResolvedValue([]),
          searchIssues: vi.fn().mockResolvedValue([]),
        },
      });
      mockContext.recorder = mockRecorder;

      const mockEmitter = createMockWorkflowEmitter();

      const event: SystemEvent = {
        type: 'ISSUE_CREATED',
        payload: {
          issueId: 'issue-no-knowledge',
          trigger: 'new_issue',
        },
      };

      const result = await suggestNextActionWorkflow.executor(event, mockContext, mockEmitter);

      expect(result.success).toBe(true);
      const output = result.output as any;
      expect(output.primaryAction).toBeDefined();
      expect(output.primaryAction.confidence).toBeLessThan(0.7);
    });

    it('詳細レベルを指定した提案ができる', async () => {
      const mockRecorder = createMockWorkflowRecorder();
      const mockIssue = createMockIssue({
        id: 'issue-quick',
      });

      const mockContext = createCustomMockContext({
        driverResponses: [
          JSON.stringify({
            actions: [
              {
                title: 'Quick fix',
                type: 'quick',
                description: 'Fast solution',
                steps: ['Apply patch'],
                estimatedTotalTime: 5,
                confidence: 0.8,
                prerequisites: [],
              },
            ],
            rootCauseAnalysis: null,
            splitSuggestion: null,
            escalationSuggestion: null,
            updatedState: 'Quick action suggested',
          }),
        ],
        storageOverrides: {
          getIssue: vi.fn().mockResolvedValue(mockIssue),
          searchKnowledge: vi.fn().mockResolvedValue([]),
          searchIssues: vi.fn().mockResolvedValue([]),
        },
      });
      mockContext.recorder = mockRecorder;

      const mockEmitter = createMockWorkflowEmitter();

      const event: SystemEvent = {
        type: 'USER_REQUEST_RECEIVED',
        payload: {
          issueId: 'issue-quick',
          requestDetail: {
            level: 'quick',
            constraints: {
              timeLimit: 10,
            },
          },
        },
      };

      const result = await suggestNextActionWorkflow.executor(event, mockContext, mockEmitter);

      expect(result.success).toBe(true);
      const output = result.output as any;
      expect(output.primaryAction.estimatedTime).toBeLessThanOrEqual(10);
    });
  });

  describe('エラーハンドリング', () => {
    it('ストレージエラーを適切に処理できる', async () => {
      const error = new Error('Database connection failed');
      const mockRecorder = createMockWorkflowRecorder();
      const mockContext = createCustomMockContext({
        storageOverrides: {
          getIssue: vi.fn().mockRejectedValue(error),
        },
      });
      mockContext.recorder = mockRecorder;

      const mockEmitter = createMockWorkflowEmitter();

      const event: SystemEvent = {
        type: 'HIGH_PRIORITY_ISSUE_DETECTED',
        payload: {
          issueId: 'issue-1',
        },
      };

      const result = await suggestNextActionWorkflow.executor(event, mockContext, mockEmitter);

      expect(result.success).toBe(false);
      expect(result.error).toBe(error);
      expect(mockRecorder.record).toHaveBeenCalledWith(
        RecordType.ERROR,
        expect.objectContaining({
          error: 'Database connection failed',
        })
      );
    });

    it('AIドライバーエラーを適切に処理できる', async () => {
      const mockIssue = createMockIssue({ id: 'issue-1' });
      const error = new Error('AI service timeout');
      const mockRecorder = createMockWorkflowRecorder();

      const mockContext = createCustomMockContext({
        storageOverrides: {
          getIssue: vi.fn().mockResolvedValue(mockIssue),
          searchKnowledge: vi.fn().mockResolvedValue([]),
          searchIssues: vi.fn().mockResolvedValue([]),
        },
      });
      mockContext.recorder = mockRecorder;

      // AIドライバーのエラーをシミュレート
      mockContext.createDriver = async () => {
        throw error;
      };

      const mockEmitter = createMockWorkflowEmitter();

      const event: SystemEvent = {
        type: 'HIGH_PRIORITY_ISSUE_DETECTED',
        payload: {
          issueId: 'issue-1',
        },
      };

      const result = await suggestNextActionWorkflow.executor(event, mockContext, mockEmitter);

      expect(result.success).toBe(false);
      expect(result.error).toBe(error);
      expect(mockRecorder.record).toHaveBeenCalledWith(
        RecordType.ERROR,
        expect.objectContaining({
          error: 'AI service timeout',
        })
      );
    });
  });

  describe('トリガー条件', () => {
    it('HIGH_PRIORITY_ISSUE_DETECTEDイベントで起動する', () => {
      const event: SystemEvent = {
        type: 'HIGH_PRIORITY_ISSUE_DETECTED',
        payload: { priority: 90 },
      };

      const canTrigger = suggestNextActionWorkflow.triggers.condition(event);
      expect(canTrigger).toBe(true);
      expect(suggestNextActionWorkflow.triggers.eventTypes).toContain('HIGH_PRIORITY_ISSUE_DETECTED');
    });

    it('低優先度のISSUE_CREATEDイベントでは起動しない', () => {
      const event: SystemEvent = {
        type: 'ISSUE_CREATED',
        payload: { priority: 30 },
      };

      const canTrigger = suggestNextActionWorkflow.triggers.condition(event);
      expect(canTrigger).toBe(false);
    });

    it('高優先度のISSUE_CREATEDイベントで起動する', () => {
      const event: SystemEvent = {
        type: 'ISSUE_CREATED',
        payload: { priority: 80 },
      };

      const canTrigger = suggestNextActionWorkflow.triggers.condition(event);
      expect(canTrigger).toBe(true);
    });

    it('USER_REQUEST_RECEIVEDイベントで起動する', () => {
      const event: SystemEvent = {
        type: 'USER_REQUEST_RECEIVED',
        payload: {},
      };

      const canTrigger = suggestNextActionWorkflow.triggers.condition(event);
      expect(canTrigger).toBe(true);
    });

    it('優先度が適切に設定されている', () => {
      expect(suggestNextActionWorkflow.triggers.priority).toBe(25);
    });
  });
});