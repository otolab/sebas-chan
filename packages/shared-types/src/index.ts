export interface Input {
  id: string;
  source: string; // "slack", "gmail", "manual"
  content: string;
  timestamp: Date;
}

export interface Issue {
  id: string;
  title: string;
  description: string; // 自然言語での詳細。ベクトル化の対象
  status: 'open' | 'closed';
  labels: string[];
  updates: IssueUpdate[]; // 履歴
  relations: IssueRelation[]; // 他のIssueとの関係性
  sourceInputIds: string[];
}

export interface IssueUpdate {
  timestamp: Date;
  content: string;
  author: 'user' | 'ai'; // ユーザーのメモか、AIの提案か
}

export interface IssueRelation {
  type: 'blocks' | 'relates_to' | 'duplicates' | 'parent_of';
  targetIssueId: string;
}

export interface Flow {
  id: string;
  title: string;
  description: string; // このフローの目的や依存関係。自然言語で記述
  status:
    | 'focused'
    | 'active'
    | 'monitoring'
    | 'blocked'
    | 'pending_user_decision'
    | 'pending_review'
    | 'backlog'
    | 'paused'
    | 'someday'
    | 'completed'
    | 'cancelled'
    | 'archived';
  priorityScore: number; // 0.0 ~ 1.0 AIが動的に評価
  issueIds: string[];
}

export interface Knowledge {
  id: string;
  type:
    | 'system_rule' // AIの振る舞いを定義するルール
    | 'process_manual' // 定型的な業務フローや手順書
    | 'entity_profile' // 特定の人物、組織、プロジェクトに関する情報
    | 'curated_summary' // 特定のトピックについて横断的に集められた要約情報
    | 'factoid'; // 再利用可能な単一の事実や情報
  content: string; // 知識の本体 (自然言語)
  reputation: {
    upvotes: number;
    downvotes: number;
  };
  sources: KnowledgeSource[]; // この知識を構成する情報源 (複数)
}

export type KnowledgeSource =
  | { type: 'issue'; issueId: string }
  | { type: 'pond'; pondEntryId: string }
  | { type: 'user_direct' }
  | { type: 'knowledge'; knowledgeId: string }; // 他のKnowledgeを参照

export interface PondEntry {
  id: string;
  content: string;
  vector?: number[]; // ベクトル化された表現
  timestamp: Date;
  source: string;
  score?: number; // ベクトル検索時の類似度スコア（0〜1、1に近いほど類似）
  distance?: number; // ベクトル検索時の距離（0に近いほど類似）
}

export interface PondSearchFilters {
  q?: string;
  source?: string;
  dateFrom?: string | Date;
  dateTo?: string | Date;
  limit?: number;
  offset?: number;
}

export interface PondSearchResponse {
  data: PondEntry[];
  meta: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
}

// ログ関連の型定義
export interface LogEntry {
  executionId: string;
  workflowType: string;
  timestamp: string | Date;
  level: string;
  message: string;
  phase?: string;
  data?: unknown;
}

export interface LogDetail {
  executionId: string;
  workflowType: string;
  status: string;
  startTime: string | Date;
  endTime: string | Date;
  input?: unknown;
  output?: unknown;
  logs?: LogEntry[];
}

// 追加の型定義をエクスポート
export type * from './events.js';
export type * from './workflow.js';
export type * from './api.js';
