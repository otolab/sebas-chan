/**
 * ExtractKnowledgeワークフローのアクション関数
 */

import type { Knowledge, KnowledgeSource, Issue } from '@sebas-chan/shared-types';
import type { WorkflowStorageInterface, WorkflowEventEmitterInterface } from '../context.js';
import type { AIDriver } from '@moduler-prompt/driver';
import { compile } from '@moduler-prompt/core';
import { extractKnowledgePromptModule, type KnowledgeExtractionContext } from './prompts.js';
import { RecordType } from '../recorder.js';

/**
 * AI抽出結果の型定義
 */
export interface KnowledgeExtractionResult {
  extractedKnowledge: string;
  updatedState: string; // State更新も含む
}

/**
 * 知識タイプを決定
 * 意図: コンテンツとソースから適切な知識カテゴリーを判定
 */
export function determineKnowledgeType(content: string, source?: string): Knowledge['type'] {
  const lowerContent = content.toLowerCase();

  if (
    source === 'high_impact_issue' ||
    lowerContent.includes('ルール') ||
    lowerContent.includes('rule')
  ) {
    return 'system_rule';
  }

  if (
    lowerContent.includes('手順') ||
    lowerContent.includes('process') ||
    lowerContent.includes('how to')
  ) {
    return 'process_manual';
  }

  if (lowerContent.includes('について') || lowerContent.includes('とは')) {
    return 'curated_summary';
  }

  return 'factoid';
}

/**
 * ソース情報を生成
 * 意図: 知識の出所を適切に記録
 */
export function createKnowledgeSource(sourceType: string, sourceId: string): KnowledgeSource {
  if (sourceType === 'issue' || sourceType === 'resolution') {
    return { type: 'issue', issueId: sourceId };
  }

  if (sourceType === 'pond') {
    return { type: 'pond', pondEntryId: sourceId };
  }

  return { type: 'user_direct' };
}

/**
 * コンテンツを取得
 * 意図: イベントタイプとペイロードから知識抽出対象のコンテンツを生成
 */
export async function getContentFromEvent(
  eventType: string,
  payload: any,
  storage: WorkflowStorageInterface
): Promise<{
  content: string;
  sourceType: string;
  sourceId: string;
  confidence: number;
}> {
  let content = '';
  let sourceType = '';
  let sourceId = '';
  let confidence = 0.5;

  if (eventType === 'KNOWLEDGE_EXTRACTABLE') {
    sourceType = payload.sourceType;
    sourceId = payload.sourceId;
    confidence = payload.confidence;

    // ソースタイプに応じてコンテンツを取得
    if (sourceType === 'issue') {
      const issue = await storage.getIssue(sourceId);
      if (issue) {
        content = `Issue: ${issue.title}\n${issue.description}`;
        // 解決済みIssueの場合は最新の更新も含める
        if (issue.status === 'closed' && issue.updates.length > 0) {
          const resolution = issue.updates[issue.updates.length - 1];
          content += `\n\n解決方法:\n${resolution.content}`;
        }
      }
    } else if (sourceType === 'pattern') {
      // パターンの場合はPondから関連データを取得
      const pondEntries = await storage.searchPond(sourceId);
      content = pondEntries.map(e => e.content).join('\n\n');
    } else {
      // その他のソースタイプの場合
      content = payload.reason;
    }
  } else if (eventType === 'ISSUE_STATUS_CHANGED') {
    // Issue解決時の知識抽出
    if (payload.to === 'resolved') {
      sourceType = 'resolution';
      sourceId = payload.issueId;
      const issue = payload.issue as Issue;
      content = `問題: ${issue.title}\n${issue.description}`;
      if (issue.updates.length > 0) {
        const resolution = issue.updates[issue.updates.length - 1];
        content += `\n\n解決方法:\n${resolution.content}`;
      }
      confidence = 0.8; // 解決済みIssueは信頼度高
    }
  } else if (eventType === 'PATTERN_FOUND') {
    // パターン発見時の知識抽出
    sourceType = 'pattern';
    sourceId = `pattern-${Date.now()}`;
    content = `パターン: ${payload.pattern.description}\n発生回数: ${payload.pattern.occurrences}\n例:\n${payload.pattern.examples.join('\n')}`;
    confidence = payload.pattern.confidence;
  }

  return { content, sourceType, sourceId, confidence };
}

