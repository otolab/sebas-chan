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
 * @deprecated この関数は削除予定です。ログ記録はCoreAgentで行います。
 */
export async function executeWorkflow(
  workflow: WorkflowDefinition,
  event: AgentEvent,
  context: WorkflowContext,
  emitter: WorkflowEventEmitter
): Promise<WorkflowResult> {
  try {
    // ワークフロー実行
    const result = await workflow.executor(event, context, emitter);
    return result;
  } catch (error) {
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
