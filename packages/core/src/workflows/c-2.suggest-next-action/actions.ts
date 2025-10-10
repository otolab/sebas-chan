/**
 * C-2: SUGGEST_NEXT_ACTION_FOR_ISSUE ワークフローのアクション関数
 */

import type { Issue, Flow, Knowledge } from '@sebas-chan/shared-types';
import type { AIDriver } from '@moduler-prompt/driver';
import type {
  WorkflowEventEmitterInterface,
  WorkflowStorageInterface,
  WorkflowRecorder,
} from '../context.js';
import { RecordType } from '../recorder.js';
import { compile } from '@moduler-prompt/core';
import { issueActionPromptModule } from './prompts.js';
import { PRIORITY } from '../shared/constants.js';

/**
 * Issue分析データの型定義
 */
export interface IssueAnalysis {
  issue: Issue;
  stalledDuration: number;
  complexity: 'low' | 'medium' | 'high';
}

/**
 * 類似の解決済みIssueの型定義
 */
export interface SimilarResolvedIssue {
  id: string;
  title: string;
  description?: string;
  resolution?: string;
  similarity: number;
}

/**
 * ユーザーコンテキストの型定義
 */
export interface UserContext {
  userId?: string;
  recentActivity?: string[];
  preferences?: Record<string, unknown>;
}

/**
 * リクエスト詳細の型定義
 */
export interface RequestDetail {
  level?: 'summary' | 'standard' | 'detailed';
  constraints?: Record<string, unknown>;
  focusArea?: string;
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
  flowPerspective: Flow | null,
  userContext: UserContext,
  requestDetail: RequestDetail,
  currentState: string
): Promise<ActionSuggestionResult> {
  const context = {
    issueAnalysis,
    relevantKnowledge,
    similarResolvedIssues: [], // 空配列を設定（プロンプトモジュールが期待するため）
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

    const scoreA = priorityWeight[a.priority] * 10 + typeWeight[a.type] * 5 + a.confidence * 3;
    const scoreB = priorityWeight[b.priority] * 10 + typeWeight[b.type] * 5 + b.confidence * 3;

    return scoreB - scoreA;
  });

  // アクション提案準備完了イベント
  // ACTION_SUGGESTION_READYは未定義のため削除
  // 提案内容はワークフローのoutputとして返されるため、イベント発火は不要
  if (prioritizedActions.length > 0) {
    // イベント発火を削除（ワークフローのoutputで十分）
  }

  // Issue分割が推奨される場合、Issueとして作成
  if (actionResult.splitSuggestion?.shouldSplit) {
    const issue = await storage.getIssue(issueId);
    const splitIssue = await storage.createIssue({
      title: `Issue "${issue?.title || issueId}" の分割を検討`,
      description: `## 提案内容\nIssue (${issueId}) を複数のサブIssueに分割することを提案します。\n\n## 理由\n${actionResult.splitSuggestion.reason}\n\n## 提案されるサブIssue\n${actionResult.splitSuggestion.suggestedSubIssues.map((sub) => `- ${sub.title}: ${sub.description}`).join('\n')}\n\n## アクション\nこの提案をレビューして、適切な場合は手動でサブIssueを作成してください。`,
      status: 'open',
      priority: PRIORITY.MEDIUM,
      labels: ['suggestion', 'issue-split'],
      updates: [
        {
          timestamp: new Date(),
          content: `SuggestNextActionワークフローによって作成されました。元Issue: ${issueId}`,
          author: 'ai' as const,
        },
      ],
      relations: [{ type: 'relates_to', targetIssueId: issueId }],
      sourceInputIds: [],
    });

    emitter.emit({
      type: 'ISSUE_CREATED',
      payload: {
        issueId: splitIssue.id,
        issue: splitIssue,
        createdBy: 'workflow' as const,
        sourceWorkflow: 'SuggestNextAction',
      },
    });

    recorder.record(RecordType.INFO, {
      action: 'ISSUE_SPLIT_ISSUE_CREATED',
      originalIssueId: issueId,
      suggestionIssueId: splitIssue.id,
      subIssuesCount: actionResult.splitSuggestion.suggestedSubIssues.length,
    });
  }

  // エスカレーションが必要な場合、高優先度Issueとして更新
  if (actionResult.escalationSuggestion?.shouldEscalate) {
    const existingIssue = await storage.getIssue(issueId);
    // 既存Issueの優先度を上げる
    await storage.updateIssue(issueId, {
      priority: PRIORITY.HIGH,
      updates: [
        ...(existingIssue?.updates || []),
        {
          timestamp: new Date(),
          content: `エスカレーション推奨: ${actionResult.escalationSuggestion.reason}\n担当推奨: ${actionResult.escalationSuggestion.escalateTo}`,
          author: 'ai' as const,
        },
      ],
    });

    // 高優先度Issue検出イベントを発火
    emitter.emit({
      type: 'HIGH_PRIORITY_ISSUE_DETECTED',
      payload: {
        issueId,
        priority: PRIORITY.CRITICAL,
        reason: actionResult.escalationSuggestion.reason,
      },
    });

    recorder.record(RecordType.INFO, {
      action: 'ISSUE_ESCALATED',
      issueId,
      escalateTo: actionResult.escalationSuggestion.escalateTo,
      reason: actionResult.escalationSuggestion.reason,
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