/**
 * 知識をAIで抽出
 * 意図: コンテンツから再利用可能な知識を抽出し、構造化
 */
export async function extractKnowledge(
  driver: AIDriver,
  sourceType: string,
  confidence: number,
  content: string,
  existingKnowledge: Knowledge[],
  currentState: string
): Promise<KnowledgeExtractionResult> {
  // 意図: PromptModuleのコンテキストに必要なデータを集約
  const extractionContext: KnowledgeExtractionContext = {
    sourceType,
    confidence,
    content,
    existingKnowledge,
    currentState, // updateStatePromptModuleが必要とする現在のState
  };

  const compiledPrompt = compile(extractKnowledgePromptModule, extractionContext);
  const result = await driver.query(compiledPrompt, { temperature: 0.2 });

  // 意図: 構造化出力は必須（ワークフローの前提条件）
  if (result.structuredOutput) {
    return result.structuredOutput as KnowledgeExtractionResult;
  }

  throw new Error('AI知識抽出の結果取得に失敗しました');
}

/**
 * 新規知識を作成
 * 意図: 抽出された知識をデータベースに保存
 */
export async function createNewKnowledge(
  storage: WorkflowStorageInterface,
  recorder: any,
  emitter: WorkflowEventEmitterInterface,
  extractedKnowledge: string,
  sourceType: string,
  sourceId: string,
  confidence: number
): Promise<string> {
  const knowledgeType = determineKnowledgeType(extractedKnowledge, sourceType);
  const knowledgeSource = createKnowledgeSource(sourceType, sourceId);

  const newKnowledge: Omit<Knowledge, 'id' | 'createdAt'> = {
    type: knowledgeType,
    content: extractedKnowledge,
    reputation: {
      upvotes: Math.round(confidence * 10), // 初期評価は信頼度に基づく
      downvotes: 0,
    },
    sources: [knowledgeSource],
  };

  const createdKnowledge = await storage.createKnowledge(newKnowledge);

  recorder.record(RecordType.DB_QUERY, {
    type: 'createKnowledge',
    knowledgeId: createdKnowledge.id,
    knowledgeType,
  });

  // 知識作成イベントを発行
  emitter.emit({
    type: 'KNOWLEDGE_CREATED',
    payload: {
      knowledgeId: createdKnowledge.id,
      knowledge: createdKnowledge,
      sourceWorkflow: 'ExtractKnowledge',
      extractedFrom: {
        type: sourceType,
        id: sourceId,
      },
    },
  });

  recorder.record(RecordType.INFO, {
    step: 'eventEmitted',
    eventType: 'KNOWLEDGE_CREATED',
    knowledgeId: createdKnowledge.id,
  });

  return createdKnowledge.id;
}

/**
 * 既存知識を更新
 * 意図: 関連する既存知識の評価を向上
 */
export async function updateExistingKnowledge(
  storage: WorkflowStorageInterface,
  recorder: any,
  targetKnowledge: Knowledge,
  sourceType: string,
  sourceId: string,
  confidence: number
): Promise<string> {
  const knowledgeSource = createKnowledgeSource(sourceType, sourceId);

  await storage.updateKnowledge(targetKnowledge.id, {
    reputation: {
      upvotes: targetKnowledge.reputation.upvotes + Math.round(confidence * 5),
      downvotes: targetKnowledge.reputation.downvotes,
    },
    sources: [...targetKnowledge.sources, knowledgeSource],
  });

  recorder.record(RecordType.DB_QUERY, {
    type: 'updateKnowledge',
    knowledgeId: targetKnowledge.id,
    action: 'incrementUpvotes',
  });

  return targetKnowledge.id;
}

/**
 * 重複チェック
 * 意図: 同じ知識が既に存在するか確認
 */
export function isDuplicateKnowledge(
  extractedKnowledge: string,
  existingKnowledge: Knowledge[]
): boolean {
  return existingKnowledge.some(
    k => k.content.toLowerCase() === extractedKnowledge.toLowerCase()
  );
}