/**
 * B-3: UPDATE_FLOW_PRIORITIES ワークフロー
 *
 * 目的：Flowの優先度を動的に調整し、ユーザーが「今、最も注力すべきFlow」を判断できるようにする
 *
 * このワークフローの責任：
 * - システムは「忘れない」ことで信頼を得る
 * - 重要なことを見逃さない、かつ多すぎて埋もれることも避ける
 * - 判断の根拠を透明にし、ユーザーが最終判断できるようにする
 */

import type { SystemEvent, Issue } from '@sebas-chan/shared-types';
import type { WorkflowContextInterface, WorkflowEventEmitterInterface } from '../context.js';
import type { WorkflowResult, WorkflowDefinition } from '../workflow-types.js';
import { RecordType } from '../recorder.js';
import { updateFlowPriorities } from './actions.js';

/**
 * B-3: UPDATE_FLOW_PRIORITIES ワークフロー実行関数
 */
async function executeUpdateFlowPriorities(
  event: SystemEvent,
  context: WorkflowContextInterface,
  emitter: WorkflowEventEmitterInterface
): Promise<WorkflowResult> {
  const { storage, recorder, createDriver } = context;

  try {
    // 処理開始を記録
    // なぜ：トレーサビリティとデバッグのため
    recorder.record(RecordType.INFO, {
      workflowName: 'UpdateFlowPriorities',
      event: event.type,
      payload: event.payload,
    });

    // ========================================
    // 1. 現在の状況を把握する
    // ========================================

    // すべてのアクティブなFlowを取得
    // なぜ：優先度調整の対象を特定するため
    const flows = await storage.searchFlows('status:active OR status:monitoring OR status:blocked');

    // 各Flowに含まれるIssueの情報を取得
    // なぜ：Issueの重要度や緊急度がFlowの優先度に影響するため
    const issuesByFlow = new Map<string, Issue[]>();
    for (const flow of flows) {
      const issues: Issue[] = [];
      for (const issueId of flow.issueIds) {
        const issue = await storage.getIssue(issueId);
        if (issue) {
          issues.push(issue);
        }
      }
      issuesByFlow.set(flow.id, issues);
    }

    // state文書を取得
    // なぜ：多くの判断は「自明」だが、それには正しいコンテキストが必要
    // 実装：単純にプロンプトに組み込むだけで十分な効果がある
    const currentState = context.state;

    // ========================================
    // 2. 停滞チェック（生存確認）と優先度計算
    // ========================================

    // 停滞チェックはactions.ts内で実施
    // なぜ：AIによる優先度判定と統合して処理するため

    // AIドライバーを作成
    // なぜ：コンテキストを考慮した柔軟な判断が必要
    const driver = await createDriver({
      requiredCapabilities: ['structured'],
      preferredCapabilities: ['japanese', 'fast'],
    });

    // すべての情報をAIに渡して優先度を判定し、state文書を更新
    // 入力：
    //   - 全Flowとその詳細
    //   - 含まれるIssueの情報
    //   - state文書（現在のコンテキスト）
    //   - context（Flow更新とイベント発行用）
    // 出力：
    //   - 更新されたstate文書（確認事項とログを含む）
    const updatedState = await updateFlowPriorities(
      driver,
      flows,
      issuesByFlow,
      currentState,
      context,
      emitter
    );

    // ========================================
    // 3. 結果の返却
    // ========================================
    // 注：イベント発行はactions.ts内で実施済み
    // - FLOW_PRIORITY_UPDATED: 全ての優先度更新について発行
    // - HIGH_PRIORITY_FLOW_DETECTED: 高優先度Flow（0.8以上）について発行

    // contextへの作用として実行完了
    // 唯一の意味のある返り値は更新されたstate
    return {
      success: true,
      context: {
        ...context,
        state: updatedState,
      },
      // outputは使わない（将来的に削除予定）
    };
  } catch (error) {
    // エラーを記録
    // なぜ：問題の追跡と改善のため
    recorder.record(RecordType.ERROR, {
      workflowName: 'UpdateFlowPriorities',
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
 * B-3: UPDATE_FLOW_PRIORITIES ワークフロー定義
 */
export const updateFlowPrioritiesWorkflow: WorkflowDefinition = {
  name: 'UpdateFlowPriorities',
  description: 'Flowの優先度を動的に調整し、ユーザーが今注力すべきものを明確にする',
  triggers: {
    eventTypes: [
      'SCHEDULE_TRIGGERED', // 定期実行（日次での生存確認）
      'FLOW_STATUS_CHANGED', // Flow状態変更時
      'ISSUE_STATUS_CHANGED', // 含まれるIssueの状態変更時
      'ISSUE_UPDATED', // Issueの重要な更新時
    ],
    priority: 15, // 中程度の優先度（バックグラウンド処理）
  },
  executor: executeUpdateFlowPriorities,
};
