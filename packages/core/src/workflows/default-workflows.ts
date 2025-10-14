/**
 * デフォルトワークフローコレクション
 */

import type { WorkflowDefinition } from './workflow-types.js';
import type { WorkflowRegistry } from './workflow-registry.js';
import { ingestInputWorkflow } from './a-0.ingest-input/index.js';
import { processUserRequestWorkflow } from './a-1.process-user-request/index.js';
import { analyzeIssueImpactWorkflow } from './a-2.analyze-issue-impact/index.js';
import { extractKnowledgeWorkflow } from './a-3.extract-knowledge/index.js';
// Phase 4ワークフロー
import { clusterIssuesWorkflow } from './b-1.cluster-issues/index.js';
import { updateFlowRelationsWorkflow } from './b-2.update-flow-relations/index.js';
import { updateFlowPrioritiesWorkflow } from './b-3.update-flow-priorities/index.js';
import { suggestNextFlowWorkflow } from './c-1.suggest-next-flow/index.js';
import { suggestNextActionWorkflow } from './c-2.suggest-next-action/index.js';
import { collectSystemStatsWorkflow } from './d-2.collect-system-stats/index.js';

/**
 * 全てのデフォルトワークフロー
 */
export const DEFAULT_WORKFLOWS: WorkflowDefinition[] = [
  // A系: 基本ワークフロー
  ingestInputWorkflow,
  processUserRequestWorkflow,
  analyzeIssueImpactWorkflow,
  extractKnowledgeWorkflow,
  // B系: 横断的ワークフロー（Phase 4）
  clusterIssuesWorkflow,
  updateFlowRelationsWorkflow,
  updateFlowPrioritiesWorkflow,
  // C系: 提案ワークフロー（Phase 4）
  suggestNextFlowWorkflow,
  suggestNextActionWorkflow,
  // D系: 監視ワークフロー（Phase 4）
  collectSystemStatsWorkflow,
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
