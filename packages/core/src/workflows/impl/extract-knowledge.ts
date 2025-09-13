import type { AgentEvent } from '../../index.js';
import type { WorkflowContext, WorkflowEventEmitter } from '../context.js';
import { BaseWorkflow, WorkflowResult } from '../types.js';

/**
 * A-3: EXTRACT_KNOWLEDGE ワークフロー
 * IssueやPondから知識を抽出してKnowledgeに格納
 */
export class ExtractKnowledgeWorkflow extends BaseWorkflow {
  constructor() {
    super('ExtractKnowledge');
  }

  protected async process(
    event: AgentEvent,
    context: WorkflowContext,
    emitter: WorkflowEventEmitter
  ): Promise<WorkflowResult> {
    const { logger, storage, driver } = context;
    const payload = event.payload as {
      issueId?: string;
      pondEntryId?: string;
      question?: string;
      source?: string;
      impact?: any;
      aiResponse?: any;
    };

    try {
      await logger.log('info', 'Extracting knowledge', {
        source: payload.source || 'unknown',
        issueId: payload.issueId,
        pondEntryId: payload.pondEntryId,
      });

      // 1. ソースデータを収集
      const sourceData = await this.collectSourceData(payload, storage, logger);

      // 2. 既存の関連Knowledge を検索
      const existingKnowledge = await this.searchExistingKnowledge(
        sourceData,
        storage,
        logger
      );

      // 3. 知識を抽出
      const extractedKnowledge = await this.extractKnowledge(
        sourceData,
        existingKnowledge,
        context,
        logger
      );

      // 4. Knowledgeの作成または更新
      const knowledgeResults = [];
      for (const knowledge of extractedKnowledge) {
        const result = await this.saveKnowledge(knowledge, existingKnowledge, storage, logger);
        if (result) {
          knowledgeResults.push(result);
        }
      }

      // 5. 高品質な知識が抽出された場合、追加処理
      const highQualityKnowledge = knowledgeResults.filter(
        (k) => k.confidence > 0.8 && k.type === 'solution'
      );

      if (highQualityKnowledge.length > 0 && payload.issueId) {
        // 関連Issueに解決策として記録
        await storage.updateIssue(payload.issueId, {
          updates: [
            {
              author: 'ai' as const,
              content: `解決策が見つかりました: ${highQualityKnowledge
                .map((k) => k.content)
                .join(', ')}`,
              timestamp: new Date(),
            },
          ],
        });
        await logger.log('info', 'Added solution to issue', { issueId: payload.issueId });
      }

      // 6. State更新
      const updatedState = this.updateState(
        context.state,
        knowledgeResults,
        sourceData.type
      );

      return {
        success: true,
        context: {
          ...context,
          state: updatedState,
        },
        output: {
          extractedCount: knowledgeResults.length,
          highQualityCount: highQualityKnowledge.length,
          sourceType: sourceData.type,
          knowledgeIds: knowledgeResults.map((k) => k.id),
        },
      };
    } catch (error) {
      await logger.logError(error as Error, payload);
      throw error;
    }
  }

  /**
   * ソースデータを収集
   */
  private async collectSourceData(payload: any, storage: any, logger: any): Promise<any> {
    const data: any = {
      type: 'unknown',
      content: '',
      metadata: {},
    };

    // Issueからデータ収集
    if (payload.issueId) {
      const issue = await storage.getIssue(payload.issueId);
      if (issue) {
        data.type = 'issue';
        data.content = `${issue.title}\n${issue.description}`;
        data.metadata.issueId = issue.id;
        data.metadata.status = issue.status;
        data.metadata.labels = issue.labels;
        await logger.logDbQuery('getIssue', { id: payload.issueId }, [issue.id]);
      }
    }

    // Pondからデータ収集
    if (payload.pondEntryId) {
      const pondResults = await storage.searchPond(`id:${payload.pondEntryId}`);
      if (pondResults.length > 0) {
        const entry = pondResults[0];
        data.type = data.type === 'issue' ? 'issue-pond' : 'pond';
        data.content += `\n${entry.content}`;
        data.metadata.pondEntryId = entry.id;
        await logger.logDbQuery('searchPond', { id: payload.pondEntryId }, [entry.id]);
      }
    }

    // 質問からデータ収集
    if (payload.question) {
      data.type = data.type === 'unknown' ? 'question' : `${data.type}-question`;
      data.content += `\n質問: ${payload.question}`;
      data.metadata.question = payload.question;
    }

    // AI応答を含める
    if (payload.aiResponse) {
      data.metadata.aiResponse = payload.aiResponse;
    }

    return data;
  }

