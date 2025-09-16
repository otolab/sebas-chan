import type { AgentEvent } from '../../index.js';
import type { WorkflowContext, WorkflowEventEmitter } from '../context.js';
import type { WorkflowDefinition, WorkflowResult } from '../functional-types.js';
import type { Knowledge, KnowledgeSource } from '@sebas-chan/shared-types';
import { LogType } from '../logger.js';
import { compile } from '@moduler-prompt/core';

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

// ペイロードの型定義
interface ExtractKnowledgePayload {
  issueId?: string;
  pondEntryId?: string;
  source?: string;
  question?: string;
  feedback?: string;
  impactAnalysis?: string;
  content?: string;
  context?: string;
}

/**
 * ソース情報を生成
 */
function createKnowledgeSources(payload: ExtractKnowledgePayload): KnowledgeSource[] {
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
  const { logger, storage, createDriver } = context;
  const payload = event.payload as unknown as ExtractKnowledgePayload;

  try {
    // 1. 抽出対象の内容を整理
    const content = String(payload.question || payload.feedback || payload.impactAnalysis || payload.content || '');

    logger.log(LogType.INFO, { message: 'Extracting knowledge', contentLength: content.length });

    // 2. 既存の類似知識を検索
    const existingKnowledge = await storage.searchKnowledge(content);
    logger.log(LogType.DB_QUERY, {
      operation: 'searchKnowledge',
      query: content,
      resultIds: existingKnowledge.map((k) => k.id)
    });

    // 3. AIで知識を抽出・構造化
    const prompt = `
以下の情報から再利用可能な知識を抽出してください：
${content}

${existingKnowledge.length > 0 ? `\n既存の関連知識:\n${existingKnowledge.map((k) => k.content).join('\n')}` : ''}

抽出した知識を簡潔に日本語でまとめてください。
`;

    // ドライバーを作成してプロンプトを実行
    const driver = await createDriver({
      requiredCapabilities: ['structured'],
      preferredCapabilities: ['japanese', 'reasoning']
    });

    const promptModule = { instructions: [prompt] };
    const compiledPrompt = compile(promptModule);
    const result = await driver.query(compiledPrompt, { temperature: 0.2 });
    const extractedKnowledge = result.content;

    logger.log(LogType.AI_CALL, { prompt, response: extractedKnowledge, capabilities: ['structured', 'japanese'] });

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

      logger.log(LogType.INFO, { message: 'Created new knowledge', knowledgeId, type: knowledgeType });
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

      logger.log(LogType.INFO, { message: 'Updated existing knowledge reputation', knowledgeId });
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
    logger.log(LogType.ERROR, {
      message: (error as Error).message,
      stack: (error as Error).stack,
      context: { payload },
    });
    throw error;
  }
}

/**
 * EXTRACT_KNOWLEDGE ワークフロー定義
 */
export const extractKnowledgeWorkflow: WorkflowDefinition = {
  name: 'ExtractKnowledge',
  description: '情報から再利用可能な知識を抽出し、Knowledge DBに保存する',
  executor: executeExtractKnowledge,
};