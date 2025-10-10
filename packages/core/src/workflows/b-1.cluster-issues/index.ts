/**
 * B-1: CLUSTER_ISSUES ワークフロー
 *
 * PERSPECTIVE_TRIGGEREDイベントを受けて、観点に基づいてIssue群をクラスタリングし、
 * 関連するIssueをまとめたFlowを自動作成する。
 *
 * このワークフローの役割：
 * - A-0等から発行されるPERSPECTIVE_TRIGGEREDイベントを処理
 * - 全Issueを対象にクラスタリング分析（Flowに属するものも含む）
 * - クラスタリング結果に基づいてFlowを自動作成
 * - 一つのIssueが複数のFlowに属することを許容（複数の観点から管理）
 */

import type {
  SystemEvent,
  Issue,
  Flow,
  PerspectiveTriggeredEvent
} from '@sebas-chan/shared-types';
import type { WorkflowContextInterface, WorkflowEventEmitterInterface } from '../context.js';
import type { WorkflowResult, WorkflowDefinition } from '../workflow-types.js';
import { RecordType } from '../recorder.js';
import { clusterIssues, emitClusterDetectedEvents } from './actions.js';

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

    // PERSPECTIVE_TRIGGEREDイベントの処理
    const perspectiveEvent = event as PerspectiveTriggeredEvent;

    // 既存Flowの更新の場合はスキップ
    if (perspectiveEvent.payload.flowId) {
      recorder.record(RecordType.INFO, {
        message: 'Existing flow update, skipping clustering',
        flowId: perspectiveEvent.payload.flowId,
      });
      return {
        success: true,
        context,
        output: {
          skipped: true,
          reason: 'Existing flow update',
        },
      };
    }

    // 観点に基づいてクラスタリング実行
    // 1. 全てのオープンなIssueを収集
    const issues = await storage.searchIssues('status:open');

    // 2. 既存Flowの取得（重複チェック用）
    const existingFlows = await storage.searchFlows('status:active');

    // 処理可否判定
    if (issues.length < 3) {
      recorder.record(RecordType.INFO, {
        message: 'Not enough issues for clustering',
        count: issues.length,
      });
      return {
        success: true,
        context,
        output: {
          skipped: true,
          reason: 'Not enough issues for clustering',
          issueCount: issues.length,
        },
      };
    }

    // 3. AIドライバーの作成
    const driver = await createDriver({
      requiredCapabilities: ['structured'],
      preferredCapabilities: ['japanese', 'fast'],
    });

    // 4. 観点に基づくクラスタリング分析
    // perspectiveEventのperspectiveを考慮してクラスタリング
    recorder.record(RecordType.INFO, {
      message: 'Starting clustering with perspective',
      perspective: perspectiveEvent.payload.perspective,
      triggerReason: perspectiveEvent.payload.triggerReason,
    });

    const clusteringResult = await clusterIssues(
      driver,
      issues,
      existingFlows,
      context.state
    );

    recorder.record(RecordType.AI_CALL, {
      purpose: 'cluster_issues',
      clustersFound: clusteringResult.clusters.length,
    });

    // 5. クラスターからFlow作成
    const createdFlows: Flow[] = [];
    for (const cluster of clusteringResult.clusters) {
      // 3件以上のIssueを含むクラスタのみFlow作成
      if (cluster.issueIds.length >= 3) {
        const newFlow: Flow = {
          id: `flow-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          title: cluster.perspective.title,
          description: cluster.perspective.description,
          status: 'active',
          priorityScore: cluster.suggestedPriority / 100, // 0-100を0-1に変換
          issueIds: cluster.issueIds,
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        await storage.createFlow(newFlow);
        createdFlows.push(newFlow);

        // FLOW_CREATEDイベントを発火
        emitter.emit({
          type: 'FLOW_CREATED',
          payload: {
            flowId: newFlow.id,
            flow: newFlow,
            createdBy: 'workflow' as const,
            sourceWorkflow: 'ClusterIssues',
            perspective: cluster.perspective.description,
          },
        });

        recorder.record(RecordType.INFO, {
          event: 'FLOW_CREATED',
          flowId: newFlow.id,
          title: newFlow.title,
          issueCount: newFlow.issueIds.length,
          perspectiveType: cluster.perspective.type,
        });
      }
    }

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
        flowsCreated: createdFlows.length,
        metrics: {
          totalIssuesAnalyzed: issues.length,
          clustersFound: clusteringResult.clusters.length,
          flowsCreated: createdFlows.length,
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
  description: '観点に基づいてIssue群をクラスタリングし、Flowを作成する',
  triggers: {
    eventTypes: [
      'PERSPECTIVE_TRIGGERED',  // A-0等から観点ベースのクラスタリング要求
    ],
    priority: 10,
  },
  executor: executeClusterIssues,
};
