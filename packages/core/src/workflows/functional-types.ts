import type { AgentEvent } from '../index.js';
import type { WorkflowContext, WorkflowEventEmitter } from './context.js';

/**
 * ワークフローの実行結果
 */
export interface WorkflowResult<T = any> {
  success: boolean;
  context: WorkflowContext; // 更新されたcontext（state含む）
  output?: T;
  error?: Error;
}

/**
 * ワークフロー実行関数の型定義
 */
export type WorkflowExecutor = (
  event: AgentEvent,
  context: WorkflowContext,
  emitter: WorkflowEventEmitter
) => Promise<WorkflowResult>;

/**
 * ワークフロー定義
 */
export interface WorkflowDefinition {
  name: string;
  executor: WorkflowExecutor;
}

/**
 * 共通のワークフロー実行ラッパー
 * ログ記録などの共通処理を提供
 */
export async function executeWorkflow(
  workflow: WorkflowDefinition,
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

    // ワークフロー実行
    const result = await workflow.executor(event, context, emitter);

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
 * ワークフローレジストリの型定義
 */
export interface FunctionalWorkflowRegistry {
  register(eventType: string, workflow: WorkflowDefinition): void;
  get(eventType: string): WorkflowDefinition | undefined;
  getAll(): Map<string, WorkflowDefinition>;
}
