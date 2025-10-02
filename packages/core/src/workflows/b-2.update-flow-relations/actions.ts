/**
 * B-2: UPDATE_FLOW_RELATIONS ワークフローのアクション関数
 *
 * Flow関係性の分析と更新を行うアクション集。
 * SUGGESTEDイベントは発火せず、必要な更新は直接実行する。
 * ユーザー判断が必要な複雑な変更はIssueとして作成する。
 */

import type { Issue, Flow, Knowledge } from '@sebas-chan/shared-types';
import type { AIDriver } from '@moduler-prompt/driver';
import type { WorkflowEventEmitterInterface, WorkflowStorageInterface } from '../context.js';
import type { WorkflowRecorder } from '../recorder.js';
import { RecordType } from '../recorder.js';
import { compile } from '@moduler-prompt/core';
import { flowRelationPromptModule } from './prompts.js';

/**
 * Flow分析データの型定義
 */
export interface FlowAnalysis {
  flow: Flow;
  issues: Issue[];
  completionRate: number;
  staleness: number;
}

/**
 * Flow変更の型定義
 */
export interface FlowChange {
  action: 'remove_issue' | 'add_issue' | 'split_flow' | 'merge_flow' | 'archive_flow';
  target: string;
  rationale: string;
}

/**
 * Flow関係性分析結果の型定義
 */
export interface FlowRelationResult {
  flowUpdates: Array<{
    flowId: string;
    health: 'healthy' | 'needs_attention' | 'stale' | 'obsolete';
    perspectiveValidity: {
      stillValid: boolean;
      reason: string;
      suggestedUpdate?: string;
    };
    relationships: string;
    suggestedChanges: FlowChange[];
  }>;
  updatedState: string;
}

/**
 * Flow関係性を分析
 */
export async function analyzeFlowRelations(
  driver: AIDriver,
  flowAnalysis: FlowAnalysis[],
  recentChanges: string[],
  currentState: string
): Promise<FlowRelationResult> {
  // 関連Knowledgeの取得（実際はstorageから取得すべきだが、簡略化）
  const knowledgeBase: Knowledge[] = [];

  const context = {
    flowAnalysis,
    recentChanges,
    knowledgeBase,
    currentState,
  };

  const compiled = compile(flowRelationPromptModule, context);
  const result = await driver.query(compiled, { temperature: 0.3 });

  if (!result.structuredOutput) {
    throw new Error('Flow関係性分析の構造化出力の取得に失敗しました');
  }

  return result.structuredOutput as FlowRelationResult;
}

/**
 * Flow更新を適用
 *
 * 意図: SUGGESTEDイベントを避け、必要な更新は直接実行する。
 * 複雑な判断が必要な場合のみIssueを作成してユーザーに委ねる。
 */
export async function applyFlowUpdates(
  analysisResult: FlowRelationResult,
  storage: WorkflowStorageInterface,
  emitter: WorkflowEventEmitterInterface,
  recorder: WorkflowRecorder
): Promise<void> {
  for (const update of analysisResult.flowUpdates) {
    const flow = await storage.getFlow(update.flowId);
    if (!flow) continue;

    // 健全性がobsoleteの場合、Flowをアーカイブ状態に変更
    if (update.health === 'obsolete') {
      await storage.updateFlow(update.flowId, {
        status: 'archived' as any, // Flow statusにarchivedがあると仮定
      });

      emitter.emit({
        type: 'FLOW_STATUS_CHANGED',
        payload: {
          flowId: update.flowId,
          oldStatus: flow.status as any,
          newStatus: 'archived' as any,
          reason: 'Obsolete flow archived by workflow',
        },
      });

      recorder.record(RecordType.INFO, {
        action: 'FLOW_ARCHIVED',
        flowId: update.flowId,
        reason: 'obsolete',
      });
      continue; // アーカイブしたFlowはそれ以上処理しない
    }

    // 観点の更新が必要な場合、descriptionに新しい観点を記録
    if (!update.perspectiveValidity.stillValid && update.perspectiveValidity.suggestedUpdate) {
      const updatedDescription = `${flow.description}\n\n[観点更新提案: ${new Date().toISOString()}]\n${update.perspectiveValidity.suggestedUpdate}\n理由: ${update.perspectiveValidity.reason}`;

      await storage.updateFlow(update.flowId, {
        description: updatedDescription,
      });

      // 観点変更はPERSPECTIVE_TRIGGEREDイベントで通知
      emitter.emit({
        type: 'PERSPECTIVE_TRIGGERED',
        payload: {
          flowId: update.flowId,
          perspective: update.perspectiveValidity.suggestedUpdate,
          triggerReason: update.perspectiveValidity.reason,
          source: 'workflow' as const,
        },
      });

      recorder.record(RecordType.INFO, {
        action: 'PERSPECTIVE_UPDATED',
        flowId: update.flowId,
        newPerspective: update.perspectiveValidity.suggestedUpdate,
      });
    }

    // Issue関係の更新を直接実行
    for (const change of update.suggestedChanges) {
      await applyFlowChange(update.flowId, change, storage, emitter, recorder);
    }

    // Flowのdescriptionを更新（relationships含む）
    const updatedDescription = `${flow.description}\n\n[関係性更新: ${new Date().toISOString()}]\n${update.relationships}`;

    await storage.updateFlow(update.flowId, {
      description: updatedDescription,
    });

    // Flow更新完了イベント
    emitter.emit({
      type: 'FLOW_UPDATED',
      payload: {
        flowId: update.flowId,
        updates: {
          before: { description: flow.description },
          after: { description: updatedDescription },
          changedFields: ['description'],
        },
        updatedBy: 'UpdateFlowRelations',
      },
    });
  }
}

/**
 * 個別のFlow変更を適用
 */
