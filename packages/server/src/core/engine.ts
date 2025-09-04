import { EventEmitter } from 'events';
import { 
  Event, 
  WorkflowType,
  CoreAPI,
  Issue,
  Flow,
  Knowledge,
  Input,
  PondEntry
} from '@sebas-chan/shared-types';
import { EventQueue } from './event-queue';
import { StateManager } from './state-manager';
import { logger } from '../utils/logger';

export class CoreEngine extends EventEmitter implements CoreAPI {
  private eventQueue: EventQueue;
  private stateManager: StateManager;
  private isRunning: boolean = false;
  private processInterval: NodeJS.Timeout | null = null;
  
  constructor() {
    super();
    this.eventQueue = new EventQueue();
    this.stateManager = new StateManager();
  }
  
  async initialize(): Promise<void> {
    logger.info('Initializing Core Engine...');
    await this.stateManager.initialize();
    this.start();
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
            retryCount: event.retryCount + 1
          };
          this.eventQueue.enqueue(retryEvent);
          logger.debug(`Event re-enqueued for retry`, { 
            eventId: event.id, 
            retryCount: retryEvent.retryCount,
            maxRetries: event.maxRetries
          });
        }
      }
    }
  }
  
  private async handleEvent(event: Event): Promise<void> {
    this.emit('event:processing', event);
    
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
    
    this.emit('event:processed', event);
  }
  
  async getIssue(id: string): Promise<Issue> {
    throw new Error('Not implemented');
  }
  
  async createIssue(data: Omit<Issue, 'id'>): Promise<Issue> {
    const issue: Issue = {
      id: `issue-${Date.now()}`,
      ...data
    };
    logger.info('Created issue', { issue });
    return issue;
  }
  
  async updateIssue(id: string, data: Partial<Issue>): Promise<Issue> {
    throw new Error('Not implemented');
  }
  
  async searchIssues(query: string): Promise<Issue[]> {
    logger.debug('Searching issues', { query });
    return [];
  }
  
  async getFlow(id: string): Promise<Flow> {
    throw new Error('Not implemented');
  }
  
  async createFlow(data: Omit<Flow, 'id'>): Promise<Flow> {
    const flow: Flow = {
      id: `flow-${Date.now()}`,
      ...data
    };
    logger.info('Created flow', { flow });
    return flow;
  }
  
  async updateFlow(id: string, data: Partial<Flow>): Promise<Flow> {
    throw new Error('Not implemented');
  }
  
  async searchFlows(query: string): Promise<Flow[]> {
    logger.debug('Searching flows', { query });
    return [];
  }
  
  async getKnowledge(id: string): Promise<Knowledge> {
    throw new Error('Not implemented');
  }
  
  async createKnowledge(data: Omit<Knowledge, 'id'>): Promise<Knowledge> {
    const knowledge: Knowledge = {
      id: `knowledge-${Date.now()}`,
      ...data
    };
    logger.info('Created knowledge', { knowledge });
    return knowledge;
  }
  
  async updateKnowledge(id: string, data: Partial<Knowledge>): Promise<Knowledge> {
    throw new Error('Not implemented');
  }
  
  async searchKnowledge(query: string): Promise<Knowledge[]> {
    logger.debug('Searching knowledge', { query });
    return [];
  }
  
  async getInput(id: string): Promise<Input> {
    throw new Error('Not implemented');
  }
  
  async createInput(data: Omit<Input, 'id'>): Promise<Input> {
    const input: Input = {
      id: `input-${Date.now()}`,
      ...data
    };
    logger.info('Created input', { input });
    this.enqueueEvent({
      type: 'INGEST_INPUT',
      priority: 'normal',
      payload: { inputId: input.id }
    });
    return input;
  }
  
  async listPendingInputs(): Promise<Input[]> {
    return [];
  }
  
  async addToPond(entry: Omit<PondEntry, 'id'>): Promise<PondEntry> {
    const pondEntry: PondEntry = {
      id: `pond-${Date.now()}`,
      ...entry
    };
    logger.info('Added to pond', { pondEntry });
    return pondEntry;
  }
  
  async searchPond(query: string): Promise<PondEntry[]> {
    logger.debug('Searching pond', { query });
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
      ...event
    };
    this.eventQueue.enqueue(fullEvent);
    logger.debug('Event enqueued', { event: fullEvent });
  }
  
  dequeueEvent(): Event | null {
    return this.eventQueue.dequeue();
  }
}