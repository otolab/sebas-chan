/**
 * C-2: SUGGEST_NEXT_ACTION_FOR_ISSUE ワークフロー
 *
 * 特定のIssueに対して、具体的で実行可能なアクションステップを提案し、
 * Issue解決を支援する。
 *
 * このワークフローの役割：
 * - 停滞しているIssueの原因分析とアクション提案
 * - Issue分割や段階的アプローチの提案
 * - 類似ケースからの学習と適用
 */

import type { AgentEvent } from '../../types.js';
import type { WorkflowContextInterface, WorkflowEventEmitterInterface } from '../context.js';
import type { WorkflowResult, WorkflowDefinition } from '../workflow-types.js';
import { RecordType } from '../recorder.js';
import { suggestIssueActions, applyActionSuggestions } from './actions.js';

/**
 * C-2: SUGGEST_NEXT_ACTION_FOR_ISSUE ワークフロー実行関数
 */
async function executeSuggestNextAction(
  event: AgentEvent,
  context: WorkflowContextInterface,
  emitter: WorkflowEventEmitterInterface
): Promise<WorkflowResult> {
  const { storage, recorder, createDriver } = context;

  try {
    // 処理開始を記録
    recorder.record(RecordType.INFO, {
      workflowName: 'SuggestNextActionForIssue',
      event: event.type,
      payload: event.payload,
    });

    // イベントからペイロードを取得
    const payload = event.payload as {
      issueId: string;
      trigger?: 'stalled' | 'requested' | 'new_issue' | 'user_stuck';
      requestDetail?: {
        level?: 'quick' | 'detailed' | 'comprehensive';
        focusArea?: string;
        constraints?: {
          timeLimit?: number;
          resources?: string[];
          skills?: string[];
        };
      };
      userContext?: {
        previousAttempts?: string[];
        blockers?: string[];
      };
      stalledDays?: number;
    };

    // 1. Issue取得と分析
    const issue = await storage.getIssue(payload.issueId);
    if (!issue) {
      recorder.record(RecordType.ERROR, {
        message: 'Issue not found',
        issueId: payload.issueId,
      });
      return {
        success: false,
        context,
        error: new Error(`Issue not found: ${payload.issueId}`),
      };
    }

    // Issue分析データの構築
    const issueAnalysis = {
      issue,
      stalledDuration: payload.stalledDays || calculateStalledDuration(issue),
      complexity: estimateIssueComplexity(issue),
    };

    // 2. 関連情報の収集
    // 関連Knowledge検索
    const relevantKnowledge = await storage.searchKnowledge(
      `${issue.title} ${issue.description}`
    );

    // 類似の解決済みIssue検索
    const similarResolvedIssues = await findSimilarResolvedIssues(storage, issue);

    // Issueが属するFlow取得
    const issueWithFlowIds = issue as any;
    const parentFlow = issueWithFlowIds.flowIds && issueWithFlowIds.flowIds.length > 0
      ? await storage.getFlow(issueWithFlowIds.flowIds[0])
      : null;

    // 3. AIドライバーの作成
    const driver = await createDriver({
      requiredCapabilities: ['structured'],
      preferredCapabilities: ['japanese', 'reasoning'],
    });

    // 4. アクション提案の生成
    const actionResult = await suggestIssueActions(
      driver,
      issueAnalysis,
      relevantKnowledge,
      similarResolvedIssues,
      parentFlow,
      payload.userContext || {},
      payload.requestDetail || { level: 'detailed' },
      context.state
    );

    recorder.record(RecordType.AI_CALL, {
      purpose: 'suggest_issue_actions',
      actionsCount: actionResult.actions.length,
      rootCauseIdentified: actionResult.rootCauseAnalysis?.identified,
    });

    // 5. 提案の適用とイベント発行
    await applyActionSuggestions(
      issue.id,
      actionResult,
      emitter,
      recorder,
      storage
    );

    // 6. 結果を返す
    const primaryAction = actionResult.actions[0];
    return {
      success: true,
      context: {
        ...context,
        state: actionResult.updatedState,
      },
      output: {
        primaryAction: primaryAction ? {
          title: primaryAction.title,
          type: primaryAction.type,
          steps: primaryAction.steps,
          estimatedTime: primaryAction.estimatedTotalTime,
          confidence: primaryAction.confidence,
          prerequisites: primaryAction.prerequisites,
        } : null,
        alternativeActions: actionResult.actions.slice(1, 3).map(a => ({
          title: a.title,
          type: a.type,
          reason: a.description,
        })),
        insights: {
          rootCause: actionResult.rootCauseAnalysis,
          splitSuggestion: actionResult.splitSuggestion,
          escalation: actionResult.escalationSuggestion,
        },
      },
    };
  } catch (error) {
    recorder.record(RecordType.ERROR, {
      workflowName: 'SuggestNextActionForIssue',
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
 * Issue停滞期間を計算（日数）
 */
function calculateStalledDuration(issue: any): number {
  const lastUpdated = new Date(issue.updatedAt);
  const now = new Date();
  return Math.floor((now.getTime() - lastUpdated.getTime()) / (1000 * 60 * 60 * 24));
}

/**
 * Issue複雑度を推定
 */
function estimateIssueComplexity(issue: any): 'low' | 'medium' | 'high' {
  // 簡易実装：説明の長さとラベル数から推定
  const descLength = issue.description?.length || 0;
  const labelCount = issue.labels?.length || 0;

  if (descLength > 500 || labelCount > 3) return 'high';
  if (descLength > 200 || labelCount > 1) return 'medium';
  return 'low';
}

/**
 * 類似の解決済みIssueを検索
 */
async function findSimilarResolvedIssues(storage: any, issue: any): Promise<any[]> {
  const resolvedIssues = await storage.searchIssues('status:closed');

  // 簡易的な類似度計算（実際はベクトル検索を使うべき）
  return resolvedIssues
    .filter((i: any) => i.resolution)
    .slice(0, 5)
    .map((i: any) => ({
      ...i,
      similarity: 0.8, // 仮の類似度
    }));
}

/**
 * C-2: SUGGEST_NEXT_ACTION_FOR_ISSUE ワークフロー定義
 */
export const suggestNextActionWorkflow: WorkflowDefinition = {
  name: 'SuggestNextActionForIssue',
  description: 'Issueに対する具体的なアクションステップを提案',
  triggers: {
    eventTypes: [
      'ISSUE_STALLED',
      'ACTION_REQUESTED',
      'ISSUE_OPENED',
      'USER_STUCK',
    ],
    priority: 25,
    condition: (event) => {
      // 高優先度Issueまたは明示的な要求の場合のみ
      if (event.type === 'ACTION_REQUESTED' || event.type === 'USER_STUCK') {
        return true;
      }
      const payload = event.payload as { priority?: number };
      return (payload.priority ?? 0) > 70;
    },
  },
  executor: executeSuggestNextAction,
};