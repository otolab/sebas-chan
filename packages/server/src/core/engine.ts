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
import { CoreAgent, AgentEvent, AgentEventPayload, WorkflowLogger } from '@sebas-chan/core';
import { nanoid } from 'nanoid';
import { createWorkflowContext } from './workflow-context.js';
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
  private processInterval: NodeJS.Timeout | null = null;
  private dbStatus: 'connecting' | 'ready' | 'error' | 'disconnected' = 'disconnected';
  private lastError?: string;
  private driverRegistry: DriverRegistry;

  constructor() {
    super();
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

      // CoreAgentを初期化し、WorkflowContextを設定（startは呼ばない）
      this.coreAgent = new CoreAgent();

      // WorkflowContextを作成して設定
      const workflowLogger = new WorkflowLogger('system');
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
      this.coreAgent.setContext(workflowContext);
      logger.info('Core Agent initialized with workflow context');

      await this.stateManager.initialize();
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
      queueSize: 0, // TODO: CoreAgentからキューサイズを取得
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
    // CoreAgentがイベントループを管理するため、
    // Engine側では特に処理は不要
    // TODO: このメソッドとprocessIntervalを削除
  }

  private async handleEvent(event: Event): Promise<void> {
    this.emit('event:processing', event);

    // CoreAgentにイベントを渡す
    if (this.coreAgent) {
      // AgentEventに変換してキューに追加
      const agentEvent: AgentEvent = {
        type: event.type,
        priority: event.priority,
        payload: event.payload as AgentEventPayload,
        timestamp: event.timestamp,
      };

      // CoreAgentのキューにイベントを追加
      this.coreAgent.queueEvent(agentEvent);
      logger.debug('Event queued for processing', { eventType: event.type });
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
    // CoreAgentにイベントをキュー
    if (this.coreAgent) {
      const agentEvent: AgentEvent = {
        type: event.type,
        priority: event.priority,
        payload: event.payload as AgentEventPayload,
        timestamp: new Date(),
      };
      this.coreAgent.queueEvent(agentEvent);
      this.emit('event:queued', agentEvent);
    }
  }

  dequeueEvent(): Event | null {
    // CoreAgentがイベントキューを管理するため、このメソッドは削除予定
    return null;
  }
}
