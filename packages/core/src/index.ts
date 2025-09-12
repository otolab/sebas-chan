import { Issue, Knowledge, Input, PondEntry } from '@sebas-chan/shared-types';

// CoreEngineから提供されるコンテキスト
export interface AgentContext {
  // State文書の取得
  getState(): string;

  // データ検索（Engineが適切なDBアクセスを行う）
  searchIssues(query: string): Promise<Issue[]>;
  searchKnowledge(query: string): Promise<Knowledge[]>;
  searchPond(query: string): Promise<PondEntry[]>;

  // データ追加（Engineが永続化を処理）
  addPondEntry(entry: Omit<PondEntry, 'id'>): Promise<PondEntry>;

  // イベント生成（Engineがキューに追加）
  emitEvent(event: Omit<AgentEvent, 'id' | 'timestamp'>): void;
}

export class CoreAgent {
  private eventQueue: AgentEvent[] = [];
  private isProcessing = false;
  private context: AgentContext | null = null;

  constructor() {
    console.log('Core Agent initialized');
  }

  async start(context?: AgentContext) {
    console.log('Starting Core Agent...');

    if (context) {
      this.context = context;
      console.log('Agent context set');
    }

    this.isProcessing = true;
    // イベントループを非同期で開始（awaitしない）
    this.processEventLoop().catch((error) => {
      console.error('Event loop error:', error);
    });
  }

  async stop() {
    console.log('Stopping Core Agent...');
    this.isProcessing = false;
  }

  // コンテキストを設定するメソッド
  setContext(context: AgentContext) {
    this.context = context;
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

      case 'INGEST_INPUT': {
        // Input -> Pond変換
        if (!this.context) {
          console.error('Agent context not initialized');
          break;
        }

        const { input } = event.payload as { input: Input };

        try {
          // コンテキスト経由でPondに保存
          const pondEntry = await this.context.addPondEntry({
            content: input.content,
            source: input.source,
            timestamp: input.timestamp,
          });

          console.log(`Input successfully ingested to Pond: ${pondEntry.id}`);
        } catch (error) {
          console.error(`Failed to ingest input:`, error);
        }
        break;
      }

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
