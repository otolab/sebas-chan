import type { AgentEvent } from '../../index.js';
import type { WorkflowContext, WorkflowEventEmitter } from '../context.js';
import { BaseWorkflow, WorkflowResult } from '../types.js';

/**
 * A-2: ANALYZE_ISSUE_IMPACT ワークフロー
 * Issueの影響範囲を分析し、優先度を評価
 */
export class AnalyzeIssueImpactWorkflow extends BaseWorkflow {
  constructor() {
    super('AnalyzeIssueImpact');
  }

  protected async process(
    event: AgentEvent,
    context: WorkflowContext,
    emitter: WorkflowEventEmitter
  ): Promise<WorkflowResult> {
    const { logger, storage, driver } = context;
    const payload = event.payload as {
      pondEntryId?: string;
      requestId?: string;
      content?: string;
      aiAnalysis?: any;
    };

    try {
      await logger.log('info', 'Analyzing issue impact', {
        pondEntryId: payload.pondEntryId,
        requestId: payload.requestId,
      });

      // 1. 関連するIssueを検索
      const relatedIssues = await this.findRelatedIssues(payload, storage, logger);

      // 2. 影響度を分析
      const impactAnalysis = await this.analyzeImpact(
        payload,
        relatedIssues,
        context,
        logger
      );

      // 3. 新規Issue作成または既存Issue更新の判定
      const issueAction = await this.determineIssueAction(
        impactAnalysis,
        relatedIssues,
        payload
      );

      // 4. Issueの作成または更新
      let issueId: string | null = null;
      if (issueAction.type === 'create' && issueAction.title && issueAction.description && issueAction.labels) {
        const newIssue = await storage.createIssue({
          title: issueAction.title,
          description: issueAction.description,
          status: 'open',
          labels: issueAction.labels,
          updates: [],
          relations: relatedIssues.map((i) => ({
            type: 'relates_to' as const,
            targetIssueId: i.id,
          })),
          sourceInputIds: payload.pondEntryId ? [payload.pondEntryId] : [],
        });
        issueId = newIssue.id;
        await logger.log('info', `Created new issue: ${issueId}`);
      } else if (issueAction.type === 'update' && issueAction.issueId && issueAction.updateContent) {
        await storage.updateIssue(issueAction.issueId, {
          updates: [
            {
              author: 'ai' as const,
              content: issueAction.updateContent,
              timestamp: new Date(),
            },
          ],
        });
        issueId = issueAction.issueId;
        await logger.log('info', `Updated existing issue: ${issueId}`);
      }

      // 5. 高影響度の場合は追加の分析を起動
      if (impactAnalysis.severity === 'high') {
        emitter.emit({
          type: 'EXTRACT_KNOWLEDGE',
          priority: 'high',
          payload: {
            issueId,
            impact: impactAnalysis,
            source: 'high-impact-issue',
          },
        });
        await logger.log('info', 'Triggered knowledge extraction for high-impact issue');
      }

      // 6. State更新
      const updatedState = this.updateState(
        context.state,
        issueId,
        impactAnalysis,
        issueAction.type
      );

      return {
        success: true,
        context: {
          ...context,
          state: updatedState,
        },
        output: {
          issueId,
          action: issueAction.type,
          impact: impactAnalysis,
          relatedIssuesCount: relatedIssues.length,
        },
      };
    } catch (error) {
      await logger.logError(error as Error, payload);
      throw error;
    }
  }

  /**
   * 関連するIssueを検索
   */
  private async findRelatedIssues(payload: any, storage: any, logger: any): Promise<any[]> {
    const searchQuery = payload.content || payload.aiAnalysis?.summary || '';
    if (!searchQuery) return [];

    const issues = await storage.searchIssues(searchQuery);
    await logger.logDbQuery('searchIssues', { query: searchQuery }, issues.map((i: any) => i.id));

    // スコアリングして上位のみ返す
    return issues
      .map((issue: any) => ({
        ...issue,
        relevanceScore: this.calculateRelevance(searchQuery, issue),
      }))
      .sort((a: any, b: any) => b.relevanceScore - a.relevanceScore)
      .slice(0, 5);
  }

  /**
   * 関連度スコアを計算
   */
  private calculateRelevance(query: string, issue: any): number {
    const queryLower = query.toLowerCase();
    const titleLower = (issue.title || '').toLowerCase();
    const descLower = (issue.description || '').toLowerCase();

    let score = 0;
    const queryWords = queryLower.split(/\s+/);

    for (const word of queryWords) {
      if (titleLower.includes(word)) score += 2;
      if (descLower.includes(word)) score += 1;
    }

    // ステータスによる重み付け
    if (issue.status === 'open') score *= 1.5;
    if (issue.status === 'in_progress') score *= 1.2;

    return score;
  }

