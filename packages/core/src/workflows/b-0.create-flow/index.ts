/**
 * B-0: CREATE_FLOW ワークフロー
 *
 * ISSUES_CLUSTER_DETECTEDやPERSPECTIVE_TRIGGEREDイベントを受けて
 * 自動的にFlowを作成する。
 *
 * このワークフローの役割：
 * - クラスター検出イベントからFlowを作成
 * - 観点発見イベントからFlowを作成
 * - FLOW_CREATEDイベントを発火
 */

import type {
  SystemEvent,
  Flow,
  IssuesClusterDetectedEvent,
  PerspectiveTriggeredEvent,
} from '@sebas-chan/shared-types';
import type { WorkflowContextInterface, WorkflowEventEmitterInterface } from '../context.js';
import type { WorkflowResult, WorkflowDefinition } from '../workflow-types.js';
import { RecordType } from '../recorder.js';

/**
 * B-0: CREATE_FLOW ワークフロー実行関数
 */
async function executeCreateFlow(
  event: SystemEvent,
  context: WorkflowContextInterface,
  emitter: WorkflowEventEmitterInterface
): Promise<WorkflowResult> {
  const { storage, recorder } = context;

  try {
    // 処理開始を記録
    recorder.record(RecordType.INFO, {
      workflowName: 'CreateFlow',
      event: event.type,
      timestamp: new Date(),
    });

    let newFlow: Flow | null = null;

    // イベントタイプによって処理を分岐
    switch (event.type) {
      case 'ISSUES_CLUSTER_DETECTED': {
        const clusterEvent = event as IssuesClusterDetectedEvent;

        // 自動作成フラグが立っていない場合はスキップ
        if (!clusterEvent.payload.autoCreate) {
          recorder.record(RecordType.INFO, {
            message: 'Auto-create flag is false, skipping flow creation',
            clusterId: clusterEvent.payload.clusterId,
          });
          return {
            success: true,
            context,
            output: {
              skipped: true,
              reason: 'Auto-create flag is false',
            },
          };
        }

        // Flow作成
        newFlow = {
          id: `flow-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          title: clusterEvent.payload.perspective.title,
          description: clusterEvent.payload.perspective.description,
          status: 'active',
          priorityScore: (clusterEvent.payload.suggestedPriority || 50) / 100, // 0-100を0-1に変換
          issueIds: clusterEvent.payload.issueIds,
          createdAt: new Date(),
          updatedAt: new Date(),
        } as Flow & {
          perspective?: {
            type: 'project' | 'temporal' | 'thematic' | 'dependency';
            query?: string;
          };
          metadata?: Record<string, unknown>;
        };

        recorder.record(RecordType.INFO, {
          event: 'FLOW_CREATED_FROM_CLUSTER',
          flowId: newFlow!.id,
          issueCount: clusterEvent.payload.issueIds.length,
        });
        break;
      }

      case 'PERSPECTIVE_TRIGGERED': {
        const perspectiveEvent = event as PerspectiveTriggeredEvent;

        // 既存Flowの更新の場合はスキップ
        if (perspectiveEvent.payload.flowId) {
          recorder.record(RecordType.INFO, {
            message: 'Existing flow update, skipping new flow creation',
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

        // Flow作成
        newFlow = {
          id: `flow-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          title: perspectiveEvent.payload.perspective,
          description: `Flow created from perspective: ${perspectiveEvent.payload.triggerReason}`,
          status: 'active',
          priorityScore: 0.6, // 観点トリガーは少し高めの優先度
          issueIds: perspectiveEvent.payload.suggestedIssues || [],
          createdAt: new Date(),
          updatedAt: new Date(),
        } as Flow & {
          perspective?: {
            type: 'project' | 'temporal' | 'thematic' | 'dependency';
            query?: string;
          };
          metadata?: Record<string, unknown>;
        };

        recorder.record(RecordType.INFO, {
          event: 'FLOW_CREATED_FROM_PERSPECTIVE',
          flowId: newFlow!.id,
          source: perspectiveEvent.payload.source,
        });
        break;
      }

      default:
        return {
          success: false,
          context,
          error: new Error(`Unsupported event type: ${event.type}`),
        };
    }

    // Flowを保存
    if (newFlow) {
      await storage.createFlow(newFlow);

      // FLOW_CREATEDイベントを発火
      emitter.emit({
        type: 'FLOW_CREATED',
        payload: {
          flowId: newFlow.id,
          flow: newFlow,
          createdBy: 'workflow' as const,
          sourceWorkflow: 'CreateFlow',
        },
      });

      recorder.record(RecordType.INFO, {
        event: 'FLOW_CREATED',
        flowId: newFlow.id,
        title: newFlow.title,
        issueCount: newFlow.issueIds.length,
      });

      // 結果を返す
      return {
        success: true,
        context,
        output: {
          flowCreated: true,
          flow: {
            id: newFlow.id,
            title: newFlow.title,
            issueCount: newFlow.issueIds.length,
          },
          logs: [
            {
              level: 'info',
              message: `Flow created: ${newFlow.title} with ${newFlow.issueIds.length} issues`,
              timestamp: new Date(),
            },
          ],
        },
      };
    }

    // Flowが作成されなかった場合
    return {
      success: true,
      context,
      output: {
        flowCreated: false,
        reason: 'No flow created',
      },
    };
  } catch (error) {
    recorder.record(RecordType.ERROR, {
      workflowName: 'CreateFlow',
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
 * B-0: CREATE_FLOW ワークフロー定義
 */
export const createFlowWorkflow: WorkflowDefinition = {
  name: 'CreateFlow',
  description: 'クラスター検出や観点発見からFlowを自動作成',
  triggers: {
    eventTypes: [
      'ISSUES_CLUSTER_DETECTED', // クラスター検出
      'PERSPECTIVE_TRIGGERED', // 観点発見
    ],
    priority: 30, // 中優先度
  },
  executor: executeCreateFlow,
};
