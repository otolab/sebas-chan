import type { AgentEvent } from '../../types.js';
import type { WorkflowContextInterface, WorkflowEventEmitterInterface } from '../context.js';
import type { WorkflowResult } from '../workflow-types.js';
import type { WorkflowDefinition } from '../workflow-types.js';
import type { Issue, IssueUpdate } from '@sebas-chan/shared-types';
import { PRIORITY } from '@sebas-chan/shared-types';
import { compile } from '@moduler-prompt/core';
import type { AIDriver } from '@moduler-prompt/driver';
import { RecordType } from '../recorder.js';
import { analyzeImpactPromptModule, type ImpactAnalysisContext } from './analyze-issue-impact-prompts.js';

/**
 * 影響度スコアを計算
 */
function calculateImpactScore(content: string, relatedIssues: Issue[]): number {
  let score = 0.5; // 基本スコア

  // キーワードによる重み付け
  const criticalKeywords = ['critical', 'urgent', '緊急', '重大', 'crash', 'down'];
  const highKeywords = ['error', 'fail', 'エラー', '失敗', 'bug', 'バグ'];

  const lowerContent = content.toLowerCase();

  if (criticalKeywords.some((k) => lowerContent.includes(k))) {
    score += 0.3;
  }
  if (highKeywords.some((k) => lowerContent.includes(k))) {
    score += 0.2;
  }

  // 関連Issue数による調整
  score += Math.min(relatedIssues.length * 0.05, 0.3);

  return Math.min(score, 1.0);
}

/**
 * 既存Issueを更新するか新規作成するかを判定
 */
function shouldCreateNewIssue(existingIssues: Issue[], _content: string): boolean {
  // 既存のオープンIssueが多い場合は既存に統合
  const openIssues = existingIssues.filter((i) => i.status === 'open');
  if (openIssues.length > 5) {
    return false;
  }

  // 類似度が高いIssueがある場合は既存に統合
  // （ここでは簡易的な実装）
  return true;
}

/**
 * A-2: ANALYZE_ISSUE_IMPACT ワークフロー実行関数
 * Issueの影響範囲を分析し、必要に応じて他のIssueとの関連付けを行う
 */