  /**
   * 既存の関連Knowledgeを検索
   */
  private async searchExistingKnowledge(
    sourceData: any,
    storage: any,
    logger: any
  ): Promise<any[]> {
    const query = sourceData.content.substring(0, 200);
    const knowledge = await storage.searchKnowledge(query);
    await logger.logDbQuery('searchKnowledge', { query }, knowledge.map((k: any) => k.id));

    // 関連度でソート
    return knowledge
      .map((k: any) => ({
        ...k,
        relevanceScore: this.calculateRelevance(sourceData.content, k.content),
      }))
      .sort((a: any, b: any) => b.relevanceScore - a.relevanceScore)
      .slice(0, 10);
  }

  /**
   * 関連度スコアを計算
   */
  private calculateRelevance(source: string, target: string): number {
    const sourceWords = source.toLowerCase().split(/\s+/);
    const targetWords = target.toLowerCase().split(/\s+/);

    let matches = 0;
    for (const word of sourceWords) {
      if (targetWords.includes(word)) {
        matches++;
      }
    }

    return matches / Math.max(sourceWords.length, 1);
  }

  /**
   * 知識を抽出
   */
  private async extractKnowledge(
    sourceData: any,
    existingKnowledge: any[],
    context: WorkflowContext,
    logger: any
  ): Promise<any[]> {
    const extracted = [];

    // パターンベースの知識抽出
    const patterns = this.extractPatterns(sourceData);
    for (const pattern of patterns) {
      extracted.push(pattern);
    }

    // AIを使用した知識抽出（利用可能な場合）
    if (context.driver && typeof context.driver.generate === 'function') {
      try {
        const prompt = this.buildExtractionPrompt(sourceData, existingKnowledge);
        const aiResult = await context.driver.generate(prompt);
        await logger.logAiCall('driver.generate', { prompt }, aiResult);

        // AI結果を解析（簡略化）
        if (aiResult && typeof aiResult === 'string') {
          extracted.push({
            type: 'ai-extracted',
            content: aiResult,
            confidence: 0.7,
            sources: [sourceData.metadata.issueId, sourceData.metadata.pondEntryId].filter(Boolean),
          });
        }
      } catch (error) {
        await logger.log('warn', 'AI knowledge extraction failed', { error });
      }
    }

    // 重複排除と品質フィルタリング
    return this.filterAndDeduplicateKnowledge(extracted, existingKnowledge);
  }

  /**
   * パターンベースの知識抽出
   */
  private extractPatterns(sourceData: any): any[] {
    const patterns = [];
    const content = sourceData.content;

    // エラーパターンの抽出
    const errorPattern = /(?:エラー|error|失敗|failed)[:：\s]*([^\n。.]+)/gi;
    const errorMatches = content.matchAll(errorPattern);
    for (const match of errorMatches) {
      patterns.push({
        type: 'error-pattern',
        content: `エラーパターン: ${match[1]}`,
        confidence: 0.6,
        sources: [sourceData.metadata.issueId].filter(Boolean),
      });
    }

    // 解決策パターンの抽出
    const solutionPattern = /(?:解決|solution|修正|fix|対処)[:：\s]*([^\n。.]+)/gi;
    const solutionMatches = content.matchAll(solutionPattern);
    for (const match of solutionMatches) {
      patterns.push({
        type: 'solution',
        content: `解決策: ${match[1]}`,
        confidence: 0.7,
        sources: [sourceData.metadata.issueId].filter(Boolean),
      });
    }

    // 事実情報の抽出
    if (sourceData.metadata.labels && sourceData.metadata.labels.length > 0) {
      patterns.push({
        type: 'factoid',
        content: `ラベル情報: ${sourceData.metadata.labels.join(', ')}`,
        confidence: 0.5,
        sources: [sourceData.metadata.issueId].filter(Boolean),
      });
    }

    return patterns;
  }

