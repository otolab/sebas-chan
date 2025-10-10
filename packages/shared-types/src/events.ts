/**
 * イベントカタログに基づくイベント型定義
 *
 * このファイルは docs/workflows/EVENT_CATALOG.md に定義されたイベントの
 * TypeScript型定義を提供します。
 */

import type { Issue, Knowledge } from './index.js';

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
  | 'ISSUE_STALLED'
  | 'FLOW_CREATED'
  | 'FLOW_UPDATED'
  | 'FLOW_STATUS_CHANGED'
  | 'KNOWLEDGE_CREATED'

  // 分析イベント
  | 'RECURRING_PATTERN_DETECTED'
  | 'KNOWLEDGE_EXTRACTABLE'
  | 'HIGH_PRIORITY_ISSUE_DETECTED'
  | 'HIGH_PRIORITY_FLOW_DETECTED'
  | 'PERSPECTIVE_TRIGGERED'
  | 'UNCLUSTERED_ISSUES_EXCEEDED'
  | 'POND_CAPACITY_WARNING'

  // システムイベント
  | 'SCHEDULE_TRIGGERED'
  | 'SYSTEM_MAINTENANCE_DUE'
  | 'IDLE_TIME_DETECTED';

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
 * ISSUE_STALLED: Issueが停滞している
 */
export interface IssueStalledEvent {
  type: 'ISSUE_STALLED';
  payload: {
    issueId: string;
    stalledDays: number;
    lastUpdate: Date | string;
  };
}

/**
 * RECURRING_PATTERN_DETECTED: 繰り返し現れるパターンが検出された
 */
