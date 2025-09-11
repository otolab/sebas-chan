// import { Issue, Flow, Knowledge, Input } from '@sebas-chan/shared-types';
import { DBClient } from '@sebas-chan/db';
import { ingestInput, IngestInputPayload } from './workflows/ingest-input.js';

export class CoreAgent {
  private eventQueue: AgentEvent[] = [];
  private isProcessing = false;
  private dbClient: DBClient | null = null;

  constructor() {
    console.log('Core Agent initialized');
  }

  async start() {
    console.log('Starting Core Agent...');
    
    // DBクライアントを初期化
    if (!this.dbClient) {
      this.dbClient = new DBClient();
      await this.dbClient.connect();
      await this.dbClient.initModel();
      console.log('DB client connected and initialized');
    }
    
    this.isProcessing = true;
    await this.processEventLoop();
  }

  async stop() {
    console.log('Stopping Core Agent...');
    this.isProcessing = false;
    
    // DBクライアントを切断
    if (this.dbClient) {
      await this.dbClient.disconnect();
      this.dbClient = null;
      console.log('DB client disconnected');
    }
  }
  
  // DBクライアントを設定するメソッド（テスト用）
  setDbClient(dbClient: DBClient) {
    this.dbClient = dbClient;
  }

  private async processEventLoop() {
    while (this.isProcessing) {
      const event = this.eventQueue.shift();

      if (!event) {
        // キューが空の場合は少し待機
        await new Promise((resolve) => setTimeout(resolve, 1000));
        continue;
      }

      console.log(`Processing event: ${event.type}`);

      try {
        await this.processEvent(event);
      } catch (error) {
        console.error(`Error processing event ${event.type}:`, error);
        // エラーが発生しても処理を継続
      }
    }
  }

  private async processEvent(event: AgentEvent) {
    console.log(`Processing event: ${event.type}`);
    
    switch (event.type) {
      case 'PROCESS_USER_REQUEST':
        // ユーザーリクエストの処理
        console.log('Processing user request...');
        break;
        
      case 'INGEST_INPUT':
        // Input -> Pond変換
        if (!this.dbClient) {
          console.error('DB client not initialized');
          break;
        }
        
        const result = await ingestInput(
          event.payload as IngestInputPayload,
          this.dbClient
        );
        
        if (result.success) {
          console.log(`Input successfully ingested: ${result.pondEntryId}`);
        } else {
          console.error(`Failed to ingest input: ${result.error}`);
        }
        break;
        
      case 'ANALYZE_ISSUE_IMPACT':
        // Issue影響分析
        console.log('Analyzing issue impact...');
        break;
        
      default:
        console.warn(`Unknown event type: ${event.type}`);
    }
  }

  public queueEvent(event: AgentEvent) {
    this.eventQueue.push(event);
    console.log(`Event queued: ${event.type}`);
  }
}

export interface AgentEvent {
  type: string;
  priority: 'high' | 'normal' | 'low';
  payload: unknown;
  timestamp: Date;
}

export default CoreAgent;
