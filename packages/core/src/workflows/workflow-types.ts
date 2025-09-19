/**
 * ワークフローシステムの新しい型定義
 * 1イベント対nワークフローをサポート
 */

import type { AgentEvent } from '../index.js';
import type { WorkflowContext, WorkflowEventEmitter } from './context.js';

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
  context: WorkflowContext;
  output?: any;
  error?: Error;
}

/**
 * ワークフロー実行関数
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
 * ワークフローキューのアイテム
 */
export interface WorkflowQueueItem {
  /** ユニークID */
  id: string;

  /** 実行するワークフロー */
  workflow: WorkflowDefinition;

  /** トリガーとなったイベント */
  event: AgentEvent;

  /** 実行優先度 */
  priority: number;

  /** キュー追加時刻 */
  timestamp: Date;

  /** 実行状態 */
  status: 'pending' | 'running' | 'completed' | 'failed';

  /** リトライ回数 */
  retryCount?: number;
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

/**
 * ワークフローレジストリインターフェース
 */
export interface IWorkflowRegistry {
  /** ワークフローを登録 */
  register(workflow: WorkflowDefinition): void;

  /** 全ワークフローを取得 */
  getAll(): WorkflowDefinition[];

  /** 名前でワークフローを取得 */
  getByName(name: string): WorkflowDefinition | undefined;

  /** イベントタイプでワークフローを検索 */
  findByEventType(eventType: string): WorkflowDefinition[];

  /** ワークフローをクリア */
  clear(): void;
}

/**
 * ワークフロー解決器インターフェース
 */
export interface IWorkflowResolver {
  /** イベントにマッチするワークフローを解決 */
  resolve(event: AgentEvent): WorkflowResolution;

  /** 解決ルールを検証 */
  validate(): boolean;
}

/**
 * ワークフローキューインターフェース
 */
export interface IWorkflowQueue {
  /** アイテムをキューに追加 */
  enqueue(item: WorkflowQueueItem): void;

  /** 次のアイテムを取得 */
  dequeue(): WorkflowQueueItem | undefined;

  /** キューのサイズ */
  size(): number;

  /** キューをクリア */
  clear(): void;

  /** 実行中のワークフローを取得 */
  getRunning(): WorkflowQueueItem[];

  /** 保留中のワークフローを取得 */
  getPending(): WorkflowQueueItem[];
}
