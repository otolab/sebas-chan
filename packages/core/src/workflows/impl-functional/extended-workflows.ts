/**
 * 拡張ワークフローコレクション
 * デフォルトワークフローの登録ヘルパー
 */

import type { WorkflowDefinition, IWorkflowRegistry } from '../workflow-types.js';
import { LogType } from '../logger.js';
import { ingestInputWorkflow } from './ingest-input.js';
import { processUserRequestWorkflow } from './process-user-request.js';
import { analyzeIssueImpactWorkflow } from './analyze-issue-impact.js';
import { extractKnowledgeWorkflow } from './extract-knowledge.js';

/**
 * 全てのデフォルトワークフロー
 */
export const DEFAULT_WORKFLOWS: WorkflowDefinition[] = [
  ingestInputWorkflow,
  processUserRequestWorkflow,
  analyzeIssueImpactWorkflow,
  extractKnowledgeWorkflow,
];

/**
 * デフォルトワークフローを登録するヘルパー関数
 */
export function registerDefaultWorkflows(registry: IWorkflowRegistry): void {
  for (const workflow of DEFAULT_WORKFLOWS) {
    registry.register(workflow);
  }
  console.log(`Registered ${DEFAULT_WORKFLOWS.length} default workflows`);
}

/**
 * 追加のワークフロー例：ログ記録
 * 全てのINGEST_INPUTイベントをログに記録
 */
export const loggingWorkflow: WorkflowDefinition = {
  name: 'LogAllInputs',
  description: '全ての入力をログに記録',
  triggers: {
    eventTypes: ['INGEST_INPUT'],
    priority: 100, // 最優先で実行
  },
  executor: async (event, context) => {
    const input = event.payload?.input as any;
    context.logger.log(LogType.INPUT, {
      id: input?.id,
      source: input?.source,
      contentLength: input?.content?.length,
      timestamp: event.timestamp,
    });

    return {
      success: true,
      context,
      output: { logged: true },
    };
  },
};

/**
 * 追加のワークフロー例：メトリクス収集
 * 全てのワークフロー実行をトラッキング
 */
export const metricsWorkflow: WorkflowDefinition = {
  name: 'CollectMetrics',
  description: 'ワークフロー実行メトリクスを収集',
  triggers: {
    eventTypes: [
      'INGEST_INPUT',
      'PROCESS_USER_REQUEST',
      'ANALYZE_ISSUE_IMPACT',
      'EXTRACT_KNOWLEDGE',
    ],
    priority: -10, // 最後に実行
  },
  executor: async (event, context) => {
    // メトリクスを収集（実際の実装では外部サービスに送信）
    const metrics = {
      eventType: event.type,
      priority: event.priority,
      timestamp: event.timestamp,
      processingTime: Date.now() - event.timestamp.getTime(),
    };

    console.log('[Metrics]', metrics);

    return {
      success: true,
      context,
      output: { metrics },
    };
  },
};