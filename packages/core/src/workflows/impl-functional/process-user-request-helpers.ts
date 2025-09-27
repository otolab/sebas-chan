/**
 * ProcessUserRequestワークフローのヘルパー関数
 */

import type { AgentEvent } from '../../types.js';
import type { Issue, IssueUpdate, PondEntry, Knowledge } from '@sebas-chan/shared-types';
import type { WorkflowStorageInterface } from '../context.js';
import {
  REQUEST_TYPE,
  ACTION_TYPE,
  type RequestType,
  type ActionType,
} from './constants.js';

/**
 * ユーザーリクエストのペイロード
 */
export interface ProcessUserRequestPayload {
  userId?: string;
  content?: string;
  sessionId?: string;
  metadata?: Record<string, unknown>;
}

/**
 * AI分析結果
 */
export interface AnalysisResult {
  interpretation: string;
  requestType: RequestType;
  events?: Array<{
    type: string;
    reason: string;
    payload: Record<string, unknown>;
  }>;
  actions?: Array<{
    type: ActionType;
    target: string;
    details: string;
  }>;
  response: string;
}

/**
 * 関連データの検索結果
 */
export interface RelatedData {
  issues: Issue[];
  knowledge: Knowledge[];
  pondEntries: PondEntry[];
}

/**
 * リクエストタイプを分類する
 * @param content リクエスト内容
 * @returns 分類されたリクエストタイプ
 */
export function classifyRequest(content: string | undefined): RequestType {
  if (!content) return REQUEST_TYPE.OTHER;

  const lowerContent = content.toLowerCase();

  // キーワードベースの簡易分類
  if (lowerContent.includes('エラー') || lowerContent.includes('error') ||
      lowerContent.includes('問題') || lowerContent.includes('issue')) {
    return REQUEST_TYPE.ISSUE;
  }

  if (lowerContent.includes('いつ') || lowerContent.includes('予定') ||
      lowerContent.includes('スケジュール') || lowerContent.includes('schedule')) {
    return REQUEST_TYPE.SCHEDULE;
  }

  if (lowerContent.includes('検索') || lowerContent.includes('探し') ||
      lowerContent.includes('search') || lowerContent.includes('find')) {
    return REQUEST_TYPE.SEARCH;
  }

  if (lowerContent.includes('？') || lowerContent.includes('?') ||
      lowerContent.includes('教えて') || lowerContent.includes('how')) {
    return REQUEST_TYPE.QUESTION;
  }

  if (lowerContent.includes('実行') || lowerContent.includes('して') ||
      lowerContent.includes('do') || lowerContent.includes('execute')) {
    return REQUEST_TYPE.ACTION;
  }

  return REQUEST_TYPE.FEEDBACK;
}

/**
 * 関連データを並列で検索する
 * @param storage ストレージインターフェース
 * @param query 検索クエリ
 * @returns 関連データ
 */
export async function searchRelatedData(
  storage: WorkflowStorageInterface,
  query: string
): Promise<RelatedData> {
  const [issues, knowledge, pondEntries] = await Promise.all([
    storage.searchIssues(query),
    storage.searchKnowledge(query),
    storage.searchPond(query),
  ]);

  return { issues, knowledge, pondEntries };
}

/**
 * 新規Issueを作成する
 * @param storage ストレージインターフェース
 * @param title タイトル
 * @param description 説明
 * @param labels ラベル
 * @returns 作成されたIssue
 */
export async function createNewIssue(
  storage: WorkflowStorageInterface,
  title: string,
  description: string,
  labels: string[] = ['user-reported']
): Promise<Issue> {
  return await storage.createIssue({
    title,
    description,
    status: 'open' as const,
    labels,
    priority: undefined,
    updates: [],
    relations: [],
    sourceInputIds: [],
  });
}

/**
 * 既存Issueを更新する
 * @param storage ストレージインターフェース
 * @param issue 更新対象のIssue
 * @param content 更新内容
 * @param author 更新者
 * @returns 更新されたIssue
 */
export async function updateExistingIssue(
  storage: WorkflowStorageInterface,
  issue: Issue,
  content: string,
  author: 'user' | 'ai' = 'user'
): Promise<Issue> {
  const update: IssueUpdate = {
    timestamp: new Date(),
    content,
    author,
  };

  return await storage.updateIssue(issue.id, {
    updates: [...issue.updates, update],
  });
}

/**
 * Pondエントリを作成する
 * @param storage ストレージインターフェース
 * @param content コンテンツ
 * @param metadata メタデータ
 * @returns 作成されたPondエントリ
 */
export async function createPondEntry(
  storage: WorkflowStorageInterface,
  content: string,
  metadata?: Record<string, unknown>
): Promise<PondEntry> {
  return await storage.addPondEntry({
    content,
    source: 'user_request',
    metadata,
  });
}

/**
 * デフォルトイベントを決定する
 * @param requestType リクエストタイプ
 * @param content コンテンツ
 * @returns イベントリスト
 */
export function determineDefaultEvents(
  requestType: RequestType,
  content?: string
): Array<{ type: string; payload: Record<string, unknown> }> {
  const events: Array<{ type: string; payload: Record<string, unknown> }> = [];
  const timestamp = new Date().toISOString();

  switch (requestType) {
    case REQUEST_TYPE.ISSUE:
      events.push({
        type: 'ISSUE_REPORTED',
        payload: {
          content,
          reportedBy: 'user',
          timestamp,
        },
      });
      break;

    case REQUEST_TYPE.SCHEDULE:
      events.push({
        type: 'SCHEDULE_REQUESTED',
        payload: {
          content,
          timestamp,
        },
      });
      break;

    case REQUEST_TYPE.SEARCH:
      events.push({
        type: 'SEARCH_REQUESTED',
        payload: {
          query: content,
          timestamp,
        },
      });
      break;

    default:
      // デフォルトでDATA_ARRIVEDイベントを発行
      events.push({
        type: 'DATA_ARRIVED',
        payload: {
          source: 'user_request',
          content,
          format: 'text',
          timestamp,
        },
      });
  }

  return events;
}

/**
 * イベントカタログのサマリーを生成する
 * @returns イベントカタログの説明文
 */
export function getEventCatalogSummary(): string {
  return `
利用可能なイベント:
- DATA_ARRIVED: 外部データ到着（Pond自動保存）
- ISSUE_CREATED: 新Issue作成
- ISSUE_UPDATED: Issue更新
- ISSUE_STATUS_CHANGED: Issueステータス変更
- ERROR_DETECTED: エラー検出
- PATTERN_FOUND: パターン発見
- KNOWLEDGE_EXTRACTABLE: 知識抽出可能
- HIGH_PRIORITY_DETECTED: 高優先度検出
- SCHEDULED_TIME_REACHED: スケジュール時刻到達
`;
}

/**
 * State更新用のサマリーを生成する
 * @param params パラメータ
 * @returns State更新用の文字列
 */
export function generateStateSummary(params: {
  timestamp: string;
  userId?: string;
  requestType: RequestType;
  interpretation: string;
  relatedIssues: number;
  relatedKnowledge: number;
  eventsEmitted: string[];
  actionsExecuted: string[];
}): string {
  return `
## ユーザーリクエスト処理 (${params.timestamp})
- User ID: ${params.userId || 'anonymous'}
- Request Type: ${params.requestType}
- Interpretation: ${params.interpretation}
- Related Issues: ${params.relatedIssues}
- Related Knowledge: ${params.relatedKnowledge}
- Events Emitted: ${params.eventsEmitted.join(', ') || 'None'}
- Actions Executed: ${params.actionsExecuted.join(', ') || 'None'}
`;
}