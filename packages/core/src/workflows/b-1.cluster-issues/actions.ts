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
 * Flow作成提案イベントを発行
 */
export async function emitFlowSuggestions(
  clusteringResult: ClusteringResult,
  emitter: WorkflowEventEmitterInterface,
  recorder: WorkflowRecorder
): Promise<void> {
  for (const cluster of clusteringResult.clusters) {
    // 3件以上のIssueを含むクラスタのみFlow提案
    if (cluster.issueIds.length >= 3) {
      emitter.emit({
        type: 'FLOW_CREATION_SUGGESTED',
        payload: {
          perspective: cluster.perspective,
          issueIds: cluster.issueIds,
          relationships: cluster.relationships,
          priority: cluster.suggestedPriority,
          completionCriteria: cluster.completionCriteria,
          autoCreate: cluster.perspective.type === 'project', // プロジェクト型は自動作成
        },
      });

      recorder.record(RecordType.INFO, {
        event: 'FLOW_CREATION_SUGGESTED',
        clusterId: cluster.id,
        issueCount: cluster.issueIds.length,
        perspectiveType: cluster.perspective.type,
      });
    }
  }

  // クラスタ発見イベント
  if (clusteringResult.clusters.length > 0) {
    emitter.emit({
      type: 'ISSUES_CLUSTER_DETECTED',
      payload: {
        clusterCount: clusteringResult.clusters.length,
        totalIssues: clusteringResult.clusters.reduce(
          (sum, c) => sum + c.issueIds.length,
          0
        ),
      },
    });
  }
}