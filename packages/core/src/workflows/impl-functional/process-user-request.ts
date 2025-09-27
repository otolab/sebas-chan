import type { AgentEvent } from '../../types.js';
import type {
  WorkflowContextInterface,
  WorkflowEventEmitterInterface,
  WorkflowStorageInterface,
  WorkflowRecorder
} from '../context.js';
import type { WorkflowResult } from '../workflow-types.js';
import type { WorkflowDefinition } from '../workflow-types.js';
import type { IssueUpdate } from '@sebas-chan/shared-types';
import { compile } from '@moduler-prompt/core';

// リクエストの型定義
import {
  type ProcessUserRequestPayload,
  type AnalysisResult,
  type RelatedData,
  searchRelatedData,
  createNewIssue,
  updateExistingIssue,
  createPondEntry,
  determineDefaultEvents,
  generateStateSummary,
} from './process-user-request-helpers.js';
import { analyzeRequest } from './process-user-request-ai.js';
import {
  REQUEST_TYPE,
  ACTION_TYPE,
  AI_CONFIG,
} from './constants.js';
import { RecordType } from '../recorder.js';

interface UserRequest {
  id?: string;
  content?: string;
}

/**
 * 分析結果に基づいてアクションを実行する
 * @param analysis AI分析結果
 * @param storage ストレージインターフェース
 * @param payload リクエストペイロード
 * @param relatedData 関連データ
 * @param recorder ワークフローレコーダー
 * @returns 実行されたアクションのリスト
 */
