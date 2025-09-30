/**
 * AnalyzeIssueImpactワークフローのヘルパー関数
 */

import type { Issue, IssueRelation } from '@sebas-chan/shared-types';
import type { WorkflowEventEmitterInterface } from '../context.js';
import type { AIDriver } from '@moduler-prompt/driver';
import { compile } from '@moduler-prompt/core';
import { analyzeImpactPromptModule, type ImpactAnalysisContext } from './prompts.js';
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
  updatedState: string; // State更新も含む
}

/**
 * Issueの影響度をAIで分析
 * 意図: 分析とState更新を1回のAI呼び出しで完結（updateStatePromptModuleの活用）
 */
export async function analyzeIssue(
  driver: AIDriver,
  issue: Issue,
  relatedIssues: Issue[],
  currentState: string
): Promise<ImpactAnalysisResult> {
  // 意図: PromptModuleのコンテキストに必要なデータを集約
  const analysisContext: ImpactAnalysisContext = {
    issue,
    otherRelatedIssues: relatedIssues,
    currentState, // updateStatePromptModuleが必要とする現在のState
  };

  const compiledPrompt = compile(analyzeImpactPromptModule, analysisContext);
  const result = await driver.query(compiledPrompt, { temperature: 0.3 });

  // 意図: 構造化出力は必須（ワークフローの前提条件）
  if (result.structuredOutput) {
    return result.structuredOutput as ImpactAnalysisResult;
  }

  throw new Error('AI分析結果の取得に失敗しました');
}

/**
 * Issueの更新を構築
 * 意図: AI分析結果に基づいて必要な更新のみを生成（無駄なDB書き込みを避ける）
 */
export function buildIssueUpdates(issue: Issue, analysis: ImpactAnalysisResult): Partial<Issue> {
  const updates: Partial<Issue> = {};
  const timestamp = new Date();

  // ステータス変更
  // 意図: AIがクローズ可能と判定し、まだクローズされていない場合のみ
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
  // 意図: 微小な変更を避け、意味のある差（10ポイント以上）のみ更新
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
  // 意図: 重複Issueが検出された場合、関係性を明示的に記録
  if (analysis.shouldMergeWith.length > 0) {
    updates.relations = [
      ...(issue.relations || []),
      ...analysis.shouldMergeWith.map(
        (targetId): IssueRelation => ({
          type: 'duplicates',
          targetIssueId: targetId,
        })
      ),
    ];
  }

  return updates;
}

/**
 * 後続イベントの発行
 * 意図: イベント駆動アーキテクチャで他のワークフローをトリガー
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
  // 意図: 解決済みIssueや重要な情報を含むIssueから知識を抽出
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
  // 意図: 緊急対応が必要なIssueをシステム全体に通知
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
