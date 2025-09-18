import { EventEmitter } from 'events';
import {
  Event,
  CoreAPI,
  Issue,
  Flow,
  Knowledge,
  Input,
  PondEntry,
  PondSearchFilters,
  PondSearchResponse,
} from '@sebas-chan/shared-types';
export { Event };
import { StateManager } from './state-manager.js';
import { logger } from '../utils/logger.js';
import { DBClient } from '@sebas-chan/db';
import {
  CoreAgent,
  AgentEvent,
  AgentEventPayload,
  WorkflowLogger,
  WorkflowResolver,
} from '@sebas-chan/core';
import { WorkflowQueue } from './workflow-queue.js';
import type { IWorkflowRegistry } from '@sebas-chan/core';
import { registerDefaultWorkflows, ExtendedWorkflowRegistry } from '@sebas-chan/core';
import { nanoid } from 'nanoid';
import { createWorkflowContext, createWorkflowEventEmitter } from './workflow-context.js';
import {
  DriverRegistry,
  registerDriverFactories,
  type DriverSelectionCriteria,
} from '@moduler-prompt/utils';
import type { DriverFactory } from '@sebas-chan/core';
import * as Drivers from '@moduler-prompt/driver';

export interface EngineStatus {
  isRunning: boolean;
  dbStatus: 'connecting' | 'ready' | 'error' | 'disconnected';
  modelLoaded: boolean;
  queueSize: number;
  lastError?: string;
}

export class CoreEngine extends EventEmitter implements CoreAPI {
  private stateManager: StateManager;
  private dbClient: DBClient | null = null;
  private coreAgent: CoreAgent | null = null;
  private isRunning: boolean = false;
  private dbStatus: 'connecting' | 'ready' | 'error' | 'disconnected' = 'disconnected';
  private lastError?: string;
  private driverRegistry: DriverRegistry;
  private workflowQueue: WorkflowQueue;
  private workflowRegistry: IWorkflowRegistry;
  private workflowResolver: WorkflowResolver;

  constructor(coreAgent?: CoreAgent) {
    super();
    this.stateManager = new StateManager();
    this.workflowQueue = new WorkflowQueue();
    this.workflowRegistry = new ExtendedWorkflowRegistry();
    this.workflowResolver = new WorkflowResolver(this.workflowRegistry);

    // デフォルトワークフローを登録
    registerDefaultWorkflows(this.workflowRegistry);

    // CoreAgentが提供された場合はそれを使用
    this.coreAgent = coreAgent || null;

    // DriverRegistryを初期化
    this.driverRegistry = new DriverRegistry();
    registerDriverFactories(this.driverRegistry, Drivers);
  }

  async initialize(): Promise<void> {
    logger.info('Initializing Core Engine...');

    try {
      // DriverRegistryの設定をロード（設定ファイルが存在する場合）
      // TODO: 設定ファイルパスを環境変数または設定から取得
      // 例: await this.driverRegistry.loadConfig('./drivers.yaml');

      // DBクライアントを初期化
      this.dbStatus = 'connecting';
      this.dbClient = new DBClient();
      await this.dbClient.connect();
      await this.dbClient.initModel();
      this.dbStatus = 'ready';
      logger.info('DB client connected and initialized');

      // CoreAgentを初期化（ステートレス）- 既に注入されていない場合のみ
      if (!this.coreAgent) {
        this.coreAgent = new CoreAgent();
        logger.info('Core Agent initialized');
      } else {
        logger.info('Core Agent already provided');
      }

      // StateManagerを初期化（DBから既存の状態を読み込む）
      await this.stateManager.initialize();
      try {
        const existingState = await this.dbClient.getStateDocument();
        if (existingState && existingState !== this.stateManager.getState()) {
          this.stateManager.updateState(existingState);
          logger.info('Loaded existing state from DB');
        }
      } catch (error) {
        logger.warn('Could not load state from DB, using default state:', error);
      }
      // startは別途呼び出す必要がある
    } catch (error) {
      this.dbStatus = 'error';
      this.lastError = error instanceof Error ? error.message : String(error);
      logger.error('Failed to initialize Core Engine:', error);
      throw error;
    }
  }

  async start(): Promise<void> {
    if (this.isRunning) return;

    this.isRunning = true;

    // イベント処理ループを開始（非同期実行）
    this.startEventLoop();

    logger.info('Core Engine started');
  }

