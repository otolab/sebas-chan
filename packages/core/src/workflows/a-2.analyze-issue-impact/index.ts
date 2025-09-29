import type { AgentEvent } from '../../types.js';
import type { WorkflowContextInterface, WorkflowEventEmitterInterface } from '../context.js';
import type { WorkflowResult } from '../workflow-types.js';
import type { WorkflowDefinition } from '../workflow-types.js';
import type { Issue } from '@sebas-chan/shared-types';
import { RecordType } from '../recorder.js';
import { analyzeIssue, buildIssueUpdates, emitFollowupEvents } from './actions.js';

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
  // 意図: payloadに含まれている場合は再取得を避ける（パフォーマンス最適化）
  const payload = event.payload as { issueId: string; issue?: Issue };
  const issueId = payload.issueId;
  const issue = payload.issue || (await storage.getIssue(issueId));

  if (!issue) {
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

  // 処理開始を記録
  // TODO: recorder.recordのschemaは別途決める必要がありそうですね。「なんでもあり」はよくなさそう。
  recorder.record(RecordType.INPUT, {
    workflowName: 'AnalyzeIssueImpact',
    event: event.type,
    issueId,
    issueStatus: issue.status,
    updateCount: issue.updates.length,
  });

  try {
    // 2. ドライバーの作成
    // 意図: 単一インスタンスで全処理を実行（作成コスト削減）
    const driver = await context.createDriver({
      requiredCapabilities: ['reasoning'],
      preferredCapabilities: ['japanese', 'structured'],
    });

    // 3. 関連Issueの検索
    // 意図: 重複や類似Issueの検出のため、説明文でベクトル検索
    recorder.record(RecordType.INFO, {
      step: 'searchRelatedIssues',
      query: issue.description.substring(0, 100),
    });

    const relatedIssues = await storage.searchIssues(issue.description);
    const otherRelatedIssues = relatedIssues.filter((i: Issue) => i.id !== issueId);

    recorder.record(RecordType.DB_QUERY, {
      type: 'searchIssues',
      relatedCount: otherRelatedIssues.length,
    });

    // 4. AI分析実行
    // 意図: 1回のAI呼び出しで分析とState更新を同時に実行（効率化）
    recorder.record(RecordType.AI_CALL, {
      step: 'analyzeImpact',
      model: 'reasoning-structured',
    });

    const analysis = await analyzeIssue(driver, issue, otherRelatedIssues, context.state);

    recorder.record(RecordType.INFO, {
      step: 'analysisComplete',
      shouldClose: analysis.shouldClose,
      suggestedPriority: analysis.suggestedPriority,
      hasKnowledge: analysis.hasKnowledge,
      impactScore: analysis.impactScore,
    });

    // 5. Issueの更新
    // 意図: AI判定に基づいて必要な場合のみDB更新（無駄な更新を避ける）
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

    // 6. 後続イベントの発行
    // 意図: 他のワークフローをトリガー（イベント駆動アーキテクチャ）
    const emittedEvents = emitFollowupEvents(emitter, recorder, analysis, issueId, issue);

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
        state: analysis.updatedState, // 意図: AIが生成した新しいStateで更新
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
        return (
          payload.updates?.changedFields?.includes('priority') ||
          payload.updates?.changedFields?.includes('status') ||
          payload.updates?.changedFields?.includes('updates')
        );
      }
      return true;
    },
    priority: 30,
  },
  executor: executeAnalyzeIssueImpact,
};
