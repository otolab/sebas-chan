/**
 * B-1: CLUSTER_ISSUES ワークフローのアクション関数
 */

import type { Issue, Flow } from '@sebas-chan/shared-types';
import type { AIDriver } from '@moduler-prompt/driver';
import type { WorkflowEventEmitterInterface } from '../context.js';
import type { WorkflowRecorder } from '../recorder.js';
import { RecordType } from '../recorder.js';
import { compile } from '@moduler-prompt/core';
import { clusteringPromptModule } from './prompts.js';

/**
 * クラスタリング結果の型定義
 */
export interface ClusteringResult {
  clusters: Array<{
    id: string;
    perspective: {
      type: 'project' | 'temporal' | 'thematic' | 'dependency';
      title: string;
      description: string;
      query?: string;
    };
    issueIds: string[];
    relationships: string;
    commonPatterns: string[];
    suggestedPriority: number;
    completionCriteria?: string;
  }>;
  insights: string[];
  unclustered: string[];
  updatedState: string;
}

/**
 * Issue群をクラスタリング分析
 */
export async function clusterIssues(
  driver: AIDriver,
  issues: Issue[],
  existingFlows: Flow[],
  currentState: string
): Promise<ClusteringResult> {
  const context = {
    issues,
    existingFlows,
    currentState,
    timestamp: new Date(),
  };

  const compiled = compile(clusteringPromptModule, context);
  const result = await driver.query(compiled, { temperature: 0.3 });

  if (!result.structuredOutput) {
    throw new Error('クラスタリング分析の構造化出力の取得に失敗しました');
  }

  return result.structuredOutput as ClusteringResult;
}

/**
 * クラスター検出イベントを発行
 */
export async function emitClusterDetectedEvents(
  clusteringResult: ClusteringResult,
  emitter: WorkflowEventEmitterInterface,
  recorder: WorkflowRecorder
): Promise<void> {
  for (const cluster of clusteringResult.clusters) {
    // 3件以上のIssueを含むクラスタのみイベント発行
    if (cluster.issueIds.length >= 3) {
      emitter.emit({
        type: 'ISSUES_CLUSTER_DETECTED',
        payload: {
          clusterId: cluster.id,
          perspective: cluster.perspective,
          issueIds: cluster.issueIds,
          similarity: 0.8, // TODO: 実際の類似度計算を実装
          suggestedPriority: cluster.suggestedPriority,
          autoCreate: cluster.perspective.type === 'project', // プロジェクト型は自動作成
        },
      });

      recorder.record(RecordType.INFO, {
        event: 'ISSUES_CLUSTER_DETECTED',
        clusterId: cluster.id,
        issueCount: cluster.issueIds.length,
        perspectiveType: cluster.perspective.type,
      });
    }
  }
}
