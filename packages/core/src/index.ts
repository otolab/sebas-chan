import { RecordType } from './workflows/recorder.js';
import { WorkflowRegistry } from './workflows/workflow-registry.js';
import type { WorkflowDefinition, WorkflowResult } from './workflows/workflow-types.js';
import type {
  WorkflowContextInterface,
  WorkflowEventEmitterInterface,
} from './workflows/context.js';
import type { SystemEvent } from '@sebas-chan/shared-types';
import {
  ingestInputWorkflow,
  processUserRequestWorkflow,
  analyzeIssueImpactWorkflow,
  extractKnowledgeWorkflow,
} from './workflows/index.js';

class CoreAgent {
  private workflowRegistry: WorkflowRegistry;

  constructor(workflowRegistry?: WorkflowRegistry) {
    this.workflowRegistry = workflowRegistry || generateWorkflowRegistry();
    console.log('Core Agent initialized with workflow support');
  }

  /**
   * ワークフローを実行
   * @param workflow 実行するワークフロー
   * @param event 処理するイベント
   * @param context 実行コンテキスト（recorderを含む）
   * @param emitter イベントエミッター
   */
  public async executeWorkflow(
    workflow: WorkflowDefinition,
    event: SystemEvent,
    context: WorkflowContextInterface,
    emitter: WorkflowEventEmitterInterface
  ): Promise<WorkflowResult> {
    context.recorder.record(RecordType.INPUT, { event });

    try {
      const result = await workflow.executor(event, context, emitter);

      if (result.success) {
        context.recorder.record(RecordType.OUTPUT, result.output);
      }

      if (result.error) {
        context.recorder.record(RecordType.ERROR, { error: result.error });
      }

      return result;
    } catch (error) {
      context.recorder.record(RecordType.ERROR, { error });
      return {
        success: false,
        context,
        error: error instanceof Error ? error : new Error(String(error)),
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

// 型の再エクスポート
// SystemEventと関連型はshared-typesから直接インポートすること
export type { SystemEvent } from '@sebas-chan/shared-types';
export { WorkflowRecorder, RecordType } from './workflows/recorder.js';

// ワークフロー関連のエクスポート
export * from './workflows/index.js';

// デフォルトワークフロー登録関数
export { registerDefaultWorkflows } from './workflows/index.js';

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

export { CoreAgent };
export default CoreAgent;