async function executeActions(
  analysis: AnalysisResult,
  storage: WorkflowStorageInterface,
  payload: ProcessUserRequestPayload,
  relatedData: RelatedData,
  recorder: WorkflowRecorder
): Promise<string[]> {
  const executedActions: string[] = [];

  if (!analysis.actions || analysis.actions.length === 0) {
    return executedActions;
  }

  for (const action of analysis.actions) {
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
          action.details || payload.content?.substring(0, 50) || 'User Request',
          payload.content || '',
          ['user-reported']
        );

        executedActions.push(`Issue作成: ${newIssue.id}`);
        
        recorder.record(RecordType.DB_QUERY, {
          type: 'createIssue',
          issueId: newIssue.id,
        });

      } else if (action.type === ACTION_TYPE.UPDATE && action.target === 'issue' && relatedData.issues.length > 0) {
        // 既存Issue更新
        const targetIssue = relatedData.issues[0];
        const updatedIssue = await updateExistingIssue(
          storage,
          targetIssue,
          `ユーザーからの追加情報: ${payload.content}`,
          'user'
        );

        executedActions.push(`Issue更新: ${updatedIssue.id}`);
        
        recorder.record(RecordType.DB_QUERY, {
          type: 'updateIssue',
          issueId: updatedIssue.id,
        });

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
 * 分析結果に基づいてイベントを発行する
 * @param analysis AI分析結果
 * @param payload リクエストペイロード
 * @param storage ストレージインターフェース
 * @param emitter イベントエミッター
 * @param recorder ワークフローレコーダー
 * @returns 発行されたイベントタイプのリスト
 */
async function emitEvents(
  analysis: AnalysisResult,
  payload: ProcessUserRequestPayload,
  storage: WorkflowStorageInterface,
  emitter: WorkflowEventEmitterInterface,
  recorder: WorkflowRecorder
): Promise<string[]> {
  const emittedEvents: string[] = [];

  if (!analysis.events || analysis.events.length === 0) {
    return emittedEvents;
  }

  for (const eventConfig of analysis.events) {
    try {
      // DATA_ARRIVEDイベントの場合はPondに保存
      if (eventConfig.type === 'DATA_ARRIVED') {
        const pondEntry = await createPondEntry(
          storage,
          payload.content || '',
          {
            userId: payload.userId,
            sessionId: payload.sessionId,
            ...payload.metadata,
          }
        );

        recorder.record(RecordType.DB_QUERY, {
          type: 'addPondEntry',
          pondEntryId: pondEntry.id,
        });

        emitter.emit({
          type: 'DATA_ARRIVED',
          payload: {
            source: 'user_request',
            content: payload.content || '',
            format: 'text',
            pondEntryId: pondEntry.id,
            metadata: payload.metadata,
            timestamp: new Date().toISOString(),
          },
        });
      } else {
        // その他のイベントをそのまま発行
        emitter.emit({
          type: eventConfig.type,
          payload: eventConfig.payload || {},
        });
      }

      emittedEvents.push(eventConfig.type);
      
      recorder.record(RecordType.INFO, {
        step: 'eventEmitted',
        eventType: eventConfig.type,
        reason: eventConfig.reason,
      });
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
 * 次のイベントを決定する
 * @param requestType リクエストタイプ
 * @param request ユーザーリクエスト
 * @param aiResponse AI応答
 * @returns 発行するイベントのリスト
 */
function determineNextEvents(
  requestType: string,
  request: UserRequest,
  aiResponse: string
): Array<{
  type: string;
  payload: Record<string, unknown>;
}> {
  const events: Array<{
    type: string;
    payload: Record<string, unknown>;
  }> = [];

  const timestamp = new Date().toISOString();

  switch (requestType) {
    case 'issue':
      // 問題報告の場合、まずIssueを作成するイベント
      events.push({
        type: 'ISSUE_CREATED',
        payload: {
          issueId: `issue-${Date.now()}`, // 仮ID（実際はシステムが生成）
          issue: {
            title: `User reported: ${request.content?.substring(0, 50)}...`,
            description: request.content || '',
            status: 'open',
            labels: ['user-reported'],
            priority: undefined, // AIで判定される
          },
          createdBy: 'user',
          sourceWorkflow: 'ProcessUserRequest',
        },
      });
      break;

    case 'question':
      // 質問の場合、知識抽出可能イベント
      events.push({
        type: 'KNOWLEDGE_EXTRACTABLE',
        payload: {
          sourceType: 'question',
          sourceId: request.id || `question-${Date.now()}`,
          confidence: 0.8,
          reason: 'User asked a question that may contain valuable knowledge',
          suggestedCategory: 'reference',
        },
      });
      break;

    case 'feedback':
      // フィードバックの場合も知識抽出可能イベント
      events.push({
        type: 'KNOWLEDGE_EXTRACTABLE',
        payload: {
          sourceType: 'feedback',
          sourceId: request.id || `feedback-${Date.now()}`,
          confidence: 0.9,
          reason: 'User provided feedback that should be captured as knowledge',
          suggestedCategory: 'best_practice',
        },
      });
      break;

    case 'action':
      // アクション要求の場合
      events.push({
        type: 'HIGH_PRIORITY_DETECTED',
        payload: {
          entityType: 'task',
          entityId: request.id || `action-${Date.now()}`,
          priority: 85,
          reason: 'User requested immediate action',
          requiredAction: aiResponse,
        },
      });
      break;
  }

  return events;
}

/**
 * ユーザーリクエストを処理し、適切なワークフローへルーティングする
 * 
 * @param event - PROCESS_USER_REQUESTイベント
 * @param context - 実行コンテキスト（storage, recorder, createDriver）
 * @param emitter - 後続イベント発行用のエミッター
 * @returns WorkflowResult - 処理結果と更新されたコンテキスト
 * 
 * @example
 * // ユーザーからの問い合わせを処理
 * const result = await executeProcessUserRequest(
 *   { type: 'PROCESS_USER_REQUEST', payload: { content: 'エラーが発生しています' } },
 *   context,
 *   emitter
 * );
 */
async function executeProcessUserRequest(
  event: AgentEvent,
  context: WorkflowContextInterface,
  emitter: WorkflowEventEmitterInterface
): Promise<WorkflowResult> {
  const { createDriver, storage, recorder } = context;
  const payload = event.payload as unknown as ProcessUserRequestPayload;

  // 処理開始を記録
  recorder.record(RecordType.INPUT, {
    workflowName: 'ProcessUserRequest',
    event: event.type,
    payload: {
      userId: payload.userId,
      contentLength: payload.content?.length || 0,
      sessionId: payload.sessionId,
    },
  });

  try {
    // 1. 関連データを並列検索
    recorder.record(RecordType.INFO, {
      step: 'searchRelatedData',
      query: payload.content?.substring(0, 100),
    });

    const relatedData = await searchRelatedData(storage, payload.content || '');
    
    recorder.record(RecordType.DB_QUERY, {
      type: 'searchRelatedData',
      results: {
        issues: relatedData.issues.length,
        knowledge: relatedData.knowledge.length,
        pondEntries: relatedData.pondEntries.length,
      },
    });

    // 2. AIドライバーを作成
    const driver = await createDriver({
      requiredCapabilities: ['structured'],
      preferredCapabilities: ['japanese', 'reasoning'],
    });

    // 3. AIでリクエストを分析
    recorder.record(RecordType.AI_CALL, {
      step: 'analyzeRequest',
      temperature: AI_CONFIG.DEFAULT_TEMPERATURE,
    });

    const analysis = await analyzeRequest(driver, payload.content, relatedData);

    recorder.record(RecordType.INFO, {
      step: 'analysisComplete',
      requestType: analysis.requestType,
      eventsToEmit: analysis.events?.length || 0,
      actionsToExecute: analysis.actions?.length || 0,
    });

    // 4. アクションを実行
    const executedActions = await executeActions(
      analysis,
      storage,
      payload,
      relatedData,
      recorder
    );

    // 5. イベントを発行
    const emittedEvents = await emitEvents(
      analysis,
      payload,
      storage,
      emitter,
      recorder
    );

    // 6. デフォルトイベントの処理（必要な場合）
    if (emittedEvents.length === 0) {
      const defaultEvents = determineDefaultEvents(analysis.requestType, payload.content);
      for (const defaultEvent of defaultEvents) {
        emitter.emit(defaultEvent);
        emittedEvents.push(defaultEvent.type);
      }
      
      recorder.record(RecordType.INFO, {
        step: 'defaultEventsEmitted',
        events: defaultEvents.map(e => e.type),
      });
    }

    // 7. State更新
    const timestamp = new Date().toISOString();
    const updatedState = context.state + generateStateSummary({
      timestamp,
      userId: payload.userId,
      requestType: analysis.requestType,
      interpretation: analysis.interpretation,
      relatedIssues: relatedData.issues.length,
      relatedKnowledge: relatedData.knowledge.length,
      eventsEmitted: emittedEvents,
      actionsExecuted: executedActions,
    });

    // 処理完了を記録
    recorder.record(RecordType.OUTPUT, {
      workflowName: 'ProcessUserRequest',
      success: true,
      requestType: analysis.requestType,
      eventsEmitted: emittedEvents,
      actionsExecuted: executedActions,
    });

    return {
      success: true,
      context: {
        ...context,
        state: updatedState,
      },
      output: {
        requestType: analysis.requestType,
        interpretation: analysis.interpretation,
        response: analysis.response,
        eventsEmitted: emittedEvents,
        actionsExecuted: executedActions,
        relatedData: {
          issues: relatedData.issues.length,
          knowledge: relatedData.knowledge.length,
          pondEntries: relatedData.pondEntries.length,
        },
      },
    };
  } catch (error) {
    // エラーを記録
    recorder.record(RecordType.ERROR, {
      workflowName: 'ProcessUserRequest',
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });

    return {
      success: false,
      context,
      error: error as Error,
    };
  }
}

/**
 * PROCESS_USER_REQUEST ワークフロー定義
 */
export const processUserRequestWorkflow: WorkflowDefinition = {
  name: 'ProcessUserRequest',
  description: 'ユーザーリクエストを分類し、適切な後続ワークフローへルーティングする',
  triggers: {
    eventTypes: ['PROCESS_USER_REQUEST'],
  },
  executor: executeProcessUserRequest,
};
