/**
 * イベントキュー関連の型定義
 */

import type { Input } from './index.js';

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

// 各ワークフローのペイロード型
export interface ProcessUserRequestPayload {
  request: {
    id?: string;
    content?: string;
  };
}

export interface IngestInputPayload {
  input: Input;
}

export interface AnalyzeIssueImpactPayload {
  issue: {
    id?: string;
    title?: string;
    content?: string;
    description?: string;
    inputId?: string;
  };
  aiResponse?: string;
}

export interface ExtractKnowledgePayload {
  issueId?: string;
  pondEntryId?: string;
  source?: string;
  question?: string;
  feedback?: string;
  impactAnalysis?: string;
  content?: string;
  context?: string;
}

// 他のワークフローのペイロード型は実装時に追加
export type EventPayload =
  | ProcessUserRequestPayload
  | IngestInputPayload
  | AnalyzeIssueImpactPayload
  | ExtractKnowledgePayload
  | Record<string, unknown>; // 未定義のワークフロー用のフォールバック

export interface Event {
  id: string;
  type: WorkflowType;
  priority: 'high' | 'normal' | 'low';
  payload: EventPayload;
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
