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
  WorkflowType,
  EventPayload,
} from '@sebas-chan/shared-types';
export { Event };
import { EventQueue } from './event-queue.js';
import { StateManager } from './state-manager.js';
import { logger } from '../utils/logger.js';
import { DBClient } from '@sebas-chan/db';
import {
  CoreAgent,
  AgentContext,
  AgentEvent,
  AgentEventPayload,
  WorkflowLogger,
} from '@sebas-chan/core';
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
  private eventQueue: EventQueue;
  private stateManager: StateManager;
  private dbClient: DBClient | null = null;
  private coreAgent: CoreAgent | null = null;
  private isRunning: boolean = false;
  private processInterval: NodeJS.Timeout | null = null;
  private dbStatus: 'connecting' | 'ready' | 'error' | 'disconnected' = 'disconnected';
  private lastError?: string;
  private driverRegistry: DriverRegistry;

  constructor() {
    super();
    this.eventQueue = new EventQueue();
    this.stateManager = new StateManager();

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

      // CoreAgentを初期化し、コンテキストを設定（startは呼ばない）
      this.coreAgent = new CoreAgent();

      const agentContext = this.createAgentContext();
      this.coreAgent.setContext(agentContext);
      logger.info('Core Agent initialized with context');

      await this.stateManager.initialize();
      // startは別途呼び出す必要がある
    } catch (error) {
      this.dbStatus = 'error';
      this.lastError = error instanceof Error ? error.message : String(error);
      logger.error('Failed to initialize Core Engine:', error);
      throw error;
    }
  }

  // CoreAgent用のコンテキストを作成
  private createAgentContext(): AgentContext {
    return {
      getState: () => this.stateManager.getState(),

      // ドライバーファクトリを提供（DriverFactory型）
      createDriver: (async (criteria: DriverSelectionCriteria) => {
        const result = this.driverRegistry.selectDriver(criteria);
        if (!result) {
          throw new Error('No suitable driver found for the given criteria');
        }
        return await this.driverRegistry.createDriver(result.driver);
      }) as DriverFactory,

      searchIssues: async (query: string) => {
        if (!this.dbClient) throw new Error('DB client not initialized');
        return this.dbClient.searchIssues(query);
      },

      searchKnowledge: async (query: string) => {
        // TODO: Implement when Knowledge methods are added to DBClient
        logger.debug('Searching knowledge', { query });
        return [];
      },

      searchPond: async (query: string) => {
        if (!this.dbClient) throw new Error('DB client not initialized');
        const results = await this.dbClient.searchPond({ q: query, limit: 100 });
        // DBClientのレスポンスをPondEntry型に変換
        return results.data.map((r) => ({
          id: r.id,
          content: r.content,
          source: r.source,
          timestamp: new Date(r.timestamp),
          vector: r.vector,
        }));
      },

      addPondEntry: async (entry: Omit<PondEntry, 'id'>) => {
        if (!this.dbClient) throw new Error('DB client not initialized');
        const id = nanoid();
        const success = await this.dbClient.addPondEntry({
          id,
          ...entry,
        });

        if (success) {
          return { id, ...entry };
        } else {
          throw new Error('Failed to add pond entry');
        }
      },

      emitEvent: (event: Omit<AgentEvent, 'id' | 'timestamp'>) => {
        // AgentEventをEventに変換してキューに追加
        this.enqueueEvent({
          type: event.type as WorkflowType,
          priority: event.priority,
          payload: event.payload as EventPayload,
        });
      },

      // getWorkflowContextは削除（handleEventで直接作成）
    };
  }

  async start(): Promise<void> {
    if (this.isRunning) return;

    // CoreAgentを開始
    if (this.coreAgent) {
      await this.coreAgent.start();
    }

    this.isRunning = true;
    this.processInterval = setInterval(() => {
      this.processNextEvent();
    }, 1000);

    logger.info('Core Engine started');
  }

  async stop(): Promise<void> {
    if (!this.isRunning) return;

    this.isRunning = false;
    if (this.processInterval) {
      clearInterval(this.processInterval);
      this.processInterval = null;
    }

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
      queueSize: this.eventQueue.size(),
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

  private async processNextEvent(): Promise<void> {
    const event = this.eventQueue.dequeue();
    if (!event) return;

    logger.debug(`Processing event: ${event.type}`, { eventId: event.id });

    try {
      await this.handleEvent(event);
    } catch (error) {
      logger.error(`Failed to process event ${event.id}:`, error);

      if (event.retryCount !== undefined && event.maxRetries !== undefined) {
        if (event.retryCount < event.maxRetries) {
          // 直接キューに追加（enqueueEventだと新しいIDとタイムスタンプが付与される）
          const retryEvent = {
            ...event,
            retryCount: event.retryCount + 1,
          };
          this.eventQueue.enqueue(retryEvent);
          logger.debug(`Event re-enqueued for retry`, {
            eventId: event.id,
            retryCount: retryEvent.retryCount,
            maxRetries: event.maxRetries,
          });
        }
      }
    }
  }

  private async handleEvent(event: Event): Promise<void> {
    this.emit('event:processing', event);

    // CoreAgentにイベントを渡す
    if (this.coreAgent) {
      // ワークフローが登録されているか確認
      // getWorkflowRegistryが存在する場合のみワークフローを確認
      const workflowRegistry = this.coreAgent.getWorkflowRegistry
        ? this.coreAgent.getWorkflowRegistry()
        : null;
      const workflow = workflowRegistry ? workflowRegistry.get(event.type) : null;

      if (workflow) {
        // ワークフロー実行コンテキストを作成
        const executionId = nanoid();
        const workflowLogger = new WorkflowLogger(event.type, { executionId });
        const workflowContext = createWorkflowContext(
          this,
          this.stateManager,
          this.dbClient!,
          workflowLogger,
          (async (criteria: DriverSelectionCriteria) => {
            const result = this.driverRegistry.selectDriver(criteria);
            if (!result) {
              throw new Error('No suitable driver found for the given criteria');
            }
            return await this.driverRegistry.createDriver(result.driver);
          }) as DriverFactory,
          {} // config
        );
        const workflowEmitter = createWorkflowEventEmitter(this);

        // ワークフローを実行
        try {
          const agentEvent: AgentEvent = {
            type: event.type,
            priority: event.priority,
            payload: event.payload as AgentEventPayload,
            timestamp: event.timestamp,
          };
          await workflow.executor(agentEvent, workflowContext, workflowEmitter);
          logger.debug('Workflow executed successfully', { eventType: event.type });
        } catch (error) {
          logger.error('Workflow execution failed', error);
        }
      } else {
        // ワークフローが登録されていない場合は従来通りCoreAgentに渡す
        const agentEvent: AgentEvent = {
          type: event.type,
          priority: event.priority,
          payload: event.payload as AgentEventPayload,
          timestamp: event.timestamp,
        };

        this.coreAgent.queueEvent(agentEvent);
        logger.debug('Event forwarded to Core Agent', { eventType: event.type });
      }
    } else {
      logger.warn('Core Agent not initialized, handling event locally');

      // フォールバック処理
      switch (event.type) {
        case 'PROCESS_USER_REQUEST':
          logger.info('Processing user request', { payload: event.payload });
          break;

        case 'INGEST_INPUT':
          logger.info('Ingesting input', { payload: event.payload });
          break;

        default:
          logger.warn(`Unhandled event type: ${event.type}`);
      }
    }

    this.emit('event:processed', event);
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

  async updateIssue(_id: string, _data: Partial<Issue>): Promise<Issue> {
    throw new Error('Not implemented');
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

  async getKnowledge(_id: string): Promise<Knowledge> {
    throw new Error('Not implemented');
  }

  async createKnowledge(data: Omit<Knowledge, 'id'>): Promise<Knowledge> {
    const knowledge: Knowledge = {
      id: `knowledge-${Date.now()}`,
      ...data,
    };
    logger.info('Created knowledge', { knowledge });
    return knowledge;
  }

  async updateKnowledge(_id: string, _data: Partial<Knowledge>): Promise<Knowledge> {
    throw new Error('Not implemented');
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
  }

  appendToState(section: string, content: string): void {
    this.stateManager.appendToState(section, content);
  }

  getStateLastUpdate(): Date | null {
    return this.stateManager.getLastUpdate();
  }

  enqueueEvent(event: Omit<Event, 'id' | 'timestamp'>): void {
    const fullEvent: Event = {
      id: `event-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date(),
      ...event,
    };
    this.eventQueue.enqueue(fullEvent);
    logger.debug('Event enqueued', { event: fullEvent });
  }

  dequeueEvent(): Event | null {
    return this.eventQueue.dequeue();
  }
}
