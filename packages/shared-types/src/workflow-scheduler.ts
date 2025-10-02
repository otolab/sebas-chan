/**
 * Workflow Scheduler Interface
 * ワークフローから利用可能なスケジューリング機能
 */

export interface WorkflowSchedulerInterface {
  /**
   * Issue関連のスケジュールを作成
   * 自然言語をModulerPromptで解釈して絶対時刻に変換
   */
  schedule(
    issueId: string,
    request: string,
    action: ScheduleAction,
    options?: ScheduleOptions
  ): Promise<ScheduleResult>;

  /**
   * スケジュールをキャンセル
   */
  cancel(scheduleId: string): Promise<boolean>;

  /**
   * Issue関連のスケジュール一覧を取得
   */
  listByIssue(issueId: string): Promise<Schedule[]>;

  /**
   * Issue関連の全スケジュールをキャンセル
   */
  cancelByIssue(issueId: string): Promise<void>;
}

export type ScheduleAction =
  | 'reminder' // リマインダー通知
  | 'escalate' // エスカレーション
  | 'auto_close' // 自動クローズ
  | 'follow_up' // フォローアップ
  | 'check_progress'; // 進捗確認

export interface ScheduledEventPayload {
  type: 'SCHEDULE_TRIGGERED';
  payload: {
    issueId: string;
    scheduleId: string;
    action: ScheduleAction;
    originalRequest: string;
    metadata?: {
      occurrences: number;
      nextRun?: string;
    };
  };
}

export interface ScheduleOptions {
  timezone?: string; // デフォルト: Asia/Tokyo
  maxOccurrences?: number; // 繰り返し最大回数
  dedupeKey?: string; // 重複防止キー（Issue ID + dedupeKeyでユニーク判定）
}

export interface ScheduleResult {
  scheduleId: string;
  interpretation: string; // AIの解釈結果
  nextRun: Date;
  pattern?: string; // 繰り返しパターン
}

export interface Schedule {
  id: string;
  issueId: string; // 関連Issue（必須）
  request: string; // 元の自然言語リクエスト
  action: ScheduleAction; // 実行するアクション
  nextRun: Date | null; // 次回実行時刻
  lastRun: Date | null; // 最終実行時刻
  pattern?: string; // 繰り返しパターン
  occurrences: number; // 実行回数
  maxOccurrences?: number; // 最大実行回数
  dedupeKey?: string; // 重複防止キー
  status: 'active' | 'completed' | 'cancelled';
  createdAt: Date;
  updatedAt: Date;
}

export interface ScheduleFilter {
  issueId?: string;
  status?: 'active' | 'completed' | 'cancelled';
  action?: ScheduleAction;
  dedupeKey?: string;
  createdAfter?: Date;
  createdBefore?: Date;
}

/**
 * 内部用: スケジュール解釈結果
 */
export interface ScheduleInterpretation {
  next: string; // ISO8601形式の次回実行時刻
  pattern?: string | null; // 繰り返しパターン
  interpretation: string; // 日本語での解釈説明
}
