/**
 * B-2: UPDATE_FLOW_RELATIONS ワークフローのアクション関数
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
 */
export async function applyFlowUpdates(
  analysisResult: FlowRelationResult,
  storage: WorkflowStorageInterface,
  emitter: WorkflowEventEmitterInterface,
  recorder: WorkflowRecorder
): Promise<void> {
  for (const update of analysisResult.flowUpdates) {
    // 健全性がobsoleteの場合、アーカイブ提案
    if (update.health === 'obsolete') {
      emitter.emit({
        type: 'FLOW_ARCHIVE_SUGGESTED',
        payload: { flowId: update.flowId },
      });
      recorder.record(RecordType.INFO, {
        event: 'FLOW_ARCHIVE_SUGGESTED',
        flowId: update.flowId,
      });
    }

    // 観点の更新が必要な場合
    if (!update.perspectiveValidity.stillValid && update.perspectiveValidity.suggestedUpdate) {
      emitter.emit({
        type: 'PERSPECTIVE_UPDATE_REQUIRED',
        payload: {
          flowId: update.flowId,
          newPerspective: update.perspectiveValidity.suggestedUpdate,
        },
      });
      recorder.record(RecordType.INFO, {
        event: 'PERSPECTIVE_UPDATE_REQUIRED',
        flowId: update.flowId,
      });
    }

    // Issue関係の更新提案
    for (const change of update.suggestedChanges) {
      await applyFlowChange(update.flowId, change, storage, emitter, recorder);
    }

    // Flowのdescriptionを更新（relationships含む）
    const flow = await storage.getFlow(update.flowId);
    if (flow) {
      // descriptionに関係性情報を追記
      const updatedDescription = `${flow.description}\n\n[更新: ${new Date().toISOString()}]\n${update.relationships}`;

      await storage.updateFlow(update.flowId, {
        description: updatedDescription,
        // health: update.health, // healthはFlowの標準プロパティではないため省略
      });

      // 関係性変更イベント
      emitter.emit({
        type: 'FLOW_RELATIONS_CHANGED',
        payload: {
          flowId: update.flowId,
          health: update.health,
        },
      });
    }
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
  switch (change.action) {
    case 'remove_issue':
      // Issue削除提案（実際の削除は別途承認が必要）
      emitter.emit({
        type: 'FLOW_ISSUE_REMOVAL_SUGGESTED',
        payload: {
          flowId,
          issueId: change.target,
          reason: change.rationale,
        },
      });
      break;

    case 'add_issue':
      // Issue追加提案
      emitter.emit({
        type: 'FLOW_ISSUE_ADDITION_SUGGESTED',
        payload: {
          flowId,
          issueId: change.target,
          reason: change.rationale,
        },
      });
      break;

    case 'split_flow':
      // Flow分割提案
      emitter.emit({
        type: 'FLOW_SPLIT_SUGGESTED',
        payload: {
          flowId,
          reason: change.rationale,
        },
      });
      break;

    case 'merge_flow':
      // Flow統合提案
      emitter.emit({
        type: 'FLOW_MERGE_SUGGESTED',
        payload: {
          sourceFlowId: flowId,
          targetFlowId: change.target,
          reason: change.rationale,
        },
      });
      break;

    case 'archive_flow':
      // Flowアーカイブ提案
      emitter.emit({
        type: 'FLOW_ARCHIVE_SUGGESTED',
        payload: {
          flowId,
          reason: change.rationale,
        },
      });
      break;
  }

  recorder.record(RecordType.INFO, {
    action: change.action,
    flowId,
    target: change.target,
    rationale: change.rationale,
  });
}