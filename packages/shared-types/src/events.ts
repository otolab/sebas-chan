/**
 * イベントカタログに基づくイベント型定義
 *
 * このファイルは docs/workflows/EVENT_CATALOG.md に定義されたイベントの
 * TypeScript型定義を提供します。
 */

import type { Issue, Knowledge, PondEntry, Flow } from './index.js';

// ====================
// イベントタイプ定義
// ====================

/**
 * システムで発生するすべてのイベントタイプ
 */
export type EventType =
  // 外部イベント
  | 'USER_REQUEST_RECEIVED'
  | 'DATA_ARRIVED'

  // データイベント
  | 'ISSUE_CREATED'
  | 'ISSUE_UPDATED'
  | 'ISSUE_STATUS_CHANGED'
  | 'KNOWLEDGE_CREATED'

  // 分析イベント
  | 'PATTERN_FOUND'
  | 'KNOWLEDGE_EXTRACTABLE'
  | 'HIGH_PRIORITY_ISSUE_DETECTED'
  | 'HIGH_PRIORITY_FLOW_DETECTED'

  // システムイベント
  | 'SCHEDULE_TRIGGERED';

// ====================
// イベントペイロード定義
// ====================

/**
 * USER_REQUEST_RECEIVED: ユーザーから自然言語のリクエストを受信した
 */
export interface UserRequestReceivedEvent {
  type: 'USER_REQUEST_RECEIVED';
  payload: {
    userId: string;
    content: string;
    sessionId?: string;
    timestamp: string;
    metadata?: {
      source: 'web' | 'api' | 'cli';
      ip?: string;
    };
  };
}

/**
 * DATA_ARRIVED: 外部システムからデータが到着した（自動的にPondに保存される）
 */
export interface DataArrivedEvent {
  type: 'DATA_ARRIVED';
  payload: {
    source: string; // Reporter名など
    content: string; // 生データ
    format?: string; // データ形式
    pondEntryId: string; // 保存されたPondエントリのID
    metadata?: Record<string, unknown>;
    timestamp: string;
  };
}

/**
 * ISSUE_CREATED: 新しいIssueが作成された
 */
export interface IssueCreatedEvent {
  type: 'ISSUE_CREATED';
  payload: {
    issueId: string;
    issue: Issue;
    createdBy: 'user' | 'system' | 'workflow';
    sourceWorkflow?: string;
  };
}

/**
 * ISSUE_UPDATED: 既存のIssueが更新された
 */
export interface IssueUpdatedEvent {
  type: 'ISSUE_UPDATED';
  payload: {
    issueId: string;
    updates: {
      before: Partial<Issue>;
      after: Partial<Issue>;
      changedFields: string[];
    };
    updatedBy: string;
  };
}

/**
 * ISSUE_STATUS_CHANGED: Issueのステータスが変更された
 */
export type IssueStatus = 'open' | 'closed';

export interface IssueStatusChangedEvent {
  type: 'ISSUE_STATUS_CHANGED';
  payload: {
    issueId: string;
    from: IssueStatus;
    to: IssueStatus;
    reason?: string;
    issue: Issue;
  };
}

/**
 * PATTERN_FOUND: Issue群から共通パターンが発見された
 */
export interface PatternFoundEvent {
  type: 'PATTERN_FOUND';
  payload: {
    patternType: 'recurring' | 'temporal' | 'category' | 'dependency';
    pattern: {
      description: string;
      occurrences: number;
      confidence: number;
      examples: string[];
    };
    relatedIssues: string[];
    suggestedAction?: string;
  };
}

/**
 * KNOWLEDGE_EXTRACTABLE: Issueから知識抽出可能な情報が特定された
 */
export type KnowledgeCategory = Knowledge['type'];

export interface KnowledgeExtractableEvent {
  type: 'KNOWLEDGE_EXTRACTABLE';
  payload: {
    sourceType: 'issue' | 'pattern' | 'resolution' | 'feedback';
    sourceId: string;
    confidence: number;
    reason: string;
    suggestedCategory?: KnowledgeCategory;
  };
}

/**
 * KNOWLEDGE_CREATED: 新しい知識が作成された
 */
export interface KnowledgeCreatedEvent {
  type: 'KNOWLEDGE_CREATED';
  payload: {
    knowledgeId: string;
    knowledge: Knowledge;
    sourceWorkflow: string;
    extractedFrom: {
      type: string;
      id: string;
    };
  };
}

/**
 * HIGH_PRIORITY_ISSUE_DETECTED: 高優先度のIssueが検出された
 */
export interface HighPriorityIssueDetectedEvent {
  type: 'HIGH_PRIORITY_ISSUE_DETECTED';
  payload: {
    issueId: string;
    priority: number; // 80-100
    reason: string;
    requiredAction?: string;
  };
}

