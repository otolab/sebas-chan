/**
 * C-1: SUGGEST_NEXT_FLOW ワークフロー
 *
 * ユーザーの現在の状況、完了したFlow、時間帯、作業パターンから、
 * 次に取り組むべき最適なFlowを提案する。
 *
 * このワークフローの役割：
 * - コンテキストに応じた最適なFlow提案
 * - 朝のルーチンや日次レビューのサポート
 * - 作業の継続性とコンテキストスイッチの最小化
 */

import type { SystemEvent, Flow } from '@sebas-chan/shared-types';
import type { WorkflowContextInterface, WorkflowEventEmitterInterface, WorkflowStorageInterface } from '../context.js';
import type { WorkflowResult, WorkflowDefinition } from '../workflow-types.js';
import type { ExtendedFlow } from '../extended-types.js';
import { RecordType } from '../recorder.js';
import { suggestNextFlow, recordSuggestion } from './actions.js';

/**
 * C-1: SUGGEST_NEXT_FLOW ワークフロー実行関数
 */
async function executeSuggestNextFlow(
  event: SystemEvent,
  context: WorkflowContextInterface,
  emitter: WorkflowEventEmitterInterface
): Promise<WorkflowResult> {
  const { storage, recorder, createDriver } = context;

  try {
    // 処理開始を記録
    recorder.record(RecordType.INFO, {
      workflowName: 'SuggestNextFlow',
      event: event.type,
      payload: event.payload,
    });

    // イベントからペイロードを取得
    const payload = event.payload as {
      trigger?: 'flow_completed' | 'user_request' | 'morning' | 'context_switch';
      completedFlowId?: string;
      currentTime?: string;
      timezone?: string;
      userState?: {
        energy?: 'high' | 'medium' | 'low';
        availableTime?: number;
        location?: string;
        preferredType?: string;
      };
      constraints?: {
        excludeFlowIds?: string[];
        includeOnlyTypes?: string[];
      };
    };

    // 1. コンテキスト情報の収集
    const contextAnalysis = {
      timeContext: {
        currentTime: new Date(payload.currentTime || Date.now()),
        timezone: payload.timezone || 'Asia/Tokyo',
        isWorkingHours: isWorkingHours(new Date(), payload.timezone),
      },
      userContext: {
        recentFlows: await getRecentCompletedFlows(storage, 7),
        currentEnergy: payload.userState?.energy || 'medium',
        availableTime: payload.userState?.availableTime || 60,
      },
      flowContext: {
        activeFlows: await storage.searchFlows('status:active'),
        upcomingDeadlines: await getUpcomingDeadlines(storage, 7),
      },
      completedFlowAnalysis: payload.completedFlowId
        ? await storage.getFlow(payload.completedFlowId)
        : null,
    };

    // 有効なFlowがない場合
    if (contextAnalysis.flowContext.activeFlows.length === 0) {
      recorder.record(RecordType.INFO, {
        message: 'No active flows available',
      });
      return {
        success: true,
        context,
        output: { message: 'No active flows to suggest' },
      };
    }

    // 2. AIドライバーの作成
    const driver = await createDriver({
      requiredCapabilities: ['structured'],
      preferredCapabilities: ['japanese', 'reasoning'],
    });

    // 3. 次のFlow提案の生成
    const suggestionResult = await suggestNextFlow(
      driver,
      contextAnalysis,
      {
        maxSuggestions: 5,
        priorityThreshold: 0.5,
      },
      context.state
    );

    recorder.record(RecordType.AI_CALL, {
      purpose: 'suggest_next_flow',
      suggestionsCount: suggestionResult.suggestions.length,
    });

    // 4. 提案の記録
    await recordSuggestion(
      payload.trigger || 'user_request',
      suggestionResult,
      contextAnalysis,
      storage,
      recorder
    );

    // 5. 主要な提案に対してイベント発行
    if (suggestionResult.suggestions.length > 0) {
      const primarySuggestion = suggestionResult.suggestions[0];

      // 高スコアの場合、観点トリガーイベント
      if (primarySuggestion.score > 0.8) {
        const flow = await storage.getFlow(primarySuggestion.flowId);
        if (flow) {
          emitter.emit({
            type: 'PERSPECTIVE_TRIGGERED',
            payload: {
              flowId: flow.id,
              perspective: flow.description,
              triggerReason: `High score suggestion: ${primarySuggestion.reason}`,
              source: 'workflow' as const,
            },
          });
        }
      }
    }

    // 6. 結果を返す
    return {
      success: true,
      context: {
        ...context,
        state: suggestionResult.updatedState,
      },
      output: {
        primarySuggestion: suggestionResult.suggestions[0],
        alternatives: suggestionResult.suggestions.slice(1, 4),
        insights: suggestionResult.contextInsights,
        fallback: suggestionResult.fallbackSuggestion,
      },
    };
  } catch (error) {
    recorder.record(RecordType.ERROR, {
      workflowName: 'SuggestNextFlow',
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      success: false,
      context,
      error: error instanceof Error ? error : new Error(String(error)),
    };
  }
}

/**
 * 作業時間内かチェック
 */
function isWorkingHours(date: Date, timezone?: string): boolean {
  // 簡易実装（実際はタイムゾーン考慮が必要）
  const hour = date.getHours();
  return hour >= 9 && hour < 18;
}

/**
 * 最近完了したFlowを取得
 */
async function getRecentCompletedFlows(storage: WorkflowStorageInterface, days: number): Promise<Flow[]> {
  const flows = await storage.searchFlows('status:completed');
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);

  return flows.filter((f) => new Date(f.updatedAt) > cutoff);
}

/**
 * 今後の締切を取得
 */
async function getUpcomingDeadlines(storage: WorkflowStorageInterface, days: number): Promise<ExtendedFlow[]> {
  const flows = await storage.searchFlows('status:active') as ExtendedFlow[];
  const future = new Date();
  future.setDate(future.getDate() + days);

  return flows
    .filter((f) => f.deadline && new Date(f.deadline) <= future)
    .sort((a, b) => {
      if (!a.deadline || !b.deadline) return 0;
      return new Date(a.deadline).getTime() - new Date(b.deadline).getTime();
    });
}

/**
 * C-1: SUGGEST_NEXT_FLOW ワークフロー定義
 */
export const suggestNextFlowWorkflow: WorkflowDefinition = {
  name: 'SuggestNextFlow',
  description: '次に取り組むべき最適なFlowを提案',
  triggers: {
    eventTypes: [
      'FLOW_STATUS_CHANGED',
      'SCHEDULE_TRIGGERED',
      'USER_REQUEST_RECEIVED',
    ],
    priority: 25,
    condition: (event) => {
      // 提案の頻度制限（実際はcontextから最後の提案時刻を取得すべき）
      // ここでは簡略化のため常にtrueを返す
      return true;
    },
  },
  executor: executeSuggestNextFlow,
};