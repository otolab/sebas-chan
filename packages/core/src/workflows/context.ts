import type { Issue, Knowledge, PondEntry } from '@sebas-chan/shared-types';
import type { AIDriver } from '@moduler-prompt/driver';
import type { DriverSelectionCriteria } from '@moduler-prompt/utils';
import type { WorkflowLogger } from './logger.js';

// イベントタイプの定義
export type WorkflowEventType =
  | 'INGEST_INPUT'
  | 'PROCESS_USER_REQUEST'
  | 'ANALYZE_ISSUE_IMPACT'
  | 'EXTRACT_KNOWLEDGE'
  | 'UPDATE_FLOW_PRIORITIES'
  | 'UPDATE_FLOW_RELATIONS'
  | 'SALVAGE_FROM_POND'
  | 'COLLECT_SYSTEM_STATS'
  | string; // 拡張可能

// ドライバーファクトリの型定義
// @moduler-prompt/utilsのDriverSelectionCriteriaを使用
export type DriverFactory = (criteria: DriverSelectionCriteria) => AIDriver | Promise<AIDriver>;

/**
 * ワークフローが動作する環境のインターフェース
 * Engineが実装を提供する
 */
export interface WorkflowContextInterface {
  /**
   * 現在のState
   * StateMachineのState
   */
  state: string;

  /**
   * データストレージへのアクセス
   */
  storage: WorkflowStorageInterface;

  /**
   * AIドライバーファクトリ
   * 必要なcapabilitiesを指定してドライバーインスタンスを作成
   */
  createDriver: DriverFactory;

  /**
   * ワークフローロガー
   */
  logger: WorkflowLogger;

  /**
   * 実行時設定
   */
  config?: WorkflowConfig;

  /**
   * 実行時メタデータ
   */
  metadata?: Record<string, unknown>;
}

/**
 * データストレージインターフェース
 */
export interface WorkflowStorageInterface {
  // Issue操作
  getIssue(id: string): Promise<Issue | null>;
  searchIssues(query: string): Promise<Issue[]>;
  createIssue(issue: Omit<Issue, 'id' | 'createdAt' | 'updatedAt'>): Promise<Issue>;
  updateIssue(id: string, update: Partial<Issue>): Promise<Issue>;

  // Pond操作
  searchPond(query: string): Promise<PondEntry[]>;
  addPondEntry(entry: Omit<PondEntry, 'id' | 'timestamp'>): Promise<PondEntry>;

  // Knowledge操作
  getKnowledge(id: string): Promise<Knowledge | null>;
  searchKnowledge(query: string): Promise<Knowledge[]>;
  createKnowledge(knowledge: Omit<Knowledge, 'id' | 'createdAt'>): Promise<Knowledge>;
  updateKnowledge(id: string, update: Partial<Knowledge>): Promise<Knowledge>;
}

/**
 * ワークフロー実行設定
 * 現時点では空オブジェクト（将来の拡張用）
 */
export interface WorkflowConfig {}

/**
 * イベントエミッター（次のワークフロー起動用）
 */
export interface WorkflowEventEmitterInterface {
  /**
   * 次のイベントを発行
   */
  emit(event: { type: WorkflowEventType; payload: unknown }): void;
}
