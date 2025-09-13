import {
  CoreAgent,
  ingestInputWorkflow,
  processUserRequestWorkflow,
  analyzeIssueImpactWorkflow,
  extractKnowledgeWorkflow,
} from '@sebas-chan/core';

/**
 * ワークフローをCoreAgentに登録
 */
export function registerWorkflows(agent: CoreAgent): void {
  // A-1: INGEST_INPUT
  agent.registerWorkflow('INGEST_INPUT', ingestInputWorkflow);

  // A-0: PROCESS_USER_REQUEST
  agent.registerWorkflow('PROCESS_USER_REQUEST', processUserRequestWorkflow);

  // A-2: ANALYZE_ISSUE_IMPACT
  agent.registerWorkflow('ANALYZE_ISSUE_IMPACT', analyzeIssueImpactWorkflow);

  // A-3: EXTRACT_KNOWLEDGE
  agent.registerWorkflow('EXTRACT_KNOWLEDGE', extractKnowledgeWorkflow);

  console.log('Workflows registered:', {
    workflows: [
      'INGEST_INPUT',
      'PROCESS_USER_REQUEST',
      'ANALYZE_ISSUE_IMPACT',
      'EXTRACT_KNOWLEDGE',
    ],
  });
}
