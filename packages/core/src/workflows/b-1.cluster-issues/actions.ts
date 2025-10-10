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
 * クラスター検出イベントを発行（廃止予定）
 * @deprecated B-1内でFlow作成まで行うため、このイベント発行は不要
 */
export async function emitClusterDetectedEvents(
  clusteringResult: ClusteringResult,
  emitter: WorkflowEventEmitterInterface,
  recorder: WorkflowRecorder
): Promise<void> {
  // B-1内でFlow作成まで行うため、イベント発行は不要になりました
  // 将来的にこの関数は削除予定
  recorder.record(RecordType.INFO, {
    message: 'Cluster detection completed, Flow creation handled internally',
    clustersFound: clusteringResult.clusters.length,
  });
}
