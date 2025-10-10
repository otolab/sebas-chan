/**
 * B-1: CLUSTER_ISSUES ワークフローのテスト
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { TestDriver } from '@moduler-prompt/driver';
import { clusterIssuesWorkflow } from './index.js';
import type { WorkflowContextInterface, WorkflowEventEmitterInterface } from '../context.js';
import type { SystemEvent, Issue, Flow } from '@sebas-chan/shared-types';
import type { RecordType } from '../recorder.js';

// レコードの型定義
interface MockRecord {
  type: RecordType;
  data: unknown;
}

// モックコンテキストの作成
function createMockContext(issues: Issue[] = [], flows: Flow[] = []): WorkflowContextInterface {
  const records: MockRecord[] = [];
  const createdFlows: Flow[] = [];

  return {
    state: '初期状態',
    storage: {
      searchIssues: async () => issues,
      searchFlows: async () => flows,
      getIssue: async (id: string) => issues.find((i) => i.id === id) || null,
      getFlow: async (id: string) => flows.find((f) => f.id === id) || null,
      createIssue: async () => {
        throw new Error('Not implemented');
      },
      updateIssue: async () => {
        throw new Error('Not implemented');
      },
      searchPond: async () => [],
      addPondEntry: async () => {
        throw new Error('Not implemented');
      },
      getKnowledge: async () => null,
      searchKnowledge: async () => [],
      createKnowledge: async () => {
        throw new Error('Not implemented');
      },
      updateKnowledge: async () => {
        throw new Error('Not implemented');
      },
      createFlow: async (flow: Flow) => {
        createdFlows.push(flow);
        return flow;
      },
      updateFlow: async () => {
        throw new Error('Not implemented');
      },
    },
    createDriver: async () =>
      new TestDriver({
        responses: [
          JSON.stringify({
            clusters: [
              {
                id: 'cluster-1',
                perspective: {
                  type: 'project',
                  title: 'プロジェクトA',
                  description: 'プロジェクトAに関連するIssue群',
                },
                issueIds: ['issue-1', 'issue-2', 'issue-3'],
                relationships: 'これらのIssueは共通の目標に向かっている',
                commonPatterns: ['deadline', 'technical'],
                suggestedPriority: 0.8,
              },
            ],
            insights: ['プロジェクトベースのグルーピングが効果的'],
            unclustered: ['issue-4'],
            updatedState: '分析完了',
          }),
        ],
      }),
    recorder: {
      record: (type: RecordType, data: unknown) => {
        records.push({ type, data });
      },
      getRecords: () => records,
    } as WorkflowContextInterface['recorder'],
  };
}

// モックイベントエミッターの作成
interface MockEmitter extends WorkflowEventEmitterInterface {
  getEmittedEvents: () => SystemEvent[];
}

function createMockEmitter(): MockEmitter {
  const emittedEvents: SystemEvent[] = [];
  return {
    emit: (event: SystemEvent) => {
      emittedEvents.push(event);
    },
    getEmittedEvents: () => emittedEvents,
  };
}

describe('ClusterIssues Workflow', () => {
  let mockContext: WorkflowContextInterface;
  let mockEmitter: MockEmitter;

  beforeEach(() => {
    // テスト用のIssueとFlowを準備
    const testIssues: Issue[] = [
      {
        id: 'issue-1',
        title: 'Issue 1',
        description: 'Test issue 1',
        status: 'open',
        priority: 50,
        labels: [],
        updates: [],
        relations: [],
        sourceInputIds: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      } as Issue,
      {
        id: 'issue-2',
        title: 'Issue 2',
        description: 'Test issue 2',
        status: 'open',
        priority: 60,
        labels: [],
        updates: [],
        relations: [],
        sourceInputIds: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      } as Issue,
      {
        id: 'issue-3',
        title: 'Issue 3',
        description: 'Test issue 3',
        status: 'open',
        priority: 40,
        labels: [],
        updates: [],
        relations: [],
        sourceInputIds: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      } as Issue,
      {
        id: 'issue-4',
        title: 'Issue 4',
        description: 'Test issue 4',
        status: 'open',
        priority: 30,
        labels: [],
        updates: [],
        relations: [],
        sourceInputIds: [],
        createdAt: new Date(),
        updatedAt: new Date(),
        // NOTE: 既存Flowに属している想定（実装では別途管理）
      } as Issue & { flowIds?: string[] },
    ];

    const testFlows: Flow[] = [
      {
        id: 'existing-flow',
        title: 'Existing Flow',
        description: '既存のFlow',
        status: 'active',
        priorityScore: 0.5,
        issueIds: ['issue-4'],
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    mockContext = createMockContext(testIssues, testFlows);
    mockEmitter = createMockEmitter();
  });

  it('should have correct workflow definition', () => {
    expect(clusterIssuesWorkflow.name).toBe('ClusterIssues');
    expect(clusterIssuesWorkflow.triggers.eventTypes).toContain('PERSPECTIVE_TRIGGERED');
    expect(clusterIssuesWorkflow.triggers.priority).toBe(10);
  });

  it('should cluster unclustered issues', async () => {
    const event: SystemEvent = {
      type: 'PERSPECTIVE_TRIGGERED',
      payload: {
        perspective: '週末の予定',
        requestedBy: 'test-user',
        context: 'クラスタリングをお願いします',
        timestamp: new Date().toISOString(),
      },
    };

    const result = await clusterIssuesWorkflow.executor(event, mockContext, mockEmitter);

    expect(result.success).toBe(true);
    expect(result.context.state).toBe('分析完了');
    expect(result.output).toMatchObject({
      clusters: expect.arrayContaining([
        expect.objectContaining({
          id: 'cluster-1',
          perspective: expect.objectContaining({
            type: 'project',
          }),
        }),
      ]),
    });
  });

  it('should emit FLOW_CREATED event for clusters with 3+ issues', async () => {
    const event: SystemEvent = {
      type: 'PERSPECTIVE_TRIGGERED',
      payload: {
        perspective: 'プロジェクトA',
        requestedBy: 'test-user',
        context: 'クラスタリングをお願いします',
        timestamp: new Date().toISOString(),
      },
    };

    await clusterIssuesWorkflow.executor(event, mockContext, mockEmitter);

    const emittedEvents = mockEmitter.getEmittedEvents();
    const flowCreatedEvent = emittedEvents.find((e) => e.type === 'FLOW_CREATED');

    expect(flowCreatedEvent).toBeDefined();
    if (flowCreatedEvent && flowCreatedEvent.type === 'FLOW_CREATED') {
      expect(flowCreatedEvent.payload).toMatchObject({
        flow: expect.objectContaining({
          title: 'プロジェクトA',
          issueIds: ['issue-1', 'issue-2', 'issue-3'],
        }),
        createdBy: 'workflow',
        sourceWorkflow: 'ClusterIssues',
        perspective: 'プロジェクトAに関連するIssue群',
      });
    }
  });

  it('should skip processing when not enough unclustered issues', async () => {
    // 未整理Issueが少ない場合のテスト
    const fewIssues: Issue[] = [
      {
        id: 'issue-1',
        title: 'Issue 1',
        description: 'Test issue 1',
        status: 'open',
        priority: 50,
        labels: [],
        updates: [],
        relations: [],
        sourceInputIds: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      } as Issue,
      {
        id: 'issue-2',
        title: 'Issue 2',
        description: 'Test issue 2',
        status: 'open',
        priority: 60,
        labels: [],
        updates: [],
        relations: [],
        sourceInputIds: [],
        createdAt: new Date(),
        updatedAt: new Date(),
        // NOTE: Flowに属している想定
      } as Issue & { flowIds?: string[] },
    ];

    mockContext = createMockContext(fewIssues, []);

    const event: SystemEvent = {
      type: 'PERSPECTIVE_TRIGGERED',
      payload: {
        perspective: 'タスク整理',
        requestedBy: 'test-user',
        context: 'クラスタリング実行',
        timestamp: new Date().toISOString(),
      },
    };

    const result = await clusterIssuesWorkflow.executor(event, mockContext, mockEmitter);

    expect(result.success).toBe(true);
    expect(result.output).toMatchObject({
      skipped: true,
      reason: 'Not enough issues for clustering',
      issueCount: 2,
    });
  });

  it('should handle errors gracefully', async () => {
    // エラー処理のテスト
    mockContext.createDriver = async () => {
      throw new Error('Driver creation failed');
    };

    const event: SystemEvent = {
      type: 'PERSPECTIVE_TRIGGERED',
      payload: {
        perspective: 'タスク整理',
        requestedBy: 'test-user',
        context: 'クラスタリング実行',
        timestamp: new Date().toISOString(),
      },
    };

    const result = await clusterIssuesWorkflow.executor(event, mockContext, mockEmitter);

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
    expect(result.error?.message).toBe('Driver creation failed');
  });
});
