import type { WorkflowContextInterface, WorkflowStorageInterface, DriverFactory } from './workflows/context.js';
import { WorkflowRecorder } from './workflows/recorder.js';
import type { Issue, Knowledge, PondEntry } from '@sebas-chan/shared-types';

/**
 * テスト用のモックWorkflowContextを作成
 */
export function createMockWorkflowContext(): WorkflowContextInterface {
  const mockStorage: WorkflowStorageInterface = {
    // Issue操作
    getIssue: async (id: string): Promise<Issue | null> => null,
    searchIssues: async (query: string): Promise<Issue[]> => [],
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
    searchPond: async (query: string): Promise<PondEntry[]> => [],
    addPondEntry: async (entry: Omit<PondEntry, 'id' | 'timestamp'>): Promise<PondEntry> => {
      return {
        ...entry,
        id: 'test-pond-id',
        timestamp: new Date(),
      } as PondEntry;
    },

    // Knowledge操作
    getKnowledge: async (id: string): Promise<Knowledge | null> => null,
    searchKnowledge: async (query: string): Promise<Knowledge[]> => [],
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
  };

  const mockDriverFactory: DriverFactory = async (criteria) => {
    // テスト用のモックドライバーを返す
    return {
      query: async (prompt: string) => {
        return { response: 'mock response' };
      },
    } as any;
  };

  return {
    state: 'test-state',
    storage: mockStorage,
    createDriver: mockDriverFactory,
    recorder: new WorkflowRecorder('test'),
    config: {},
    metadata: {},
  };
}
