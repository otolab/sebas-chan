/**
 * デフォルトワークフローコレクション
 */

import type { WorkflowDefinition } from './workflow-types.js';
import type { WorkflowRegistry } from './workflow-registry.js';
import { ingestInputWorkflow } from './a-0.ingest-input/index.js';
import { processUserRequestWorkflow } from './a-1.process-user-request/index.js';
import { analyzeIssueImpactWorkflow } from './a-2.analyze-issue-impact/index.js';
import { extractKnowledgeWorkflow } from './a-3.extract-knowledge/index.js';

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
