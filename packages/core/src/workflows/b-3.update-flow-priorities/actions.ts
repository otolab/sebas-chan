/**
 * B-3: UPDATE_FLOW_PRIORITIES アクション実装
 *
 * 優先度判定の実際の処理を行う
 * 重要：機械的な判断は避け、AIによる柔軟な判断を基本とする
 */

import type { AIDriver } from '@moduler-prompt/driver';
import type { Flow, Issue } from '@sebas-chan/shared-types';
import type { WorkflowStorageInterface } from '../context.js';
import { calculateFlowPriorities, analyzeIndividualFlow, updateStateDocument } from './prompts.js';

// 型を再エクスポート（外部から参照可能にする）
export type { FlowPriorityUpdate } from './types.js';

/**
 * 停滞チェックの結果
 */
interface StalenessCheck {
  flowId: string;
  daysSinceUpdate: number;
  status: 'active_check' | 'warning' | 'stale' | 'abandoned';
  suggestedUserQuery?: string; // ユーザーに確認したいこと
}

/**
 * Flowの停滞状態をチェックする
 *
 * なぜ必要か：
 * - 重要なFlowが忘れ去られることを防ぐ
 * - しかし「寝かせている」と「放置している」の判断はユーザーに委ねる
 */
function checkStaleness(flow: Flow): StalenessCheck {
  // 最終更新からの経過日数を計算
  const now = new Date();
  const updatedAt = new Date(flow.updatedAt);
  const daysSinceUpdate = Math.floor((now.getTime() - updatedAt.getTime()) / (1000 * 60 * 60 * 24));

  // 閾値に基づいて状態を判定
  let status: StalenessCheck['status'];
  let suggestedUserQuery: string | undefined;

  if (daysSinceUpdate >= 14) {
    status = 'abandoned';
    suggestedUserQuery = `「${flow.title}」は${daysSinceUpdate}日間更新されていません。まだ必要ですか？クローズしますか？`;
  } else if (daysSinceUpdate >= 7) {
    status = 'stale';
    suggestedUserQuery = `「${flow.title}」は${daysSinceUpdate}日間更新されていません。まだ進行中ですか？`;
  } else if (daysSinceUpdate >= 3) {
    status = 'warning';
    suggestedUserQuery = `「${flow.title}」は${daysSinceUpdate}日間動きがありません。状況確認が必要ですか？`;
  } else if (daysSinceUpdate >= 1) {
    status = 'active_check';
    // 1日程度なら確認不要
  } else {
    status = 'active_check';
  }

  return {
    flowId: flow.id,
    daysSinceUpdate,
    status,
    suggestedUserQuery,
  };
}

// 以下の関数は、AI処理（updateStateDocument）に置き換えられたため削除
// - addUserConfirmations: ユーザー確認事項の追加
// - addPriorityUpdateLog: 優先度更新ログの追加
// これらの機能はupdateStateDocument内でAIが自然言語で処理

/**
 * Flow優先度を更新する
 *
 * 仕様準拠：
 * - storage経由でFlowを直接更新
 * - state文書への作用として実行
 * - outputは使わない
 */
export async function updateFlowPriorities(
  driver: AIDriver,
  flows: Flow[],
  issuesByFlow: Map<string, Issue[]>,
  stateDocument: string,
  storage: WorkflowStorageInterface
): Promise<string> {
  // 更新されたstate文書を返す

  // ========================================
  // 処理の全体構造（2段階AI処理）
  // ========================================
  // 1. 第1段階：各Flowの個別分析（並行処理）
  //    - Flowごとにその特性や状態を詳細に分析
  //    - 停滞チェック、Issue分析、コンテキスト理解
  // 2. 第2段階：全体の比較と優先付け
  //    - 全Flow分析結果を比較して相対的な優先度を決定
  //    - state文書の更新も同時に実行
  //
  // なぜ2段階か：
  // - 個別分析では各Flowの「絶対的な重要性」を評価
  // - 比較段階では「相対的な優先順位」を決定
  // - この分離により、より精度の高い判断が可能

  // ========================================
  // 1. 各Flowの現状を分析
  // ========================================

  // 各Flowについて以下を収集：
  // - 基本情報（title, description, status）
  // - 含まれるIssueの詳細
  // - 停滞チェックの結果
  // - 現在の優先度

  const flowAnalysis = flows.map((flow) => {
    // Flowに含まれるIssueを取得
    // なぜ：Issueの重要度や緊急度がFlowの優先度に影響

    // 停滞状態をチェック
    // なぜ：忘れ去られているFlowを検出

    // 現在の優先度と状態を記録
    // なぜ：変化の大きさを判定するため

    return {
      flow,
      issues: issuesByFlow.get(flow.id) || [],
      staleness: checkStaleness(flow),
      currentPriority: flow.priorityScore,
    };
  });

  // ========================================
  // 2. 第1段階：各Flowの個別分析（AI処理）
  // ========================================

  // 各Flowを順次分析（ローカル実行の負荷を考慮）
  const individualAnalyses = [];
  for (const fa of flowAnalysis) {
    const analysis = await analyzeIndividualFlow(driver, fa, stateDocument);
    individualAnalyses.push(analysis);
  }

  // ========================================
  // 3. 第2段階：全体の比較と優先付け（AI処理）
  // ========================================

  // 個別分析結果を元に、全体の優先順位を決定
  // TODO: individualAnalysesの結果を活用する新しい関数に置き換える
  // 現在は暫定的に既存の一段階処理を使用
  const priorityResult = await calculateFlowPriorities(driver, flowAnalysis, stateDocument);

  // ========================================
  // 4. 結果の整理とFlow更新
  // ========================================

  // AIの判定結果を検証
  // - 優先度スコアが0.0〜1.0の範囲内か
  // - 説明が含まれているか

  // 各Flowの優先度をstorageで直接更新
  // なぜ：次回の判断の基礎データとなるため
  for (const update of priorityResult.updates) {
    await storage.updateFlow(update.flowId, {
      priorityScore: update.newPriority,
    });

    // 大きな変更があった場合の記録（後でstate文書に追加）
    // 閾値：優先度の変化が0.2以上
  }

  // ========================================
  // 5. ユーザーへの確認事項を整理
  // ========================================

  // 停滞Flowについての確認
  const confirmations: Array<{ flowId: string; message: string }> = [];

  for (const analysis of flowAnalysis) {
    if (analysis.staleness.status === 'stale' || analysis.staleness.status === 'abandoned') {
      confirmations.push({
        flowId: analysis.flow.id,
        message:
          analysis.staleness.suggestedUserQuery ||
          `「${analysis.flow.title}」は${analysis.staleness.daysSinceUpdate}日間更新されていません。まだ進行中ですか？`,
      });
    }
  }

  // 大きな優先度変更についての確認
  for (const update of priorityResult.updates) {
    if (Math.abs(update.newPriority - update.oldPriority) > 0.3) {
      if (update.userQuery) {
        confirmations.push({
          flowId: update.flowId,
          message: update.userQuery.message,
        });
      }
    }
  }

  // ========================================
  // 6. state文書の更新（AI処理）
  // ========================================

  // AI処理によるstate文書の自然言語更新
  const updatedState = await updateStateDocument(driver, stateDocument, {
    priorityUpdates: priorityResult.updates,
    userConfirmations: confirmations,
    flowAnalysis: flowAnalysis,
    timestamp: new Date(),
  });

  // 更新されたstate文書を返す
  // なぜ：唯一の意味のある返り値
  return updatedState;
}