  /**
   * 影響度を分析
   */
  private async analyzeImpact(
    payload: any,
    relatedIssues: any[],
    context: WorkflowContext,
    logger: any
  ): Promise<{
    severity: 'high' | 'medium' | 'low';
    scope: string;
    urgency: number;
    confidence: number;
  }> {
    // 基本的な影響度分析
    let severity: 'high' | 'medium' | 'low' = 'low';
    let urgency = 0.3;
    let confidence = 0.5;

    const content = payload.content || '';
    const contentLower = content.toLowerCase();

    // キーワードベースの重要度判定
    if (
      contentLower.includes('critical') ||
      contentLower.includes('緊急') ||
      contentLower.includes('システムダウン')
    ) {
      severity = 'high';
      urgency = 0.9;
    } else if (
      contentLower.includes('エラー') ||
      contentLower.includes('error') ||
      contentLower.includes('失敗')
    ) {
      severity = 'medium';
      urgency = 0.6;
    }

    // 関連Issueの数による影響度調整
    if (relatedIssues.length > 3) {
      severity = severity === 'low' ? 'medium' : severity;
      confidence = Math.min(0.9, confidence + relatedIssues.length * 0.1);
    }

    // AIによる分析が利用可能な場合
    if (context.driver && payload.aiAnalysis) {
      try {
        const aiPrompt = `
Analyze the severity and urgency of this issue:
${content}

Related issues count: ${relatedIssues.length}
AI Analysis: ${JSON.stringify(payload.aiAnalysis)}

Return severity (high/medium/low) and urgency (0-1).
`;

        if (typeof context.driver.generate === 'function') {
          const aiResult = await context.driver.generate(aiPrompt);
          await logger.logAiCall('driver.generate', { prompt: aiPrompt }, aiResult);

          // AI結果を解析して適用（実装は簡略化）
          confidence = 0.8;
        }
      } catch (error) {
        await logger.log('warn', 'AI impact analysis failed', { error });
      }
    }

    const scope = relatedIssues.length > 5 ? 'system-wide' :
                  relatedIssues.length > 2 ? 'multiple-components' :
                  'isolated';

    return {
      severity,
      scope,
      urgency,
      confidence,
    };
  }

  /**
   * Issue作成/更新のアクションを決定
   */
  private async determineIssueAction(
    impact: any,
    relatedIssues: any[],
    payload: any
  ): Promise<{
    type: 'create' | 'update' | 'skip';
    issueId?: string;
    title?: string;
    description?: string;
    labels?: string[];
    updateContent?: string;
  }> {
    // 最も関連性の高い既存Issueを探す
    const mostRelated = relatedIssues.find(
      (issue) => issue.relevanceScore > 5 && issue.status === 'open'
    );

    if (mostRelated) {
      // 既存Issueを更新
      return {
        type: 'update',
        issueId: mostRelated.id,
        updateContent: `関連する報告を受信しました:\n${payload.content || ''}

影響度分析:
- 深刻度: ${impact.severity}
- 範囲: ${impact.scope}
- 緊急度: ${impact.urgency}`,
      };
    }

    // 影響度が低い場合はスキップ
    if (impact.severity === 'low' && impact.confidence < 0.5) {
      return { type: 'skip' };
    }

    // 新規Issue作成
    const title = this.generateIssueTitle(payload, impact);
    const description = this.generateIssueDescription(payload, impact, relatedIssues);
    const labels = this.generateLabels(impact);

    return {
      type: 'create',
      title,
      description,
      labels,
    };
  }

  /**
   * Issueタイトルを生成
   */
  private generateIssueTitle(payload: any, impact: any): string {
    const content = payload.content || '';
    const preview = content.substring(0, 50);
    const severity = impact.severity === 'high' ? '[緊急] ' :
                    impact.severity === 'medium' ? '[要対応] ' : '';

    return `${severity}${preview}${content.length > 50 ? '...' : ''}`;
  }

  /**
   * Issue説明を生成
   */
  private generateIssueDescription(payload: any, impact: any, relatedIssues: any[]): string {
    let description = `## 概要\n${payload.content || 'No content provided'}\n\n`;

    description += `## 影響度分析\n`;
    description += `- 深刻度: ${impact.severity}\n`;
    description += `- 影響範囲: ${impact.scope}\n`;
    description += `- 緊急度: ${impact.urgency}\n`;
    description += `- 信頼度: ${impact.confidence}\n\n`;

    if (relatedIssues.length > 0) {
      description += `## 関連Issue\n`;
      for (const issue of relatedIssues.slice(0, 3)) {
        description += `- #${issue.id}: ${issue.title}\n`;
      }
    }

    if (payload.pondEntryId) {
      description += `\n## ソース\n`;
      description += `- Pond Entry: ${payload.pondEntryId}\n`;
    }

    return description;
  }

  /**
   * ラベルを生成
   */
  private generateLabels(impact: any): string[] {
    const labels = [];

    if (impact.severity === 'high') labels.push('critical');
    if (impact.severity === 'medium') labels.push('important');
    if (impact.scope === 'system-wide') labels.push('system-wide');
    if (impact.urgency > 0.7) labels.push('urgent');

    labels.push('auto-generated');

    return labels;
  }

  /**
   * Stateを更新
   */
  private updateState(
    currentState: string,
    issueId: string | null,
    impact: any,
    action: string
  ): string {
    const timestamp = new Date().toISOString();
    const addition = `
## Issue影響分析 (${timestamp})
- Action: ${action}
- Issue ID: ${issueId || 'N/A'}
- Severity: ${impact.severity}
- Scope: ${impact.scope}
- Urgency: ${impact.urgency}
`;
    return currentState + addition;
  }
}