async function executeAnalyzeIssueImpact(
  event: AgentEvent,
  context: WorkflowContextInterface,
  emitter: WorkflowEventEmitterInterface
): Promise<WorkflowResult> {
  const { storage, createDriver, recorder } = context;
  
  // IssueのIDを取得
  let issueId: string | undefined;
  let issue: Issue | null = null;
  
  // イベントタイプに応じてIssueを取得
  if (event.type === 'ISSUE_CREATED' || event.type === 'ISSUE_UPDATED') {
    const payload = event.payload as { issueId: string; issue?: Issue };
    issueId = payload.issueId;
    issue = payload.issue || await storage.getIssue(issueId);
  }

  if (!issue || !issueId) {
    recorder.record(RecordType.ERROR, {
      workflowName: 'AnalyzeIssueImpact',
      error: 'Issue not found',
      issueId,
    });
    return {
      success: false,
      context,
      error: new Error('Issue not found'),
    };
  }

  // 処理開始を記録
  recorder.record(RecordType.INPUT, {
    workflowName: 'AnalyzeIssueImpact',
    event: event.type,
    issueId,
    issueStatus: issue.status,
    updateCount: issue.updates.length,
  });

  try {
    // 1. 関連するIssueを検索して関係性を分析
    recorder.record(RecordType.INFO, {
      step: 'searchRelatedIssues',
      query: issue.description.substring(0, 100),
    });

    const relatedIssues = await storage.searchIssues(issue.description);
    const otherRelatedIssues = relatedIssues.filter(i => i.id !== issueId);

    recorder.record(RecordType.DB_QUERY, {
      type: 'searchIssues',
      relatedCount: otherRelatedIssues.length,
    });

    // 2. AIで状態変化と影響を分析
    const driver = await createDriver({
      requiredCapabilities: ['reasoning'],
      preferredCapabilities: ['japanese', 'structured'],
    });

    recorder.record(RecordType.AI_CALL, {
      step: 'analyzeImpact',
      model: 'reasoning-structured',
    });

    // コンテキストを作成
    const context: ImpactAnalysisContext = {
      issue,
      otherRelatedIssues
    };

    // コンパイル
    const compiledPrompt = compile(analyzeImpactPromptModule, context);
    const result = await driver.query(compiledPrompt, { temperature: 0.3 });

    // 構造化出力またはJSON形式で解析
    let analysis: any;
    if (result.structuredOutput) {
      analysis = result.structuredOutput;
    } else {
      try {
        analysis = JSON.parse(result.content);
      } catch (parseError) {
        // JSON解析失敗時のフォールバック
        recorder.record(RecordType.WARN, {
          step: 'jsonParseFailed',
          error: parseError instanceof Error ? parseError.message : String(parseError),
        });
        analysis = {
          shouldClose: false,
          suggestedPriority: issue.priority || 50,
          shouldMergeWith: [],
          impactedComponents: [],
          hasKnowledge: false,
          impactScore: 0.5,
        };
      }
    }

    recorder.record(RecordType.INFO, {
      step: 'analysisComplete',
      shouldClose: analysis.shouldClose,
      suggestedPriority: analysis.suggestedPriority,
      hasKnowledge: analysis.hasKnowledge,
      impactScore: analysis.impactScore,
    });

    // 3. 分析結果に基づいてIssueを更新
    const updates: Partial<Issue> = {};
    const timestamp = new Date();
    
    // ステータス変更の判定
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
      
      // ステータス変更イベントを発行
      emitter.emit({
        type: 'ISSUE_STATUS_CHANGED',
        payload: {
          issueId,
          from: issue.status,
          to: 'closed',
          reason: analysis.closeReason,
          issue: { ...issue, ...updates },
        },
      });
    }
    
    // 優先度の更新
    const currentPriorityScore = issue.priority || PRIORITY.LOW;
    if (analysis.suggestedPriority && Math.abs(currentPriorityScore - analysis.suggestedPriority) > 10) {
      updates.priority = analysis.suggestedPriority;
      
      if (!updates.updates) {
        updates.updates = [...issue.updates];
      }
      updates.updates.push({
        timestamp,
        content: `優先度を${currentPriorityScore}から${updates.priority}に変更`,
        author: 'ai' as const,
      });
    }
    
    // 関係性の追加
    if (analysis.shouldMergeWith && analysis.shouldMergeWith.length > 0) {
      updates.relations = [
        ...(issue.relations || []),
        ...analysis.shouldMergeWith.map((targetId: string) => ({
          type: 'duplicate_of' as const,
          targetIssueId: targetId,
        })),
      ];
    }
    
    // Issueを更新
    if (Object.keys(updates).length > 0) {
      await storage.updateIssue(issueId, updates);
      recorder.record(RecordType.DB_QUERY, {
        type: 'updateIssue',
        issueId,
        updatedFields: Object.keys(updates),
      });
    }

    // 4. 後続イベントの発行
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

    // 5. State更新
    const updatedState = context.state + `
## Issue影響分析 (${timestamp.toISOString()})
- Issue ID: ${issueId}
- Impact Score: ${analysis.impactScore.toFixed(2)}
- Should Close: ${analysis.shouldClose}
- Suggested Priority: ${analysis.suggestedPriority}
- Related Issues: ${otherRelatedIssues.length}
- Impacted Components: ${analysis.impactedComponents.join(', ') || 'None'}
`;

    // 処理完了を記録
    recorder.record(RecordType.OUTPUT, {
      workflowName: 'AnalyzeIssueImpact',
      success: true,
      issueId,
      impactScore: analysis.impactScore,
      eventsEmitted: emittedEvents,
    });

    return {
      success: true,
      context: {
        ...context,
        state: updatedState,
      },
      output: {
        issueId,
        impactScore: analysis.impactScore,
        shouldClose: analysis.shouldClose,
        suggestedPriority: analysis.suggestedPriority,
        relatedIssuesCount: otherRelatedIssues.length,
        analysis,
      },
    };
  } catch (error) {
    // エラーを記録
    recorder.record(RecordType.ERROR, {
      workflowName: 'AnalyzeIssueImpact',
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });

    return {
      success: false,
      context,
      error: error as Error,
    };
  }
}

/**
 * 知識カテゴリを判定
 */
function determineKnowledgeCategory(analysis: string): 'solution' | 'pattern' | 'best_practice' | 'reference' {
  const lowerAnalysis = analysis.toLowerCase();
  if (lowerAnalysis.includes('解決') || lowerAnalysis.includes('solution')) {
    return 'solution';
  }
  if (lowerAnalysis.includes('パターン') || lowerAnalysis.includes('pattern')) {
    return 'pattern';
  }
  if (lowerAnalysis.includes('ベストプラクティス') || lowerAnalysis.includes('best practice')) {
    return 'best_practice';
  }
  return 'reference';
}

/**
 * 必要なアクションを抽出
 */
function extractRequiredAction(analysis: string): string {
  // 最初の100文字を返す（実際にはより高度な抽出ロジックが必要）
  return analysis.substring(0, 100) + '...';
}

/**
 * ANALYZE_ISSUE_IMPACT ワークフロー定義
 */
export const analyzeIssueImpactWorkflow: WorkflowDefinition = {
  name: 'AnalyzeIssueImpact',
  description: 'Issueの状態変化を分析し、close判定、優先度変更、知識抽出可否を判断する',
  triggers: {
    eventTypes: ['ISSUE_CREATED', 'ISSUE_UPDATED'],
    condition: (event) => {
      // ISSUE_UPDATEDの場合は重要な更新のみ
      if (event.type === 'ISSUE_UPDATED') {
        const payload = event.payload as any;
        // updates配列への追加、priority変更、status変更の場合のみ
        return payload.updates?.changedFields?.includes('priority') ||
               payload.updates?.changedFields?.includes('status') ||
               payload.updates?.changedFields?.includes('updates');
      }
      return true;
    },
    priority: 30,
  },
  executor: executeAnalyzeIssueImpact,
};;;
