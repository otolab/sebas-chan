/**
 * B-2: UPDATE_FLOW_RELATIONS ワークフローのユニットテスト
 *
 * テスト方針:
 * - コードカバレッジを重視
 * - 出力の正確性ではなく、ロジックの動作確認に焦点
 * - TestDriverで固定レスポンスを使用
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { updateFlowRelationsWorkflow } from './index.js';
import type { SystemEvent, Flow, Issue } from '@sebas-chan/shared-types';
import {
  createCustomMockContext,
  createMockWorkflowEmitter,
  createMockIssue
} from '../test-utils.js';
import { TestDriver } from '@moduler-prompt/driver';

describe('UpdateFlowRelations Workflow (B-2)', () => {
  let mockContext: ReturnType<typeof createCustomMockContext>;
  let mockEmitter: ReturnType<typeof createMockWorkflowEmitter>;
  let mockEvent: SystemEvent;

  // テスト用のFlow
  const mockFlow: Flow = {
    id: 'flow-1',
    title: 'テストフロー',
    description: '初期の観点記述',
    status: 'active',
    priorityScore: 0.5,
    issueIds: ['issue-1', 'issue-2'],
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
  };

  // テスト用のIssue
  const mockIssues: Issue[] = [
    createMockIssue({
      id: 'issue-1',
      title: 'Issue 1',
      status: 'open',
    }),
    createMockIssue({
      id: 'issue-2',
      title: 'Issue 2',
      status: 'closed',
    }),
  ];

  beforeEach(() => {
    // デフォルトのモックコンテキスト設定
    mockContext = createCustomMockContext({
      driverResponses: [JSON.stringify({
        flowUpdates: [{
          flowId: 'flow-1',
          health: 'healthy',
          perspectiveValidity: {
            stillValid: true,
            reason: 'Flow is still relevant',
          },
          relationships: 'Issue 1 blocks Issue 2',
          suggestedChanges: [],
        }],
        updatedState: 'State updated with flow analysis',
      })],
      storageOverrides: {
        getFlow: vi.fn().mockImplementation((id) =>
          id === 'flow-1' ? mockFlow : null
        ),
        searchFlows: vi.fn().mockResolvedValue([mockFlow]),
        getIssue: vi.fn().mockImplementation((id) =>
          mockIssues.find(i => i.id === id) || null
        ),
        updateFlow: vi.fn().mockResolvedValue(mockFlow),
      }
    });

    mockEmitter = createMockWorkflowEmitter();

    // デフォルトのイベント
    mockEvent = {
      type: 'ISSUE_UPDATED',
      payload: {
        issueId: 'issue-1',
        issue: mockIssues[0],
        updates: { status: 'closed' },
        updatedBy: 'user',
      },
    };
  });

  describe('正常系', () => {
    it('Flow関係性を正常に更新する', async () => {
      const result = await updateFlowRelationsWorkflow.executor(
        mockEvent,
        mockContext,
        mockEmitter
      );

      expect(result.success).toBe(true);
      expect(result.output).toMatchObject({
        updatedFlows: ['flow-1'],
        changes: [{
          flowId: 'flow-1',
          health: 'healthy',
          perspectiveValid: true,
        }],
      });

      // stateが更新されたことを確認
      expect(result.context.state).toContain('flow analysis');
    });

    it('特定のFlowIDが指定された場合、そのFlowのみを処理する', async () => {
      mockEvent.payload = {
        flowId: 'flow-1',
        trigger: 'issue_changed',
      };

      const result = await updateFlowRelationsWorkflow.executor(
        mockEvent,
        mockContext,
        mockEmitter
      );

      expect(result.success).toBe(true);
      expect(mockContext.storage.getFlow).toHaveBeenCalledWith('flow-1');
      expect(mockContext.storage.searchFlows).not.toHaveBeenCalled();
    });

    it('FlowIDが指定されない場合、アクティブなFlow全てを処理する', async () => {
      mockEvent.payload = {
        trigger: 'scheduled',
      };

      const result = await updateFlowRelationsWorkflow.executor(
        mockEvent,
        mockContext,
        mockEmitter
      );

      expect(result.success).toBe(true);
      expect(mockContext.storage.searchFlows).toHaveBeenCalledWith('status:active');
    });
  });

  describe('Flow健全性による処理分岐', () => {
    it('obsoleteなFlowをアーカイブする', async () => {
      mockContext = createCustomMockContext({
        driverResponses: [JSON.stringify({
          flowUpdates: [{
            flowId: 'flow-1',
            health: 'obsolete',
            perspectiveValidity: {
              stillValid: false,
              reason: 'Flow is no longer needed',
            },
            relationships: '',
            suggestedChanges: [],
          }],
          updatedState: 'Flow marked as obsolete',
        })],
        storageOverrides: {
          getFlow: vi.fn().mockResolvedValue(mockFlow),
          searchFlows: vi.fn().mockResolvedValue([mockFlow]),
          getIssue: vi.fn().mockImplementation((id) =>
            mockIssues.find(i => i.id === id) || null
          ),
          updateFlow: vi.fn().mockResolvedValue({
            ...mockFlow,
            status: 'archived',
          }),
        }
      });
      mockEmitter = createMockWorkflowEmitter();

      const result = await updateFlowRelationsWorkflow.executor(
        mockEvent,
        mockContext,
        mockEmitter
      );

      expect(result.success).toBe(true);

      // Flowがアーカイブされたことを確認
      expect(mockContext.storage.updateFlow).toHaveBeenCalledWith(
        'flow-1',
        { status: 'archived' }
      );

      // イベントが発行されたことを確認
      expect(mockEmitter.emit).toHaveBeenCalledWith({
        type: 'FLOW_STATUS_CHANGED',
        payload: expect.objectContaining({
          flowId: 'flow-1',
          newStatus: 'archived',
        }),
      });
    });

    it('観点が無効な場合、descriptionを更新する', async () => {
      mockContext = createCustomMockContext({
        driverResponses: [JSON.stringify({
          flowUpdates: [{
            flowId: 'flow-1',
            health: 'needs_attention',
            perspectiveValidity: {
              stillValid: false,
              reason: 'Perspective needs update',
              suggestedUpdate: '新しい観点: プロジェクトフェーズが変更',
            },
            relationships: 'Updated relationships',
            suggestedChanges: [],
          }],
          updatedState: 'Perspective updated',
        })],
        storageOverrides: {
          getFlow: vi.fn().mockResolvedValue(mockFlow),
          searchFlows: vi.fn().mockResolvedValue([mockFlow]),
          getIssue: vi.fn().mockImplementation((id) =>
            mockIssues.find(i => i.id === id) || null
          ),
          updateFlow: vi.fn(),
        }
      });
      mockEmitter = createMockWorkflowEmitter();

      const result = await updateFlowRelationsWorkflow.executor(
        mockEvent,
        mockContext,
        mockEmitter
      );

      expect(result.success).toBe(true);

      // descriptionが更新されたことを確認
      expect(mockContext.storage.updateFlow).toHaveBeenCalledWith(
        'flow-1',
        expect.objectContaining({
          description: expect.stringContaining('[観点更新提案:'),
        })
      );

      // PERSPECTIVE_TRIGGEREDイベントが発行されたことを確認
      expect(mockEmitter.emit).toHaveBeenCalledWith({
        type: 'PERSPECTIVE_TRIGGERED',
        payload: expect.objectContaining({
          flowId: 'flow-1',
          perspective: '新しい観点: プロジェクトフェーズが変更',
        }),
      });
    });
  });

  describe('エッジケース', () => {
    it('アクティブなFlowが存在しない場合', async () => {
      mockContext.storage.searchFlows = vi.fn().mockResolvedValue([]);

      const result = await updateFlowRelationsWorkflow.executor(
        mockEvent,
        mockContext,
        mockEmitter
      );

      expect(result.success).toBe(true);
      expect(result.output).toMatchObject({
        message: 'No active flows to update',
      });
    });

    it('Flowに関連するIssueが取得できない場合でも処理を継続', async () => {
      mockContext.storage.getIssue = vi.fn().mockResolvedValue(null);

      const result = await updateFlowRelationsWorkflow.executor(
        mockEvent,
        mockContext,
        mockEmitter
      );

      expect(result.success).toBe(true);
      // 空のissues配列で処理が継続されることを確認
      expect(result.output?.updatedFlows).toBeDefined();
    });

    it('複数のFlowを処理する', async () => {
      const flow2: Flow = {
        id: 'flow-2',
        title: 'フロー2',
        description: 'フロー2の説明',
        status: 'active',
        priorityScore: 0.4,
        issueIds: ['issue-3'],
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-01'),
      };

      mockContext = createCustomMockContext({
        driverResponses: [JSON.stringify({
          flowUpdates: [
            {
              flowId: 'flow-1',
              health: 'healthy',
              perspectiveValidity: { stillValid: true, reason: 'OK' },
              relationships: '',
              suggestedChanges: [],
            },
            {
              flowId: 'flow-2',
              health: 'stale',
              perspectiveValidity: { stillValid: true, reason: 'Stale but valid' },
              relationships: '',
              suggestedChanges: [],
            },
          ],
          updatedState: 'Multiple flows updated',
        })],
        storageOverrides: {
          searchFlows: vi.fn().mockResolvedValue([mockFlow, flow2]),
          getFlow: vi.fn().mockImplementation((id) => {
            if (id === 'flow-1') return mockFlow;
            if (id === 'flow-2') return flow2;
            return null;
          }),
          getIssue: vi.fn().mockResolvedValue(null),
          updateFlow: vi.fn(),
        }
      });
      mockEmitter = createMockWorkflowEmitter();

      const result = await updateFlowRelationsWorkflow.executor(
        mockEvent,
        mockContext,
        mockEmitter
      );

      expect(result.success).toBe(true);
      expect(result.output?.updatedFlows).toHaveLength(2);
      expect(result.output?.updatedFlows).toContain('flow-1');
      expect(result.output?.updatedFlows).toContain('flow-2');
    });
  });

  describe('エラーハンドリング', () => {
    it('AIドライバーがエラーを返した場合', async () => {
      const error = new Error('AI analysis failed');
      mockContext.createDriver = async () => { throw error; };

      const result = await updateFlowRelationsWorkflow.executor(
        mockEvent,
        mockContext,
        mockEmitter
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe(error);
    });

    it('ストレージエラーが発生した場合', async () => {
      const error = new Error('Database connection failed');
      mockContext.storage.searchFlows = vi.fn().mockRejectedValue(error);

      const result = await updateFlowRelationsWorkflow.executor(
        mockEvent,
        mockContext,
        mockEmitter
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe(error);
    });
  });

  describe('トリガー条件', () => {
    it('ISSUE_STATUS_CHANGEDでclosedの場合、条件を満たす', () => {
      const event: SystemEvent = {
        type: 'ISSUE_STATUS_CHANGED',
        payload: {
          issueId: 'issue-1',
          from: 'open',
          to: 'closed',
          newStatus: 'closed',
        },
      };

      const condition = updateFlowRelationsWorkflow.triggers.condition;
      expect(condition?.(event)).toBe(true);
    });

    it('優先度が50を超える場合、条件を満たす', () => {
      const event: SystemEvent = {
        type: 'ISSUE_UPDATED',
        payload: {
          issueId: 'issue-1',
          priority: 75,
        },
      };

      const condition = updateFlowRelationsWorkflow.triggers.condition;
      expect(condition?.(event)).toBe(true);
    });

    it('優先度が50以下の場合、条件を満たさない', () => {
      const event: SystemEvent = {
        type: 'ISSUE_UPDATED',
        payload: {
          issueId: 'issue-1',
          priority: 30,
        },
      };

      const condition = updateFlowRelationsWorkflow.triggers.condition;
      expect(condition?.(event)).toBe(false);
    });
  });
});