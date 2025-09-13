import {
  CoreAgent,
  IngestInputWorkflow,
  ProcessUserRequestWorkflow,
  AnalyzeIssueImpactWorkflow,
  ExtractKnowledgeWorkflow,
} from '@sebas-chan/core';

/**
 * ワークフローをCoreAgentに登録
 */
export function registerWorkflows(agent: CoreAgent): void {
  const registry = agent.getWorkflowRegistry();

  // A-1: INGEST_INPUT
  registry.register('INGEST_INPUT', new IngestInputWorkflow());

  // A-0: PROCESS_USER_REQUEST
  registry.register('PROCESS_USER_REQUEST', new ProcessUserRequestWorkflow());

  // A-2: ANALYZE_ISSUE_IMPACT
  registry.register('ANALYZE_ISSUE_IMPACT', new AnalyzeIssueImpactWorkflow());

  // A-3: EXTRACT_KNOWLEDGE
  registry.register('EXTRACT_KNOWLEDGE', new ExtractKnowledgeWorkflow());

  console.log('Workflows registered:', {
    workflows: ['INGEST_INPUT', 'PROCESS_USER_REQUEST', 'ANALYZE_ISSUE_IMPACT', 'EXTRACT_KNOWLEDGE'],
  });
}