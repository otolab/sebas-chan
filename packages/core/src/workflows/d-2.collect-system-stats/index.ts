/**
 * D-2: COLLECT_SYSTEM_STATS ワークフロー
 *
 * 定期的にシステム内のデータを監視し、閾値超過時にイベントを発行する。
 * シンプルな監視役として、他のワークフローをトリガーする。
 *
 * このワークフローの役割：
 * - Issue停滞期間の検出
 * - システム統計の記録
 */

import type { SystemEvent } from '@sebas-chan/shared-types';
import type { WorkflowContextInterface, WorkflowEventEmitterInterface } from '../context.js';
import type { WorkflowResult, WorkflowDefinition } from '../workflow-types.js';
import { RecordType } from '../recorder.js';

// 閾値の定義（将来的にはKnowledgeから取得）
const THRESHOLDS = {
  STALLED_DAYS: 3, // 停滞日数
  POND_CAPACITY_RATIO: 0.8, // Pond容量の警告閾値（80%）
  POND_MAX_ENTRIES: 10000, // Pond最大エントリ数
};

/**
 * D-2: COLLECT_SYSTEM_STATS ワークフロー実行関数
 */
async function executeCollectSystemStats(
  event: SystemEvent,
  context: WorkflowContextInterface,
  emitter: WorkflowEventEmitterInterface
): Promise<WorkflowResult> {
  const { storage, recorder } = context;

  try {
    // 処理開始を記録
    recorder.record(RecordType.INFO, {
      workflowName: 'CollectSystemStats',
      event: event.type,
      timestamp: new Date(),
    });

    const eventsEmitted: SystemEvent[] = [];

    // 1. Issue統計の収集
    const issues = await storage.searchIssues('status:open');

    // 停滞Issue（3日以上更新なし）を検出
    const now = new Date();
    const stalledIssues = issues.filter((issue) => {
      const daysSinceUpdate = Math.floor(
        (now.getTime() - new Date(issue.updatedAt).getTime()) / (1000 * 60 * 60 * 24)
      );
      return daysSinceUpdate > THRESHOLDS.STALLED_DAYS;
    });

    // 2. Flow統計の収集（記録用）
    const flows = await storage.searchFlows('status:active');
    const staleFlows = flows.filter((flow) => {
      const daysSinceUpdate = Math.floor(
        (now.getTime() - new Date(flow.updatedAt).getTime()) / (1000 * 60 * 60 * 24)
      );
      return daysSinceUpdate > 7; // 7日以上更新なし
    });

    // 3. Pond容量の確認
    const pondEntries = await storage.searchPond('');
    const pondUsageRatio = pondEntries.length / THRESHOLDS.POND_MAX_ENTRIES;

    // 4. イベント発行

    // Pond容量が閾値を超えた場合
    if (pondUsageRatio > THRESHOLDS.POND_CAPACITY_RATIO) {
      const event = {
        type: 'POND_CAPACITY_WARNING',
        payload: {
          usage: pondEntries.length,
          capacity: THRESHOLDS.POND_MAX_ENTRIES,
          ratio: pondUsageRatio,
        },
      } as const;
      emitter.emit(event as SystemEvent);
      eventsEmitted.push(event);
    }

    // 停滞Issue検出
    for (const issue of stalledIssues) {
      const stalledDays = Math.floor(
        (now.getTime() - new Date(issue.updatedAt).getTime()) / (1000 * 60 * 60 * 24)
      );

      const event = {
        type: 'ISSUE_STALLED',
        payload: {
          issueId: issue.id,
          stalledDays,
          lastUpdate: issue.updatedAt,
        },
      } as const;
      emitter.emit(event as SystemEvent);
      eventsEmitted.push(event);
    }

    // 5. 統計をRecorderに記録
    recorder.record(RecordType.INFO, {
      type: 'SYSTEM_STATS_COLLECTED',
      timestamp: new Date(),
      stats: {
        totalIssues: issues.length,
        stalledCount: stalledIssues.length,
        totalFlows: flows.length,
        staleFlowsCount: staleFlows.length,
        pondUsage: pondEntries.length,
        pondCapacityRatio: pondUsageRatio,
      },
      eventsEmitted: eventsEmitted.length,
    });

    // 6. 結果を返す
    return {
      success: true,
      context, // Stateの更新は不要（監視のみ）
      output: {
        stats: {
          totalIssues: issues.length,
          stalledIssues: stalledIssues.length,
          totalFlows: flows.length,
          staleFlows: staleFlows.length,
          pondUsage: {
            entries: pondEntries.length,
            ratio: pondUsageRatio,
          },
        },
        eventsEmitted: eventsEmitted.length,
        logs: [
          {
            level: 'info',
            message: `統計収集完了: ${eventsEmitted.length}個のイベント発行`,
            timestamp: new Date(),
          },
        ],
      },
    };
  } catch (error) {
    recorder.record(RecordType.ERROR, {
      workflowName: 'CollectSystemStats',
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
 * D-2: COLLECT_SYSTEM_STATS ワークフロー定義
 */
export const collectSystemStatsWorkflow: WorkflowDefinition = {
  name: 'CollectSystemStats',
  description: 'システム内のデータを監視し、閾値超過時にイベントを発行',
  triggers: {
    eventTypes: [
      'SYSTEM_MAINTENANCE_DUE', // 定期実行（1時間ごと等）
      'IDLE_TIME_DETECTED', // アイドル時
    ],
    priority: 5, // 最低優先度（バックグラウンド処理）
  },
  executor: executeCollectSystemStats,
};
