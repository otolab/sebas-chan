/**
 * ProcessUserRequestワークフロー固有の定数
 *
 * 注意: 他で定義されているものは使わない（作らなければ壊れない）
 */

// AI分析で使用する内部的な分類（ワークフロー固有）
export const REQUEST_TYPE = {
  ISSUE: 'issue',
  QUESTION: 'question',
  ACTION: 'action',
  FEEDBACK: 'feedback',
  SCHEDULE: 'schedule',
  SEARCH: 'search',
  OTHER: 'other',
} as const;

export type RequestType = typeof REQUEST_TYPE[keyof typeof REQUEST_TYPE];

// AI分析結果のアクション分類（ワークフロー固有）
export const ACTION_TYPE = {
  SEARCH: 'search',
  CREATE: 'create',
  UPDATE: 'update',
  ANALYZE: 'analyze',
} as const;

export type ActionType = typeof ACTION_TYPE[keyof typeof ACTION_TYPE];

// AI処理の設定値（ワークフロー固有）
export const AI_CONFIG = {
  DEFAULT_TEMPERATURE: 0.3,
  MAX_RELATED_ISSUES: 10,
  MAX_RELATED_KNOWLEDGE: 3,
} as const;