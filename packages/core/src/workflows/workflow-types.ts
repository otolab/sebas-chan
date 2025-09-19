/**
 * ワークフローシステムの新しい型定義
 * 1イベント対nワークフローをサポート
 */

import type { AgentEvent } from '../index.js';
import type { WorkflowContextInterface, WorkflowEventEmitterInterface } from './context.js';

/**
 * ワークフローのトリガー条件
 */
export interface WorkflowTrigger {
  /** 反応するイベントタイプのリスト */
  eventTypes: string[];

  /** 追加の実行条件（オプション） */
  condition?: (event: AgentEvent) => boolean;

  /** 実行優先度（大きいほど優先、デフォルト: 0） */
  priority?: number;
}

/**
 * ワークフロー実行結果
 */
export interface WorkflowResult {
  success: boolean;
  context: WorkflowContextInterface;
  output?: any;
  error?: Error;
}

/**
 * ワークフロー実行関数
 */
export type WorkflowExecutor = (
  event: AgentEvent,
  context: WorkflowContextInterface,
  emitter: WorkflowEventEmitterInterface
) => Promise<WorkflowResult>;

/**
 * ワークフロー定義
 */
export interface WorkflowDefinition {
  /** ワークフロー名（ユニーク） */
  name: string;

  /** 説明 */
  description: string;

  /** トリガー条件 */
  triggers: WorkflowTrigger;

  /** 実行関数 */
  executor: WorkflowExecutor;
}

/**
 * ワークフロー解決結果
 */
export interface WorkflowResolution {
  /** マッチしたワークフロー */
  workflows: WorkflowDefinition[];

  /** 解決にかかった時間（ms） */
  resolutionTime: number;

  /** デバッグ情報 */
  debug?: {
    totalWorkflows: number;
    matchedCount: number;
    filteredByType: number;
    filteredByCondition: number;
  };
}
