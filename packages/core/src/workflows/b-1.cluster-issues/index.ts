/**
 * B-1: CLUSTER_ISSUES ワークフロー
 *
 * 関連するIssue群を自動的にグルーピングし、Flow生成の候補を発見する。
 * 「観点」を自動抽出し、Flowによる位置づけを提案する。
 *
 * このワークフローの役割：
 * - 未整理のIssueを分析してグループ化
 * - 各グループに対する「観点」の発見
 * - Flow作成の必要性判断と提案
 */

import type { SystemEvent, Issue } from '@sebas-chan/shared-types';
import type { WorkflowContextInterface, WorkflowEventEmitterInterface } from '../context.js';
import type { WorkflowResult, WorkflowDefinition } from '../workflow-types.js';
import { RecordType } from '../recorder.js';
import { clusterIssues, emitClusterDetectedEvents } from './actions.js';

// Issue型を拡張してflowIdsを含める
type IssueWithFlowIds = Issue & { flowIds?: string[] };

/**
 * B-1: CLUSTER_ISSUES ワークフロー実行関数
 */
async function executeClusterIssues(
  event: SystemEvent,
  context: WorkflowContextInterface,
  emitter: WorkflowEventEmitterInterface
): Promise<WorkflowResult> {
  const { storage, recorder, createDriver } = context;

  try {
    // 処理開始を記録
    recorder.record(RecordType.INFO, {
      workflowName: 'ClusterIssues',
      event: event.type,
      payload: event.payload,
    });

    // 1. Issue収集
    const issues = await storage.searchIssues('status:open');

    // Flowに属していないIssueのみ抽出
    // NOTE: issueにflowIdsプロパティがあると仮定（実際の実装では関係性を別途管理するか検討）
    const unclusteredIssues = (issues as IssueWithFlowIds[]).filter(
      issue => !issue.flowIds || issue.flowIds.length === 0
    );

    // 処理可否判定
    if (unclusteredIssues.length < 3) {
      recorder.record(RecordType.INFO, {
        message: 'Not enough unclustered issues',
        count: unclusteredIssues.length,
      });
      return {
        success: true,
        context,
        output: {
          skipped: true,
          reason: 'Not enough unclustered issues',
          issueCount: unclusteredIssues.length,
        },
      };
    }

    // 2. 既存Flowの取得
    const existingFlows = await storage.searchFlows('status:active');

    // 3. AIドライバーの作成
    const driver = await createDriver({
      requiredCapabilities: ['structured'],
      preferredCapabilities: ['japanese', 'fast'],
    });

    // 4. クラスタリング分析
    const clusteringResult = await clusterIssues(
      driver,
      unclusteredIssues,
      existingFlows,
      context.state
    );

    recorder.record(RecordType.AI_CALL, {
      purpose: 'cluster_issues',
      clustersFound: clusteringResult.clusters.length,
    });

    // 5. クラスター検出イベント発行
    await emitClusterDetectedEvents(clusteringResult, emitter, recorder);

    // 6. 結果を返す
    return {
      success: true,
      context: {
        ...context,
        state: clusteringResult.updatedState,
      },
      output: {
        clusters: clusteringResult.clusters,
        insights: clusteringResult.insights,
        metrics: {
          totalIssuesAnalyzed: unclusteredIssues.length,
          clustersFound: clusteringResult.clusters.length,
          executionTime: Date.now(),
        },
      },
    };
  } catch (error) {
    recorder.record(RecordType.ERROR, {
      workflowName: 'ClusterIssues',
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
 * B-1: CLUSTER_ISSUES ワークフロー定義
 */
export const clusterIssuesWorkflow: WorkflowDefinition = {
  name: 'ClusterIssues',
  description: '関連するIssue群を自動的にグルーピングし、Flow生成の候補を発見する',
  triggers: {
    eventTypes: [
      'UNCLUSTERED_ISSUES_EXCEEDED',
      'USER_REQUEST_RECEIVED',
    ],
    priority: 10,
    condition: (event) => {
      if (event.type === 'UNCLUSTERED_ISSUES_EXCEEDED') {
        const payload = event.payload as { count?: number };
        return (payload.count ?? 0) >= 5;
      }
      return true;
    },
  },
  executor: executeClusterIssues,
};