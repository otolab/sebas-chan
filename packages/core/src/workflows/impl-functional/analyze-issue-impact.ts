import type { AgentEvent } from '../../types.js';
import type { WorkflowContextInterface, WorkflowEventEmitterInterface } from '../context.js';
import type { WorkflowResult } from '../workflow-types.js';
import type { WorkflowDefinition } from '../workflow-types.js';
import type { Issue, IssueUpdate } from '@sebas-chan/shared-types';
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
  const { storage, createDriver } = context;
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
  const { issue } = event.payload as unknown as AnalyzeIssueImpactPayload;

  // issueが存在しない場合はエラー
  if (!issue) {
    return {
      success: false,
      context,
      error: new Error('Issue not found in payload'),
    };
  }

  // 1. 関連するIssueを検索
  const relatedIssues = await storage.searchIssues(issue.content || issue.description || '');

  // 2. AIで影響分析
  const prompt = `
以下の問題の影響範囲を分析してください：
${issue.content || issue.description}

関連Issue数: ${relatedIssues.length}
${relatedIssues.length > 0 ? `関連Issue: ${relatedIssues.map((i) => i.title).join(', ')}` : ''}

影響範囲と優先度を日本語で説明してください。
`;

  // ドライバーを作成（分析タスク用）
  const driver = await createDriver({
    requiredCapabilities: ['reasoning'],
    preferredCapabilities: ['japanese', 'structured'],
  });

  const promptModule = { instructions: [prompt] };
  const compiledPrompt = compile(promptModule);
  const result = await driver.query(compiledPrompt, { temperature: 0.3 });
  const impactAnalysis = result.content;

  // 3. 影響度スコアを計算
  const impactScore = calculateImpactScore(issue.content || issue.description || '', relatedIssues);

  // 4. Issue作成または更新
  let issueId: string;
  const timestamp = new Date();

  if (shouldCreateNewIssue(relatedIssues, issue.content || issue.description || '')) {
    // 新規Issue作成
    const newIssue: Omit<Issue, 'id' | 'createdAt' | 'updatedAt'> = {
      title:
        issue.title || `Issue: ${(issue.content || issue.description || '').substring(0, 50)}...`,
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
  } else {
    // 既存Issue更新
    const targetIssue = relatedIssues[0];
    issueId = targetIssue.id;

    const update: IssueUpdate = {
      timestamp,
      content: `関連する報告: ${issue.content}\nAI分析: ${impactAnalysis}`,
      author: 'ai' as const,
    };

    await storage.updateIssue(issueId, {
      updates: [...targetIssue.updates, update],
    });
  }

  // 5. 高影響度の場合は追加のワークフローを起動
  if (impactScore > 0.8) {
    emitter.emit({
      type: 'EXTRACT_KNOWLEDGE',
      payload: {
        issueId,
        impactAnalysis,
        source: 'high_impact_issue',
      },
    });
  }

  // 6. State更新
  const updatedState =
    context.state +
    `
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
}

/**
 * ANALYZE_ISSUE_IMPACT ワークフロー定義
 */
export const analyzeIssueImpactWorkflow: WorkflowDefinition = {
  name: 'AnalyzeIssueImpact',
  description: 'Issueの影響範囲を分析し、関連性と優先度を判定して必要に応じて知識抽出を起動する',
  triggers: {
    eventTypes: ['ANALYZE_ISSUE_IMPACT'],
  },
  executor: executeAnalyzeIssueImpact,
};
