import type { AgentEvent } from '../../types.js';
import type { WorkflowContextInterface, WorkflowEventEmitterInterface } from '../context.js';
import type { WorkflowResult } from '../workflow-types.js';
import type { WorkflowDefinition } from '../workflow-types.js';
import type { Knowledge, KnowledgeSource, Issue } from '@sebas-chan/shared-types';
import { compile } from '@moduler-prompt/core';
import type { AIDriver } from '@moduler-prompt/driver';
import { RecordType } from '../recorder.js';
import { extractKnowledgePromptModule, type KnowledgeExtractionContext } from './extract-knowledge-prompts.js';

/**
 * 知識タイプを決定
 */
function determineKnowledgeType(content: string, source?: string): Knowledge['type'] {
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
  context: WorkflowContextInterface,
  emitter: WorkflowEventEmitterInterface
): Promise<WorkflowResult> {
  const { storage, createDriver, recorder } = context;
  
  // 複数のイベントタイプに対応
  let content = '';
  let sourceType = '';
  let sourceId = '';
  let confidence = 0.5;
  
  if (event.type === 'KNOWLEDGE_EXTRACTABLE') {
    const payload = event.payload as {
      sourceType: string;
      sourceId: string;
      confidence: number;
      reason: string;
      suggestedCategory?: string;
    };
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
  } else if (event.type === 'ISSUE_STATUS_CHANGED') {
    // Issue解決時の知識抽出
    const payload = event.payload as {
      issueId: string;
      from: string;
      to: string;
      issue: Issue;
    };
    if (payload.to === 'resolved') {
      sourceType = 'resolution';
      sourceId = payload.issueId;
      const issue = payload.issue;
      content = `問題: ${issue.title}\n${issue.description}`;
      if (issue.updates.length > 0) {
        const resolution = issue.updates[issue.updates.length - 1];
        content += `\n\n解決方法:\n${resolution.content}`;
      }
      confidence = 0.8; // 解決済みIssueは信頼度高
    }
  } else if (event.type === 'PATTERN_FOUND') {
    // パターン発見時の知識抽出
    const payload = event.payload as {
      patternType: string;
      pattern: {
        description: string;
        occurrences: number;
        confidence: number;
        examples: string[];
      };
    };
    sourceType = 'pattern';
    sourceId = `pattern-${Date.now()}`;
    content = `パターン: ${payload.pattern.description}\n発生回数: ${payload.pattern.occurrences}\n例:\n${payload.pattern.examples.join('\n')}`;
    confidence = payload.pattern.confidence;
  }

  if (!content) {
    recorder.record(RecordType.ERROR, {
      workflowName: 'ExtractKnowledge',
      error: 'No content to extract knowledge from',
      sourceType,
      sourceId,
    });
    return {
      success: false,
      context,
      error: new Error('No content to extract knowledge from'),
    };
  }

  // 処理開始を記録
  recorder.record(RecordType.INPUT, {
    workflowName: 'ExtractKnowledge',
    event: event.type,
    sourceType,
    sourceId,
    confidence,
    contentLength: content.length,
  });

  try {
    // 1. 既存の類似知識を検索
    recorder.record(RecordType.INFO, {
      step: 'searchExistingKnowledge',
      query: content.substring(0, 100),
    });

    const existingKnowledge = await storage.searchKnowledge(content);

    recorder.record(RecordType.DB_QUERY, {
      type: 'searchKnowledge',
      existingCount: existingKnowledge.length,
    });

    // 2. AIで知識を抽出・構造化
    const driver = await createDriver({
      requiredCapabilities: ['structured'],
      preferredCapabilities: ['japanese', 'reasoning'],
    });

    recorder.record(RecordType.AI_CALL, {
      step: 'extractKnowledge',
      model: 'structured-reasoning',
      temperature: 0.2,
    });

    // コンテキストを作成
    const extractionContext: KnowledgeExtractionContext = {
      sourceType,
      confidence,
      content,
      existingKnowledge,
      currentState: context.state
    };

    // コンパイル
    const compiledPrompt = compile(extractKnowledgePromptModule, extractionContext);
    // 構造化出力を有効にするためにmetadataを設定
    compiledPrompt.metadata = {
      outputSchema: {
        type: 'object',
        properties: {
          extractedKnowledge: { type: 'string' },
          updatedState: { type: 'string' }
        },
        required: ['extractedKnowledge', 'updatedState']
      }
    };
    const result = await driver.query(compiledPrompt, { temperature: 0.2 });

    // 構造化出力を取得
    if (!result.structuredOutput) {
      throw new Error('構造化出力の取得に失敗しました');
    }

    const output = result.structuredOutput as {
      extractedKnowledge: string;
      updatedState: string;
    };

    const extractedKnowledge = output.extractedKnowledge;

    recorder.record(RecordType.INFO, {
      step: 'knowledgeExtracted',
      knowledgeLength: extractedKnowledge.length,
    });

    // 3. 重複チェック
    const isDuplicate = existingKnowledge.some(
      k => k.content.toLowerCase() === extractedKnowledge.toLowerCase()
    );

    let knowledgeId: string | null = null;

    if (!isDuplicate && extractedKnowledge.length > 50 && confidence > 0.5) {
      // 4. 新規Knowledge作成
      const knowledgeType = determineKnowledgeType(extractedKnowledge, sourceType);
      
      const newKnowledge: Omit<Knowledge, 'id' | 'createdAt'> = {
        type: knowledgeType,
        content: extractedKnowledge,
        reputation: {
          upvotes: Math.round(confidence * 10), // 初期評価は信頼度に基づく
          downvotes: 0,
        },
        sources: [sourceType === 'issue' || sourceType === 'resolution' ?
          { type: 'issue' as const, issueId: sourceId } :
          sourceType === 'pond' ?
          { type: 'pond' as const, pondEntryId: sourceId } :
          { type: 'user_direct' as const }
        ],
      };

      const createdKnowledge = await storage.createKnowledge(newKnowledge);
      knowledgeId = createdKnowledge.id;

      recorder.record(RecordType.DB_QUERY, {
        type: 'createKnowledge',
        knowledgeId,
        knowledgeType,
      });
      
      // 知識作成イベントを発行
      recorder.record(RecordType.INFO, {
        step: 'eventEmitted',
        eventType: 'KNOWLEDGE_CREATED',
        knowledgeId,
      });

      emitter.emit({
        type: 'KNOWLEDGE_CREATED',
        payload: {
          knowledgeId: knowledgeId,
          knowledge: createdKnowledge,
          sourceWorkflow: 'ExtractKnowledge',
          extractedFrom: {
            type: sourceType,
            id: sourceId,
          },
        },
      });
    } else if (existingKnowledge.length > 0 && !isDuplicate) {
      // 5. 既存知識の評価を更新
      const targetKnowledge = existingKnowledge[0];
      knowledgeId = targetKnowledge.id;
      
      await storage.updateKnowledge(knowledgeId, {
        reputation: {
          upvotes: targetKnowledge.reputation.upvotes + Math.round(confidence * 5),
          downvotes: targetKnowledge.reputation.downvotes,
        },
        sources: [
          ...targetKnowledge.sources,
          sourceType === 'issue' || sourceType === 'resolution' ?
            { type: 'issue' as const, issueId: sourceId } :
            sourceType === 'pond' ?
            { type: 'pond' as const, pondEntryId: sourceId } :
            { type: 'user_direct' as const }
        ],
      });

      recorder.record(RecordType.DB_QUERY, {
        type: 'updateKnowledge',
        knowledgeId,
        action: 'incrementUpvotes',
      });
    }

    // 6. State更新 - AIが生成したupdatedStateを使用
    const updatedState = output.updatedState;

    // 処理完了を記録
    recorder.record(RecordType.OUTPUT, {
      workflowName: 'ExtractKnowledge',
      success: true,
      knowledgeId,
      isDuplicate,
      confidence,
    });

    return {
      success: true,
      context: {
        ...context,
        state: updatedState,
      },
      output: {
        knowledgeId,
        isDuplicate,
        confidence,
        extractedContent: extractedKnowledge,
        existingKnowledgeCount: existingKnowledge.length,
      },
    };
  } catch (error) {
    // エラーを記録
    recorder.record(RecordType.ERROR, {
      workflowName: 'ExtractKnowledge',
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
 * EXTRACT_KNOWLEDGE ワークフロー定義
 */
export const extractKnowledgeWorkflow: WorkflowDefinition = {
  name: 'ExtractKnowledge',
  description: '解決済みIssueやパターンから再利用可能な知識を抽出し、Knowledge DBに保存する',
  triggers: {
    eventTypes: ['KNOWLEDGE_EXTRACTABLE', 'ISSUE_STATUS_CHANGED', 'PATTERN_FOUND'],
    condition: (event) => {
      // ISSUE_STATUS_CHANGEDの場合はresolvedのみ
      if (event.type === 'ISSUE_STATUS_CHANGED') {
        const payload = event.payload as any;
        return payload.to === 'resolved';
      }
      // PATTERN_FOUNDの場合は信頼度が高いもののみ
      if (event.type === 'PATTERN_FOUND') {
        const payload = event.payload as any;
        return payload.pattern?.confidence > 0.7;
      }
      return true;
    },
    priority: 20,
  },
  executor: executeExtractKnowledge,
};;