  /**
   * 抽出プロンプトを構築
   */
  private buildExtractionPrompt(sourceData: any, existingKnowledge: any[]): string {
    return `Extract knowledge from the following content:

Source Type: ${sourceData.type}
Content: ${sourceData.content}

Existing related knowledge count: ${existingKnowledge.length}

Please extract:
1. Key facts or patterns
2. Solutions or workarounds
3. Important relationships
4. Lessons learned

Format as clear, concise knowledge statements.`;
  }

  /**
   * 知識のフィルタリングと重複排除
   */
  private filterAndDeduplicateKnowledge(extracted: any[], existing: any[]): any[] {
    const filtered = [];
    const seenContent = new Set(existing.map((k) => k.content.toLowerCase()));

    for (const knowledge of extracted) {
      const contentLower = knowledge.content.toLowerCase();

      // 重複チェック
      if (seenContent.has(contentLower)) {
        continue;
      }

      // 品質チェック
      if (knowledge.content.length < 10 || knowledge.content.length > 1000) {
        continue;
      }

      // 信頼度チェック
      if (knowledge.confidence < 0.3) {
        continue;
      }

      filtered.push(knowledge);
      seenContent.add(contentLower);
    }

    return filtered;
  }

  /**
   * 知識を保存
   */
  private async saveKnowledge(
    knowledge: any,
    existingKnowledge: any[],
    storage: any,
    logger: any
  ): Promise<any> {
    try {
      // 類似の既存知識を探す
      const similar = existingKnowledge.find(
        (k) => k.relevanceScore > 0.8 && k.type === knowledge.type
      );

      if (similar) {
        // 既存知識を更新（投票）
        const updated = await storage.updateKnowledge(similar.id, {
          reputation: {
            upvotes: (similar.reputation?.upvotes || 0) + 1,
            downvotes: similar.reputation?.downvotes || 0,
          },
        });
        await logger.log('info', 'Updated existing knowledge reputation', {
          knowledgeId: similar.id,
        });
        return updated;
      }

      // 新規知識を作成
      const created = await storage.createKnowledge({
        type: this.mapKnowledgeType(knowledge.type),
        content: knowledge.content,
        reputation: {
          upvotes: 0,
          downvotes: 0,
        },
        sources: knowledge.sources || [],
      });

      await logger.log('info', 'Created new knowledge', {
        knowledgeId: created.id,
        type: created.type,
      });

      return {
        ...created,
        confidence: knowledge.confidence,
      };
    } catch (error) {
      await logger.log('error', 'Failed to save knowledge', { error, knowledge });
      return null;
    }
  }

  /**
   * 知識タイプをマッピング
   */
  private mapKnowledgeType(type: string): 'factoid' | 'solution' | 'pattern' {
    if (type.includes('solution') || type.includes('fix')) {
      return 'solution';
    }
    if (type.includes('pattern') || type.includes('error')) {
      return 'pattern';
    }
    return 'factoid';
  }

  /**
   * Stateを更新
   */
  private updateState(
    currentState: string,
    knowledgeResults: any[],
    sourceType: string
  ): string {
    const timestamp = new Date().toISOString();
    const addition = `
## 知識抽出 (${timestamp})
- Source type: ${sourceType}
- Extracted: ${knowledgeResults.length} items
- Types: ${[...new Set(knowledgeResults.map((k) => k.type))].join(', ')}
- High quality: ${knowledgeResults.filter((k) => k.confidence > 0.8).length}
`;
    return currentState + addition;
  }
}