import type {
  Issue,
  Knowledge,
  PondEntry,
  Flow,
  DriverSelectionCriteria,
} from '@sebas-chan/shared-types';
import type { AIDriver } from '@moduler-prompt/driver';
import type { WorkflowRecorder } from './recorder.js';

// Re-export for convenience
export type { WorkflowRecorder } from './recorder.js';

// イベントタイプの定義（EVENT_CATALOGに基づく）
export type WorkflowEventType =
  // 外部イベント
  | 'USER_REQUEST_RECEIVED'
  | 'DATA_ARRIVED'
  // データイベント
  | 'ISSUE_CREATED'
  | 'ISSUE_UPDATED'
  | 'ISSUE_STATUS_CHANGED'
  | 'KNOWLEDGE_CREATED'
  // 分析イベント
  | 'RECURRING_PATTERN_DETECTED'
  | 'KNOWLEDGE_EXTRACTABLE'
  | 'HIGH_PRIORITY_ISSUE_DETECTED'
  | 'HIGH_PRIORITY_FLOW_DETECTED'
  // システムイベント
  | 'SCHEDULE_TRIGGERED'
  | string; // 拡張可能

// ドライバーファクトリの型定義
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
   * ワークフローレコーダー
   */
  recorder: WorkflowRecorder;
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

  // Flow操作
  getFlow(id: string): Promise<Flow | null>;
  searchFlows(query: string): Promise<Flow[]>;
  createFlow(flow: Omit<Flow, 'id' | 'createdAt' | 'updatedAt'>): Promise<Flow>;
  updateFlow(id: string, update: Partial<Flow>): Promise<Flow>;

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
