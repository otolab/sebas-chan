import type { AgentEvent } from '../index.js';
import type { WorkflowContext, WorkflowEventEmitter } from './context.js';
import { LogType } from './logger.js';

/**
 * ワークフローの実行結果
 */
export interface WorkflowResult<T = unknown> {
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
  description: string; // 生成AIが判断できるようにワークフローの目的を明確に定義
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
    logger.log(LogType.INPUT, {
      event,
      state: context.state,
      metadata: context.metadata,
    });

    // ワークフロー実行
    const result = await workflow.executor(event, context, emitter);

    // 出力をログ
    logger.log(LogType.OUTPUT, result.output);

    return result;
  } catch (error) {
    // エラーをログ
    logger.log(LogType.ERROR, {
      message: (error as Error).message,
      stack: (error as Error).stack,
      context: { event, context },
    });

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
  register(workflow: WorkflowDefinition): void;
  get(eventType: string): WorkflowDefinition | undefined;
  getAll(): Map<string, WorkflowDefinition>;
}
