/**
 * ProcessUserRequestワークフローのアクション関数
 */

import type { Issue, IssueUpdate, PondEntry, Knowledge } from '@sebas-chan/shared-types';
import type { WorkflowStorageInterface, WorkflowEventEmitterInterface } from '../context.js';
import type { AIDriver } from '@moduler-prompt/driver';
import { compile } from '@moduler-prompt/core';
import { processUserRequestPromptModule, type RequestAnalysisContext } from './prompts.js';
import { RecordType, type WorkflowRecorder } from '../recorder.js';
import { REQUEST_TYPE, ACTION_TYPE } from '../shared/constants.js';

/**
 * AI分析結果の型定義
 */
export interface RequestAnalysisResult {
  interpretation: string;
  requestType: string; // REQUEST_TYPEの値
  events?: Array<{
    type: string;
    reason: string;
    payload: Record<string, unknown>;
  }>;
  actions?: Array<{
    type: string; // ACTION_TYPEの値
    target: string;
    details: string;
  }>;
  response: string;
  updatedState: string; // State更新も含む
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
 * ユーザーリクエストをAIで分析
 * 意図: リクエストの解釈、分類、必要なアクションとイベントの決定
 */
export async function analyzeUserRequest(
  driver: AIDriver,
  content: string | undefined,
  relatedData: RelatedData,
  currentState: string
): Promise<RequestAnalysisResult> {
  // 意図: PromptModuleのコンテキストに必要なデータを集約
  const analysisContext: RequestAnalysisContext = {
    content,
    relatedIssues: relatedData.issues,
    relatedKnowledge: relatedData.knowledge,
    relatedPondEntries: relatedData.pondEntries,
    currentState, // updateStatePromptModuleが必要とする現在のState
  };

  const compiledPrompt = compile(processUserRequestPromptModule, analysisContext);
  const result = await driver.query(compiledPrompt, { temperature: 0.3 });

  // 意図: 構造化出力は必須（ワークフローの前提条件）
  if (result.structuredOutput) {
    return result.structuredOutput as RequestAnalysisResult;
  }

  throw new Error('AI分析結果の取得に失敗しました');
}

/**
 * 関連データを並列で検索
 * 意図: 効率的に関連する既存データを収集
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
 * 新規Issueを作成
 * 意図: ユーザーリクエストから新しいIssueを生成
 */
export async function createNewIssue(
  storage: WorkflowStorageInterface,
  recorder: WorkflowRecorder,
  emitter: WorkflowEventEmitterInterface,
  title: string,
  description: string,
  labels: string[] = ['user-reported']
): Promise<Issue> {
  const newIssue = {
    title,
    description,
    status: 'open' as const,
    labels,
    priority: undefined,
    updates: [],
    relations: [],
    sourceInputIds: [],
  };

  const createdIssue = await storage.createIssue(newIssue);

  recorder.record(RecordType.DB_QUERY, {
    type: 'createIssue',
    issueId: createdIssue.id,
    title: createdIssue.title,
  });

  // Issue作成イベントを発行
  emitter.emit({
    type: 'ISSUE_CREATED',
    payload: {
      issueId: createdIssue.id,
      issue: createdIssue,
      createdBy: 'user',
      sourceWorkflow: 'ProcessUserRequest',
    },
  });

  return createdIssue;
}

/**
 * 既存Issueを更新
 * 意図: ユーザーからの追加情報でIssueを更新
 */
export async function updateExistingIssue(
  storage: WorkflowStorageInterface,
  recorder: WorkflowRecorder,
  emitter: WorkflowEventEmitterInterface,
  issue: Issue,
  content: string,
  author: 'user' | 'ai' = 'user'
): Promise<Issue> {
  const update: IssueUpdate = {
    timestamp: new Date(),
    content,
    author,
  };

  const updatedIssue = await storage.updateIssue(issue.id, {
    updates: [...issue.updates, update],
  });

  recorder.record(RecordType.DB_QUERY, {
    type: 'updateIssue',
    issueId: updatedIssue.id,
  });

  // Issue更新イベントを発行
  emitter.emit({
    type: 'ISSUE_UPDATED',
    payload: {
      issueId: updatedIssue.id,
      updates: {
        before: { updatesCount: issue.updates.length },
        after: { updatesCount: updatedIssue.updates.length },
        changedFields: ['updates'],
      },
      updatedBy: 'ProcessUserRequest',
    },
  });

  return updatedIssue;
}

/**
 * Pondエントリを作成
 * 意図: ユーザーリクエストをPondに保存し、DATA_ARRIVEDイベントを発行
 */
export async function createPondEntryAndEmitEvent(
  storage: WorkflowStorageInterface,
  recorder: WorkflowRecorder,
  emitter: WorkflowEventEmitterInterface,
  content: string,
  metadata?: Record<string, unknown>
): Promise<PondEntry> {
  const pondEntry = await storage.addPondEntry({
    content,
    source: 'user_request',
    metadata,
  });

  recorder.record(RecordType.DB_QUERY, {
    type: 'addPondEntry',
    pondEntryId: pondEntry.id,
  });

  // DATA_ARRIVEDイベントを発行
  emitter.emit({
    type: 'DATA_ARRIVED',
    payload: {
      source: 'user_request',
      content,
      format: 'text',
      pondEntryId: pondEntry.id,
      metadata,
      timestamp: new Date().toISOString(),
    },
  });

  recorder.record(RecordType.INFO, {
    step: 'eventEmitted',
    eventType: 'DATA_ARRIVED',
    pondEntryId: pondEntry.id,
  });

  return pondEntry;
}

/**
 * アクションを実行
 * 意図: AI判定に基づいて具体的なアクションを実行
 */

// TODO: アクションタイプが増えすぎた場合はプラグイン化を検討
export async function executeActions(
  storage: WorkflowStorageInterface,
  recorder: WorkflowRecorder,
  emitter: WorkflowEventEmitterInterface,
  actions: RequestAnalysisResult['actions'],
  content: string | undefined,
  relatedData: RelatedData
): Promise<string[]> {
  const executedActions: string[] = [];

  if (!actions || actions.length === 0) {
    return executedActions;
  }

  for (const action of actions) {
    try {
      recorder.record(RecordType.INFO, {
        step: 'executeAction',
        actionType: action.type,
        target: action.target,
      });

      if (action.type === ACTION_TYPE.CREATE && action.target === 'issue') {
        // 新規Issue作成
        const newIssue = await createNewIssue(
          storage,
          recorder,
          emitter,
          action.details || content?.substring(0, 50) || 'User Request',
          content || '',
          ['user-reported']
        );
        executedActions.push(`Issue作成: ${newIssue.id}`);
      } else if (
        action.type === ACTION_TYPE.UPDATE &&
        action.target === 'issue' &&
        relatedData.issues.length > 0
      ) {
        // 既存Issue更新
        const targetIssue = relatedData.issues[0];
        const updatedIssue = await updateExistingIssue(
          storage,
          recorder,
          emitter,
          targetIssue,
          `ユーザーからの追加情報: ${content}`,
          'user'
        );
        executedActions.push(`Issue更新: ${updatedIssue.id}`);
      } else if (action.type === ACTION_TYPE.SEARCH) {
        executedActions.push(`${action.target}を検索: ${action.details}`);
        recorder.record(RecordType.INFO, {
          step: 'searchAction',
          target: action.target,
          query: action.details,
        });
      }
    } catch (error) {
      recorder.record(RecordType.WARN, {
        step: 'actionExecutionFailed',
        action,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return executedActions;
}

/**
 * イベントを発行
 * 意図: AI判定に基づいて適切なイベントを発行
 */
export async function emitEvents(
  storage: WorkflowStorageInterface,
  recorder: WorkflowRecorder,
  emitter: WorkflowEventEmitterInterface,
  events: RequestAnalysisResult['events'],
  content: string | undefined,
  metadata?: Record<string, unknown>
): Promise<string[]> {
  const emittedEvents: string[] = [];

  if (!events || events.length === 0) {
    return emittedEvents;
  }

  for (const eventConfig of events) {
    try {
      // DATA_ARRIVEDイベントの場合はPondに保存
      if (eventConfig.type === 'DATA_ARRIVED') {
        await createPondEntryAndEmitEvent(storage, recorder, emitter, content || '', metadata);
      } else {
        // その他のイベントをそのまま発行
        emitter.emit({
          type: eventConfig.type,
          payload: eventConfig.payload || {},
        });
        recorder.record(RecordType.INFO, {
          step: 'eventEmitted',
          eventType: eventConfig.type,
          reason: eventConfig.reason,
        });
      }
      emittedEvents.push(eventConfig.type);
    } catch (error) {
      recorder.record(RecordType.WARN, {
        step: 'eventEmissionFailed',
        event: eventConfig,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return emittedEvents;
}

/**
 * デフォルトイベントを決定
 * 意図: AIが明示的にイベントを指定しなかった場合のフォールバック
 */
export function determineDefaultEvents(
  requestType: string,
  content?: string
): Array<{ type: string; payload: Record<string, unknown> }> {
  const events: Array<{ type: string; payload: Record<string, unknown> }> = [];
  const timestamp = new Date().toISOString();

  switch (requestType) {
    case REQUEST_TYPE.ISSUE:
      // ISSUE_REPORTEDは削除されたため、ISSUE_CREATEDイベントを直接発火する準備
      // 実際のIssue作成はexecutorで行い、ここではイベント準備のみ
      events.push({
        type: 'ISSUE_CREATED',
        payload: {
          content,
          createdBy: 'user' as const,
          sourceWorkflow: 'ProcessUserRequest',
          timestamp,
        },
      });
      break;

    case REQUEST_TYPE.SCHEDULE:
      // SCHEDULE_REQUESTEDは未定義のため、SCHEDULE_TRIGGEREDを使用
      events.push({
        type: 'SCHEDULE_TRIGGERED',
        payload: {
          scheduledTask: content,
          scheduledTime: timestamp,
          executionTime: timestamp,
        },
      });
      break;

    case REQUEST_TYPE.SEARCH:
      // SEARCH_REQUESTEDは未定義のため、DATA_ARRIVEDを使用
      events.push({
        type: 'DATA_ARRIVED',
        payload: {
          source: 'user_search',
          content: `検索クエリ: ${content}`,
          pondEntryId: `search-${Date.now()}`,
          metadata: { searchQuery: content },
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