/**
 * HIGH_PRIORITY_FLOW_DETECTED: 高優先度のFlowが検出された
 */
export interface HighPriorityFlowDetectedEvent {
  type: 'HIGH_PRIORITY_FLOW_DETECTED';
  payload: {
    flowId: string;
    priority: number; // 80-100
    reason: string;
    requiredAction?: string;
  };
}

/**
 * SCHEDULE_TRIGGERED: context.schedulerに登録されたスケジュールが実行時刻に達した
 */
export interface ScheduleTriggeredEvent {
  type: 'SCHEDULE_TRIGGERED';
  payload: {
    issueId: string; // 関連Issue（必須）
    scheduleId: string;
    scheduledTime: string;
    action: 'reminder' | 'follow_up' | 'escalate' | 'custom';
    details?: Record<string, unknown>;
  };
}

// ====================
// ユニオン型定義
// ====================

/**
 * すべてのイベントのユニオン型
 */
export type SystemEvent =
  | UserRequestReceivedEvent
  | DataArrivedEvent
  | IssueCreatedEvent
  | IssueUpdatedEvent
  | IssueStatusChangedEvent
  | PatternFoundEvent
  | KnowledgeExtractableEvent
  | KnowledgeCreatedEvent
  | HighPriorityIssueDetectedEvent
  | HighPriorityFlowDetectedEvent
  | ScheduleTriggeredEvent;

/**
 * イベントのペイロード型を取得するヘルパー型
 */
export type EventPayload<T extends EventType> = Extract<SystemEvent, { type: T }>['payload'];

// ====================
// イベントキュー関連
// ====================

/**
 * イベントキュー用のイベント型
 */
export interface Event {
  id: string;
  type: EventType;
  payload: SystemEvent['payload'];
  timestamp: Date;
  retryCount?: number;
  maxRetries?: number;
  priority?: number; // イベント処理の優先度
}

/**
 * イベントキューインターフェース
 */
export interface EventQueue {
  enqueue(event: Event): void;
  dequeue(): Event | null;
  peek(): Event | null;
  size(): number;
  clear(): void;
}

// ====================
// ワークフロー関連（後方互換性のため）
// ====================

/**
 * ワークフロータイプ（イベントをトリガーするワークフロー）
 */
export type WorkflowType =
  | 'PROCESS_USER_REQUEST'  // A-0
  | 'INGEST_INPUT'          // A-1
  | 'ANALYZE_ISSUE_IMPACT'  // A-2
  | 'EXTRACT_KNOWLEDGE'     // A-3
  | 'DEFINE_SYSTEM_RULE'
  | 'CLUSTER_ISSUES'        // B-1
  | 'UPDATE_FLOW_RELATIONS' // B-2
  | 'UPDATE_FLOW_PRIORITIES' // B-3
  | 'SALVAGE_FROM_POND'     // B-4
  | 'REFLECT_AND_ORGANIZE_STATE'
  | 'SUGGEST_NEXT_FLOW'     // C-1
  | 'SUGGEST_NEXT_ACTION'   // C-2
  | 'TUNE_SYSTEM_PARAMETERS'
  | 'COLLECT_SYSTEM_STATS'
  | 'HANDLE_SCHEDULED_TASK'; // C-4

/**
 * イベントとワークフローのマッピング
 */
export const EVENT_TO_WORKFLOWS: Record<EventType, WorkflowType[]> = {
  'USER_REQUEST_RECEIVED': ['PROCESS_USER_REQUEST'],
  'DATA_ARRIVED': ['INGEST_INPUT'],
  'ISSUE_CREATED': ['ANALYZE_ISSUE_IMPACT', 'UPDATE_FLOW_RELATIONS'],
  'ISSUE_UPDATED': ['ANALYZE_ISSUE_IMPACT', 'UPDATE_FLOW_PRIORITIES'],
  'ISSUE_STATUS_CHANGED': ['EXTRACT_KNOWLEDGE', 'SUGGEST_NEXT_FLOW'],
  'PATTERN_FOUND': ['EXTRACT_KNOWLEDGE', 'CLUSTER_ISSUES'],
  'KNOWLEDGE_EXTRACTABLE': ['EXTRACT_KNOWLEDGE'],
  'KNOWLEDGE_CREATED': [], // 終端イベント
  'HIGH_PRIORITY_ISSUE_DETECTED': ['SUGGEST_NEXT_ACTION'],
  'HIGH_PRIORITY_FLOW_DETECTED': ['SUGGEST_NEXT_ACTION'],
  'SCHEDULE_TRIGGERED': ['HANDLE_SCHEDULED_TASK'],
};