export interface RecurringPatternDetectedEvent {
  type: 'RECURRING_PATTERN_DETECTED';
  payload: {
    patternType: 'temporal' | 'behavioral' | 'structural' | 'statistical';
    description: string;
    occurrences: number;
    timespan?: {
      start: string;
      end: string;
    };
    confidence: number; // 0-1
    entities: string[]; // 関連するIssue ID、ユーザーID等
    suggestedKnowledge?: string; // 知識化の提案
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
 * PERSPECTIVE_TRIGGERED: 重要な観点が発見された
 */
export interface PerspectiveTriggeredEvent {
  type: 'PERSPECTIVE_TRIGGERED';
  payload: {
    flowId?: string; // 既存Flowの場合
    perspective: string;
    triggerReason: string;
    source: 'user' | 'workflow' | 'system';
    suggestedIssues?: string[]; // 関連するIssue
  };
}

/**
 * FLOW_CREATED: 新しいFlowが作成された
 */
export interface FlowCreatedEvent {
  type: 'FLOW_CREATED';
  payload: {
    flowId: string;
    flow: {
      id: string;
      title: string;
      description: string;
      status: string;
      priority?: number;
      perspective?: {
        type: 'project' | 'temporal' | 'thematic' | 'dependency';
        query?: string;
      };
      issueIds: string[];
      metadata?: Record<string, unknown>;
      createdAt: Date;
      updatedAt: Date;
    };
    createdBy: 'user' | 'system' | 'workflow';
    sourceWorkflow?: string;
  };
}

/**
 * FLOW_UPDATED: Flowが更新された
 */
export interface FlowUpdatedEvent {
  type: 'FLOW_UPDATED';
  payload: {
    flowId: string;
    updates: {
      before: Record<string, unknown>;
      after: Record<string, unknown>;
      changedFields: string[];
    };
    updatedBy: string;
  };
}

/**
 * FLOW_STATUS_CHANGED: Flowのステータスが変更された
 */
export type FlowStatus = 'active' | 'completed' | 'archived' | 'paused';

export interface FlowStatusChangedEvent {
  type: 'FLOW_STATUS_CHANGED';
  payload: {
    flowId: string;
    oldStatus: FlowStatus;
    newStatus: FlowStatus;
    reason?: string;
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

/**
 * SYSTEM_MAINTENANCE_DUE: システムメンテナンス時期
 */
export interface SystemMaintenanceDueEvent {
  type: 'SYSTEM_MAINTENANCE_DUE';
  payload: {
    maintenanceType?: string;
    lastExecution?: string;
  };
}

/**
 * IDLE_TIME_DETECTED: アイドル時間が検出された
 */
export interface IdleTimeDetectedEvent {
  type: 'IDLE_TIME_DETECTED';
  payload: {
    duration?: number; // ミリ秒
    lastActivity?: string;
  };
}

/**
 * UNCLUSTERED_ISSUES_EXCEEDED: 未整理Issueが閾値を超えた
 */
export interface UnclusteredIssuesExceededEvent {
  type: 'UNCLUSTERED_ISSUES_EXCEEDED';
  payload: {
    count: number;
    threshold: number;
    issueIds: string[];
  };
}

/**
 * POND_CAPACITY_WARNING: Pond容量が警告レベルに達した
 */
export interface PondCapacityWarningEvent {
  type: 'POND_CAPACITY_WARNING';
  payload: {
    usage: number;
    capacity: number;
    ratio: number;
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
  | IssueStalledEvent
  | FlowCreatedEvent
  | FlowUpdatedEvent
  | FlowStatusChangedEvent
  | RecurringPatternDetectedEvent
  | KnowledgeExtractableEvent
  | KnowledgeCreatedEvent
  | HighPriorityIssueDetectedEvent
  | HighPriorityFlowDetectedEvent
  | PerspectiveTriggeredEvent
  | ScheduleTriggeredEvent
  | SystemMaintenanceDueEvent
  | IdleTimeDetectedEvent
  | UnclusteredIssuesExceededEvent
  | PondCapacityWarningEvent;

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
  | 'PROCESS_USER_REQUEST' // A-0
  | 'INGEST_INPUT' // A-1
  | 'ANALYZE_ISSUE_IMPACT' // A-2
  | 'EXTRACT_KNOWLEDGE' // A-3
  | 'DEFINE_SYSTEM_RULE'
  | 'CLUSTER_ISSUES' // B-1
  | 'UPDATE_FLOW_RELATIONS' // B-2
  | 'UPDATE_FLOW_PRIORITIES' // B-3
  | 'SALVAGE_FROM_POND' // B-4
  | 'REFLECT_AND_ORGANIZE_STATE'
  | 'SUGGEST_NEXT_FLOW' // C-1
  | 'SUGGEST_NEXT_ACTION' // C-2
  | 'TUNE_SYSTEM_PARAMETERS'
  | 'COLLECT_SYSTEM_STATS'
  | 'HANDLE_SCHEDULED_TASK'; // C-4

/**
 * イベントとワークフローのマッピング
 */
export const EVENT_TO_WORKFLOWS: Record<EventType, WorkflowType[]> = {
  USER_REQUEST_RECEIVED: ['PROCESS_USER_REQUEST'],
  DATA_ARRIVED: ['INGEST_INPUT'],
  ISSUE_CREATED: ['ANALYZE_ISSUE_IMPACT', 'UPDATE_FLOW_RELATIONS'],
  ISSUE_UPDATED: ['ANALYZE_ISSUE_IMPACT', 'UPDATE_FLOW_PRIORITIES'],
  ISSUE_STATUS_CHANGED: ['EXTRACT_KNOWLEDGE', 'SUGGEST_NEXT_FLOW'],
  ISSUE_STALLED: ['SUGGEST_NEXT_ACTION'],
  FLOW_CREATED: [], // 終端イベント（現時点）
  FLOW_UPDATED: ['UPDATE_FLOW_PRIORITIES'],
  FLOW_STATUS_CHANGED: [], // 終端イベント（現時点）
  RECURRING_PATTERN_DETECTED: ['EXTRACT_KNOWLEDGE'],
  KNOWLEDGE_EXTRACTABLE: ['EXTRACT_KNOWLEDGE'],
  KNOWLEDGE_CREATED: [], // 終端イベント
  HIGH_PRIORITY_ISSUE_DETECTED: ['SUGGEST_NEXT_ACTION'],
  HIGH_PRIORITY_FLOW_DETECTED: ['SUGGEST_NEXT_ACTION'],
  PERSPECTIVE_TRIGGERED: ['CLUSTER_ISSUES'],
  SCHEDULE_TRIGGERED: ['HANDLE_SCHEDULED_TASK'],
  SYSTEM_MAINTENANCE_DUE: ['COLLECT_SYSTEM_STATS'],
  IDLE_TIME_DETECTED: ['COLLECT_SYSTEM_STATS'],
  UNCLUSTERED_ISSUES_EXCEEDED: ['CLUSTER_ISSUES'],
  POND_CAPACITY_WARNING: [], // 終端イベント（警告のみ）
};
