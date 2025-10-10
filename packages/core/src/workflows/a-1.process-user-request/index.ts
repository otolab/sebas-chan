/**
 * A-1: PROCESS_USER_REQUEST ワークフロー
 *
 * ユーザーリクエストを分類し、適切な後続ワークフローへルーティングする。
 *
 * このワークフローの役割：
 * - ユーザーからの直接的なリクエストを理解し、意図を解釈
 * - 追跡すべき新しい事項、既存事項への更新、質問などを分類
 * - 関連する既存の追跡事項や知識を検索して文脈を把握
 * - 適切なアクションを実行し、必要なイベントを発行
 */

import type { SystemEvent } from '@sebas-chan/shared-types';
import type { WorkflowContextInterface, WorkflowEventEmitterInterface } from '../context.js';
import type { WorkflowResult, WorkflowDefinition } from '../workflow-types.js';
import { RecordType } from '../recorder.js';
import {
  analyzeUserRequest,
  searchRelatedData,
  executeActions,
  emitEvents,
  determineDefaultEvents,
} from './actions.js';

/**
 * PROCESS_USER_REQUESTイベントのペイロード型
 */
interface ProcessUserRequestPayload {
  userId?: string;
  content?: string;
  sessionId?: string;
  metadata?: Record<string, unknown>;
}

/**
 * A-1: PROCESS_USER_REQUEST ワークフロー実行関数
 *
 * 処理の流れ:
 * 1. ユーザーリクエストの受信
 * 2. 関連データの検索（Issues、Knowledge、Pond）
 * 3. AIによるリクエスト分析と分類
 * 4. 必要なアクションの実行（Issue作成/更新等）
 * 5. 後続ワークフローへのイベント発行
 * 6. システムStateの更新
 */
async function executeProcessUserRequest(
  event: SystemEvent,
  context: WorkflowContextInterface,
  emitter: WorkflowEventEmitterInterface
): Promise<WorkflowResult> {
  const { storage, createDriver, recorder } = context;
  const payload = event.payload as unknown as ProcessUserRequestPayload;

  // 処理開始を記録
  recorder.record(RecordType.INPUT, {
    workflowName: 'ProcessUserRequest',
    event: event.type,
    userId: payload.userId,
    contentLength: payload.content?.length || 0,
    sessionId: payload.sessionId,
  });

  try {
    // 1. 関連データを並列検索（意図: リクエスト分析のコンテキスト収集）
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

    // 2. 単一のドライバーインスタンスを作成（意図: オーバーヘッド削減）
    const driver = await createDriver({
      requiredCapabilities: ['structured'],
      preferredCapabilities: ['japanese', 'reasoning'],
    });

    // 3. AIでリクエストを分析とState更新を同時に実行（意図: 1回のAI呼び出しで完結）
    recorder.record(RecordType.AI_CALL, {
      step: 'analyzeUserRequest',
      model: 'structured-japanese-reasoning',
      temperature: 0.3,
    });

    const analysis = await analyzeUserRequest(driver, payload.content, relatedData, context.state);

    recorder.record(RecordType.INFO, {
      step: 'analysisComplete',
      requestType: analysis.requestType,
      eventsToEmit: analysis.events?.length || 0,
      actionsToExecute: analysis.actions?.length || 0,
    });

    // 4. アクションを実行
    const executedActions = await executeActions(
      storage,
      recorder,
      emitter,
      analysis.actions,
      payload.content,
      relatedData
    );

    // 5. イベントを発行
    let emittedEvents = await emitEvents(
      storage,
      recorder,
      emitter,
      analysis.events,
      payload.content,
      {
        userId: payload.userId,
        sessionId: payload.sessionId,
        ...payload.metadata,
      }
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
        events: defaultEvents.map((e) => e.type),
      });
    }

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
        state: analysis.updatedState, // AIが生成したStateを使用
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
      error: error instanceof Error ? error : new Error(String(error)),
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
    eventTypes: ['USER_REQUEST_RECEIVED'],
    priority: 50, // 高優先度：ユーザー入力の処理
  },
  executor: executeProcessUserRequest,
};
