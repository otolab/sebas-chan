import { Issue, Knowledge, Input, PondEntry } from '@sebas-chan/shared-types';
import type { AIDriver } from '@moduler-prompt/driver';
import type { WorkflowLogger } from './workflows/logger.js';
import { WorkflowRegistry } from './workflows/functional-registry.js';
import type { WorkflowDefinition, WorkflowResult } from './workflows/functional-types.js';
import type { WorkflowContext, WorkflowEventEmitter, DriverFactory } from './workflows/context.js';
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
  private eventQueue: AgentEvent[] = [];
  private isProcessing = false;
  private context: AgentContext | null = null;
  private workflowRegistry: WorkflowRegistry;

  constructor(workflowRegistry?: WorkflowRegistry) {
    this.workflowRegistry = workflowRegistry || new WorkflowRegistry();
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

    // ワークフローレジストリから対応するワークフローを取得
    const workflow = this.workflowRegistry.get(event.type);

    if (workflow) {
      // ワークフローが登録されている場合
      if (!this.context) {
        console.error('Agent context not initialized for workflow execution');
        return;
      }

      // WorkflowはEngine側で実行される
      // CoreAgentはワークフローの登録のみを行う
      console.log(`Workflow ${workflow.name} would be executed by Engine`);
    } else {
      // ワークフローが登録されていない場合はエラー
      console.error(`No workflow registered for event type: ${event.type}`);
    }
  }

  public queueEvent(event: AgentEvent) {
    this.eventQueue.push(event);
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
