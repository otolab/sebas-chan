import type { AgentEvent } from '../../types.js';
import type { WorkflowContextInterface, WorkflowEventEmitterInterface } from '../context.js';
import type { WorkflowResult } from '../workflow-types.js';
import type { WorkflowDefinition } from '../workflow-types.js';
import type { Issue } from '@sebas-chan/shared-types';
import { compile } from '@moduler-prompt/core';
import { RecordType } from '../recorder.js';
import { analyzeImpactPromptModule, type ImpactAnalysisContext } from './analyze-issue-impact-prompts.js';
import {
  type ImpactAnalysisResult,
  calculateImpactScoreWithAI,
  updateContextState,
  buildIssueUpdates,
  emitFollowupEvents
} from './analyze-issue-impact-helpers.js';

/**
 * Issueとその関連情報を取得
 */
async function fetchIssueData(
  event: AgentEvent,
  storage: WorkflowContextInterface['storage']
): Promise<{ issue: Issue; issueId: string } | null> {
  if (event.type !== 'ISSUE_CREATED' && event.type !== 'ISSUE_UPDATED') {
    return null;
  }

  const payload = event.payload as { issueId: string; issue?: Issue };
  const issueId = payload.issueId;
  const issue = payload.issue || await storage.getIssue(issueId);

  if (!issue) {
    return null;
  }

  return { issue, issueId };
}

/**
 * AI分析を実行
 */
async function analyzeIssueWithAI(
  context: WorkflowContextInterface,
  issue: Issue,
  relatedIssues: Issue[]
): Promise<ImpactAnalysisResult> {
  const driver = await context.createDriver({
    requiredCapabilities: ['reasoning'],
    preferredCapabilities: ['japanese', 'structured'],
  });

  const analysisContext: ImpactAnalysisContext = {
    issue,
    otherRelatedIssues: relatedIssues,
    currentState: context.state
  };

  const compiledPrompt = compile(analyzeImpactPromptModule, analysisContext);
  // 構造化出力を有効にするためにmetadataを設定
  compiledPrompt.metadata = {
    outputSchema: {
      type: 'object',
      properties: {
        impactScore: { type: 'number' },
        urgency: { type: 'string', enum: ['immediate', 'high', 'medium', 'low'] },
        affectedComponents: { type: 'array', items: { type: 'string' } },
        suggestedAction: { type: 'string', enum: ['escalate', 'monitor', 'defer', 'merge'] },
        relatedIssueIds: { type: 'array', items: { type: 'string' } },
        hasKnowledge: { type: 'boolean' },
        shouldClose: { type: 'boolean' },
        suggestedPriority: { type: 'number' },
        updatedState: { type: 'string' }
      },
      required: ['impactScore', 'urgency', 'affectedComponents', 'suggestedAction', 'relatedIssueIds', 'hasKnowledge', 'shouldClose', 'suggestedPriority', 'updatedState']
    }
  };
  const result = await driver.query(compiledPrompt, { temperature: 0.3 });

  if (result.structuredOutput) {
    return result.structuredOutput as ImpactAnalysisResult;
  }

  // 構造化出力が得られない場合はエラー
  throw new Error('AI分析結果の取得に失敗しました');
}

/**
 * A-2: ANALYZE_ISSUE_IMPACT ワークフロー実行関数
 */
async function executeAnalyzeIssueImpact(
  event: AgentEvent,
  context: WorkflowContextInterface,
  emitter: WorkflowEventEmitterInterface
): Promise<WorkflowResult> {
  const { storage, recorder } = context;

  // 1. Issueデータの取得
  const issueData = await fetchIssueData(event, storage);
  if (!issueData) {
    recorder.record(RecordType.ERROR, {
      workflowName: 'AnalyzeIssueImpact',
      error: 'Issue not found',
    });
    return {
      success: false,
      context,
      error: new Error('Issue not found'),
    };
  }

  const { issue, issueId } = issueData;

  // 処理開始を記録
  recorder.record(RecordType.INPUT, {
    workflowName: 'AnalyzeIssueImpact',
    event: event.type,
    issueId,
    issueStatus: issue.status,
    updateCount: issue.updates.length,
  });

  try {
    // 2. 関連Issueの検索
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

    // 3. AI分析実行
    recorder.record(RecordType.AI_CALL, {
      step: 'analyzeImpact',
      model: 'reasoning-structured',
    });

    const analysis = await analyzeIssueWithAI(context, issue, otherRelatedIssues);

    recorder.record(RecordType.INFO, {
      step: 'analysisComplete',
      shouldClose: analysis.shouldClose,
      suggestedPriority: analysis.suggestedPriority,
      hasKnowledge: analysis.hasKnowledge,
      impactScore: analysis.impactScore,
    });

    // 4. Issueの更新
    const updates = buildIssueUpdates(issue, analysis);

    if (Object.keys(updates).length > 0) {
      await storage.updateIssue(issueId, updates);
      recorder.record(RecordType.DB_QUERY, {
        type: 'updateIssue',
        issueId,
        updatedFields: Object.keys(updates),
      });

      // ステータス変更イベント
      if (updates.status === 'closed') {
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
    }

    // 5. 後続イベントの発行
    const emittedEvents = emitFollowupEvents(
      emitter,
      recorder,
      analysis,
      issueId,
      issue
    );

    // 6. State更新
    const driver = await context.createDriver({
      requiredCapabilities: ['fast'],
      preferredCapabilities: ['structured'],
    });

    const updatedState = await updateContextState(
      driver,
      context.state,
      analysis,
      issueId
    );

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
};