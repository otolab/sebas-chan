/**
 * AnalyzeIssueImpactワークフローのヘルパー関数
 */

import type { Issue, IssueRelation } from '@sebas-chan/shared-types';
import type { WorkflowContextInterface, WorkflowEventEmitterInterface } from '../context.js';
import type { AIDriver } from '@moduler-prompt/driver';
import { compile } from '@moduler-prompt/core';
import { impactScorePromptModule } from './impact-score-prompt-module.js';
import { updateStatePromptModule } from './state-prompt-module.js';
import { RecordType } from '../recorder.js';

/**
 * AI分析結果の型定義
 */
export interface ImpactAnalysisResult {
  shouldClose: boolean;
  closeReason?: string;
  suggestedPriority: number;
  shouldMergeWith: string[];
  impactedComponents: string[];
  hasKnowledge: boolean;
  knowledgeSummary?: string;
  impactScore: number;
}

/**
 * 影響度スコアをAIで計算
 */
export async function calculateImpactScoreWithAI(
  driver: AIDriver,
  issueContent: string,
  relatedIssuesCount: number
): Promise<{ score: number; reasoning: string }> {
  const compiledPrompt = compile(impactScorePromptModule, {
    issueContent,
    relatedIssuesCount
  });
  // 構造化出力を有効にするためにmetadataを設定
  compiledPrompt.metadata = {
    outputSchema: {
      type: 'object',
      properties: {
        impactScore: { type: 'number' },
        reasoning: { type: 'string' }
      },
      required: ['impactScore', 'reasoning']
    }
  };

  const result = await driver.query(compiledPrompt, { temperature: 0.2 });

  if (result.structuredOutput) {
    const output = result.structuredOutput as { impactScore: number; reasoning: string };
    return {
      score: output.impactScore,
      reasoning: output.reasoning
    };
  }

  // フォールバック
  return {
    score: 0.5,
    reasoning: 'スコア計算に失敗したため、デフォルト値を使用'
  };
}

/**
 * context.stateを更新
 */
export async function updateContextState(
  driver: AIDriver,
  currentState: string,
  analysisResult: ImpactAnalysisResult,
  issueId: string
): Promise<string> {
  const newInfo = `
## Issue影響分析 (${new Date().toISOString()})
- Issue ID: ${issueId}
- Impact Score: ${analysisResult.impactScore.toFixed(2)}
- Should Close: ${analysisResult.shouldClose}
- Suggested Priority: ${analysisResult.suggestedPriority}
- Impacted Components: ${analysisResult.impactedComponents.join(', ') || 'None'}
`;

  const compiledPrompt = compile(updateStatePromptModule, {
    currentState,
    newInfo
  });
  // 構造化出力を有効にするためにmetadataを設定
  compiledPrompt.metadata = {
    outputSchema: {
      type: 'object',
      properties: {
        updatedState: { type: 'string' }
      },
      required: ['updatedState']
    }
  };

  const result = await driver.query(compiledPrompt, { temperature: 0.3 });

  if (result.structuredOutput) {
    const output = result.structuredOutput as { updatedState: string };
    if (output.updatedState) {
      return output.updatedState;
    }
  }

  // フォールバック: 単純に追加
  return currentState + '\n' + newInfo;
}

/**
 * Issueの更新を構築
 */
export function buildIssueUpdates(
  issue: Issue,
  analysis: ImpactAnalysisResult
): Partial<Issue> {
  const updates: Partial<Issue> = {};
  const timestamp = new Date();

  // ステータス変更
  if (analysis.shouldClose && issue.status !== 'closed') {
    updates.status = 'closed';
    updates.updates = [
      ...issue.updates,
      {
        timestamp,
        content: `自動解決判定: ${analysis.closeReason || '条件を満たしたため解決'}`,
        author: 'ai' as const,
      },
    ];
  }

  // 優先度変更
  const currentPriority = issue.priority || 0;
  if (Math.abs(currentPriority - analysis.suggestedPriority) > 10) {
    updates.priority = analysis.suggestedPriority;

    if (!updates.updates) {
      updates.updates = [...issue.updates];
    }
    updates.updates.push({
      timestamp,
      content: `優先度を${currentPriority}から${analysis.suggestedPriority}に変更`,
      author: 'ai' as const,
    });
  }

  // 関係性の追加
  if (analysis.shouldMergeWith.length > 0) {
    updates.relations = [
      ...(issue.relations || []),
      ...analysis.shouldMergeWith.map((targetId): IssueRelation => ({
        type: 'duplicates',
        targetIssueId: targetId,
      })),
    ];
  }

  return updates;
}

/**
 * 後続イベントの発行
 */
export function emitFollowupEvents(
  emitter: WorkflowEventEmitterInterface,
  recorder: any,
  analysis: ImpactAnalysisResult,
  issueId: string,
  issue: Issue
): string[] {
  const emittedEvents: string[] = [];

  // 知識抽出可能な場合
  if (analysis.hasKnowledge || (analysis.shouldClose && issue.updates.length > 2)) {
    emitter.emit({
      type: 'KNOWLEDGE_EXTRACTABLE',
      payload: {
        sourceType: 'issue',
        sourceId: issueId,
        confidence: analysis.impactScore || 0.7,
        reason: analysis.knowledgeSummary || '解決済みIssueから知識を抽出',
        suggestedCategory: analysis.shouldClose ? 'solution' : 'pattern',
      },
    });
    emittedEvents.push('KNOWLEDGE_EXTRACTABLE');

    recorder.record(RecordType.INFO, {
      step: 'eventEmitted',
      eventType: 'KNOWLEDGE_EXTRACTABLE',
      confidence: analysis.impactScore || 0.7,
    });
  }

  // 高優先度検出
  if (analysis.suggestedPriority > 80 || analysis.impactScore > 0.8) {
    emitter.emit({
      type: 'HIGH_PRIORITY_DETECTED',
      payload: {
        entityType: 'issue',
        entityId: issueId,
        priority: analysis.suggestedPriority || Math.round(analysis.impactScore * 100),
        reason: `影響スコア: ${analysis.impactScore}, 影響コンポーネント: ${analysis.impactedComponents.join(', ')}`,
        requiredAction: analysis.shouldClose ? 'レビューと承認' : '緊急対応が必要',
      },
    });
    emittedEvents.push('HIGH_PRIORITY_DETECTED');

    recorder.record(RecordType.INFO, {
      step: 'eventEmitted',
      eventType: 'HIGH_PRIORITY_DETECTED',
      priority: analysis.suggestedPriority || Math.round(analysis.impactScore * 100),
    });
  }

  return emittedEvents;
}