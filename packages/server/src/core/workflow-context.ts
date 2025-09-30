import type {
  WorkflowContextInterface,
  WorkflowStorageInterface,
  WorkflowEventEmitterInterface,
  DriverFactory,
} from '@sebas-chan/core';
import type { WorkflowRecorder } from '@sebas-chan/core';
import type {
  Issue,
  Knowledge,
  PondEntry,
  EventType,
  SystemEvent,
} from '@sebas-chan/shared-types';
import type { DBClient } from '@sebas-chan/db';
import type { StateManager } from './state-manager.js';
import type { CoreEngine } from './engine.js';

/**
 * WorkflowStorageのEngine実装
 */
export class EngineWorkflowStorage implements WorkflowStorageInterface {
  constructor(
    private db: DBClient,
    private engine: CoreEngine
  ) {}

  async searchIssues(query: string): Promise<Issue[]> {
    return this.engine.searchIssues(query);
  }

  async searchKnowledge(query: string): Promise<Knowledge[]> {
    return this.engine.searchKnowledge(query);
  }

  async searchPond(query: string): Promise<PondEntry[]> {
    const response = await this.engine.searchPond({ q: query });
    return response.data;
  }

  async getIssue(id: string): Promise<Issue | null> {
    const results = await this.searchIssues(`id:${id}`);
    return results.length > 0 ? results[0] : null;
  }

  async createIssue(issue: Omit<Issue, 'id' | 'createdAt' | 'updatedAt'>): Promise<Issue> {
    return this.engine.createIssue({
      ...issue,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  async updateIssue(id: string, update: Partial<Issue>): Promise<Issue> {
    // DBClientが利用可能な場合はそれを使用
    if (this.db) {
      return await this.db.updateIssue(id, update);
    }

    // 既存のIssueを取得
    const existing = await this.getIssue(id);
    if (!existing) {
      throw new Error(`Issue not found: ${id}`);
    }

    // 更新を適用
    const updated = {
      ...existing,
      ...update,
    };

    return updated;
  }

  async addPondEntry(entry: Omit<PondEntry, 'id' | 'timestamp'>): Promise<PondEntry> {
    const result = await this.engine.addToPond({
      content: entry.content,
      source: entry.source,
      timestamp: new Date(),
    });
    return result;
  }

  async getKnowledge(id: string): Promise<Knowledge | null> {
    // DBClientが利用可能な場合はそれを使用
    if (this.db) {
      return await this.db.getKnowledge(id);
    }

    // フォールバックとして検索を使用
    const results = await this.searchKnowledge(`id:${id}`);
    return results.length > 0 ? results[0] : null;
  }

  async createKnowledge(knowledge: Omit<Knowledge, 'id'>): Promise<Knowledge> {
    // createdAtが提供されていない場合は、engine側で自動設定
    return this.engine.createKnowledge(knowledge);
  }

  async updateKnowledge(id: string, update: Partial<Knowledge>): Promise<Knowledge> {
    // DBClientが利用可能な場合はそれを使用
    if (this.db) {
      return await this.db.updateKnowledge(id, update);
    }

    // 既存のKnowledgeを取得
    const results = await this.searchKnowledge(`id:${id}`);
    if (results.length === 0) {
      throw new Error(`Knowledge not found: ${id}`);
    }

    const existing = results[0];
    const updated = {
      ...existing,
      ...update,
    };

    return updated;
  }
}

/**
 * WorkflowEventEmitterのEngine実装
 */
export class EngineWorkflowEventEmitter implements WorkflowEventEmitterInterface {
  constructor(private engine: CoreEngine) {}

  emit(event: { type: string; payload: unknown }): void {
    // EngineのemitEventを使用してイベントを発行
    this.engine.emitEvent({
      type: event.type as EventType,
      payload: event.payload as SystemEvent['payload'],
    });
  }
}

/**
 * WorkflowContextのEngine実装
 */
export class EngineWorkflowContext implements WorkflowContextInterface {
  public readonly storage: WorkflowStorageInterface;
  public state: string;

  constructor(
    private stateManager: StateManager,
    private db: DBClient,
    private engine: CoreEngine,
    public readonly createDriver: DriverFactory,
    public readonly recorder: WorkflowRecorder
  ) {
    this.storage = new EngineWorkflowStorage(db, engine);
    this.state = stateManager.getState();
  }
}

/**
 * WorkflowContext作成ヘルパー
 */
export function createWorkflowContext(
  engine: CoreEngine,
  stateManager: StateManager,
  db: DBClient,
  createDriver: DriverFactory,
  recorder: WorkflowRecorder
): EngineWorkflowContext {
  return new EngineWorkflowContext(stateManager, db, engine, createDriver, recorder);
}

/**
 * WorkflowEventEmitter作成ヘルパー
 */
export function createWorkflowEventEmitter(engine: CoreEngine): WorkflowEventEmitterInterface {
  return new EngineWorkflowEventEmitter(engine);
}
