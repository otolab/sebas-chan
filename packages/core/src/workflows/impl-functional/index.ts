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

  // 各ワークフローを対応するイベントタイプに登録
  registry.register('INGEST_INPUT', ingestInputWorkflow);
  registry.register('PROCESS_USER_REQUEST', processUserRequestWorkflow);
  registry.register('ANALYZE_ISSUE_IMPACT', analyzeIssueImpactWorkflow);
  registry.register('EXTRACT_KNOWLEDGE', extractKnowledgeWorkflow);

  console.log('All workflows registered successfully');
}