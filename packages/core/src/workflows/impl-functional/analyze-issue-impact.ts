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
    return {
      success: false,
      context,
      error: new Error('Issue not found'),
    };
  }

  try {
    // 1. 関連するIssueを検索して関係性を分析
    const relatedIssues = await storage.searchIssues(issue.description);
    const otherRelatedIssues = relatedIssues.filter(i => i.id !== issueId);

    // 2. AIで状態変化と影響を分析
    const driver = await createDriver({
      requiredCapabilities: ['reasoning'],
      preferredCapabilities: ['japanese', 'structured'],
    });

    const prompt = `
以下のIssueの現在の状態を分析し、必要なアクションを判定してください：

Issue ID: ${issue.id}
タイトル: ${issue.title}
説明: ${issue.description}
現在のステータス: ${issue.status}
ラベル: ${issue.labels.join(', ')}
優先度: ${issue.priority || '未設定'}
更新回数: ${issue.updates.length}

関連Issue数: ${otherRelatedIssues.length}
${otherRelatedIssues.length > 0 ? `関連Issue:
${otherRelatedIssues.slice(0, 5).map(i => 
  `- [${i.id}] ${i.title} (status: ${i.status})`
).join('\n')}` : ''}

最新の更新:
${issue.updates.slice(-3).map(u => 
  `- ${u.timestamp}: ${u.content.substring(0, 100)}...`
).join('\n')}

以下を分析してください：
1. このIssueは解決可能な状態か（close判定）
2. 優先度の見直しが必要か
3. 他のIssueとの統合が必要か
4. 影響範囲とコンポーネント
5. 知識として抽出すべき内容があるか

JSONで応答してください：
{
  "shouldClose": boolean,
  "closeReason": "解決理由",
  "suggestedPriority": number (0-100),
  "shouldMergeWith": ["統合すべきIssueのID"],
  "impactedComponents": ["影響を受けるコンポーネント"],
  "hasKnowledge": boolean,
  "knowledgeSummary": "抽出可能な知識の概要",
  "impactScore": number (0-1)
}
`;

    const promptModule = {
      instructions: [prompt],
      output: {
        schema: {
          type: 'object',
          properties: {
            shouldClose: { type: 'boolean' },
            suggestedPriority: { type: 'number', minimum: 0, maximum: 100 },
            shouldMergeWith: {
              type: 'array',
              items: { type: 'string' }
            },
            impactedComponents: {
              type: 'array',
              items: { type: 'string' }
            },
            hasKnowledge: { type: 'boolean' },
            knowledgeSummary: { type: 'string' },
            impactScore: { type: 'number', minimum: 0, maximum: 1 }
          },
          required: ['shouldClose', 'suggestedPriority', 'shouldMergeWith', 'impactedComponents', 'hasKnowledge', 'impactScore']
        }
      }
    };
    const compiledPrompt = compile(promptModule);
    const result = await driver.query(compiledPrompt, { temperature: 0.3 });

    // 構造化出力またはJSON形式で解析
    let analysis;
    if (result.structuredOutput) {
      analysis = result.structuredOutput;
    } else {
      try {
        analysis = JSON.parse(result.content);
      } catch {
        // JSON解析失敗時のフォールバック
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

    // 3. 分析結果に基づいてIssueを更新
    const updates: Partial<Issue> = {};
    const timestamp = new Date();
    
    // ステータス変更の判定
    if (analysis.shouldClose && issue.status !== 'closed' && issue.status !== 'resolved') {
      updates.status = 'resolved';
      updates.updates = [
        ...issue.updates,
        {
          timestamp,
          content: `自動解決判定: ${analysis.closeReason || '条件を満たしたため解決'}`,
          author: 'ai' as const,
          statusChange: {
            from: issue.status,
            to: 'resolved' as const,
          },
        },
      ];
      
      // ステータス変更イベントを発行
      emitter.emit({
        type: 'ISSUE_STATUS_CHANGED',
        payload: {
          issueId,
          from: issue.status,
          to: 'resolved',
          reason: analysis.closeReason,
          issue: { ...issue, ...updates },
        },
      });
    }
    
    // 優先度の更新
    if (analysis.suggestedPriority && Math.abs((issue.priority || 50) - analysis.suggestedPriority) > 10) {
      updates.priority = analysis.suggestedPriority;
      
      if (!updates.updates) {
        updates.updates = [...issue.updates];
      }
      updates.updates.push({
        timestamp,
        content: `優先度を${issue.priority || 50}から${analysis.suggestedPriority}に変更`,
        author: 'ai' as const,
        priorityChange: {
          from: issue.priority,
          to: analysis.suggestedPriority,
        },
      });
    }
    
    // 関係性の追加
    if (analysis.shouldMergeWith && analysis.shouldMergeWith.length > 0) {
      updates.relations = [
        ...(issue.relations || []),
        ...analysis.shouldMergeWith.map(targetId => ({
          type: 'duplicate_of' as const,
          targetIssueId: targetId,
        })),
      ];
    }
    
    // Issueを更新
    if (Object.keys(updates).length > 0) {
      await storage.updateIssue(issueId, updates);
    }

    // 4. 後続イベントの発行
    
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
