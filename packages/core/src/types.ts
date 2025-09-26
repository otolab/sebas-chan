/**
 * Core パッケージの基本型定義
 * 循環参照を避けるため、独立したファイルに定義
 */

// ============================================================================
// イベントペイロード型定義
// ============================================================================

// DATA_ARRIVED - 外部データが到着（Pondに保存済み）
export interface DataArrivedPayload {
  pondEntryId: string; // Pondに保存されたエントリのID
}

// PROCESS_USER_REQUEST - ユーザーリクエスト処理
export interface ProcessUserRequestPayload {
  userId: string;
  content: string;
  context?: string; // 自然言語的コンテキスト（例: "work: ECサイト開発"）
  sessionId?: string;
  metadata?: Record<string, unknown>;
}

// ISSUE_CREATED - Issue作成完了
export interface IssueCreatedPayload {
  issueId: string;
  title: string;
  priority?: number;
}

// ISSUE_UPDATED - Issue更新完了
export interface IssueUpdatedPayload {
  issueId: string;
  changes: Record<string, unknown>;
}

// HIGH_PRIORITY_DETECTED - 高優先度タスク検出
export interface HighPriorityDetectedPayload {
  issueId?: string;
  priority: number;
  reason: string;
  requiredAction?: string;
}

// ERROR_DETECTED - エラー検出
export interface ErrorDetectedPayload {
  severity: 'low' | 'medium' | 'high' | 'critical';
  errorType: string;
  message: string;
  issueId?: string;
}

// KNOWLEDGE_EXTRACTABLE - 知識抽出可能
export interface KnowledgeExtractablePayload {
  sourceType: 'issue' | 'conversation' | 'feedback';
  sourceId: string;
  suggestedCategory: 'reference' | 'best_practice' | 'lesson_learned' | 'solution';
  content?: string;
}

// SCHEDULE_TRIGGERED - スケジュール実行
export interface ScheduleTriggeredPayload {
  scheduleId: string;
  issueId: string;
  action: string;
  nextRun?: string;
}

// 汎用ペイロード型（後方互換性のため維持）
export type AgentEventPayload = Record<string, unknown>;

// ============================================================================
// イベント型定義
// ============================================================================

// 型安全なイベント定義
export type TypedAgentEvent =
  | { type: 'DATA_ARRIVED'; payload: DataArrivedPayload; timestamp: Date }
  | { type: 'PROCESS_USER_REQUEST'; payload: ProcessUserRequestPayload; timestamp: Date }
  | { type: 'ISSUE_CREATED'; payload: IssueCreatedPayload; timestamp: Date }
  | { type: 'ISSUE_UPDATED'; payload: IssueUpdatedPayload; timestamp: Date }
  | { type: 'HIGH_PRIORITY_DETECTED'; payload: HighPriorityDetectedPayload; timestamp: Date }
  | { type: 'ERROR_DETECTED'; payload: ErrorDetectedPayload; timestamp: Date }
  | { type: 'KNOWLEDGE_EXTRACTABLE'; payload: KnowledgeExtractablePayload; timestamp: Date }
  | { type: 'SCHEDULE_TRIGGERED'; payload: ScheduleTriggeredPayload; timestamp: Date }
  | { type: string; payload: AgentEventPayload; timestamp: Date }; // フォールバック

// エージェントイベントの基本型定義（後方互換性のため維持）
export interface AgentEvent {
  type: string;
  payload: AgentEventPayload;
  timestamp: Date;
}
