/**
 * イベントキュー関連の型定義
 */

export type WorkflowType =
  | 'PROCESS_USER_REQUEST'
  | 'INGEST_INPUT'
  | 'ANALYZE_ISSUE_IMPACT'
  | 'EXTRACT_KNOWLEDGE'
  | 'DEFINE_SYSTEM_RULE'
  | 'CLUSTER_ISSUES'
  | 'UPDATE_FLOW_RELATIONS'
  | 'UPDATE_FLOW_PRIORITIES'
  | 'SALVAGE_FROM_POND'
  | 'REFLECT_AND_ORGANIZE_STATE'
  | 'SUGGEST_NEXT_FLOW'
  | 'SUGGEST_NEXT_ACTION_FOR_ISSUE'
  | 'TUNE_SYSTEM_PARAMETERS'
  | 'COLLECT_SYSTEM_STATS';

export interface Event {
  id: string;
  type: WorkflowType;
  priority: 'high' | 'normal' | 'low';
  payload: any;
  timestamp: Date;
  retryCount?: number;
  maxRetries?: number;
}

export interface EventQueue {
  enqueue(event: Event): void;
  dequeue(): Event | null;
  peek(): Event | null;
  size(): number;
  clear(): void;
}