/**
 * ワークフローキューの型定義
 * serverパッケージ固有の実装
 */

import type { WorkflowDefinition } from '@sebas-chan/core';
import type { AgentEvent } from '@sebas-chan/core';

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
