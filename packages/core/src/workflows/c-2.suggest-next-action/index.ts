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

import type { SystemEvent, Issue } from '@sebas-chan/shared-types';
import type { WorkflowContextInterface, WorkflowEventEmitterInterface } from '../context.js';
import type { WorkflowResult, WorkflowDefinition } from '../workflow-types.js';
import type { UserContext, RequestDetail } from './actions.js';
import { RecordType } from '../recorder.js';
import { suggestIssueActions, applyActionSuggestions } from './actions.js';

// ExtendedIssue型は削除（Flow→Issueの一方向関係のため）

/**
 * C-2: SUGGEST_NEXT_ACTION_FOR_ISSUE ワークフロー実行関数
 */
async function executeSuggestNextAction(
  event: SystemEvent,
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
      flowId?: string; // C-1から連携された場合のFlowID
      issueId?: string; // 直接Issue指定の場合
      trigger?: 'flow_selected' | 'high_priority' | 'new_issue';
      priority?: number;
      context?: {
        reason?: string;
        estimatedDuration?: number;
        userState?: string;
      };
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
      issue?: Issue; // ISSUE_CREATEDイベントの場合
    };

    // 1. Issue特定と分析
    let targetIssue: Issue | null = null;
    let parentFlow: import('@sebas-chan/shared-types').Flow | null = null;

    // C-1から連携された場合（FlowIDからIssue特定）
    if (payload.flowId) {
      parentFlow = await storage.getFlow(payload.flowId);
      if (!parentFlow) {
        recorder.record(RecordType.ERROR, {
          message: 'Flow not found',
          flowId: payload.flowId,
        });
        return {
          success: false,
          context,
          error: new Error(`Flow not found: ${payload.flowId}`),
        };
      }

      // Flow内の最優先Issueを特定
      const flowIssues = await Promise.all(
        (parentFlow.issueIds || []).map((id) => storage.getIssue(id))
      );
      const activeIssues = flowIssues.filter(
        (issue) => issue && issue.status !== 'closed'
      ) as Issue[];

      // 優先度とステータスに基づいてソート
      activeIssues.sort((a, b) => {
        const priorityA = a.priority ?? 0;
        const priorityB = b.priority ?? 0;
        if (priorityB !== priorityA) return priorityB - priorityA;
        const stalledA = calculateStalledDuration(a);
        const stalledB = calculateStalledDuration(b);
        return stalledB - stalledA;
      });

      targetIssue = activeIssues[0] || null;

      if (!targetIssue) {
        recorder.record(RecordType.INFO, {
          message: 'No active issues in flow',
          flowId: payload.flowId,
        });
        return {
          success: true,
          context,
          // outputフィールドは使用しない
        };
      }
    }
    // 直接Issue指定の場合
    else if (payload.issueId) {
      targetIssue = await storage.getIssue(payload.issueId);
      if (!targetIssue) {
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
      // 直接Issue指定の場合、Flowは不明（IssueはFlowを知らない）
      parentFlow = null;
    }
    // ISSUE_CREATEDイベントの場合
    else if (payload.issue) {
      targetIssue = payload.issue;
      // ISSUE_CREATEDの場合もFlowは不明（IssueはFlowを知らない）
      parentFlow = null;
    } else {
      return {
        success: false,
        context,
        error: new Error('Either flowId, issueId, or issue must be provided'),
      };
    }

    const issue = targetIssue;

    // Issue分析データの構築
    const issueAnalysis = {
      issue,
      stalledDuration: payload.stalledDays || calculateStalledDuration(issue),
      complexity: estimateIssueComplexity(issue),
    };

    // 2. 関連情報の収集
    // 関連Knowledge検索
    const relevantKnowledge = await storage.searchKnowledge(`${issue.title} ${issue.description}`);

    // parentFlowはC-1から連携された場合のみ設定される
    // IssueはFlowを知らない（レイヤー分離の原則）

    // 3. AIドライバーの作成
    const driver = await createDriver({
      requiredCapabilities: ['structured'],
      preferredCapabilities: ['japanese', 'reasoning'],
    });

    // 4. アクション提案の生成
    const userContext: UserContext = {
      userId: undefined,
      recentActivity: payload.userContext?.previousAttempts,
      preferences: payload.userContext?.blockers
        ? { blockers: payload.userContext.blockers }
        : undefined,
    };

    const requestDetail: RequestDetail = {
      level:
        payload.requestDetail?.level === 'quick'
          ? 'summary'
          : payload.requestDetail?.level === 'comprehensive'
            ? 'detailed'
            : 'detailed',
      focusArea: payload.requestDetail?.focusArea,
      constraints: payload.requestDetail?.constraints,
    };

    const actionResult = await suggestIssueActions(
      driver,
      issueAnalysis,
      relevantKnowledge,
      parentFlow,
      userContext,
      requestDetail,
      context.state
    );

    recorder.record(RecordType.AI_CALL, {
      purpose: 'suggest_issue_actions',
      actionsCount: actionResult.actions.length,
      rootCauseIdentified: actionResult.rootCauseAnalysis?.identified,
    });

    // 5. 提案の適用とイベント発行
    await applyActionSuggestions(issue.id, actionResult, emitter, recorder, storage);

    // 6. 進捗をIssue updatesに自然言語で記録
    const primaryAction = actionResult.actions[0];
    if (primaryAction) {
      const updatedIssue = await storage.getIssue(issue.id);
      if (updatedIssue) {
        const updates = [...(updatedIssue.updates || [])];

        // C-1から連携された場合、優先度の文脈を記録
        if (parentFlow && payload.context?.reason) {
          updates.push({
            timestamp: new Date(),
            author: 'ai',
            content: `優先度を調整しました。理由: ${payload.context.reason}`,
          });
        }

        // C-2の責任：次のアクションを提案したことを記録
        updates.push({
          timestamp: new Date(),
          author: 'ai',
          content:
            `次のアクションを提案しました: ${primaryAction.title}` +
            (primaryAction.estimatedTotalTime
              ? ` (推定${primaryAction.estimatedTotalTime}分)`
              : '') +
            `. ${primaryAction.description || ''}`,
        });

        await storage.updateIssue(issue.id, { updates });

        recorder.record(RecordType.INFO, {
          message: 'Progress recorded to Issue updates',
          issueId: issue.id,
          primaryActionTitle: primaryAction.title,
          hasFlowContext: !!parentFlow,
        });
      }

      // 構造化されたアクション提案は、必要に応じてイベントで次のワークフローへ
      // （現時点では仕様を柔軟に考え、後で精査）
    }

    // 7. 結果を返す
    // 必要な情報はすべてIssue.updatesに記録済み
    // stateは実行中の一時状態のみ保持
    return {
      success: true,
      context: {
        ...context,
        state: actionResult.updatedState, // AIドライバーが必要に応じて更新したstate
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
function calculateStalledDuration(issue: Issue): number {
  const lastUpdated = new Date(issue.updatedAt);
  const now = new Date();
  return Math.floor((now.getTime() - lastUpdated.getTime()) / (1000 * 60 * 60 * 24));
}

/**
 * Issue複雑度を推定
 */
function estimateIssueComplexity(issue: Issue): 'low' | 'medium' | 'high' {
  // 簡易実装：説明の長さとラベル数から推定
  const descLength = issue.description?.length || 0;
  const labelCount = issue.labels?.length || 0;

  if (descLength > 500 || labelCount > 3) return 'high';
  if (descLength > 200 || labelCount > 1) return 'medium';
  return 'low';
}

/**
 * C-2: SUGGEST_NEXT_ACTION_FOR_ISSUE ワークフロー定義
 */
export const suggestNextActionWorkflow: WorkflowDefinition = {
  name: 'SuggestNextActionForIssue',
  description: 'Issueに対する具体的なアクションステップを提案',
  triggers: {
    eventTypes: [
      'FLOW_SELECTED_FOR_ACTION', // C-1からの連携イベント
      'HIGH_PRIORITY_ISSUE_DETECTED', // 高優先度Issue検出時
      'ISSUE_CREATED', // 新規Issue作成時（高優先度のみ）
    ],
    priority: 25,
    condition: (event) => {
      // FLOW_SELECTED_FOR_ACTIONの場合は無条件で実行
      if (event.type === 'FLOW_SELECTED_FOR_ACTION') {
        return true;
      }

      // 高優先度Issue検出時は常に実行
      if (event.type === 'HIGH_PRIORITY_ISSUE_DETECTED') {
        return true;
      }

      // ISSUE_CREATEDイベントの場合はissue.priorityをチェック
      if (event.type === 'ISSUE_CREATED') {
        const payload = event.payload as { issue?: { priority?: number } };
        return (payload.issue?.priority ?? 0) > 70;
      }

      return false;
    },
  },
  executor: executeSuggestNextAction,
};
