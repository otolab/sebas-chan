import { Issue, Knowledge, Input, PondEntry } from '@sebas-chan/shared-types';
import type { AIDriver } from '@moduler-prompt/driver';
import type { WorkflowLogger } from './workflows/logger.js';
import { WorkflowRegistry } from './workflows/functional-registry.js';
import type { WorkflowDefinition, WorkflowResult } from './workflows/functional-types.js';
import type { WorkflowContext, WorkflowEventEmitter, DriverFactory } from './workflows/context.js';
import { EventQueueImpl } from './event-queue.js';
import {
  ingestInputWorkflow,
  processUserRequestWorkflow,
  analyzeIssueImpactWorkflow,
  extractKnowledgeWorkflow
} from './workflows/impl-functional/index.js';

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

  // ドライバーファクトリ（AI モデルアクセス）
  // @moduler-prompt/utilsのDriverSelectionCriteriaを使用
  createDriver?: DriverFactory;
}

export class CoreAgent {
  private eventQueue: EventQueueImpl;
  private isProcessing = false;
  private context: AgentContext | null = null;
  private workflowRegistry: WorkflowRegistry;

  constructor(workflowRegistry?: WorkflowRegistry) {
    this.eventQueue = new EventQueueImpl();
    this.workflowRegistry = workflowRegistry || generateWorkflowRegistry();
    console.log('Core Agent initialized with workflow support');
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

    console.log('Core Agent started');
    // start()メソッドを完了させる
    return Promise.resolve();
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
      const event = this.eventQueue.dequeue();

      if (!event) {
        // キューが空の場合は少し待機
        await new Promise((resolve) => setTimeout(resolve, 1000));
        continue;
      }

      console.log(`Processing event: ${event.type}`);

      try {
        // processEventを呼び出し
        // テストではprocessEventがモックされる
        await (this as any).processEvent(event);
      } catch (error) {
        console.error(`Error processing event ${event.type}:`, error);
        // エラーが発生しても処理を継続
      }
    }
  }

  /**
   * イベントを処理してワークフローを実行
   * @param event 処理するイベント
   * @param workflowContext Engineから提供されるコンテキスト
   */
  public async processEvent(event: AgentEvent, workflowContext: WorkflowContext): Promise<void> {
    console.log(`Processing event: ${event.type}`);

    // ワークフローレジストリから対応するワークフローを取得
    const workflow = this.workflowRegistry.get(event.type);

    if (!workflow) {
      throw new Error(`No workflow registered for event type: ${event.type}`);
    }

    // イベントエミッターを作成（CoreAgentが管理）
    const emitter: WorkflowEventEmitter = {
      emit: (nextEvent) => {
        this.queueEvent({
          type: nextEvent.type,
          priority: nextEvent.priority || 'normal',
          payload: nextEvent.payload as AgentEventPayload,
          timestamp: new Date()
        });
      }
    };

    // ワークフローを実行
    try {
      const result = await workflow.executor(event, workflowContext, emitter);
      if (!result.success) {
        console.error(`Workflow ${workflow.name} failed:`, result.error);
      }
    } catch (error) {
      console.error(`Error executing workflow ${workflow.name}:`, error);
      throw error;
    }
  }

  public queueEvent(event: AgentEvent) {
    this.eventQueue.enqueue(event);
    console.log(`Event queued: ${event.type}`);
  }

  /**
   * ワークフローを登録
   */
  public registerWorkflow(workflow: WorkflowDefinition): void {
    this.workflowRegistry.register(workflow);
  }

  /**
   * ワークフローレジストリを取得
   */
  public getWorkflowRegistry(): WorkflowRegistry {
    return this.workflowRegistry;
  }

}

// AgentEventのペイロード型定義
export type AgentEventPayload = Record<string, unknown>;

export interface AgentEvent {
  type: string;
  priority: 'high' | 'normal' | 'low';
  payload: AgentEventPayload;
  timestamp: Date;
}

// ワークフロー関連のエクスポート
export * from './workflows/index.js';

// 標準ワークフローをすべて登録したRegistryを生成
export function generateWorkflowRegistry(): WorkflowRegistry {
  const registry = new WorkflowRegistry();

  // 標準ワークフローを登録
  const workflows = [
    ingestInputWorkflow,
    processUserRequestWorkflow,
    analyzeIssueImpactWorkflow,
    extractKnowledgeWorkflow
  ];

  for (const workflow of workflows) {
    registry.register(workflow);
  }

  return registry;
}

export default CoreAgent;
