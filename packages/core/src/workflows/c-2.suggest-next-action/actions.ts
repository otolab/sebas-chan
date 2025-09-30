/**
 * C-2: SUGGEST_NEXT_ACTION_FOR_ISSUE ワークフローのアクション関数
 */

import type { Issue, Flow, Knowledge } from '@sebas-chan/shared-types';
import type { AIDriver } from '@moduler-prompt/driver';
import type { WorkflowEventEmitterInterface, WorkflowStorageInterface, WorkflowRecorder } from '../context.js';
import { RecordType } from '../recorder.js';
import { compile } from '@moduler-prompt/core';
import { issueActionPromptModule } from './prompts.js';

/**
 * Issue分析データの型定義
 */
export interface IssueAnalysis {
  issue: Issue;
  stalledDuration: number;
  complexity: 'low' | 'medium' | 'high';
}

/**
 * アクション提案結果の型定義
 */
export interface ActionSuggestionResult {
  actions: Array<{
    type: 'immediate' | 'planned' | 'investigative' | 'delegatable';
    priority: 'must_do' | 'should_do' | 'nice_to_have';
    title: string;
    description: string;
    steps: Array<{
      order: number;
      action: string;
      detail: string;
      estimatedTime: number;
      tools: string[];
      checkpoints: string[];
    }>;
    prerequisites: string[];
    estimatedTotalTime: number;
    confidence: number;
    riskLevel: 'low' | 'medium' | 'high';
    successCriteria: string[];
    potentialBlockers: Array<{
      blocker: string;
      mitigation: string;
    }>;
  }>;
  rootCauseAnalysis?: {
    identified: boolean;
    description: string;
    evidence: string[];
    addressedByActions: boolean;
  };
  alternativeApproaches?: Array<{
    approach: string;
    whenToConsider: string;
    prosAndCons: {
      pros: string[];
      cons: string[];
    };
  }>;
  splitSuggestion?: {
    shouldSplit: boolean;
    reason: string;
    suggestedSubIssues: Array<{
      title: string;
      description: string;
      dependency: 'independent' | 'sequential' | 'parallel';
    }>;
  };
  escalationSuggestion?: {
    shouldEscalate: boolean;
    reason: string;
    escalateTo: string;
    preparedInformation: string[];
  };
  updatedState: string;
}

/**
 * Issueに対するアクションを提案
 */
export async function suggestIssueActions(
  driver: AIDriver,
  issueAnalysis: IssueAnalysis,
  relevantKnowledge: Knowledge[],
  similarResolvedIssues: any[],
  flowPerspective: Flow | null,
  userContext: any,
  requestDetail: any,
  currentState: string
): Promise<ActionSuggestionResult> {
  const context = {
    issueAnalysis,
    relevantKnowledge,
    similarResolvedIssues,
    flowPerspective,
    userContext,
    constraints: requestDetail.constraints || {},
    detailLevel: requestDetail.level || 'detailed',
    currentState,
  };

  const compiled = compile(issueActionPromptModule, context);
  const result = await driver.query(compiled, { temperature: 0.3 });

  if (!result.structuredOutput) {
    throw new Error('アクション提案の構造化出力の取得に失敗しました');
  }

  return result.structuredOutput as ActionSuggestionResult;
}

/**
 * アクション提案を適用
 */
export async function applyActionSuggestions(
  issueId: string,
  actionResult: ActionSuggestionResult,
  emitter: WorkflowEventEmitterInterface,
  recorder: WorkflowRecorder,
  storage: WorkflowStorageInterface
): Promise<void> {
  // アクションの優先順位付け
  const prioritizedActions = actionResult.actions.sort((a, b) => {
    const priorityWeight = { must_do: 3, should_do: 2, nice_to_have: 1 };
    const typeWeight = { immediate: 3, investigative: 2, planned: 1, delegatable: 0 };

    const scoreA = priorityWeight[a.priority] * 10 +
                    typeWeight[a.type] * 5 +
                    a.confidence * 3;
    const scoreB = priorityWeight[b.priority] * 10 +
                    typeWeight[b.type] * 5 +
                    b.confidence * 3;

    return scoreB - scoreA;
  });

  // アクション提案準備完了イベント
  if (prioritizedActions.length > 0) {
    emitter.emit({
      type: 'ACTION_SUGGESTION_READY',
      payload: {
        issueId,
        primaryAction: prioritizedActions[0].title,
        totalActions: prioritizedActions.length,
      },
    });
  }

  // Issue分割が推奨される場合
  if (actionResult.splitSuggestion?.shouldSplit) {
    emitter.emit({
      type: 'ISSUE_SPLIT_SUGGESTED',
      payload: {
        issueId,
        reason: actionResult.splitSuggestion.reason,
        suggestedSubIssues: actionResult.splitSuggestion.suggestedSubIssues,
      },
    });

    recorder.record(RecordType.INFO, {
      event: 'ISSUE_SPLIT_SUGGESTED',
      issueId,
      subIssuesCount: actionResult.splitSuggestion.suggestedSubIssues.length,
    });
  }

  // エスカレーションが必要な場合
  if (actionResult.escalationSuggestion?.shouldEscalate) {
    emitter.emit({
      type: 'ESCALATION_REQUIRED',
      payload: {
        issueId,
        reason: actionResult.escalationSuggestion.reason,
        escalateTo: actionResult.escalationSuggestion.escalateTo,
      },
    });

    recorder.record(RecordType.INFO, {
      event: 'ESCALATION_REQUIRED',
      issueId,
      escalateTo: actionResult.escalationSuggestion.escalateTo,
    });
  }

  // 適用されたKnowledgeの記録
  if (actionResult.actions.length > 0) {
    const primaryAction = actionResult.actions[0];

    // Knowledge適用イベント（関連Knowledgeがある場合）
    emitter.emit({
      type: 'KNOWLEDGE_APPLIED',
      payload: {
        issueId,
        actionTitle: primaryAction.title,
        confidence: primaryAction.confidence,
      },
    });
  }

  // アクション提案の記録（学習用）
  recorder.record(RecordType.INFO, {
    type: 'action_suggestion_recorded',
    issueId,
    suggestionsCount: prioritizedActions.length,
    rootCauseIdentified: actionResult.rootCauseAnalysis?.identified,
    timestamp: new Date(),
  });
}