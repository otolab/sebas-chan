import type { AgentEvent } from '../index.js';
import type { WorkflowContext, WorkflowEventEmitter } from './context.js';

export interface WorkflowResult<T = any> {
  success: boolean;
  context: WorkflowContext; // 更新されたcontext（state含む）
  output?: T;
  error?: Error;
}

export abstract class BaseWorkflow {
  protected name: string;

  constructor(name: string) {
    this.name = name;
  }

  /**
   * ワークフローを実行
   */
  async execute(
    event: AgentEvent,
    context: WorkflowContext,
    emitter: WorkflowEventEmitter
  ): Promise<WorkflowResult> {
    const { logger } = context;

    try {
      // 入力をログ
      await logger.logInput({
        event,
        state: context.state,
        metadata: context.metadata,
      });

      // 実装クラスの処理を実行
      const result = await this.process(event, context, emitter);

      // 出力をログ
      await logger.logOutput(result.output);

      return result;
    } catch (error) {
      // エラーをログ
      await logger.logError(error as Error, { event, context });

      return {
        success: false,
        context,
        error: error as Error,
      };
    }
  }

  /**
   * 実際のワークフロー処理（サブクラスで実装）
   */
  protected abstract process(
    event: AgentEvent,
    context: WorkflowContext,
    emitter: WorkflowEventEmitter
  ): Promise<WorkflowResult>;
}

export interface WorkflowRegistry {
  register(eventType: string, workflow: BaseWorkflow): void;
  get(eventType: string): BaseWorkflow | undefined;
  getAll(): Map<string, BaseWorkflow>;
}
