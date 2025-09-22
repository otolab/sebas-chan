/**
 * デフォルトワークフローコレクション
 */

import type { WorkflowDefinition } from '../workflow-types.js';
import type { WorkflowRegistry } from '../workflow-registry.js';
import { LogType } from '../recorder.js';
import { ingestInputWorkflow } from './ingest-input.js';
import { processUserRequestWorkflow } from './process-user-request.js';
import { analyzeIssueImpactWorkflow } from './analyze-issue-impact.js';
import { extractKnowledgeWorkflow } from './extract-knowledge.js';

// 全ワークフロー定義を再エクスポート
export { ingestInputWorkflow } from './ingest-input.js';
export { processUserRequestWorkflow } from './process-user-request.js';
export { analyzeIssueImpactWorkflow } from './analyze-issue-impact.js';
export { extractKnowledgeWorkflow } from './extract-knowledge.js';

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
export function registerDefaultWorkflows(registry: WorkflowRegistry): void {
  for (const workflow of DEFAULT_WORKFLOWS) {
    registry.register(workflow);
  }
  console.log(`Registered ${DEFAULT_WORKFLOWS.length} default workflows`);
}

