/**
 * ワークフロー用テストユーティリティ
 */

import { vi } from 'vitest';
import type {
  WorkflowContextInterface,
  WorkflowStorageInterface,
  WorkflowEventEmitterInterface,
  DriverFactory,
} from './context.js';
import { WorkflowRecorder } from './recorder.js';
import type { Issue, Knowledge, PondEntry, Flow } from '@sebas-chan/shared-types';
import { TestDriver } from '@moduler-prompt/driver';

/**
 * テスト用のモックWorkflowContextを作成
 */
export function createMockWorkflowContext(): WorkflowContextInterface {
  const mockStorage: WorkflowStorageInterface = {
    // Issue操作
    getIssue: async (_id: string): Promise<Issue | null> => null,
    searchIssues: async (_query: string): Promise<Issue[]> => [],
    createIssue: async (issue: Omit<Issue, 'id' | 'createdAt' | 'updatedAt'>): Promise<Issue> => {
      return {
        ...issue,
        id: 'test-issue-id',
        createdAt: new Date(),
        updatedAt: new Date(),
      } as Issue;
    },
    updateIssue: async (id: string, update: Partial<Issue>): Promise<Issue> => {
      return {
        ...update,
        id,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as Issue;
    },

    // Pond操作
    searchPond: async (_query: string): Promise<PondEntry[]> => [],
    addPondEntry: async (entry: Omit<PondEntry, 'id' | 'timestamp'>): Promise<PondEntry> => {
      return {
        ...entry,
        id: 'test-pond-id',
        timestamp: new Date(),
      } as PondEntry;
    },

    // Knowledge操作
    getKnowledge: async (_id: string): Promise<Knowledge | null> => null,
    searchKnowledge: async (_query: string): Promise<Knowledge[]> => [],
    createKnowledge: async (knowledge: Omit<Knowledge, 'id' | 'createdAt'>): Promise<Knowledge> => {
      return {
        ...knowledge,
        id: 'test-knowledge-id',
        createdAt: new Date(),
      } as Knowledge;
    },
    updateKnowledge: async (id: string, update: Partial<Knowledge>): Promise<Knowledge> => {
      return {
        ...update,
        id,
        createdAt: new Date(),
      } as Knowledge;
    },

    // Flow操作
    getFlow: async (_id: string): Promise<Flow | null> => null,
    searchFlows: async (_query: string): Promise<Flow[]> => [],
    createFlow: async (flow: Omit<Flow, 'id' | 'createdAt' | 'updatedAt'>): Promise<Flow> => {
      return {
        ...flow,
        id: 'test-flow-id',
        createdAt: new Date(),
        updatedAt: new Date(),
      } as Flow;
    },
    updateFlow: async (id: string, update: Partial<Flow>): Promise<Flow> => {
      return {
        ...update,
        id,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as Flow;
    },
  };

  const mockCreateDriver: DriverFactory = async () => {
    return new TestDriver({ responses: [] });
  };

  const recorder = new WorkflowRecorder('test-execution');

  return {
    storage: mockStorage,
    createDriver: mockCreateDriver,
    recorder,
    state: 'Initial state',
  };
}

/**
 * WorkflowRecorderのモック実装を作成
 */
export function createMockWorkflowRecorder(): WorkflowRecorder {
  // 実際のWorkflowRecorderインスタンスを作成
  const recorder = new WorkflowRecorder('TestWorkflow', {
    executionId: 'test-execution-id',
    consoleOutput: false,
  });

  // メソッドをモックに置き換え
  vi.spyOn(recorder, 'record');
  vi.spyOn(recorder, 'clearBuffer').mockReturnValue([]);
  vi.spyOn(recorder, 'getBuffer').mockReturnValue([]);
  vi.spyOn(recorder, 'close');

  return recorder;
}

/**
 * WorkflowEventEmitterのモック実装を作成
 */
export function createMockWorkflowEmitter(): WorkflowEventEmitterInterface {
  return {
    emit: vi.fn(),
  };
}

/**
 * カスタマイズ可能なモックコンテキストを作成
 * @param overrides - デフォルト値を上書きする設定
 */
export function createCustomMockContext(overrides?: {
  state?: string;
  driverResponses?: string[];
  storageOverrides?: Partial<WorkflowStorageInterface>;
}): WorkflowContextInterface {
  const baseContext = createMockWorkflowContext();

  // Stateのカスタマイズ
  if (overrides?.state) {
    baseContext.state = overrides.state;
  }

  // ドライバーレスポンスのカスタマイズ
  if (overrides?.driverResponses) {
    baseContext.createDriver = async () =>
      new TestDriver({
        responses: overrides.driverResponses,
      });
  }

  // ストレージのカスタマイズ
  if (overrides?.storageOverrides) {
    Object.assign(baseContext.storage, overrides.storageOverrides);
  }

  return baseContext;
}

/**
 * よく使うモックIssueを生成
 */
export function createMockIssue(overrides?: Partial<Issue>): Issue {
  const baseIssue: Issue = {
    id: 'issue-test-123',
    title: 'Test Issue',
    description: 'Test Description',
    status: 'open',
    labels: [],
    sourceInputIds: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    updates: [],
    relations: [],
    // priorityはオプショナルなので設定しない
  };

  return {
    ...baseIssue,
    ...overrides,
  };
}

/**
 * よく使うモックKnowledgeを生成
 */
export function createMockKnowledge(overrides?: Partial<Knowledge>): Knowledge {
  const baseKnowledge: Knowledge = {
    id: 'knowledge-test-123',
    type: 'factoid',
    content: 'Test Knowledge Content',
    reputation: { upvotes: 0, downvotes: 0 },
    sources: [],
    createdAt: new Date(),
  };

  return {
    ...baseKnowledge,
    ...overrides,
  };
}

/**
 * よく使うモックPondEntryを生成
 */
export function createMockPondEntry(overrides?: Partial<PondEntry>): PondEntry {
  const basePondEntry: PondEntry = {
    id: 'pond-test-123',
    content: 'Test Pond Content',
    source: 'test',
    timestamp: new Date(),
    // metadata, context, vector, score, distanceはオプショナルなので設定しない
  };

  return {
    ...basePondEntry,
    ...overrides,
  };
}
