import type { AgentEvent } from '../../types.js';
import type { WorkflowContextInterface, WorkflowEventEmitterInterface } from '../context.js';
import type { WorkflowResult } from '../workflow-types.js';
import type { WorkflowDefinition } from '../workflow-types.js';
import type { Knowledge, KnowledgeSource } from '@sebas-chan/shared-types';
import { compile } from '@moduler-prompt/core';

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
  const { storage, createDriver } = context;
  
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
        if (issue.status === 'resolved' && issue.updates.length > 0) {
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
    return {
      success: false,
      context,
      error: new Error('No content to extract knowledge from'),
    };
  }

  try {
    // 1. 既存の類似知識を検索
    const existingKnowledge = await storage.searchKnowledge(content);

    // 2. AIで知識を抽出・構造化
    const driver = await createDriver({
      requiredCapabilities: ['structured'],
      preferredCapabilities: ['japanese', 'reasoning'],
    });

    const prompt = `
以下の情報から再利用可能な知識を抽出してください：

ソースタイプ: ${sourceType}
信頼度: ${confidence}
内容:
${content}

${existingKnowledge.length > 0 ? `\n既存の関連知識:\n${existingKnowledge.slice(0, 3).map(k => k.content).join('\n')}` : ''}

以下の形式で知識を抽出してください：
1. 問題の概要
2. 解決方法またはベストプラクティス
3. 適用可能な状況
4. 注意点

簡潔にまとめてください。
`;

    const promptModule = { instructions: [prompt] };
    const compiledPrompt = compile(promptModule);
    const result = await driver.query(compiledPrompt, { temperature: 0.2 });
    const extractedKnowledge = result.content;

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
        sources: [{
          type: sourceType as any,
          id: sourceId,
          timestamp: new Date(),
        }],
      };

      const createdKnowledge = await storage.createKnowledge(newKnowledge);
      knowledgeId = createdKnowledge.id;
      
      // 知識作成イベントを発行
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
          {
            type: sourceType as any,
            id: sourceId,
            timestamp: new Date(),
          },
        ],
      });
    }

    // 6. State更新
    const timestamp = new Date().toISOString();
    const updatedState = context.state + `
## 知識抽出 (${timestamp})
- Knowledge ID: ${knowledgeId || 'N/A'}
- Source Type: ${sourceType}
- Confidence: ${confidence.toFixed(2)}
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
        confidence,
        extractedContent: extractedKnowledge,
        existingKnowledgeCount: existingKnowledge.length,
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
