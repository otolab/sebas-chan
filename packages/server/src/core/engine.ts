import { EventEmitter } from 'events';
import { Event, CoreAPI, Issue, Flow, Knowledge, Input, PondEntry } from '@sebas-chan/shared-types';
export { Event };
import { EventQueue } from './event-queue';
import { StateManager } from './state-manager';
import { logger } from '../utils/logger';
import { DBClient } from '@sebas-chan/db';
import { CoreAgent, AgentContext } from '@sebas-chan/core';
import { nanoid } from 'nanoid';

export class CoreEngine extends EventEmitter implements CoreAPI {
  private eventQueue: EventQueue;
  private stateManager: StateManager;
  private dbClient: DBClient | null = null;
  private coreAgent: CoreAgent | null = null;
  private isRunning: boolean = false;
  private processInterval: NodeJS.Timeout | null = null;

  constructor() {
    super();
    this.eventQueue = new EventQueue();
    this.stateManager = new StateManager();
  }

  async initialize(): Promise<void> {
    logger.info('Initializing Core Engine...');

    // DBクライアントを初期化
    this.dbClient = new DBClient();
    await this.dbClient.connect();
    await this.dbClient.initModel();
    logger.info('DB client connected and initialized');

    // CoreAgentを初期化し、コンテキストを提供
    this.coreAgent = new CoreAgent();
    const agentContext = this.createAgentContext();
    await this.coreAgent.start(agentContext);
    logger.info('Core Agent initialized with context');

    await this.stateManager.initialize();
    this.start();
  }

  // CoreAgent用のコンテキストを作成
  private createAgentContext(): AgentContext {
    return {
      getState: () => this.stateManager.getState(),

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
        const results = await this.dbClient.searchPond(query);
        // DBClientのレスポンスをPondEntry型に変換
        return results.map((r) => ({
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

      emitEvent: (event: Omit<Event, 'id' | 'timestamp'>) => {
        this.enqueueEvent(event);
      },
    };
  }

  private start(): void {
    if (this.isRunning) return;

    this.isRunning = true;
    this.processInterval = setInterval(() => {
      this.processNextEvent();
    }, 1000);

    logger.info('Core Engine started');
  }

  stop(): void {
    if (!this.isRunning) return;

    this.isRunning = false;
    if (this.processInterval) {
      clearInterval(this.processInterval);
      this.processInterval = null;
    }

    logger.info('Core Engine stopped');
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
      // AgentEvent形式に変換
      const agentEvent = {
        type: event.type,
        priority: event.priority,
        payload: event.payload,
        timestamp: event.timestamp,
      };

      // CoreAgentのキューに追加
      this.coreAgent.queueEvent(agentEvent);
      logger.debug('Event forwarded to Core Agent', { eventType: event.type });
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

  async searchPond(query: string, limit?: number): Promise<PondEntry[]> {
    logger.debug('Searching pond', { query, limit });
    return [];
  }

  getState(): string {
    return this.stateManager.getState();
  }

  updateState(content: string): void {
    this.stateManager.updateState(content);
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
