// 全ワークフロー定義をエクスポート
export { ingestInputWorkflow } from './ingest-input.js';
export { processUserRequestWorkflow } from './process-user-request.js';
export { analyzeIssueImpactWorkflow } from './analyze-issue-impact.js';
export { extractKnowledgeWorkflow } from './extract-knowledge.js';

// ワークフローレジストリに登録するヘルパー関数
import { getWorkflowRegistry } from '../functional-registry.js';
import { ingestInputWorkflow } from './ingest-input.js';
import { processUserRequestWorkflow } from './process-user-request.js';
import { analyzeIssueImpactWorkflow } from './analyze-issue-impact.js';
import { extractKnowledgeWorkflow } from './extract-knowledge.js';

/**
 * 全ワークフローをレジストリに登録
 */
export function registerAllWorkflows(): void {
  const registry = getWorkflowRegistry();

  // 各ワークフローを登録（workflow.nameを使用）
  registry.register(ingestInputWorkflow);
  registry.register(processUserRequestWorkflow);
  registry.register(analyzeIssueImpactWorkflow);
  registry.register(extractKnowledgeWorkflow);

  console.log('All workflows registered successfully');
}