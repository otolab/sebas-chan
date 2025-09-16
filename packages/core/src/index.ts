import { Issue, Knowledge, Input, PondEntry } from '@sebas-chan/shared-types';
import type { AIDriver } from '@moduler-prompt/driver';
import { WorkflowLogger, LogType } from './workflows/logger.js';
import { WorkflowRegistry } from './workflows/functional-registry.js';
import type { WorkflowDefinition, WorkflowResult } from './workflows/functional-types.js';
import type { WorkflowContext, WorkflowEventEmitter, DriverFactory } from './workflows/context.js';
import {
  ingestInputWorkflow,
  processUserRequestWorkflow,
  analyzeIssueImpactWorkflow,
  extractKnowledgeWorkflow,
} from './workflows/impl-functional/index.js';

export class CoreAgent {
  private workflowRegistry: WorkflowRegistry;

  constructor(workflowRegistry?: WorkflowRegistry) {
    this.workflowRegistry = workflowRegistry || generateWorkflowRegistry();
    console.log('Core Agent initialized with workflow support');
  }

  /**
   * ワークフローを実行
   * @param workflow 実行するワークフロー
   * @param event 処理するイベント
   * @param context 実行コンテキスト
   * @param logger ワークフローロガー
   * @param emitter イベントエミッター
   */
  public async executeWorkflow(
    workflow: WorkflowDefinition,
    event: AgentEvent,
    context: WorkflowContext,
    logger: WorkflowLogger,
    emitter: WorkflowEventEmitter
  ): Promise<WorkflowResult> {
    console.log(`Executing workflow: ${workflow.name} for event: ${event.type}`);

    try {
      // ログ記録
      logger.log(LogType.INPUT, { event });

      // ワークフローを実行
      const result = await workflow.executor(event, context, emitter);

      // 出力をログ
      if (result.output) {
        logger.log(LogType.OUTPUT, result.output);
      }

      if (!result.success) {
        console.error(`Workflow ${workflow.name} failed:`, result.error);
        logger.log(LogType.ERROR, { error: result.error });
      }

      return result;
    } catch (error) {
      console.error(`Error executing workflow ${workflow.name}:`, error);
      logger.log(LogType.ERROR, { error });
      return {
        success: false,
        context,
        error: error as Error,
      };
    }
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

// イベントキューのエクスポート
export { EventQueueImpl } from './event-queue.js';

// 標準ワークフローをすべて登録したRegistryを生成
export function generateWorkflowRegistry(): WorkflowRegistry {
  const registry = new WorkflowRegistry();

  // 標準ワークフローを登録
  const workflows = [
    ingestInputWorkflow,
    processUserRequestWorkflow,
    analyzeIssueImpactWorkflow,
    extractKnowledgeWorkflow,
  ];

  for (const workflow of workflows) {
    registry.register(workflow);
  }

  return registry;
}

export default CoreAgent;
