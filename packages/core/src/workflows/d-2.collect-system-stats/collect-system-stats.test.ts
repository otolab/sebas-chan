/**
 * D-2: COLLECT_SYSTEM_STATS ワークフローのテスト
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { collectSystemStatsWorkflow } from './index.js';
import type { WorkflowContextInterface, WorkflowEventEmitterInterface, WorkflowRecorder } from '../context.js';
import type { SystemEvent, Issue, Flow, PondEntry } from '@sebas-chan/shared-types';
import { RecordType } from '../recorder.js';

// モックコンテキストの作成

// >>> 共通のmockがあるはずです。毎回全部作らないほうがよいですね。

interface MockRecord {
  type: RecordType;
  data: unknown;
}

function createMockContext(
  issues: Issue[] = [],
  flows: Flow[] = [],
  pondEntries: PondEntry[] = []
): WorkflowContextInterface {
  const records: MockRecord[] = [];

  return {
    state: '初期状態',
    storage: {
      searchIssues: async () => issues,
      searchFlows: async () => flows,
      searchPond: async () => pondEntries,
      getIssue: async (id: string) => issues.find((i) => i.id === id) || null,
      getFlow: async (id: string) => flows.find((f) => f.id === id) || null,
      createIssue: async () => {
        throw new Error('Not implemented');
      },
      updateIssue: async () => {
        throw new Error('Not implemented');
      },
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
      createFlow: async () => {
        throw new Error('Not implemented');
      },
      updateFlow: async () => {
        throw new Error('Not implemented');
      },
    },
    createDriver: async () => {
      throw new Error('Not needed for D-2');
    },
    recorder: {
      record: (type: RecordType, data: unknown) => {
        records.push({ type, data });
      },
      getRecords: () => records,
    } as WorkflowRecorder,
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

describe('CollectSystemStats Workflow', () => {
  let mockContext: WorkflowContextInterface;
  let mockEmitter: ReturnType<typeof createMockEmitter>;

  beforeEach(() => {
    mockContext = createMockContext();
    mockEmitter = createMockEmitter();
  });

  it('should have correct workflow definition', () => {
    expect(collectSystemStatsWorkflow.name).toBe('CollectSystemStats');
    expect(collectSystemStatsWorkflow.triggers.eventTypes).toContain('SYSTEM_MAINTENANCE_DUE');
    expect(collectSystemStatsWorkflow.triggers.eventTypes).toContain('IDLE_TIME_DETECTED');
    expect(collectSystemStatsWorkflow.triggers.priority).toBe(5);
  });

  it('should emit UNCLUSTERED_ISSUES_EXCEEDED event when threshold exceeded', async () => {
    // 21個の未整理Issueを作成
    const issues: Issue[] = Array.from(
      { length: 21 },
      (_, i) =>
        ({
          id: `issue-${i}`,
          title: `Issue ${i}`,
          description: 'Test issue',
          status: 'open',
          priority: 50,
          labels: [],
          updates: [],
          relations: [],
          sourceInputIds: [],
          createdAt: new Date(),
          updatedAt: new Date(),
          // flowIdsを設定しない（未整理）
        }) as Issue
    );

    mockContext = createMockContext(issues, [], []);

    const event: SystemEvent = {
      type: 'SYSTEM_MAINTENANCE_DUE',
      payload: {},
    };

    const result = await collectSystemStatsWorkflow.executor(event, mockContext, mockEmitter);

    expect(result.success).toBe(true);

    const emittedEvents = mockEmitter.getEmittedEvents();
    const unclusteredEvent = emittedEvents.find((e) => e.type === 'UNCLUSTERED_ISSUES_EXCEEDED');

    expect(unclusteredEvent).toBeDefined();
    expect(unclusteredEvent.payload.count).toBe(21);
    expect(unclusteredEvent.payload.threshold).toBe(20);
    expect(unclusteredEvent.payload.issueIds).toHaveLength(21);
  });

  it('should emit ISSUE_STALLED events for stalled issues', async () => {
    // 4日前の日付
    const fourDaysAgo = new Date();
    fourDaysAgo.setDate(fourDaysAgo.getDate() - 4);

    const issues: Issue[] = [
      {
        id: 'stalled-issue-1',
        title: 'Stalled Issue 1',
        description: 'This issue has been stalled',
        status: 'open',
        priority: 50,
        labels: [],
        updates: [],
        relations: [],
        sourceInputIds: [],
        createdAt: fourDaysAgo,
        updatedAt: fourDaysAgo, // 4日前に最終更新
      } as Issue,
      {
        id: 'active-issue',
        title: 'Active Issue',
        description: 'This issue is active',
        status: 'open',
        priority: 60,
        labels: [],
        updates: [],
        relations: [],
        sourceInputIds: [],
        createdAt: new Date(),
        updatedAt: new Date(), // 今日更新
      } as Issue,
    ];

    mockContext = createMockContext(issues, [], []);

    const event: SystemEvent = {
      type: 'IDLE_TIME_DETECTED',
      payload: {},
    };

    const result = await collectSystemStatsWorkflow.executor(event, mockContext, mockEmitter);

    expect(result.success).toBe(true);

    const emittedEvents = mockEmitter.getEmittedEvents();
    const stalledEvents = emittedEvents.filter((e) => e.type === 'ISSUE_STALLED');

    expect(stalledEvents).toHaveLength(1);
    expect(stalledEvents[0].payload.issueId).toBe('stalled-issue-1');
    expect(stalledEvents[0].payload.stalledDays).toBeGreaterThanOrEqual(4);
  });

  it('should emit POND_CAPACITY_WARNING when capacity exceeds threshold', async () => {
    // 8001個のPondエントリを作成（80%超過）
    const pondEntries: PondEntry[] = Array.from({ length: 8001 }, (_, i) => ({
      id: `pond-${i}`,
      content: 'Test content',
      source: 'test',
      timestamp: new Date(),
      vector: new Array(256).fill(0),
    }));

    mockContext = createMockContext([], [], pondEntries);

    const event: SystemEvent = {
      type: 'SYSTEM_MAINTENANCE_DUE',
      payload: {},
    };

    const result = await collectSystemStatsWorkflow.executor(event, mockContext, mockEmitter);

    expect(result.success).toBe(true);

    const emittedEvents = mockEmitter.getEmittedEvents();
    const capacityWarning = emittedEvents.find((e) => e.type === 'POND_CAPACITY_WARNING');

    expect(capacityWarning).toBeDefined();
    expect(capacityWarning.payload.usage).toBe(8001);
    expect(capacityWarning.payload.ratio).toBeGreaterThan(0.8);
  });

  it('should collect and return system statistics', async () => {
    const issues: Issue[] = [
      {
        id: 'issue-1',
        title: 'Issue 1',
        description: 'Test',
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
        description: 'Test',
        status: 'open',
        priority: 60,
        labels: [],
        updates: [],
        relations: [],
        sourceInputIds: [],
        createdAt: new Date(),
        updatedAt: new Date(),
        // NOTE: flow-1に属している想定
      } as Issue & { flowIds?: string[] },
    ];

    const flows: Flow[] = [
      {
        id: 'flow-1',
        title: 'Flow 1',
        description: 'Test flow',
        status: 'active',
        priorityScore: 0.5,
        issueIds: ['issue-2'],
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    mockContext = createMockContext(issues, flows, []);

    const event: SystemEvent = {
      type: 'SYSTEM_MAINTENANCE_DUE',
      payload: {},
    };

    const result = await collectSystemStatsWorkflow.executor(event, mockContext, mockEmitter);

    expect(result.success).toBe(true);
    expect(result.output).toMatchObject({
      stats: {
        totalIssues: 2,
        unclusteredIssues: 2,
        stalledIssues: 0,
        totalFlows: 1,
        staleFlows: 0,
        pondUsage: {
          entries: 0,
          ratio: 0,
        },
      },
    });
  });

  it('should handle errors gracefully', async () => {
    // storageエラーのシミュレーション
    mockContext.storage.searchIssues = async () => {
      throw new Error('Database connection failed');
    };

    const event: SystemEvent = {
      type: 'SYSTEM_MAINTENANCE_DUE',
      payload: {},
    };

    const result = await collectSystemStatsWorkflow.executor(event, mockContext, mockEmitter);

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
    expect(result.error?.message).toBe('Database connection failed');
  });
});
