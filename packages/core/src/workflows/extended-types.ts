/**
 * ワークフロー内で使用する拡張型定義
 *
 * shared-typesの基本型に対して、ワークフロー実装で必要な追加プロパティを定義
 */

import type {
  Issue as BaseIssue,
  Flow as BaseFlow,
  Knowledge as BaseKnowledge,
} from '@sebas-chan/shared-types';

/**
 * ワークフロー内で使用するIssue拡張型
 */
export interface ExtendedIssue extends BaseIssue {
  // Flowとの関連
  flowIds?: string[];
  // ソース情報
  source?: string;
}

/**
 * Flow観点（perspective）の定義
 */
export interface FlowPerspective {
  type: 'project' | 'phase' | 'goal' | 'topic' | 'temporal' | 'personal';
  title: string;
  description: string;
}

/**
 * ワークフロー内で使用するFlow拡張型
 */
export interface ExtendedFlow extends BaseFlow {
  // 観点情報
  perspective?: FlowPerspective;
  // Issue間の関係性
  relationships?: string;
  // 完了条件
  completionCriteria?: string;
  // 緊急度レベル
  urgencyLevel?: 'low' | 'medium' | 'high' | 'critical';
  // 健康状態
  health?: 'healthy' | 'at_risk' | 'stalled' | 'blocked';
  // 締切
  deadline?: Date;
  // 推奨作業時間帯
  recommendedTimeSlot?: string;
}

/**
 * ワークフロー内で使用するKnowledge拡張型
 */
export interface ExtendedKnowledge extends BaseKnowledge {
  // 要約
  summary?: string;
  // 信頼度
  confidence?: number;
  // タグ
  tags?: string[];
  // メタデータ
  metadata?: Record<string, unknown>;
  // タイトル（ワークフロー内で生成）
  title?: string;
}

/**
 * 型ガード関数
 */
export function hasFlowIds(issue: BaseIssue): issue is ExtendedIssue {
  return 'flowIds' in issue;
}

export function hasPerspective(flow: BaseFlow): flow is ExtendedFlow {
  return 'perspective' in flow;
}

export function hasSummary(knowledge: BaseKnowledge): knowledge is ExtendedKnowledge {
  return 'summary' in knowledge;
}
