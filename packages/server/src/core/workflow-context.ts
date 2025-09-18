import type {
  WorkflowContext,
  WorkflowStorage,
  WorkflowEventEmitter,
  WorkflowConfig,
  WorkflowLogger,
  DriverFactory,
} from '@sebas-chan/core';
import type {
  Issue,
  Knowledge,
  PondEntry,
  WorkflowType,
  EventPayload,
} from '@sebas-chan/shared-types';
import type { DBClient } from '@sebas-chan/db';
import type { StateManager } from './state-manager.js';
import type { CoreEngine } from './engine.js';

/**
 * WorkflowStorageのEngine実装
 */
export class EngineWorkflowStorage implements WorkflowStorage {
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
    return this.engine.createIssue(issue);
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

  async createKnowledge(knowledge: Omit<Knowledge, 'id' | 'createdAt'>): Promise<Knowledge> {
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
export class EngineWorkflowEventEmitter implements WorkflowEventEmitter {
  constructor(private engine: CoreEngine) {}

  emit(event: { type: string; priority?: 'high' | 'normal' | 'low'; payload: unknown }): void {
    // EngineのenqueueEventを使用してイベントをキューに追加
    this.engine.enqueueEvent({
      type: event.type as WorkflowType,
      priority: event.priority || 'normal',
      payload: event.payload as EventPayload,
    });
  }
}

/**
 * WorkflowContextのEngine実装
 */
export class EngineWorkflowContext implements WorkflowContext {
  public readonly storage: WorkflowStorage;
  public state: string;

  constructor(
    private stateManager: StateManager,
    private db: DBClient,
    private engine: CoreEngine,
    public readonly createDriver: DriverFactory,
    public readonly logger: WorkflowLogger,
    public readonly config?: WorkflowConfig,
    public readonly metadata?: Record<string, unknown>
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
  logger: WorkflowLogger,
  config?: WorkflowConfig,
  metadata?: Record<string, unknown>
): EngineWorkflowContext {
  return new EngineWorkflowContext(
    stateManager,
    db,
    engine,
    createDriver,
    logger,
    config,
    metadata
  );
}

/**
 * WorkflowEventEmitter作成ヘルパー
 */
export function createWorkflowEventEmitter(engine: CoreEngine): WorkflowEventEmitter {
  return new EngineWorkflowEventEmitter(engine);
}
