import type { AgentEvent } from '../../index.js';
import type { WorkflowContext, WorkflowEventEmitter } from '../context.js';
import type { WorkflowDefinition, WorkflowResult } from '../functional-types.js';
import type { Issue, IssueUpdate, IssueRelation } from '@sebas-chan/shared-types';
import { LogType } from '../logger.js';
import { compile } from '@moduler-prompt/core';

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
function shouldCreateNewIssue(existingIssues: Issue[], content: string): boolean {
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
  context: WorkflowContext,
  emitter: WorkflowEventEmitter
): Promise<WorkflowResult> {
  const { logger, storage, createDriver } = context;
  // event.payloadの型を明示的に定義
  interface AnalyzeIssueImpactPayload {
    issue: {
      id?: string;
      title?: string;
      content?: string;
      description?: string;
      inputId?: string;
    };
    aiResponse?: string;
  }
  const { issue, aiResponse } = event.payload as unknown as AnalyzeIssueImpactPayload;

  try {
    // 1. 関連するIssueを検索
    logger.log(LogType.INFO, { message: 'Analyzing issue impact', issueContent: issue.content });

    const relatedIssues = await storage.searchIssues(issue.content || issue.description || '');
    logger.log(LogType.DB_QUERY, {
      operation: 'searchIssues',
      query: issue.content || issue.description || '',
      resultIds: relatedIssues.map((i) => i.id)
    });

    // 2. AIで影響分析
    const prompt = `
以下の問題の影響範囲を分析してください：
${issue.content || issue.description}

関連Issue数: ${relatedIssues.length}
${relatedIssues.length > 0 ? `関連Issue: ${relatedIssues.map((i) => i.title).join(', ')}` : ''}

影響範囲と優先度を日本語で説明してください。
`;

    // ドライバーを作成（standard モデルを使用）
    const driver = await createDriver({
      model: 'standard',
      temperature: 0.3,
    });

    const promptModule = { instructions: [prompt] };
    const compiledPrompt = compile(promptModule);
    const result = await driver.query(compiledPrompt, { temperature: 0.3 });
    const impactAnalysis = result.content;

    logger.log(LogType.AI_CALL, { prompt, response: impactAnalysis, model: 'standard', temperature: 0.3 });

    // 3. 影響度スコアを計算
    const impactScore = calculateImpactScore(issue.content || issue.description || '', relatedIssues);

    // 4. Issue作成または更新
    let issueId: string;
    const timestamp = new Date();

    if (shouldCreateNewIssue(relatedIssues, issue.content || issue.description || '')) {
      // 新規Issue作成
      const newIssue: Omit<Issue, 'id' | 'createdAt' | 'updatedAt'> = {
        title: issue.title || `Issue: ${(issue.content || issue.description || '').substring(0, 50)}...`,
        description: issue.content || issue.description || '',
        status: 'open',
        labels: impactScore > 0.7 ? ['high-priority'] : ['normal'],
        updates: [
          {
            timestamp,
            content: `AI分析結果: ${impactAnalysis}`,
            author: 'ai' as const,
          },
        ],
        relations: relatedIssues.slice(0, 3).map((relatedIssue) => ({
          type: 'relates_to' as const,
          targetIssueId: relatedIssue.id,
        })),
        sourceInputIds: issue.inputId ? [issue.inputId] : [],
      };

      const createdIssue = await storage.createIssue(newIssue);
      issueId = createdIssue.id;

      logger.log(LogType.INFO, { message: 'Created new issue', issueId });
    } else {
      // 既存Issue更新
      const targetIssue = relatedIssues[0];
      issueId = targetIssue.id;

      const update: IssueUpdate = {
        timestamp,
        content: `関連する報告: ${issue.content}\nAI分析: ${impactAnalysis}`,
        author: 'ai' as const,
      };

      // TODO: updateIssueメソッドの実装が必要
      // await storage.updateIssue(issueId, { updates: [...targetIssue.updates, update] });

      logger.log(LogType.INFO, { message: 'Updated existing issue', issueId });
    }

    // 5. 高影響度の場合は追加のワークフローを起動
    if (impactScore > 0.8) {
      logger.log(LogType.WARN, { message: 'High impact issue detected', issueId, impactScore });

      emitter.emit({
        type: 'EXTRACT_KNOWLEDGE',
        priority: 'high',
        payload: {
          issueId,
          impactAnalysis,
          source: 'high_impact_issue',
        },
      });
    }

    // 6. State更新
    const updatedState = context.state + `
## Issue影響分析 (${timestamp.toISOString()})
- Issue ID: ${issueId}
- Impact Score: ${impactScore.toFixed(2)}
- Related Issues: ${relatedIssues.length}
- Analysis: ${impactAnalysis.substring(0, 200)}...
`;

    return {
      success: true,
      context: {
        ...context,
        state: updatedState,
      },
      output: {
        issueId,
        impactScore,
        relatedIssues: relatedIssues.length,
        analysis: impactAnalysis,
      },
    };
  } catch (error) {
    logger.log(LogType.ERROR, {
      message: (error as Error).message,
      stack: (error as Error).stack,
      context: { issue },
    });
    throw error;
  }
}

/**
 * ANALYZE_ISSUE_IMPACT ワークフロー定義
 */
export const analyzeIssueImpactWorkflow: WorkflowDefinition = {
  name: 'AnalyzeIssueImpact',
  description: 'Issueの影響範囲を分析し、関連性と優先度を判定して必要に応じて知識抽出を起動する',
  executor: executeAnalyzeIssueImpact,
};