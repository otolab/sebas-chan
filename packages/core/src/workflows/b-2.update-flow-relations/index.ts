/**
 * B-2: UPDATE_FLOW_RELATIONS ワークフロー
 *
 * FlowとIssueの関係性、およびFlow間の関係性を最新状態に保ち、
 * 「観点」による位置づけを維持・更新する。
 *
 * このワークフローの役割：
 * - Issue変更に応じたFlow descriptionの更新
 * - Flow健全性の評価と更新
 * - Flow間の関係性の再評価
 */

import type { AgentEvent } from '../../types.js';
import type { WorkflowContextInterface, WorkflowEventEmitterInterface } from '../context.js';
import type { WorkflowResult, WorkflowDefinition } from '../workflow-types.js';
import { RecordType } from '../recorder.js';
import { analyzeFlowRelations, applyFlowUpdates } from './actions.js';

/**
 * B-2: UPDATE_FLOW_RELATIONS ワークフロー実行関数
 */
async function executeUpdateFlowRelations(
  event: AgentEvent,
  context: WorkflowContextInterface,
  emitter: WorkflowEventEmitterInterface
): Promise<WorkflowResult> {
  const { storage, recorder, createDriver } = context;

  try {
    // 処理開始を記録
    recorder.record(RecordType.INFO, {
      workflowName: 'UpdateFlowRelations',
      event: event.type,
      payload: event.payload,
    });

    // イベントからペイロードを取得
    const payload = event.payload as {
      flowId?: string;
      trigger?: 'issue_changed' | 'perspective_changed' | 'scheduled';
      changedIssueIds?: string[];
      issueId?: string;
    };

    // 1. 対象Flowの取得
    const flows = payload.flowId
      ? [await storage.getFlow(payload.flowId)]
      : await storage.searchFlows('status:active');

    const validFlows = flows.filter(f => f !== null);
    if (validFlows.length === 0) {
      recorder.record(RecordType.INFO, {
        message: 'No active flows to update',
      });
      return {
        success: true,
        context,
        output: { message: 'No active flows to update' },
      };
    }

    // 2. 各Flowに関連するIssueを取得
    const flowAnalysis = await Promise.all(
      validFlows.map(async (flow) => {
        const issues = await Promise.all(
          flow.issueIds.map(id => storage.getIssue(id))
        );
        return {
          flow,
          issues: issues.filter(i => i !== null),
          completionRate: calculateCompletionRate(issues),
          staleness: calculateStaleness(flow),
        };
      })
    );

    // 3. AIドライバーの作成
    const driver = await createDriver({
      requiredCapabilities: ['structured'],
      preferredCapabilities: ['japanese', 'reasoning'],
    });

    // 4. 関係性の再評価
    const analysisResult = await analyzeFlowRelations(
      driver,
      flowAnalysis,
      payload.changedIssueIds || (payload.issueId ? [payload.issueId] : []),
      context.state
    );

    recorder.record(RecordType.AI_CALL, {
      purpose: 'analyze_flow_relations',
      flowsAnalyzed: flowAnalysis.length,
      updates: analysisResult.flowUpdates.length,
    });

    // 5. 更新の適用とイベント発行
    await applyFlowUpdates(analysisResult, storage, emitter, recorder);

    // 6. 結果を返す
    return {
      success: true,
      context: {
        ...context,
        state: analysisResult.updatedState,
      },
      output: {
        updatedFlows: analysisResult.flowUpdates.map(u => u.flowId),
        changes: analysisResult.flowUpdates.map(u => ({
          flowId: u.flowId,
          health: u.health,
          perspectiveValid: u.perspectiveValidity.stillValid,
        })),
        metrics: {
          flowsAnalyzed: flowAnalysis.length,
          changesApplied: analysisResult.flowUpdates.length,
          executionTime: Date.now(),
        },
      },
    };
  } catch (error) {
    recorder.record(RecordType.ERROR, {
      workflowName: 'UpdateFlowRelations',
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
 * 完了率を計算
 */
function calculateCompletionRate(issues: any[]): number {
  if (issues.length === 0) return 0;
  const closedCount = issues.filter(i => i?.status === 'closed').length;
  return Math.round((closedCount / issues.length) * 100);
}

/**
 * 停滞度を計算（日数）
 */
function calculateStaleness(flow: any): number {
  const lastUpdated = new Date(flow.updatedAt);
  const now = new Date();
  return Math.floor((now.getTime() - lastUpdated.getTime()) / (1000 * 60 * 60 * 24));
}

/**
 * B-2: UPDATE_FLOW_RELATIONS ワークフロー定義
 */
export const updateFlowRelationsWorkflow: WorkflowDefinition = {
  name: 'UpdateFlowRelations',
  description: 'FlowとIssueの関係性を最新状態に保ち、観点による位置づけを維持・更新',
  triggers: {
    eventTypes: [
      'ISSUE_CREATED',
      'ISSUE_UPDATED',
      'ISSUE_STATUS_CHANGED',
      'ISSUE_CLOSED',
    ],
    // Issue変更に応じて優先度を変える
    priority: 15,
    condition: (event) => {
      // ISSUE_CLOSEDは重要なので常に実行
      if (event.type === 'ISSUE_CLOSED') {
        return true;
      }
      // それ以外は高優先度Issueの場合のみ
      const payload = event.payload as { priority?: number };
      return (payload.priority ?? 0) > 50;
    },
  },
  executor: executeUpdateFlowRelations,
};