async function applyFlowChange(
  flowId: string,
  change: FlowChange,
  storage: WorkflowStorageInterface,
  emitter: WorkflowEventEmitterInterface,
  recorder: WorkflowRecorder
): Promise<void> {
  /**
   * Flow変更を直接実行する。
   * SUGGESTEDイベントを発火せず、実行可能な変更は即座に適用する。
   * ユーザー判断が必要な複雑な変更はIssueとして作成する。
   */
  
  const flow = await storage.getFlow(flowId);
  if (!flow) {
    recorder.record(RecordType.ERROR, {
      action: 'FLOW_NOT_FOUND',
      flowId,
      change: change.action,
    });
    return;
  }

  switch (change.action) {
    case 'remove_issue': {
      // Issueを直接削除
      const updatedIssueIds = flow.issueIds.filter(id => id !== change.target);
      await storage.updateFlow(flowId, {
        issueIds: updatedIssueIds,
      });

      emitter.emit({
        type: 'FLOW_UPDATED',
        payload: {
          flowId,
          updates: {
            before: { issueIds: flow.issueIds },
            after: { issueIds: updatedIssueIds },
            changedFields: ['issueIds'],
          },
          updatedBy: 'UpdateFlowRelations',
        },
      });

      recorder.record(RecordType.INFO, {
        action: 'ISSUE_REMOVED_FROM_FLOW',
        flowId,
        issueId: change.target,
        rationale: change.rationale,
      });
      break;
    }

    case 'add_issue': {
      // Issueを直接追加
      const updatedIssueIds = [...flow.issueIds, change.target];
      await storage.updateFlow(flowId, {
        issueIds: updatedIssueIds,
      });

      emitter.emit({
        type: 'FLOW_UPDATED',
        payload: {
          flowId,
          updates: {
            before: { issueIds: flow.issueIds },
            after: { issueIds: updatedIssueIds },
            changedFields: ['issueIds'],
          },
          updatedBy: 'UpdateFlowRelations',
        },
      });

      recorder.record(RecordType.INFO, {
        action: 'ISSUE_ADDED_TO_FLOW',
        flowId,
        issueId: change.target,
        rationale: change.rationale,
      });
      break;
    }

    case 'split_flow': {
      // Flow分割は複雑なため、Issueとして作成
      const suggestionIssue = await storage.createIssue({
        title: `Flow "${flow.title}" の分割を検討`,
        description: `## 提案内容\nFlow (${flowId}) を複数のFlowに分割することを提案します。\n\n## 理由\n${change.rationale}\n\n## 現在のFlow内容\n- タイトル: ${flow.title}\n- Issue数: ${flow.issueIds.length}\n\n## アクション\nこのIssueをレビューして、分割が適切な場合は手動で新しいFlowを作成してください。`,
        status: 'open' as any,
        priority: 'medium' as any,
        labels: ['suggestion', 'flow-management', 'split-flow'],
        updates: [{
          timestamp: new Date(),
          content: `UpdateFlowRelationsワークフローによって作成されました。Flow ID: ${flowId}`,
          author: 'ai' as const,
        }],
        relations: [],
        sourceInputIds: [],
      });

      emitter.emit({
        type: 'ISSUE_CREATED',
        payload: {
          issueId: suggestionIssue.id,
          issue: suggestionIssue,
          createdBy: 'workflow' as const,
          sourceWorkflow: 'UpdateFlowRelations',
        },
      });

      recorder.record(RecordType.INFO, {
        action: 'FLOW_SPLIT_ISSUE_CREATED',
        flowId,
        issueId: suggestionIssue.id,
        rationale: change.rationale,
      });
      break;
    }

    case 'merge_flow': {
      // Flow統合も複雑なため、Issueとして作成
      const targetFlow = await storage.getFlow(change.target);
      const suggestionIssue = await storage.createIssue({
        title: `Flow "${flow.title}" と "${targetFlow?.title || change.target}" の統合を検討`,
        description: `## 提案内容\n2つのFlowを統合することを提案します。\n\n## 対象Flow\n- ソース: ${flow.title} (${flowId})\n- ターゲット: ${targetFlow?.title || 'Unknown'} (${change.target})\n\n## 理由\n${change.rationale}\n\n## アクション\nこのIssueをレビューして、統合が適切な場合は手動でFlowを統合してください。`,
        status: 'open' as any,
        priority: 'medium' as any,
        labels: ['suggestion', 'flow-management', 'merge-flow'],
        updates: [{
          timestamp: new Date(),
          content: `UpdateFlowRelationsワークフローによって作成されました。Flow IDs: ${flowId}, ${change.target}`,
          author: 'ai' as const,
        }],
        relations: [],
        sourceInputIds: [],
      });

      emitter.emit({
        type: 'ISSUE_CREATED',
        payload: {
          issueId: suggestionIssue.id,
          issue: suggestionIssue,
          createdBy: 'workflow' as const,
          sourceWorkflow: 'UpdateFlowRelations',
        },
      });

      recorder.record(RecordType.INFO, {
        action: 'FLOW_MERGE_ISSUE_CREATED',
        flowId,
        targetFlowId: change.target,
        issueId: suggestionIssue.id,
        rationale: change.rationale,
      });
      break;
    }

    case 'archive_flow': {
      // Flowのアーカイブを直接実行
      await storage.updateFlow(flowId, {
        status: 'archived' as any,
      });

      emitter.emit({
        type: 'FLOW_STATUS_CHANGED',
        payload: {
          flowId,
          oldStatus: flow.status as any,
          newStatus: 'archived' as any,
          reason: change.rationale,
        },
      });

      recorder.record(RecordType.INFO, {
        action: 'FLOW_ARCHIVED',
        flowId,
        rationale: change.rationale,
      });
      break;
    }
  }
}