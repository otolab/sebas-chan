import { Issue, Knowledge, Input, PondEntry } from '@sebas-chan/shared-types';
import type { AgentEvent, AgentEventPayload } from './types.js';
import type { AIDriver } from '@moduler-prompt/driver';
import { WorkflowRecorder, RecordType } from './workflows/recorder.js';
import { WorkflowRegistry } from './workflows/workflow-registry.js';
import type { WorkflowDefinition, WorkflowResult } from './workflows/workflow-types.js';
import type { WorkflowContextInterface, WorkflowEventEmitterInterface, DriverFactory } from './workflows/context.js';
import {
  ingestInputWorkflow,
  processUserRequestWorkflow,
  analyzeIssueImpactWorkflow,
  extractKnowledgeWorkflow,
} from './workflows/impl-functional/index.js';

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
    event: Event,
    context: WorkflowContext,
  ): Promise<AgentOutput> {
    context.recorder.record(RecordType.INPUT, { event });

    try {
      const input = { type: event.type, data: event.data } as EventInput;
      const result = await this.processEventSync(input, context);

      if (result.ok) {
        context.recorder.record(RecordType.OUTPUT, result.output);
      }

      if (result.error) {
        context.recorder.record(RecordType.ERROR, { error: result.error });
      }

      return result.output;
    } catch (error) {
      context.recorder.record(RecordType.ERROR, { error });
      throw error;
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
export type { AgentEvent, AgentEventPayload } from './types.js';

// ワークフロー関連のエクスポート
export * from './workflows/index.js';


// デフォルトワークフロー登録関数
export { registerDefaultWorkflows } from './workflows/impl-functional/index.js';

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