  private async startEventLoop(): Promise<void> {
    while (this.isRunning) {
      await this.processNextWorkflow();
      // 次のワークフロー処理まで待機
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  async stop(): Promise<void> {
    if (!this.isRunning) return;

    this.isRunning = false;

    // DBクライアントを切断
    if (this.dbClient) {
      try {
        await this.dbClient.disconnect();
        this.dbStatus = 'disconnected';
      } catch (error) {
        logger.error('Error disconnecting DB client:', error);
      }
    }

    logger.info('Core Engine stopped');
  }

  /**
   * エンジンの現在のステータスを取得
   */
  async getStatus(): Promise<EngineStatus> {
    let modelLoaded = false;

    // DBのステータスを確認
    if (this.dbClient && this.dbStatus === 'ready') {
      try {
        const dbStatus = await this.dbClient.getStatus();
        modelLoaded = dbStatus.model_loaded || false;
        if (dbStatus.status === 'error') {
          this.dbStatus = 'error';
        }
      } catch (error) {
        this.dbStatus = 'error';
        this.lastError = error instanceof Error ? error.message : String(error);
      }
    }

    return {
      isRunning: this.isRunning,
      dbStatus: this.dbStatus,
      modelLoaded,
      queueSize: this.workflowQueue.size(),
      lastError: this.lastError,
    };
  }

  /**
   * ヘルスチェック用のステータスを取得（同期的）
   */
  getHealthStatus(): {
    ready: boolean;
    engine: string;
    database: string;
    agent: string;
  } {
    const ready = this.isRunning && this.dbStatus === 'ready';

    return {
      ready,
      engine: this.isRunning ? 'running' : 'stopped',
      database: this.dbStatus,
      agent: this.coreAgent ? 'initialized' : 'not initialized',
    };
  }

  private async processNextWorkflow(): Promise<void> {
    if (!this.coreAgent || !this.dbClient) {
      return;
    }

    const queueItem = this.workflowQueue.dequeue();
    if (!queueItem) {
      return;
    }

    const { workflow, event } = queueItem;

    try {
      logger.debug(`Processing workflow ${workflow.name} for event ${event.type}`);

      // 実行ごとに新しいloggerを作成
      const workflowLogger = new WorkflowLogger(workflow.name);

      // contextを作成（loggerを含む）
      const context = createWorkflowContext(
        this,
        this.stateManager,
        this.dbClient,
        (async (criteria: DriverSelectionCriteria) => {
          const result = this.driverRegistry.selectDriver(criteria);
          if (!result) {
            throw new Error('No suitable driver found for the given criteria');
          }
          return await this.driverRegistry.createDriver(result.driver);
        }) as DriverFactory,
        workflowLogger,
        {}
      );

      // emitterを作成
      const emitter = createWorkflowEventEmitter(this);

      // 実行前の状態を保存
      const originalState = context.state;

      // CoreAgentに実行を委譲
      const result = await this.coreAgent.executeWorkflow(workflow, event, context, emitter);

      // ワークフローで更新されたstateをStateManagerに反映
      if (result.success && result.context.state !== originalState) {
        this.stateManager.updateState(result.context.state);
      }

      logger.info(`Workflow ${workflow.name} executed successfully for event ${event.type}`);
    } catch (error) {
      logger.error(`Error processing workflow ${workflow.name} for event ${event.type}:`, error);
    }
  }

  async getIssue(_id: string): Promise<Issue> {
    throw new Error('Not implemented');
  }

  async createIssue(data: Omit<Issue, 'id'>): Promise<Issue> {
    const issue: Issue = {
      id: `issue-${Date.now()}`,
      ...data,
    };
    logger.info('Created issue', { issue });
    return issue;
  }

  async updateIssue(id: string, data: Partial<Issue>): Promise<Issue> {
    // DBClientが利用可能な場合
    if (this.dbClient) {
      return await this.dbClient.updateIssue(id, data);
    }

    // フォールバック: インメモリで更新をシミュレート
    const existing = await this.getIssue(id);
    if (!existing) {
      throw new Error(`Issue not found: ${id}`);
    }

    return {
      ...existing,
      ...data,
      id, // IDは変更しない
    };
  }

  async searchIssues(query: string): Promise<Issue[]> {
    logger.debug('Searching issues', { query });
    return [];
  }

  async getFlow(_id: string): Promise<Flow> {
    throw new Error('Not implemented');
  }

  async createFlow(data: Omit<Flow, 'id'>): Promise<Flow> {
    const flow: Flow = {
      id: `flow-${Date.now()}`,
      ...data,
    };
    logger.info('Created flow', { flow });
    return flow;
  }

  async updateFlow(_id: string, _data: Partial<Flow>): Promise<Flow> {
    throw new Error('Not implemented');
  }

  async searchFlows(query: string): Promise<Flow[]> {
    logger.debug('Searching flows', { query });
    return [];
  }

  async getKnowledge(id: string): Promise<Knowledge> {
    // DBClientが利用可能な場合
    if (this.dbClient) {
      const knowledge = await this.dbClient.getKnowledge(id);
      if (!knowledge) {
        throw new Error(`Knowledge not found: ${id}`);
      }
      return knowledge;
    }

    // フォールバック
    throw new Error(`Knowledge not found: ${id}`);
  }

  async createKnowledge(data: Omit<Knowledge, 'id'>): Promise<Knowledge> {
    const knowledge: Knowledge = {
      id: `knowledge-${Date.now()}`,
      ...data,
    };
    logger.info('Created knowledge', { knowledge });
    return knowledge;
  }

  async updateKnowledge(id: string, data: Partial<Knowledge>): Promise<Knowledge> {
    // DBClientが利用可能な場合
    if (this.dbClient) {
      return await this.dbClient.updateKnowledge(id, data);
    }

    // フォールバック: インメモリで更新をシミュレート
    const existing = await this.getKnowledge(id);
    return {
      ...existing,
      ...data,
      id, // IDは変更しない
    };
  }

  async searchKnowledge(query: string): Promise<Knowledge[]> {
    logger.debug('Searching knowledge', { query });
    return [];
  }

  async getInput(_id: string): Promise<Input> {
    throw new Error('Not implemented');
  }

  async createInput(data: Omit<Input, 'id'>): Promise<Input> {
    const input: Input = {
      id: nanoid(),
      ...data,
    };
    logger.info('Created input', { input });
    this.enqueueEvent({
      type: 'INGEST_INPUT',
      priority: 'normal',
      payload: { input }, // Inputオブジェクト全体を渡す
    });
    return input;
  }

  async listPendingInputs(): Promise<Input[]> {
    return [];
  }

  async addToPond(entry: Omit<PondEntry, 'id'>): Promise<PondEntry> {
    const pondEntry: PondEntry = {
      id: `pond-${Date.now()}`,
      ...entry,
    };
    logger.info('Added to pond', { pondEntry });
    return pondEntry;
  }

  async getPondSources(): Promise<string[]> {
    logger.debug('Getting pond sources');
    if (!this.dbClient) {
      logger.warn('DB client not initialized');
      return [];
    }
    try {
      return await this.dbClient.getPondSources();
    } catch (error) {
      logger.error('Failed to get pond sources', { error });
      return [];
    }
  }

  async searchPond(filters: PondSearchFilters): Promise<PondSearchResponse> {
    logger.debug('Searching pond with filters', filters);
    if (!this.dbClient) {
      logger.warn('DB client not initialized');
      return {
        data: [],
        meta: {
          total: 0,
          limit: filters.limit || 20,
          offset: filters.offset || 0,
          hasMore: false,
        },
      };
    }

    try {
      const result = await this.dbClient.searchPond(filters);

      // resultまたはresult.dataがundefinedの場合の対処
      if (!result || !result.data) {
        return {
          data: [],
          meta: {
            total: 0,
            limit: filters.limit || 20,
            offset: filters.offset || 0,
            hasMore: false,
          },
        };
      }

      // タイムスタンプをDate型に変換（score/distanceも保持）
      const data = result.data.map((r) => ({
        id: r.id,
        content: r.content,
        source: r.source,
        timestamp: new Date(r.timestamp),
        vector: r.vector,
        score: r.score,
        distance: r.distance,
      }));

      return {
        data,
        meta: result.meta,
      };
    } catch (error) {
      logger.error('Failed to search pond with filters', { error });
      return {
        data: [],
        meta: {
          total: 0,
          limit: filters.limit || 20,
          offset: filters.offset || 0,
          hasMore: false,
        },
      };
    }
  }

  getState(): string {
    return this.stateManager.getState();
  }

  isReady(): boolean {
    return this.isRunning && this.dbClient !== null && this.coreAgent !== null;
  }

  updateState(content: string): void {
    this.stateManager.updateState(content);
    // DBにも非同期で保存
    if (this.dbClient) {
      this.dbClient.updateStateDocument(content).catch((error: Error) => {
        logger.error('Failed to persist state to DB', error);
      });
    }
  }

  appendToState(section: string, content: string): void {
    this.stateManager.appendToState(section, content);
  }

  getStateLastUpdate(): Date | null {
    return this.stateManager.getLastUpdate();
  }

  async enqueueEvent(event: Omit<Event, 'id' | 'timestamp'>): Promise<void> {
    // イベントを完全な形にする
    const fullEvent: Event = {
      ...event,
      id: nanoid(),
      timestamp: new Date(),
    };

    // AgentEventに変換
    const agentEvent: AgentEvent = {
      type: fullEvent.type,
      priority: fullEvent.priority,
      payload: fullEvent.payload as AgentEventPayload,
      timestamp: fullEvent.timestamp,
    };

    // イベントから実行すべきワークフローを解決
    const resolution = await this.workflowResolver.resolve(agentEvent);

    if (resolution.workflows.length === 0) {
      logger.warn(`No workflows found for event type: ${event.type}`);
      return;
    }

    logger.debug(
      `Resolved ${resolution.workflows.length} workflows for event ${event.type} in ${resolution.resolutionTime}ms`
    );

    // 優先度を数値に変換するヘルパー
    const priorityToNumber = (priority: 'high' | 'normal' | 'low'): number => {
      switch (priority) {
        case 'high':
          return 100;
        case 'normal':
          return 50;
        case 'low':
          return 10;
        default:
          return 50;
      }
    };

    // 各ワークフローをキューに追加
    for (const workflow of resolution.workflows) {
      this.workflowQueue.enqueue({
        workflow,
        event: agentEvent,
        priority: workflow.triggers.priority ?? priorityToNumber(agentEvent.priority),
        timestamp: new Date(),
      });
    }

    this.emit('event:queued', fullEvent);
  }
}
