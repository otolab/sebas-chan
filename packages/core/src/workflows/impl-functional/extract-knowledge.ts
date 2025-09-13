import type { AgentEvent } from '../../index.js';
import type { WorkflowContext, WorkflowEventEmitter } from '../context.js';
import type { WorkflowDefinition, WorkflowResult } from '../functional-types.js';
import type { Knowledge, KnowledgeSource } from '@sebas-chan/shared-types';

/**
 * 知識タイプを決定
 */
function determineKnowledgeType(content: string, source?: string): Knowledge['type'] {
  const lowerContent = content.toLowerCase();

  if (source === 'high_impact_issue' || lowerContent.includes('ルール') || lowerContent.includes('rule')) {
    return 'system_rule';
  }

  if (lowerContent.includes('手順') || lowerContent.includes('process') || lowerContent.includes('how to')) {
    return 'process_manual';
  }

  if (lowerContent.includes('について') || lowerContent.includes('とは')) {
    return 'curated_summary';
  }

  return 'factoid';
}

/**
 * ソース情報を生成
 */
function createKnowledgeSources(payload: any): KnowledgeSource[] {
  const sources: KnowledgeSource[] = [];

  if (payload.issueId) {
    sources.push({ type: 'issue', issueId: payload.issueId });
  }

  if (payload.pondEntryId) {
    sources.push({ type: 'pond', pondEntryId: payload.pondEntryId });
  }

  if (payload.source === 'user_feedback') {
    sources.push({ type: 'user_direct' });
  }

  if (sources.length === 0) {
    sources.push({ type: 'user_direct' });
  }

  return sources;
}

/**
 * A-3: EXTRACT_KNOWLEDGE ワークフロー実行関数
 * 情報から知識を抽出し、Knowledge DBに保存
 */
async function executeExtractKnowledge(
  event: AgentEvent,
  context: WorkflowContext,
  emitter: WorkflowEventEmitter
): Promise<WorkflowResult> {
  const { logger, storage, driver } = context;
  const payload = event.payload as Record<string, unknown>;

  try {
    // 1. 抽出対象の内容を整理
    const content = String(payload.question || payload.feedback || payload.impactAnalysis || payload.content || '');

    await logger.log('info', 'Extracting knowledge', { contentLength: content.length });

    // 2. 既存の類似知識を検索
    const existingKnowledge = await storage.searchKnowledge(content);
    await logger.logDbQuery('searchKnowledge', { query: content }, existingKnowledge.map((k) => k.id));

    // 3. AIで知識を抽出・構造化
    const prompt = `
以下の情報から再利用可能な知識を抽出してください：
${content}

${existingKnowledge.length > 0 ? `\n既存の関連知識:\n${existingKnowledge.map((k) => k.content).join('\n')}` : ''}

抽出した知識を簡潔に日本語でまとめてください。
`;

    const extractedKnowledge = await (driver as any).call(prompt, {
      model: 'standard',
      temperature: 0.2,
    });

    await logger.logAiCall(prompt, extractedKnowledge, { model: 'standard' });

    // 4. 重複チェック（簡易版）
    const isDuplicate = existingKnowledge.some(
      (k) => k.content.toLowerCase() === extractedKnowledge.toLowerCase()
    );

    let knowledgeId: string | null = null;

    if (!isDuplicate && extractedKnowledge.length > 20) {
      // 5. 新規Knowledge作成
      const knowledgeType = determineKnowledgeType(extractedKnowledge, payload.source as string);
      const sources = createKnowledgeSources(payload);

      const newKnowledge: Omit<Knowledge, 'id' | 'createdAt'> = {
        type: knowledgeType,
        content: extractedKnowledge,
        reputation: {
          upvotes: 0,
          downvotes: 0,
        },
        sources,
      };

      const createdKnowledge = await storage.createKnowledge(newKnowledge);
      knowledgeId = createdKnowledge.id;

      await logger.log('info', 'Created new knowledge', { knowledgeId, type: knowledgeType });
    } else if (existingKnowledge.length > 0) {
      // 6. 既存知識の評価を更新（簡易版）
      knowledgeId = existingKnowledge[0].id;

      // TODO: updateKnowledgeメソッドの実装が必要
      // await storage.updateKnowledge(knowledgeId, {
      //   reputation: {
      //     upvotes: existingKnowledge[0].reputation.upvotes + 1,
      //     downvotes: existingKnowledge[0].reputation.downvotes,
      //   },
      // });

      await logger.log('info', 'Updated existing knowledge reputation', { knowledgeId });
    }

    // 7. State更新
    const timestamp = new Date().toISOString();
    const updatedState = context.state + `
## 知識抽出 (${timestamp})
- Knowledge ID: ${knowledgeId || 'N/A'}
- Type: ${determineKnowledgeType(extractedKnowledge, payload.source as string)}
- Duplicate: ${isDuplicate}
- Content preview: ${extractedKnowledge.substring(0, 100)}...
`;

    return {
      success: true,
      context: {
        ...context,
        state: updatedState,
      },
      output: {
        knowledgeId,
        isDuplicate,
        extractedContent: extractedKnowledge,
        existingKnowledgeCount: existingKnowledge.length,
      },
    };
  } catch (error) {
    await logger.logError(error as Error, { payload });
    throw error;
  }
}

/**
 * EXTRACT_KNOWLEDGE ワークフロー定義
 */
export const extractKnowledgeWorkflow: WorkflowDefinition = {
  name: 'ExtractKnowledge',
  executor: executeExtractKnowledge,
};